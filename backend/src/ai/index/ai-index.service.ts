import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import IORedis from "ioredis";
import { AiProvider, AssetExtractionStatus, Prisma } from "../../generated/prisma/client";
import { ExtractionQueueService } from "../../extraction/extraction-queue.service";
import { isExtractable, normalizeMimeType } from "../../extraction/text-extractors";
import { PrismaService } from "../../prisma/prisma.service";
import { DomainRow, rowToPayload } from "../../records/record-mapper";
import { RECORD_TABLES, type RecordType, type TableSpec } from "../../records/record-schema";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { AiService } from "../ai.service";
import { AiProviderError } from "../providers/ai-client";
import { AiIndexQueueService } from "./ai-index-queue.service";
import { embedTexts } from "./gemini-embedding";
import { KNOWLEDGE_VAULT_CONTEXT } from "../../knowledge/knowledge-constants";
import { knowledgeMetadata, noteIndexText, TEMPLATE_DIR } from "../../knowledge/vault-parser";
import {
  ASSET_SOURCE,
  chunkSource,
  documentEmbeddingText,
  EMBEDDING_MODEL,
  hashText,
  INDEXED_TYPES,
  isIndexedType,
  KNOWLEDGE_COLLECTION,
  NOTEBOOK_SOURCE,
  OBSIDIAN_SOURCE,
  queryEmbeddingText,
  reciprocalRankFusion,
  renderRecord,
  toVectorLiteral,
  WORKSPACE_COLLECTION,
} from "./index-text";

interface SourceDocument {
  sourceType: string;
  sourceId: string;
  title: string;
  text: string;
  /** `knowledge` (vault Obsidian & berkasnya) atau `workspace` (data kerja) */
  collection: string;
  metadata?: Record<string, unknown> | null;
}

interface FindManyDelegate {
  findMany(args: object): Promise<DomainRow[]>;
  findUnique(args: object): Promise<DomainRow | null>;
}

/** Batasi pencarian ke sumber tertentu (mis. sumber satu notebook). */
export interface SourceRef {
  sourceType: string;
  sourceId: string;
}

export interface SearchHit {
  id: string;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  title: string;
  content: string;
  collection: string;
  metadata: Record<string, unknown> | null;
  score: number;
}

export interface SearchOptions {
  /** Batasi ke sumber tertentu (mis. sumber satu notebook) */
  only?: SourceRef[];
  /** Batasi ke koleksi tertentu */
  collections?: string[];
  /** Buang potongan berstatus ini (`metadata.status`), mis. `dicabut` */
  excludeStatuses?: string[];
  /** Hanya potongan yang boleh dipakai publik (`metadata.publik = true`) */
  publicOnly?: boolean;
}

/** Status pengindeksan per user di Redis (bukan data penting → TTL 30 hari). */
const statusKey = (userId: string) => `ai:index:status:${userId}`;
const STATUS_TTL_SECONDS = 30 * 24 * 3600;
/** Jumlah dokumen yang diproses per gelombang saat membangun ulang indeks. */
const REBUILD_BATCH = 40;
/** Nilai `model` untuk potongan tanpa embedding (hanya pencarian kata). */
const KEYWORD_ONLY_MODEL = "none";

/**
 * Indeks pengetahuan (RAG tahap 1): mengubah data user (record + isi berkas) menjadi potongan teks di `ai_chunks`.
 * Embedding memakai API key Gemini milik pemilik data; tanpa key Gemini potongan hanya mendukung pencarian kata, dan bila
 * indeks dimatikan user tidak ada yang disimpan maupun dikirim ke Google.
 */
@Injectable()
export class AiIndexService {
  private readonly logger = new Logger(AiIndexService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly queue: AiIndexQueueService,
    @Inject(forwardRef(() => ExtractionQueueService)) private readonly extraction: ExtractionQueueService,
    @Inject(REDIS_CLIENT) private readonly redis: IORedis,
  ) {}

  // ---------------------------------------------------------------- Pemrosesan job

