import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { AssetExtractionStatus, NotebookSourceKind, Prisma, type NotebookSource } from "../generated/prisma/client";
import { AiService } from "../ai/ai.service";
import { AiIndexQueueService } from "../ai/index/ai-index-queue.service";
import { AiIndexService } from "../ai/index/ai-index.service";
import { ASSET_SOURCE, NOTEBOOK_SOURCE, renderRecord } from "../ai/index/index-text";
import { AuthUser } from "../common/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { DomainRow, rowToPayload } from "../records/record-mapper";
import { RECORD_TABLES, type TableSpec } from "../records/record-schema";
import { ObjectStorageService } from "../storage/object-storage.service";
import { UploadsService } from "../uploads/uploads.service";
import {
  AddNotebookSourceDto,
  CreateNotebookDto,
  MAX_CHAT_FILE_BYTES,
  MAX_CHAT_IMAGE_BYTES,
  NOTEBOOK_RECORD_TYPES,
  NOTEBOOK_UPLOAD_CONTEXT,
  type NotebookRecordType,
  SaveNotebookNoteDto,
  UpdateNotebookDto,
  UpdateNotebookNoteDto,
  UpdateNotebookSourceDto,
} from "./dto/notebook.dto";
import {
  buildChatPrompt,
  buildSummaryPrompt,
  clampContext,
  chunkKey,
  citationsFor,
  FULL_CONTEXT_CHARS,
  numberChunks,
  parseSummary,
  partChunks,
  selectChunks,
  type SourcePart,
  type SourceRef,
  sourcesFingerprint,
  totalChars,
} from "./notebook-context";
import { fetchWebSource, WebSourceError } from "./web-source";

export type SourceStatus = "ready" | "processing" | "failed" | "missing";

interface FindDelegate {
  findUnique(args: object): Promise<DomainRow | null>;
}

interface LoadedSource {
  source: NotebookSource;
  status: SourceStatus;
  error: string | null;
  parts: SourcePart[];
  /** Penanda versi isi (untuk sidik jari ringkasan) */
  version: string;
  /** Berkas sumber unggahan: jenis & apakah diunggah langsung ke notebook (ikut terhapus bersama notebook) */
  asset?: { mimeType: string; ownedByNotebook: boolean };
}

const EXTRACTION_REASONS: Record<string, string> = {
  unsupported_type: "Format berkas tidak bisa dibaca.",
  too_large: "Berkas lebih dari 20 MB tidak dibaca.",
  needs_gemini_key: "Gambar/PDF hasil scan perlu OCR Gemini — simpan API key Gemini di Pengaturan → AI.",
  empty: "Tidak ada teks yang terbaca dari berkas ini.",
};

/**
 * My Notebook (RAG ala NotebookLM): notebook berisi sumber (berkas, item LifeOS, teks tempel, halaman web), chat yang
 * menjawab hanya dari sumber dengan sitasi, ringkasan Studio, dan catatan hasil. Semua data milik user sendiri.
 */
@Injectable()
export class NotebooksService {
  private readonly logger = new Logger(NotebooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly index: AiIndexService,
    private readonly indexQueue: AiIndexQueueService,
    private readonly uploads: UploadsService,
    private readonly storage: ObjectStorageService,
  ) {}

  // ---------------------------------------------------------------- Notebook

