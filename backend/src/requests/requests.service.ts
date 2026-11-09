import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AssetExtractionStatus, Prisma, type Request } from "../generated/prisma/client";
import { chatCitations, EXCLUDED_STATUSES, numberSources } from "../ai/chat/ai-chat-context";
import { AiService } from "../ai/ai.service";
import { AiIndexService } from "../ai/index/ai-index.service";
import { KNOWLEDGE_COLLECTION } from "../ai/index/index-text";
import type { AuthUser } from "../common/types/auth-user";
import { todayLabel } from "../integrations/api-token-logic";
import { OFFICE_TEMPLATE_CONTEXT } from "../office/office.service";
import { PrismaService } from "../prisma/prisma.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { UploadsService } from "../uploads/uploads.service";
import {
  advanceStatus,
  buildAnalysisPrompt,
  buildFillPrompt,
  buildReviewPrompt,
  clampAttachments,
  fillMissingMeta,
  KIND_LABELS,
  parseAnalysis,
  parseFill,
  parseReview,
  type RequestContext,
  type RequestKind,
  type RequestStatus,
  withHistory,
} from "./request-logic";
import { CreateRequestDto, CreateRequestDocumentDto, UpdateRequestDto } from "./requests.dto";
import { analyzeTemplate, fillTemplate, unfilledFields, isSrikandiTag } from "./template-engine";

/** Konteks upload berkas pemohon & dokumen yang dibuat dari templat (ikut terhapus bersama pengajuan). */
export const REQUEST_UPLOAD_CONTEXT = "request";
export const REQUEST_DOCUMENT_CONTEXT = "request-document";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface Attachment {
  uploadId: string;
  name: string;
  mimeType: string;
}
export interface GeneratedDocument {
  uploadId: string;
  name: string;
  templateName: string;
  createdAt: string;
  /** Penanda & petunjuk yang belum terisi (tidak termasuk penanda SRIKANDI) */
  unfilled?: string[];
}

/** Dipanggil setelah user mengubah status pengajuan (mis. bot WhatsApp mengabari pemohon). */
export type RequestStatusListener = (request: Request, status: RequestStatus, note?: string) => Promise<void>;
/** Dipanggil setelah pengajuan baru dibuat (pemicu Kebijakan Otomatis). */
export type RequestCreatedListener = (request: Request) => Promise<void>;

/** Keputusan Kebijakan Otomatis yang disimpan di pengajuan (`auto_decision`). */
export interface AutoDecision {
  policyId: string;
  policyName: string;
  mode: string;
  outcome: "approve" | "review";
  applied: boolean;
  reasons: string[];
  score: number | null;
  decidedAt: string;
  registerId?: string;
  sendAt?: string;
  sentAt?: string;
  cancelledAt?: string;
  error?: string;
}

