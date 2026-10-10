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
import {
  ASSET_SOURCE,
  chunkText,
  documentEmbeddingText,
  EMBEDDING_MODEL,
  hashText,
  INDEXED_TYPES,
  isIndexedType,
  MAX_SOURCE_CHARS,
  queryEmbeddingText,
  reciprocalRankFusion,
  renderRecord,
  toVectorLiteral,
} from "./index-text";

interface SourceDocument {
  sourceType: string;
  sourceId: string;
  title: string;
  text: string;
}

interface FindManyDelegate {
  findMany(args: object): Promise<DomainRow[]>;
  findUnique(args: object): Promise<DomainRow | null>;
}

export interface SearchHit {
  id: string;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  title: string;
  content: string;
  score: number;
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
      const chunks = chunkText(doc.text.slice(0, MAX_SOURCE_CHARS));
      // Sumber tanpa isi (mis. hanya judul) tetap diindeks satu potongan berisi judul
      const contents = chunks.length ? chunks : [doc.title];
      return { doc, contents, hashes: contents.map((c) => hashText(`${doc.title}\n${c}`)) };
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
                                   embedding, created_at, updated_at)
            VALUES (${randomUUID()}, ${userId}, ${doc.sourceType}, ${doc.sourceId}, ${i}, ${doc.title}, ${row.content},
                    ${row.hash}, ${model}, ${row.vector ? toVectorLiteral(row.vector) : null}::vector, now(), now())`,
        ),
      ]);
    }
  }

  // ---------------------------------------------------------------- Sumber data

  private async loadSource(userId: string, sourceType: string, sourceId: string): Promise<SourceDocument | null> {
    if (sourceType === ASSET_SOURCE) {
      const asset = await this.prisma.asset.findFirst({
        where: { id: sourceId, userId },
        include: { extraction: true },
      });
      const text =
        asset?.extraction?.status === AssetExtractionStatus.completed ? asset.extraction.extractedText : null;
      return asset && text?.trim() ? { sourceType, sourceId, title: `Berkas: ${asset.originalName}`, text } : null;
    }
    if (!isIndexedType(sourceType)) return null;
    const spec: TableSpec = RECORD_TABLES[sourceType];
    const row = await this.delegate(sourceType).findUnique({
      where: { userId_clientId: { userId, clientId: sourceId } },
    });
    if (!row || row.deletedAt) return null;
    return { sourceType, sourceId, ...renderRecord(sourceType, rowToPayload(spec, row), spec.titleKey) };
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
      if (text?.trim()) {
        docs.push({ sourceType: ASSET_SOURCE, sourceId: asset.id, title: `Berkas: ${asset.originalName}`, text });
      }
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
  async search(userId: string, query: string, limit = 8): Promise<SearchHit[]> {
    const candidates = Math.max(limit * 3, 20);
    type Row = Omit<SearchHit, "score"> & { contentHash: string };
    const keyword = await this.prisma.$queryRaw<Row[]>`
      SELECT id, source_type AS "sourceType", source_id AS "sourceId", chunk_index AS "chunkIndex", title, content,
             content_hash AS "contentHash"
      FROM ai_chunks
      WHERE user_id = ${userId}
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
             content_hash AS "contentHash"
        FROM ai_chunks
        WHERE user_id = ${userId} AND embedding IS NOT NULL
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