  /** Sinkronkan satu sumber: hapus potongannya bila sumber hilang/dihapus, atau embed ulang bila isinya berubah. */
  async indexSource(userId: string, sourceType: string, sourceId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiIndexEnabled: true } });
    const doc = user?.aiIndexEnabled ? await this.loadSource(userId, sourceType, sourceId) : null;
    if (!doc) {
      await this.prisma.aiChunk.deleteMany({ where: { userId, sourceType, sourceId } });
      return;
    }
    await this.indexDocuments(userId, await this.embeddingKey(userId), [doc]);
    await this.markSuccess(userId);
  }

  /** Bangun ulang seluruh indeks user: sumber baru/berubah di-embed, sumber yang sudah tidak ada dibuang. */
  async rebuild(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiIndexEnabled: true } });
    if (!user?.aiIndexEnabled) return this.purge(userId);
    const apiKey = await this.embeddingKey(userId);
    await this.requeueUnextractedAssets(userId);
    const docs = await this.loadAllSources(userId);

    // Buang potongan dari sumber yang sudah dihapus
    const live = new Set(docs.map((d) => `${d.sourceType}|${d.sourceId}`));
    const existing = await this.prisma.aiChunk.findMany({
      where: { userId },
      distinct: ["sourceType", "sourceId"],
      select: { sourceType: true, sourceId: true },
    });
    for (const stale of existing.filter((e) => !live.has(`${e.sourceType}|${e.sourceId}`))) {
      await this.prisma.aiChunk.deleteMany({ where: { userId, ...stale } });
    }

    for (let i = 0; i < docs.length; i += REBUILD_BATCH) {
      await this.indexDocuments(userId, apiKey, docs.slice(i, i + REBUILD_BATCH));
    }
    await this.markSuccess(userId);
    this.logger.log(`Indeks AI user ${userId} dibangun ulang (${docs.length} sumber).`);
  }

  async purge(userId: string) {
    await this.prisma.aiChunk.deleteMany({ where: { userId } });
  }

  /** Catat error terakhir agar terlihat di Pengaturan → AI. */
  async markError(userId: string, error: unknown) {
    const message =
      error instanceof AiProviderError
        ? `${error.kind}: ${error.providerMessage}`
        : error instanceof Error
          ? error.message
          : String(error);
    await this.redis
      .multi()
      .hset(statusKey(userId), { lastError: message.slice(0, 500), lastErrorAt: new Date().toISOString() })
      .expire(statusKey(userId), STATUS_TTL_SECONDS)
      .exec();
  }

  private async markSuccess(userId: string) {
    await this.redis
      .multi()
      .hset(statusKey(userId), { lastIndexedAt: new Date().toISOString() })
      .hdel(statusKey(userId), "lastError", "lastErrorAt")
      .expire(statusKey(userId), STATUS_TTL_SECONDS)
      .exec();
  }

  /**
   * Tulis ulang potongan dokumen yang isinya berubah (dibandingkan hash per potongan) dalam satu transaksi.
   * Dengan key Gemini: potongan di-embed (teks semua dokumen digabung per batch agar panggilan sedikit), termasuk
   * potongan lama yang belum ber-embedding. Tanpa key: potongan disimpan tanpa embedding (`model = "none"`) sehingga
   * pencarian kata persis tetap jalan dan tidak ada data yang dikirim ke luar.
   */
  private async indexDocuments(userId: string, apiKey: string | null, docs: SourceDocument[]) {
    const prepared = docs.map((doc) => {
      const chunks = chunkSource(doc.sourceType, doc.text);
      // Sumber tanpa isi (mis. hanya judul) tetap diindeks satu potongan berisi judul
      const contents = chunks.length ? chunks : [doc.title];
      // Koleksi & metadata ikut hash: perubahan status catatan menulis ulang potongannya
      const meta = `${doc.collection}|${JSON.stringify(doc.metadata ?? null)}`;
      return { doc, contents, hashes: contents.map((c) => hashText(`${meta}\n${doc.title}\n${c}`)) };
    });

    const existing = await this.prisma.aiChunk.findMany({
      where: { userId, OR: docs.map((d) => ({ sourceType: d.sourceType, sourceId: d.sourceId })) },
      select: { sourceType: true, sourceId: true, chunkIndex: true, contentHash: true, model: true },
    });
    const changed = prepared.filter(({ doc, hashes }) => {
      const current = existing
        .filter((e) => e.sourceType === doc.sourceType && e.sourceId === doc.sourceId)
        .sort((a, b) => a.chunkIndex - b.chunkIndex);
      return (
        current.length !== hashes.length ||
        current.some((e, i) => e.contentHash !== hashes[i] || (apiKey !== null && e.model !== EMBEDDING_MODEL))
      );
    });
    if (changed.length === 0) return;

    const texts = changed.flatMap(({ doc, contents }) => contents.map((c) => documentEmbeddingText(doc.title, c)));
    const vectors = apiKey ? await embedTexts(apiKey, texts) : null;
    const model = vectors ? EMBEDDING_MODEL : KEYWORD_ONLY_MODEL;

    let offset = 0;
    for (const { doc, contents, hashes } of changed) {
      const rows = contents.map((content, i) => ({ content, hash: hashes[i], vector: vectors?.[offset + i] }));
      offset += contents.length;
      await this.prisma.$transaction([
        this.prisma.aiChunk.deleteMany({ where: { userId, sourceType: doc.sourceType, sourceId: doc.sourceId } }),
        ...rows.map(
          (row, i) => this.prisma.$executeRaw`
            INSERT INTO ai_chunks (id, user_id, source_type, source_id, chunk_index, title, content, content_hash, model,
                                   embedding, collection, metadata, created_at, updated_at)
            VALUES (${randomUUID()}, ${userId}, ${doc.sourceType}, ${doc.sourceId}, ${i}, ${doc.title}, ${row.content},
                    ${row.hash}, ${model}, ${row.vector ? toVectorLiteral(row.vector) : null}::vector, ${doc.collection},
                    ${doc.metadata ? JSON.stringify(doc.metadata) : null}::jsonb, now(), now())`,
        ),
      ]);
    }
  }

  // ---------------------------------------------------------------- Sumber data

  private async loadSource(userId: string, sourceType: string, sourceId: string): Promise<SourceDocument | null> {
    if (sourceType === NOTEBOOK_SOURCE) {
      const source = await this.prisma.notebookSource.findFirst({
        where: { id: sourceId, notebook: { userId }, content: { not: null } },
      });
      return source?.content?.trim()
        ? {
            sourceType,
            sourceId,
            title: `Sumber notebook: ${source.title}`,
            text: source.content,
            collection: WORKSPACE_COLLECTION,
          }
        : null;
    }
    if (sourceType === OBSIDIAN_SOURCE) {
      const note = await this.prisma.knowledgeNote.findFirst({ where: { id: sourceId, userId, kind: "note" } });
      return note ? this.noteDocument(note) : null;
    }
    if (sourceType === ASSET_SOURCE) {
      const asset = await this.prisma.asset.findFirst({
        where: { id: sourceId, userId },
        include: { extraction: true },
      });
      const text =
        asset?.extraction?.status === AssetExtractionStatus.completed ? asset.extraction.extractedText : null;
      return asset && text?.trim() ? this.assetDocument(asset, text) : null;
    }
    if (!isIndexedType(sourceType)) return null;
    const spec: TableSpec = RECORD_TABLES[sourceType];
    const row = await this.delegate(sourceType).findUnique({
      where: { userId_clientId: { userId, clientId: sourceId } },
    });
    if (!row || row.deletedAt) return null;
    return {
      sourceType,
      sourceId,
      collection: WORKSPACE_COLLECTION,
      ...renderRecord(sourceType, rowToPayload(spec, row), spec.titleKey),
    };
  }

  /** Catatan vault Obsidian → dokumen koleksi pengetahuan (templat tidak diindeks: isinya kerangka). */
  private noteDocument(note: {
    id: string;
    path: string;
    title: string;
    content: string | null;
    frontmatter: unknown;
  }): SourceDocument | null {
    if (note.path.split("/")[0] === TEMPLATE_DIR) return null;
    const frontmatter = (note.frontmatter as Record<string, unknown> | null) ?? null;
    const tags = Array.isArray(frontmatter?.tags)
      ? frontmatter.tags.filter((t): t is string => typeof t === "string")
      : [];
    return {
      sourceType: OBSIDIAN_SOURCE,
      sourceId: note.id,
      title: `Pengetahuan: ${note.title}`,
      text: noteIndexText({ title: note.title, content: note.content ?? "", frontmatter }),
      collection: KNOWLEDGE_COLLECTION,
      metadata: { ...knowledgeMetadata(note.path, frontmatter, tags) },
    };
  }

  /** Isi berkas: berkas vault Obsidian masuk koleksi pengetahuan, berkas lain = data kerja. */
  private assetDocument(asset: { id: string; originalName: string; context: string | null }, text: string) {
    const knowledge = asset.context === KNOWLEDGE_VAULT_CONTEXT;
    return {
      sourceType: ASSET_SOURCE,
      sourceId: asset.id,
      title: knowledge ? `Pengetahuan (berkas): ${asset.originalName}` : `Berkas: ${asset.originalName}`,
      text,
      collection: knowledge ? KNOWLEDGE_COLLECTION : WORKSPACE_COLLECTION,
      metadata: knowledge ? { path: asset.originalName } : null,
    } satisfies SourceDocument;
  }

  private async loadAllSources(userId: string): Promise<SourceDocument[]> {
    const docs: SourceDocument[] = [];
    for (const type of Object.keys(INDEXED_TYPES) as RecordType[]) {
      const spec: TableSpec = RECORD_TABLES[type];
      const rows = await this.delegate(type).findMany({ where: { userId, deletedAt: null } });
      for (const row of rows) {
        docs.push({
          sourceType: type,
          sourceId: row.clientId as string,
          collection: WORKSPACE_COLLECTION,
          ...renderRecord(type, rowToPayload(spec, row), spec.titleKey),
        });
      }
    }
    const assets = await this.prisma.asset.findMany({
      where: { userId, extraction: { status: AssetExtractionStatus.completed, extractedText: { not: null } } },
      include: { extraction: { select: { extractedText: true } } },
    });
    for (const asset of assets) {
      const text = asset.extraction?.extractedText;
      if (text?.trim()) docs.push(this.assetDocument(asset, text));
    }
    const notebookSources = await this.prisma.notebookSource.findMany({
      where: { notebook: { userId }, content: { not: null } },
    });
    for (const source of notebookSources) {
      if (source.content?.trim()) {
        docs.push({
          sourceType: NOTEBOOK_SOURCE,
          sourceId: source.id,
          title: `Sumber notebook: ${source.title}`,
          text: source.content,
          collection: WORKSPACE_COLLECTION,
        });
      }
    }
    const notes = await this.prisma.knowledgeNote.findMany({ where: { userId, kind: "note" } });
    for (const note of notes) {
      const doc = this.noteDocument(note);
      if (doc) docs.push(doc);
    }
    return docs;
  }

  /** Berkas lama yang dulu belum bisa diekstrak (mis. PDF/DOCX sebelum ekstraktor ditambahkan) diekstrak ulang. */
  private async requeueUnextractedAssets(userId: string) {
    const assets = await this.prisma.asset.findMany({
      where: {
        userId,
        extraction: { status: { in: [AssetExtractionStatus.unsupported, AssetExtractionStatus.failed] } },
      },
      select: { id: true, mimeType: true, originalName: true },
    });
    for (const asset of assets.filter((a) => isExtractable(normalizeMimeType(a.mimeType, a.originalName)))) {
      await this.extraction.enqueue(asset.id, { rerun: true });
    }
  }

  private delegate(type: RecordType): FindManyDelegate {
    const model = RECORD_TABLES[type].model;
    const key = model.charAt(0).toLowerCase() + model.slice(1);
    return (this.prisma as unknown as Record<string, FindManyDelegate>)[key];
  }

  private async embeddingKey(userId: string) {
    return (await this.ai.getCredentialKey(userId, AiProvider.gemini))?.apiKey ?? null;
  }

  // ---------------------------------------------------------------- Status & pencarian

  async status(userId: string) {
    const [user, counts, status, pending, hasKey] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { aiIndexEnabled: true } }),
      this.prisma.$queryRaw<{ chunks: bigint; embedded: bigint; sources: bigint; last: Date | null }[]>`
        SELECT count(*) AS chunks, count(embedding) AS embedded, count(DISTINCT (source_type, source_id)) AS sources,
               max(updated_at) AS last
        FROM ai_chunks WHERE user_id = ${userId}`,
      this.redis.hgetall(statusKey(userId)),
      this.queue.pendingCount(),
      this.ai.hasCredential(userId, AiProvider.gemini),
    ]);
    return {
      enabled: user.aiIndexEnabled,
      embeddingAvailable: hasKey,
      model: EMBEDDING_MODEL,
      sources: Number(counts[0]?.sources ?? 0),
      chunks: Number(counts[0]?.chunks ?? 0),
      embeddedChunks: Number(counts[0]?.embedded ?? 0),
      lastIndexedAt: status.lastIndexedAt ?? counts[0]?.last?.toISOString() ?? null,
      lastError: status.lastError ?? null,
      lastErrorAt: status.lastErrorAt ?? null,
      pendingJobs: pending,
    };
  }

  /**
   * Pencarian gabungan: kemiripan makna (pgvector, cosine) + kata persis (full-text PostgreSQL, penting untuk nomor
   * arsip/kode), digabung dengan Reciprocal Rank Fusion. Tanpa key Gemini hanya pencarian kata.
   */
  async search(userId: string, query: string, limit = 8, options: SearchOptions = {}): Promise<SearchHit[]> {
    const { only, collections, excludeStatuses, publicOnly } = options;
    if (only && only.length === 0) return [];
    if (collections && collections.length === 0) return [];
    const candidates = Math.max(limit * 3, 20);
    // Filter: sumber tertentu (notebook), koleksi, status (mis. dicabut), publik
    const filters = [
      only
        ? Prisma.sql`AND (source_type, source_id) IN (${Prisma.join(
            only.map((ref) => Prisma.sql`(${ref.sourceType}, ${ref.sourceId})`),
          )})`
        : Prisma.empty,
      collections ? Prisma.sql`AND collection IN (${Prisma.join(collections)})` : Prisma.empty,
      excludeStatuses?.length
        ? Prisma.sql`AND coalesce(metadata->>'status', '') NOT IN (${Prisma.join(excludeStatuses)})`
        : Prisma.empty,
      publicOnly ? Prisma.sql`AND metadata->>'publik' = 'true'` : Prisma.empty,
    ];
    const scope = Prisma.join(filters, " ");
    type Row = Omit<SearchHit, "score"> & { contentHash: string };
    const keyword = await this.prisma.$queryRaw<Row[]>`
      SELECT id, source_type AS "sourceType", source_id AS "sourceId", chunk_index AS "chunkIndex", title, content,
             collection, metadata, content_hash AS "contentHash"
      FROM ai_chunks
      WHERE user_id = ${userId} ${scope}
        AND to_tsvector('simple', title || ' ' || content) @@ websearch_to_tsquery('simple', ${query})
      ORDER BY ts_rank(to_tsvector('simple', title || ' ' || content), websearch_to_tsquery('simple', ${query})) DESC
      LIMIT ${candidates}`;

    let semantic: Row[] = [];
    const apiKey = await this.embeddingKey(userId);
    const vector = apiKey ? await this.embedQuery(userId, apiKey, query) : null;
    if (vector) {
      const literal = toVectorLiteral(vector);
      // `embedding IS NOT NULL` wajib agar indeks HNSW parsial terpakai
      semantic = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT id, source_type AS "sourceType", source_id AS "sourceId", chunk_index AS "chunkIndex", title, content,
             collection, metadata, content_hash AS "contentHash"
        FROM ai_chunks
        WHERE user_id = ${userId} AND embedding IS NOT NULL ${scope}
        ORDER BY embedding <=> ${literal}::vector
        LIMIT ${candidates}`);
    }
    // Berkas yang sama bisa diunggah berkali-kali (asset berbeda, isi identik) → tampilkan satu kali saja
    const seen = new Set<string>();
    return reciprocalRankFusion([semantic, keyword])
      .filter((hit) => !seen.has(hit.contentHash) && seen.add(hit.contentHash))
      .slice(0, limit)
      .map(({ contentHash, ...hit }) => {
        void contentHash;
        return hit;
      });
  }

  /** Embedding pertanyaan; gagal (kuota, key ditolak) → null sehingga pencarian tetap jalan dengan kata kunci saja. */
  private async embedQuery(userId: string, apiKey: string, query: string) {
    try {
      const [vector] = await embedTexts(apiKey, [queryEmbeddingText(query)]);
      return vector;
    } catch (error) {
      if (!(error instanceof AiProviderError)) throw error;
      this.logger.warn(
        `Embedding pertanyaan user ${userId} gagal (${error.kind}), memakai pencarian kata: ${error.providerMessage}`,
      );
      return null;
    }
  }
}