const asList = <T>(value: unknown) => (Array.isArray(value) ? (value as T[]) : []);
const LIST_SELECT = {
  id: true,
  kind: true,
  title: true,
  applicant: true,
  groupCode: true,
  letterNumber: true,
  letterDate: true,
  subject: true,
  status: true,
  source: true,
  attachments: true,
  documents: true,
  autoDecision: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Pengajuan & Antrian Verifikasi (tahap 4 docs/AI-AGENT.md): pengajuan dibuat manual / oleh agen (MCP), dianalisis
 * AI (ringkasan, ekstraksi data, kelengkapan terhadap persyaratan di basis pengetahuan), ditelaah + dikonsep jawabannya,
 * lalu dokumen dibuat dari templat instansi. Semua keluaran agen berstatus konsep sampai diverifikasi pengguna.
 */
@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);
  private readonly statusListeners: RequestStatusListener[] = [];
  private readonly createdListeners: RequestCreatedListener[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly index: AiIndexService,
    private readonly uploads: UploadsService,
    private readonly storage: ObjectStorageService,
  ) {}

  onStatusChange(listener: RequestStatusListener) {
    this.statusListeners.push(listener);
  }

  onCreated(listener: RequestCreatedListener) {
    this.createdListeners.push(listener);
  }

  /** Kabari pendengar status (WhatsApp) — dipakai juga setelah konsep keputusan otomatis tersimpan di SRIKANDI. */
  async emitStatus(request: Request, status: RequestStatus, note?: string) {
    for (const listener of this.statusListeners) {
      await listener(request, status, note).catch((error) =>
        this.logger.warn(
          `Kabar status pengajuan ${request.id} gagal: ${error instanceof Error ? error.message : error}`,
        ),
      );
    }
  }

  /** Simpan hasil verifikasi aset oleh server (bukan oleh agen). */
  async setAssetCheck(userId: string, id: string, check: Prisma.InputJsonValue) {
    await this.own(userId, id);
    await this.prisma.request.update({ where: { id }, data: { assetCheck: check } });
  }

  /**
   * Keputusan Kebijakan Otomatis — satu-satunya jalan selain pemilik untuk menyetujui. Disetujui hanya bila keputusan
   * benar-benar dijalankan (mode auto); selain itu pengajuan diserahkan ke pemilik (menunggu verifikasi) beserta alasannya.
   */
  async policyDecide(userId: string, id: string, decision: AutoDecision) {
    const current = await this.own(userId, id);
    if (!["baru", "diproses", "menunggu_verifikasi"].includes(current.status)) return current;
    const status: RequestStatus = decision.applied
      ? "disetujui"
      : advanceStatus(current.status as RequestStatus, "menunggu_verifikasi");
    const label = decision.applied
      ? `Disetujui otomatis (kebijakan ${decision.policyName})`
      : decision.outcome === "approve"
        ? `Memenuhi kebijakan ${decision.policyName}, tidak dijalankan`
        : `Diserahkan ke pemilik (kebijakan ${decision.policyName})`;
    return this.prisma.request.update({
      where: { id },
      data: {
        status,
        autoDecision: decision as unknown as Prisma.InputJsonValue,
        history: withHistory(
          current.history,
          status,
          "kebijakan",
          `${label}: ${decision.reasons.join(" ")}`,
        ) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /** Perbarui catatan keputusan otomatis (jadwal kirim, hasil kirim, pembatalan). */
  async patchAutoDecision(id: string, patch: Partial<AutoDecision>, reopenNote?: string) {
    const current = await this.prisma.request.findUnique({ where: { id } });
    if (!current?.autoDecision) return null;
    const data: Prisma.RequestUpdateInput = {
      autoDecision: { ...(current.autoDecision as object), ...patch } as Prisma.InputJsonValue,
    };
    // Kiriman dibatalkan → keputusan kembali ke pemilik
    if (reopenNote) {
      data.status = "menunggu_verifikasi";
      data.history = withHistory(
        current.history,
        "menunggu_verifikasi",
        "user",
        reopenNote,
      ) as unknown as Prisma.InputJsonValue;
    }
    return this.prisma.request.update({ where: { id }, data });
  }

  list(userId: string, status?: string) {
    return this.prisma.request.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: LIST_SELECT,
    });
  }

  async get(userId: string, id: string) {
    const request = await this.own(userId, id);
    return { ...request, files: await this.fileStatuses(request) };
  }

  async create(
    user: AuthUser,
    dto: CreateRequestDto,
    source: "manual" | "mcp" | "whatsapp" = "manual",
    extra: { waContactId?: string } = {},
  ) {
    const attachments = await this.attachmentsFor(user.id, dto.uploadIds ?? []);
    const request = await this.prisma.request.create({
      data: {
        userId: user.id,
        kind: dto.kind,
        title: dto.title.trim(),
        applicant: dto.applicant?.trim() || null,
        groupCode: dto.groupCode?.trim() || null,
        letterNumber: dto.letterNumber?.trim() || null,
        letterDate: dto.letterDate || null,
        subject: dto.subject?.trim() || null,
        message: dto.message?.trim() || null,
        source,
        waContactId: extra.waContactId ?? null,
        attachments: attachments as unknown as Prisma.InputJsonValue,
        history: withHistory([], "baru", source === "manual" ? "user" : "agen") as unknown as Prisma.InputJsonValue,
      },
    });
    for (const listener of this.createdListeners) {
      await listener(request).catch((error) =>
        this.logger.warn(`Pemicu pengajuan ${request.id} gagal: ${error instanceof Error ? error.message : error}`),
      );
    }
    return this.get(user.id, request.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateRequestDto) {
    const current = await this.own(user.id, id);
    const data: Prisma.RequestUpdateInput = {};
    for (const key of [
      "kind",
      "title",
      "applicant",
      "groupCode",
      "letterNumber",
      "subject",
      "message",
      "notes",
      "review",
      "draftReply",
    ] as const) {
      if (dto[key] !== undefined)
        (data as Record<string, unknown>)[key] = typeof dto[key] === "string" ? dto[key].trim() || null : null;
    }
    if (dto.title !== undefined && !dto.title.trim()) throw new BadRequestException("Judul wajib diisi.");
    if (dto.letterDate !== undefined) data.letterDate = dto.letterDate || null;
    if (dto.uploadIds) {
      const next = await this.attachmentsFor(user.id, dto.uploadIds);
      data.attachments = next as unknown as Prisma.InputJsonValue;
      // Berkas pemohon yang dilepas dihapus dari storage (milik pengajuan ini saja)
      const kept = new Set(next.map((a) => a.uploadId));
      for (const old of asList<Attachment>(current.attachments).filter((a) => !kept.has(a.uploadId))) {
        await this.removeUpload(user, old.uploadId);
      }
    }
    if (dto.status !== undefined || dto.statusNote) {
      const status = (dto.status ?? current.status) as RequestStatus;
      data.status = status;
      data.history = withHistory(
        current.history,
        status,
        "user",
        dto.statusNote?.trim() || undefined,
      ) as unknown as Prisma.InputJsonValue;
    }
    const updated = await this.prisma.request.update({ where: { id }, data });
    if (dto.status !== undefined && dto.status !== current.status) {
      for (const listener of this.statusListeners) {
        await listener(updated, dto.status as RequestStatus, dto.statusNote?.trim() || undefined).catch((error) =>
          this.logger.warn(`Kabar status pengajuan ${id} gagal: ${error instanceof Error ? error.message : error}`),
        );
      }
    }
    return this.get(user.id, id);
  }

  /** Tambah berkas pemohon ke pengajuan yang sudah ada (berkas susulan dari WhatsApp). */
  async appendAttachments(user: AuthUser, id: string, uploadIds: string[]) {
    const current = await this.own(user.id, id);
    const existing = asList<Attachment>(current.attachments);
    const added = await this.attachmentsFor(
      user.id,
      uploadIds.filter((u) => !existing.some((a) => a.uploadId === u)),
    );
    await this.prisma.request.update({
      where: { id },
      data: { attachments: [...existing, ...added] as unknown as Prisma.InputJsonValue },
    });
    return this.get(user.id, id);
  }

  async remove(user: AuthUser, id: string) {
    const request = await this.own(user.id, id);
    await this.prisma.request.delete({ where: { id } });
    for (const file of [...asList<Attachment>(request.attachments), ...asList<GeneratedDocument>(request.documents)]) {
      await this.removeUpload(user, file.uploadId);
    }
    return { success: true };
  }

  // ---------------------------------------------------------------- Agen AI

  /** Ringkasan, ekstraksi data, dan pemeriksaan kelengkapan terhadap persyaratan di basis pengetahuan. */
  async analyze(user: AuthUser, id: string) {
    const request = await this.own(user.id, id);
    const files = await this.readFiles(request);
    const query = `persyaratan kelengkapan ${KIND_LABELS[request.kind as RequestKind]} ${request.subject ?? request.title}`;
    const requirements = numberSources([
      await this.index.search(user.id, query, 6, {
        collections: [KNOWLEDGE_COLLECTION],
        excludeStatuses: EXCLUDED_STATUSES,
      }),
    ]);
    const profile = await this.profile(user.id);
    const result = await this.ai.generate(
      user.id,
      buildAnalysisPrompt({ request: this.context(request), files, requirements, profile: profile.aiProfile }),
      [],
      "chat",
    );
    const analysis = this.parseOrFail(() => parseAnalysis(result.text));
    const status = advanceStatus(request.status as RequestStatus, "diproses");
    await this.prisma.request.update({
      where: { id },
      data: {
        ...fillMissingMeta(this.context(request), analysis.fields),
        analysis: {
          ...analysis,
          sources: requirements.map((s) => ({
            n: s.n,
            title: s.title,
            sourceType: s.sourceType,
            sourceId: s.sourceId,
          })),
          analyzedAt: new Date().toISOString(),
          provider: result.provider,
        } as unknown as Prisma.InputJsonValue,
        status,
        history: withHistory(request.history, status, "agen") as unknown as Prisma.InputJsonValue,
      },
    });
    return { request: await this.get(user.id, id), fallback: result.fallback };
  }

  /** Telaah (bersitasi basis pengetahuan) + konsep jawaban surat. */
  async review(user: AuthUser, id: string) {
    const request = await this.own(user.id, id);
    const files = await this.readFiles(request);
    const analysis = request.analysis as { summary?: string } | null;
    const query = [request.subject ?? request.title, request.message ?? "", analysis?.summary ?? ""]
      .join("\n")
      .slice(0, 1_000);
    const sources = numberSources([
      await this.index.search(user.id, query, 8, {
        collections: [KNOWLEDGE_COLLECTION],
        excludeStatuses: EXCLUDED_STATUSES,
      }),
    ]);
    const profile = await this.profile(user.id);
    const result = await this.ai.generate(
      user.id,
      buildReviewPrompt({
        request: this.context(request),
        files,
        analysisSummary: analysis?.summary,
        sources,
        profile: profile.aiProfile,
        userName: profile.name,
      }),
      [],
      "chat",
    );
    const { review, draftReply } = this.parseOrFail(() => parseReview(result.text));
    const status = advanceStatus(request.status as RequestStatus, "diproses");
    await this.prisma.request.update({
      where: { id },
      data: {
        review,
        reviewCitations: chatCitations(review, sources) as unknown as Prisma.InputJsonValue,
        draftReply: draftReply || null,
        status,
        history: withHistory(request.history, status, "agen") as unknown as Prisma.InputJsonValue,
      },
    });
    return { request: await this.get(user.id, id), fallback: result.fallback };
  }

  // ---------------------------------------------------------------- Templat dokumen

  /** Penanda `${…}` & paragraf petunjuk sebuah templat DOCX (penanda SRIKANDI ditandai). */
  async templateFields(user: AuthUser, templateId: string) {
    const { analysis, name } = await this.loadTemplate(user, templateId);
    return {
      templateName: name,
      tags: analysis.tags.map((tag) => ({ name: tag, srikandi: isSrikandiTag(tag) })),
      slots: analysis.slots,
    };
  }

  /** Templat dokumen DOCX milik user (Tools → ONLYOFFICE → Templat) — pilihan agen untuk mengisi dokumen. */
  async templates(userId: string) {
    const rows = await this.prisma.asset.findMany({
      where: { userId, context: OFFICE_TEMPLATE_CONTEXT, originalName: { endsWith: ".docx", mode: "insensitive" } },
      select: { id: true, originalName: true, createdAt: true },
      orderBy: { originalName: "asc" },
    });
    return rows.map((r) => ({ id: r.id, name: r.originalName.replace(/\.docx$/i, ""), createdAt: r.createdAt }));
  }

  /** Teks ekstraksi berkas pemohon untuk agen (masih dibaca → 409, sama seperti analisis). */
  async fileTexts(userId: string, id: string) {
    return this.readFiles(await this.own(userId, id));
  }

  /**
   * Pembaruan oleh agen (MCP): hanya data surat, catatan, telaah, konsep jawaban; status hanya bisa **maju** ke
   * Diproses / Menunggu verifikasi. Persetujuan, penolakan, dan pengiriman tetap hanya oleh pemilik di aplikasi.
   */
  async agentUpdate(
    user: AuthUser,
    id: string,
    fields: Pick<
      UpdateRequestDto,
      "title" | "applicant" | "letterNumber" | "letterDate" | "subject" | "notes" | "review" | "draftReply"
    >,
    target?: "diproses" | "menunggu_verifikasi",
    note?: string,
  ) {
    const current = await this.own(user.id, id);
    if (!["baru", "diproses", "menunggu_verifikasi"].includes(current.status)) {
      throw new BadRequestException("Pengajuan sudah diputuskan pemilik — agen tidak bisa mengubahnya.");
    }
    const data: Prisma.RequestUpdateInput = {};
    for (const key of ["title", "applicant", "letterNumber", "subject", "notes", "review", "draftReply"] as const) {
      const value = fields[key];
      if (typeof value === "string" && value.trim()) (data as Record<string, unknown>)[key] = value.trim();
    }
    if (fields.letterDate) data.letterDate = fields.letterDate;
    const status = target ? advanceStatus(current.status as RequestStatus, target) : (current.status as RequestStatus);
    if (status !== current.status || note?.trim()) {
      data.status = status;
      data.history = withHistory(
        current.history,
        status,
        "agen",
        note?.trim() || undefined,
      ) as unknown as Prisma.InputJsonValue;
    }
    await this.prisma.request.update({ where: { id }, data });
    return this.get(user.id, id);
  }

  /** Usulan nilai penanda & teks paragraf petunjuk dari AI (belum disimpan — disunting pengguna dulu). */
  async suggestValues(user: AuthUser, id: string, templateId: string) {
    const request = await this.own(user.id, id);
    const { analysis, name } = await this.loadTemplate(user, templateId);
    const profile = await this.profile(user.id);
    const result = await this.ai.generate(
      user.id,
      buildFillPrompt({
        template: analysis,
        templateName: name,
        request: this.context(request),
        analysisFields: (request.analysis as { fields?: unknown } | null)?.fields,
        draftReply: request.draftReply,
        profile: profile.aiProfile,
        userName: profile.name,
        today: todayLabel(new Date()),
      }),
      [],
      "chat",
    );
    return { values: this.parseOrFail(() => parseFill(result.text, analysis)), fallback: result.fallback };
  }

  /** Buat dokumen DOCX dari templat + nilai → berkas pengajuan (dibuka di ONLYOFFICE untuk diperiksa). */
  async createDocument(user: AuthUser, id: string, dto: CreateRequestDocumentDto, by: "user" | "agen" = "user") {
    const request = await this.own(user.id, id);
    const { buffer, name: templateName } = await this.loadTemplate(user, dto.templateId);
    const values = Object.fromEntries(
      Object.entries(dto.values ?? {}).filter(([, v]) => typeof v === "string") as [string, string][],
    );
    const filled = fillTemplate(buffer, values);
    const base = (dto.name?.trim() || `${templateName} - ${request.title}`)
      .replace(/[\\/:*?"<>|]+/g, " ")
      .slice(0, 150);
    const asset = await this.uploads.createFromBuffer(
      filled,
      `${base}.docx`,
      DOCX_MIME,
      user,
      REQUEST_DOCUMENT_CONTEXT,
    );
    const documents: GeneratedDocument[] = [
      ...asList<GeneratedDocument>(request.documents),
      {
        uploadId: asset.id,
        name: `${base}.docx`,
        templateName,
        createdAt: new Date().toISOString(),
        unfilled: unfilledFields(filled),
      },
    ];
    const status = advanceStatus(request.status as RequestStatus, "menunggu_verifikasi");
    await this.prisma.request.update({
      where: { id },
      data: {
        documents: documents as unknown as Prisma.InputJsonValue,
        status,
        history: withHistory(request.history, status, by) as unknown as Prisma.InputJsonValue,
      },
    });
    return { document: documents[documents.length - 1], request: await this.get(user.id, id) };
  }

  /** Lepas dokumen hasil templat dari pengajuan (berkasnya dihapus). */
  async removeDocument(user: AuthUser, id: string, uploadId: string) {
    const request = await this.own(user.id, id);
    const documents = asList<GeneratedDocument>(request.documents);
    if (!documents.some((d) => d.uploadId === uploadId)) throw new NotFoundException("Dokumen tidak ditemukan.");
    await this.prisma.request.update({
      where: { id },
      data: { documents: documents.filter((d) => d.uploadId !== uploadId) as unknown as Prisma.InputJsonValue },
    });
    await this.removeUpload(user, uploadId);
    return this.get(user.id, id);
  }

  // ---------------------------------------------------------------- Bantuan

  private async own(userId: string, id: string): Promise<Request> {
    const request = await this.prisma.request.findFirst({ where: { id, userId } });
    if (!request) throw new NotFoundException("Pengajuan tidak ditemukan.");
    return request;
  }

  private context(request: Request): RequestContext {
    return {
      kind: request.kind as RequestKind,
      title: request.title,
      applicant: request.applicant,
      letterNumber: request.letterNumber,
      letterDate: request.letterDate,
      subject: request.subject,
      message: request.message,
      notes: request.notes,
    };
  }

  private profile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, aiProfile: true } });
  }

  /** Berkas pemohon harus milik user; nama & jenisnya disimpan agar daftar tidak perlu query tambahan. */
  private async attachmentsFor(userId: string, uploadIds: string[]): Promise<Attachment[]> {
    const ids = [...new Set(uploadIds)];
    if (!ids.length) return [];
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true, originalName: true, mimeType: true },
    });
    if (assets.length !== ids.length) throw new BadRequestException("Sebagian berkas tidak ditemukan.");
    return ids.map((id) => {
      const a = assets.find((x) => x.id === id)!;
      return { uploadId: a.id, name: a.originalName, mimeType: a.mimeType };
    });
  }

  private async fileStatuses(request: Request) {
    const attachments = asList<Attachment>(request.attachments);
    if (!attachments.length) return [];
    const extractions = await this.prisma.assetExtraction.findMany({
      where: { assetId: { in: attachments.map((a) => a.uploadId) } },
      select: { assetId: true, status: true },
    });
    return attachments.map((a) => ({
      ...a,
      extraction: extractions.find((e) => e.assetId === a.uploadId)?.status ?? null,
    }));
  }

  /** Teks berkas pemohon dari ekstraksi server; berkas yang masih dibaca → 409 (coba lagi sebentar). */
  private async readFiles(request: Request) {
    const attachments = asList<Attachment>(request.attachments);
    if (!attachments.length) return [];
    const rows = await this.prisma.assetExtraction.findMany({
      where: { assetId: { in: attachments.map((a) => a.uploadId) } },
      select: { assetId: true, status: true, extractedText: true },
    });
    const pending = rows.filter(
      (r) => r.status === AssetExtractionStatus.pending || r.status === AssetExtractionStatus.extracting,
    );
    if (pending.length)
      throw new ConflictException("Berkas pemohon masih dibaca server. Coba lagi beberapa detik lagi.");
    return clampAttachments(
      attachments.map((a) => {
        const row = rows.find((r) => r.assetId === a.uploadId);
        const text = row?.status === AssetExtractionStatus.completed ? (row.extractedText ?? "") : "";
        return { name: a.name, text: text.trim() || "(isi berkas tidak terbaca — mis. gambar tanpa key OCR)" };
      }),
    );
  }

  private async loadTemplate(user: AuthUser, templateId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: templateId, userId: user.id, context: OFFICE_TEMPLATE_CONTEXT },
      select: { objectKey: true, originalName: true },
    });
    if (!asset) throw new NotFoundException("Templat tidak ditemukan (Tools → ONLYOFFICE → Templat dokumen).");
    if (!/\.docx$/i.test(asset.originalName)) {
      throw new BadRequestException("Pengisian otomatis hanya untuk templat DOCX.");
    }
    const buffer = await this.storage.getObjectBuffer(asset.objectKey);
    try {
      return { buffer, analysis: analyzeTemplate(buffer), name: asset.originalName.replace(/\.docx$/i, "") };
    } catch (error) {
      throw new BadRequestException(`Templat tidak dapat dibaca: ${error instanceof Error ? error.message : error}`);
    }
  }

  private parseOrFail<T>(fn: () => T): T {
    try {
      return fn();
    } catch (error) {
      this.logger.warn(`Jawaban AI pengajuan tidak bisa dibaca: ${error instanceof Error ? error.message : error}`);
      throw new BadRequestException(
        "Jawaban AI tidak sesuai format. Coba lagi (atau ganti model di Pengaturan → Model AI).",
      );
    }
  }

  private async removeUpload(user: AuthUser, uploadId: string) {
    await this.uploads.remove(uploadId, user).catch((error) => {
      if (!(error instanceof NotFoundException)) {
        this.logger.warn(
          `Berkas pengajuan ${uploadId} gagal dihapus: ${error instanceof Error ? error.message : error}`,
        );
      }
    });
  }
}