  async list(userId: string) {
    const notebooks = await this.prisma.notebook.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { sources: true, notes: true, messages: true } } },
    });
    return notebooks.map(({ summary, summaryHash, ...n }) => {
      void summaryHash;
      return { ...n, hasSummary: !!summary };
    });
  }

  create(userId: string, dto: CreateNotebookDto) {
    return this.prisma.notebook.create({
      data: { userId, title: dto.title.trim(), description: dto.description?.trim() || null, icon: dto.icon || null },
    });
  }

  async get(userId: string, id: string) {
    const notebook = await this.own(userId, id);
    const loaded = await this.loadSources(userId, id);
    const fingerprint = this.fingerprint(loaded);
    return {
      ...notebook,
      summaryStale: !!notebook.summary && notebook.summaryHash !== fingerprint,
      sources: loaded.map((l) => this.toSourceResponse(l)),
    };
  }

  async update(userId: string, id: string, dto: UpdateNotebookDto) {
    await this.own(userId, id);
    return this.prisma.notebook.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description: dto.description === undefined ? undefined : dto.description?.trim() || null,
        icon: dto.icon === undefined ? undefined : dto.icon || null,
      },
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.own(user.id, id);
    const sources = await this.prisma.notebookSource.findMany({ where: { notebookId: id } });
    const images = await this.messageImageIds(id);
    await this.prisma.notebook.delete({ where: { id } });
    for (const source of sources) await this.cleanupSource(user, source);
    await this.removeUploads(user, images);
    return { success: true };
  }

  // ---------------------------------------------------------------- Sumber

  async addSource(user: AuthUser, notebookId: string, dto: AddNotebookSourceDto) {
    await this.own(user.id, notebookId);
    let data: Prisma.NotebookSourceUncheckedCreateInput;

    switch (dto.kind) {
      case NotebookSourceKind.upload: {
        const asset = await this.prisma.asset.findFirst({ where: { id: dto.assetId, userId: user.id } });
        if (!asset) throw new NotFoundException("Berkas tidak ditemukan.");
        data = { notebookId, kind: dto.kind, title: dto.title?.trim() || asset.originalName, assetId: asset.id };
        break;
      }
      case NotebookSourceKind.record: {
        const type = dto.recordType as NotebookRecordType;
        const row = await this.findRecord(user.id, type, dto.recordId!);
        if (!row) throw new NotFoundException("Item tidak ditemukan (hanya item milik sendiri yang bisa ditambahkan).");
        const payload = rowToPayload(RECORD_TABLES[type] as TableSpec, row);
        const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "Tanpa judul";
        const exists = await this.prisma.notebookSource.findFirst({
          where: { notebookId, kind: dto.kind, recordType: type, recordId: dto.recordId },
        });
        if (exists) throw new BadRequestException("Item ini sudah menjadi sumber notebook.");
        data = { notebookId, kind: dto.kind, title, recordType: type, recordId: dto.recordId };
        break;
      }
      case NotebookSourceKind.text: {
        const content = dto.content!.trim();
        const title = dto.title?.trim() || content.split("\n")[0].slice(0, 80) || "Teks";
        data = { notebookId, kind: dto.kind, title, content };
        break;
      }
      case NotebookSourceKind.web: {
        try {
          const page = await fetchWebSource(dto.url!);
          data = {
            notebookId,
            kind: dto.kind,
            title: dto.title?.trim() || page.title,
            url: page.url,
            content: page.text,
          };
        } catch (error) {
          if (error instanceof WebSourceError) throw new UnprocessableEntityException(error.message);
          throw error;
        }
        break;
      }
    }

    const source = await this.prisma.notebookSource.create({ data });
    await this.touch(notebookId);
    if (source.content) await this.enqueueIndex(user.id, source.id);
    const [loaded] = await this.loadSourceList(user.id, [source]);
    return this.toSourceResponse(loaded);
  }

  async updateSource(userId: string, notebookId: string, sourceId: string, dto: UpdateNotebookSourceDto) {
    await this.own(userId, notebookId);
    const source = await this.ownSource(notebookId, sourceId);
    const updated = await this.prisma.notebookSource.update({
      where: { id: source.id },
      data: { enabled: dto.enabled, title: dto.title?.trim() },
    });
    await this.touch(notebookId);
    const [loaded] = await this.loadSourceList(userId, [updated]);
    return this.toSourceResponse(loaded);
  }

  /** Ambil ulang halaman web (isi terbaru). */
  async refreshSource(userId: string, notebookId: string, sourceId: string) {
    await this.own(userId, notebookId);
    const source = await this.ownSource(notebookId, sourceId);
    if (source.kind !== NotebookSourceKind.web || !source.url) {
      throw new BadRequestException("Hanya sumber halaman web yang bisa dimuat ulang.");
    }
    let updated: NotebookSource;
    try {
      const page = await fetchWebSource(source.url);
      updated = await this.prisma.notebookSource.update({
        where: { id: source.id },
        data: { content: page.text, url: page.url, error: null },
      });
    } catch (error) {
      if (!(error instanceof WebSourceError)) throw error;
      updated = await this.prisma.notebookSource.update({ where: { id: source.id }, data: { error: error.message } });
    }
    await this.touch(notebookId);
    await this.enqueueIndex(userId, source.id);
    const [loaded] = await this.loadSourceList(userId, [updated]);
    return this.toSourceResponse(loaded);
  }

  async removeSource(user: AuthUser, notebookId: string, sourceId: string) {
    await this.own(user.id, notebookId);
    const source = await this.ownSource(notebookId, sourceId);
    await this.prisma.notebookSource.delete({ where: { id: source.id } });
    await this.touch(notebookId);
    await this.cleanupSource(user, source);
    return { success: true };
  }

  // ---------------------------------------------------------------- Chat

  async messages(userId: string, notebookId: string) {
    await this.own(userId, notebookId);
    return this.prisma.notebookMessage.findMany({ where: { notebookId }, orderBy: { createdAt: "asc" } });
  }

  async clearMessages(user: AuthUser, notebookId: string) {
    await this.own(user.id, notebookId);
    const images = await this.messageImageIds(notebookId);
    await this.prisma.notebookMessage.deleteMany({ where: { notebookId } });
    await this.removeUploads(user, images);
    return { success: true };
  }

  async chat(userId: string, notebookId: string, message: string, fileIds: string[] = []) {
    const notebook = await this.own(userId, notebookId);
    const attachments = await this.loadChatAttachments(userId, fileIds);
    const question = message.trim() || "Jelaskan lampiran yang saya kirim.";
    if (!message.trim() && !attachments.length) throw new BadRequestException("Pertanyaan wajib diisi.");
    const loaded = (await this.loadSources(userId, notebookId)).filter((l) => l.source.enabled && l.status === "ready");
    const parts = loaded.flatMap((l) => l.parts);
    if (!parts.length && !attachments.length) {
      throw new BadRequestException("Belum ada sumber yang siap. Tambahkan atau aktifkan sumber notebook dulu.");
    }

    const chunks = partChunks(parts);
    const mode = totalChars(parts) <= FULL_CONTEXT_CHARS ? "full" : "rag";
    let selected = chunks;
    if (mode === "rag") {
      const vectorKeys = await this.vectorKeys(userId, question, parts);
      selected = selectChunks(chunks, question, vectorKeys);
    }
    const numbered = numberChunks(
      selected,
      loaded.map((l) => l.source.id),
    );

    const history = await this.prisma.notebookMessage.findMany({
      where: { notebookId },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    const prompt = buildChatPrompt({
      notebookTitle: notebook.title,
      chunks: numbered,
      history: history.reverse(),
      question,
      mode,
      fileCount: attachments.filter((a) => a.file).length,
      attachedTexts: attachments.flatMap((a) => (a.text ? [{ name: a.attachment.name, text: a.text }] : [])),
    });
    const result = await this.ai.generate(
      userId,
      prompt,
      attachments.flatMap((a) => (a.file ? [a.file] : [])),
    );
    const citations = citationsFor(result.text, numbered);

    const now = Date.now();
    const userMessage = await this.prisma.notebookMessage.create({
      data: {
        notebookId,
        role: "user",
        content: message.trim(),
        attachments: attachments.length
          ? (attachments.map((a) => a.attachment) as unknown as Prisma.InputJsonValue)
          : undefined,
        createdAt: new Date(now),
      },
    });
    const assistantMessage = await this.prisma.notebookMessage.create({
      data: {
        notebookId,
        role: "assistant",
        content: result.text,
        citations: citations as unknown as Prisma.InputJsonValue,
        createdAt: new Date(now + 1),
      },
    });
    await this.touch(notebookId);
    return { userMessage, assistantMessage, mode, fallback: result.fallback };
  }

  /**
   * Lampiran chat (milik user): gambar dikirim langsung ke AI; dokumen dibaca dari teks hasil ekstraksi server (PDF,
   * DOCX, XLSX, teks). PDF tanpa lapisan teks (hasil scan) dikirim langsung ke AI sebagai berkas.
   */
  private async loadChatAttachments(userId: string, fileIds: string[]) {
    const ids = [...new Set(fileIds)];
    if (!ids.length) return [];
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: ids }, userId },
      include: { extraction: true },
    });
    if (assets.length !== ids.length) throw new NotFoundException("Lampiran tidak ditemukan.");
    const byId = new Map(assets.map((a) => [a.id, a]));
    return Promise.all(
      ids.map(async (id, i) => {
        const asset = byId.get(id)!;
        const attachment = { uploadId: asset.id, name: asset.originalName, mimeType: asset.mimeType };
        const isImage = asset.mimeType.startsWith("image/");
        if (isImage && asset.size > MAX_CHAT_IMAGE_BYTES)
          throw new BadRequestException("Gambar lampiran maksimal 10 MB.");
        if (asset.size > MAX_CHAT_FILE_BYTES) throw new BadRequestException("Lampiran maksimal 20 MB.");

        const extraction = asset.extraction;
        const text = extraction?.status === AssetExtractionStatus.completed ? extraction.extractedText?.trim() : "";
        if (!isImage && text) return { attachment, text: clampContext(text), file: null };

        const pending =
          !extraction ||
          extraction.status === AssetExtractionStatus.pending ||
          extraction.status === AssetExtractionStatus.extracting;
        if (!isImage && asset.mimeType !== "application/pdf") {
          throw new BadRequestException(
            pending
              ? `${asset.originalName} masih dibaca server. Tunggu sebentar lalu kirim lagi.`
              : `Isi ${asset.originalName} tidak bisa dibaca. Gunakan gambar, PDF, DOCX, XLSX, atau teks.`,
          );
        }
        const buffer = await this.storage.getObjectBuffer(asset.objectKey);
        const ext = asset.mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
        return {
          attachment,
          text: null,
          // Nama ASCII: nama asli bisa berisi karakter non-latin1
          file: { originalname: `lampiran-${i + 1}.${ext}`, mimetype: asset.mimeType, size: asset.size, buffer },
        };
      }),
    );
  }

  /** ID berkas yang dilampirkan di pesan chat notebook. */
  private async messageImageIds(notebookId: string) {
    const rows = await this.prisma.notebookMessage.findMany({
      // Hanya pesan pengguna yang bisa berlampiran; kolom JSON disaring di kode (filter JSON null Prisma tidak dipakai)
      where: { notebookId, role: "user" },
      select: { attachments: true },
    });
    return rows.flatMap((r) =>
      Array.isArray(r.attachments)
        ? (r.attachments as { uploadId?: unknown }[])
            .map((a) => a.uploadId)
            .filter((id): id is string => typeof id === "string")
        : [],
    );
  }

  private async removeUploads(user: AuthUser, ids: string[]) {
    for (const id of new Set(ids)) {
      await this.uploads.remove(id, user).catch((error: unknown) => {
        this.logger.warn(`Berkas ${id} gagal dihapus: ${error instanceof Error ? error.message : error}`);
      });
    }
  }

  /** Peringkat potongan dari indeks AI (vektor + kata) yang dibatasi ke sumber notebook; gagal → kosong. */
  private async vectorKeys(userId: string, question: string, parts: SourcePart[]) {
    const refs = [...new Map(parts.map((p) => [`${p.ref.sourceType}|${p.ref.sourceId}`, p.ref])).values()];
    try {
      const hits = await this.index.search(userId, question, 30, refs);
      return hits.map((h) => chunkKey({ sourceType: h.sourceType, sourceId: h.sourceId }, h.chunkIndex));
    } catch (error) {
      this.logger.warn(`Pencarian indeks notebook gagal: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  // ---------------------------------------------------------------- Studio

  async summarize(userId: string, notebookId: string) {
    const notebook = await this.own(userId, notebookId);
    const all = await this.loadSources(userId, notebookId);
    const parts = all.filter((l) => l.source.enabled && l.status === "ready").flatMap((l) => l.parts);
    if (!parts.length) throw new BadRequestException("Belum ada sumber yang siap untuk diringkas.");

    const result = await this.ai.generate(userId, buildSummaryPrompt(notebook.title, parts));
    let summary;
    try {
      summary = parseSummary(result.text);
    } catch {
      throw new UnprocessableEntityException("Jawaban AI tidak bisa dibaca sebagai ringkasan. Coba lagi.");
    }
    const updated = await this.prisma.notebook.update({
      where: { id: notebookId },
      data: {
        summary: summary as unknown as Prisma.InputJsonValue,
        summaryHash: this.fingerprint(all),
        summaryAt: new Date(),
      },
    });
    return { summary: updated.summary, summaryAt: updated.summaryAt, summaryStale: false, fallback: result.fallback };
  }

  // ---------------------------------------------------------------- Catatan notebook

  async notes(userId: string, notebookId: string) {
    await this.own(userId, notebookId);
    return this.prisma.notebookNote.findMany({ where: { notebookId }, orderBy: { updatedAt: "desc" } });
  }

  async createNote(userId: string, notebookId: string, dto: SaveNotebookNoteDto) {
    await this.own(userId, notebookId);
    const note = await this.prisma.notebookNote.create({
      data: { notebookId, title: dto.title.trim(), content: dto.content, origin: dto.origin ?? "manual" },
    });
    await this.touch(notebookId);
    return note;
  }

  async updateNote(userId: string, notebookId: string, noteId: string, dto: UpdateNotebookNoteDto) {
    await this.own(userId, notebookId);
    await this.ownNote(notebookId, noteId);
    return this.prisma.notebookNote.update({
      where: { id: noteId },
      data: { title: dto.title?.trim(), content: dto.content },
    });
  }

  async removeNote(userId: string, notebookId: string, noteId: string) {
    await this.own(userId, notebookId);
    await this.ownNote(notebookId, noteId);
    await this.prisma.notebookNote.delete({ where: { id: noteId } });
    return { success: true };
  }

  // ---------------------------------------------------------------- Bantuan

  private async own(userId: string, id: string) {
    const notebook = await this.prisma.notebook.findFirst({ where: { id, userId } });
    if (!notebook) throw new NotFoundException("Notebook tidak ditemukan.");
    return notebook;
  }

  private async ownSource(notebookId: string, sourceId: string) {
    const source = await this.prisma.notebookSource.findFirst({ where: { id: sourceId, notebookId } });
    if (!source) throw new NotFoundException("Sumber tidak ditemukan.");
    return source;
  }

  private async ownNote(notebookId: string, noteId: string) {
    const note = await this.prisma.notebookNote.findFirst({ where: { id: noteId, notebookId } });
    if (!note) throw new NotFoundException("Catatan tidak ditemukan.");
    return note;
  }

  private touch(notebookId: string) {
    return this.prisma.notebook.update({ where: { id: notebookId }, data: { updatedAt: new Date() } });
  }

  private async enqueueIndex(userId: string, sourceId: string) {
    try {
      await this.indexQueue.enqueueSource(userId, NOTEBOOK_SOURCE, sourceId);
    } catch (error) {
      this.logger.warn(
        `Gagal enqueue indeks sumber notebook ${sourceId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /** Bersihkan data turunan sumber yang dihapus: berkas unggahan notebook & potongan indeks teks/web. */
  private async cleanupSource(user: AuthUser, source: NotebookSource) {
    if (source.kind === NotebookSourceKind.upload && source.assetId) {
      // Hanya berkas yang diunggah langsung ke notebook yang ikut dihapus; berkas yang dipilih dari LifeOS (lampiran,
      // resource, dsb.) tetap utuh. Juga tidak dihapus bila masih dipakai sumber notebook lain.
      const asset = await this.prisma.asset.findUnique({ where: { id: source.assetId }, select: { context: true } });
      const others = await this.prisma.notebookSource.count({ where: { assetId: source.assetId } });
      if (asset?.context === NOTEBOOK_UPLOAD_CONTEXT && !others) {
        await this.uploads.remove(source.assetId, user).catch((error: unknown) => {
          this.logger.warn(
            `Berkas sumber ${source.assetId} gagal dihapus: ${error instanceof Error ? error.message : error}`,
          );
        });
      }
    }
    if (source.content !== null) {
      await this.prisma.aiChunk.deleteMany({
        where: { userId: user.id, sourceType: NOTEBOOK_SOURCE, sourceId: source.id },
      });
    }
  }

  private findRecord(userId: string, type: NotebookRecordType, clientId: string) {
    if (!(NOTEBOOK_RECORD_TYPES as readonly string[]).includes(type)) return Promise.resolve(null);
    const model = RECORD_TABLES[type].model;
    const key = model.charAt(0).toLowerCase() + model.slice(1);
    const delegate = (this.prisma as unknown as Record<string, FindDelegate>)[key];
    return delegate
      .findUnique({ where: { userId_clientId: { userId, clientId } } })
      .then((row) => (row && !row.deletedAt ? row : null));
  }

  private async loadSources(userId: string, notebookId: string) {
    const sources = await this.prisma.notebookSource.findMany({ where: { notebookId }, orderBy: { createdAt: "asc" } });
    return this.loadSourceList(userId, sources);
  }

  /** Status & isi teks tiap sumber (bagian-bagian yang dibaca AI). */
  private async loadSourceList(userId: string, sources: NotebookSource[]): Promise<LoadedSource[]> {
    const assetIds = sources.map((s) => s.assetId).filter((id): id is string => !!id);
    const records = new Map<string, DomainRow | null>();
    for (const s of sources) {
      if (s.kind === NotebookSourceKind.record && s.recordType && s.recordId) {
        records.set(s.id, await this.findRecord(userId, s.recordType as NotebookRecordType, s.recordId));
      }
    }
    // Berkas milik resource (para_resource.uploadId) ikut dibaca
    const resourceUploads = new Map<string, string>();
    for (const [sourceId, row] of records) {
      const source = sources.find((s) => s.id === sourceId)!;
      if (row && source.recordType === "para_resource") {
        const uploadId = rowToPayload(RECORD_TABLES.para_resource as TableSpec, row).uploadId;
        if (typeof uploadId === "string") resourceUploads.set(sourceId, uploadId);
      }
    }
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: [...assetIds, ...resourceUploads.values()] }, userId },
      include: { extraction: true },
    });
    const assetById = new Map(assets.map((a) => [a.id, a]));

    return sources.map((source): LoadedSource => {
      const base = { source, parts: [] as SourcePart[], error: null as string | null };
      const part = (ref: SourceRef, text: string): SourcePart => ({
        notebookSourceId: source.id,
        sourceTitle: source.title,
        ref,
        text,
      });

      if (source.kind === NotebookSourceKind.upload) {
        const asset = source.assetId ? assetById.get(source.assetId) : undefined;
        const extraction = asset?.extraction;
        const version = `${extraction?.status ?? "none"}:${extraction?.completedAt?.toISOString() ?? ""}`;
        if (!asset) return { ...base, status: "missing", error: "Berkas sudah dihapus.", version };
        const assetInfo = { mimeType: asset.mimeType, ownedByNotebook: asset.context === NOTEBOOK_UPLOAD_CONTEXT };
        if (
          !extraction ||
          extraction.status === AssetExtractionStatus.pending ||
          extraction.status === AssetExtractionStatus.extracting
        ) {
          return { ...base, status: "processing", version, asset: assetInfo };
        }
        const text = extraction.status === AssetExtractionStatus.completed ? extraction.extractedText?.trim() : "";
        if (!text) {
          const reason = (extraction.metadata as { reason?: string } | null)?.reason;
          return {
            ...base,
            status: "failed",
            error: (reason && EXTRACTION_REASONS[reason]) || extraction.error || "Isi berkas tidak bisa dibaca.",
            version,
            asset: assetInfo,
          };
        }
        return {
          ...base,
          status: "ready",
          parts: [part({ sourceType: ASSET_SOURCE, sourceId: asset.id }, text)],
          version,
          asset: assetInfo,
        };
      }

      if (source.kind === NotebookSourceKind.record) {
        const row = records.get(source.id);
        if (!row) return { ...base, status: "missing", error: "Item sudah dihapus.", version: "missing" };
        const type = source.recordType as NotebookRecordType;
        const spec = RECORD_TABLES[type] as TableSpec;
        const { text } = renderRecord(type, rowToPayload(spec, row), spec.titleKey);
        const parts = [part({ sourceType: type, sourceId: source.recordId! }, text)];
        const uploadId = resourceUploads.get(source.id);
        const fileText = uploadId ? assetById.get(uploadId)?.extraction?.extractedText?.trim() : "";
        if (uploadId && fileText) parts.push(part({ sourceType: ASSET_SOURCE, sourceId: uploadId }, fileText));
        return {
          ...base,
          status: "ready",
          parts,
          version: `${(row.updatedAt as Date).toISOString()}:${fileText ? 1 : 0}`,
        };
      }

      // text & web
      const version = source.updatedAt.toISOString();
      if (!source.content?.trim()) {
        return { ...base, status: "failed", error: source.error ?? "Sumber tidak berisi teks.", version };
      }
      return {
        ...base,
        error: source.error,
        status: "ready",
        parts: [part({ sourceType: NOTEBOOK_SOURCE, sourceId: source.id }, source.content)],
        version,
      };
    });
  }

  private fingerprint(loaded: LoadedSource[]) {
    return sourcesFingerprint(
      loaded.filter((l) => l.source.enabled).map((l) => ({ id: l.source.id, version: `${l.status}:${l.version}` })),
    );
  }

  private toSourceResponse(loaded: LoadedSource) {
    const { source } = loaded;
    return {
      id: source.id,
      kind: source.kind,
      title: source.title,
      enabled: source.enabled,
      assetId: source.assetId,
      recordType: source.recordType,
      recordId: source.recordId,
      url: source.url,
      status: loaded.status,
      error: loaded.error,
      mimeType: loaded.asset?.mimeType ?? null,
      /** true = berkas diunggah langsung ke notebook (ikut terhapus); false = berkas dari LifeOS (tidak dihapus) */
      ownedByNotebook: loaded.asset?.ownedByNotebook ?? false,
      chars: loaded.parts.reduce((sum, p) => sum + p.text.length, 0),
      /** Cuplikan awal isi (pratinjau di panel sumber) */
      preview: loaded.parts[0]?.text.slice(0, 600) ?? "",
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    };
  }
}
