import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, stat, unlink } from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AssetExtractionStatus, AssetStatus } from "../generated/prisma/client";
import { AuthUser } from "../common/types/auth-user";
import { ExtractionQueueService } from "../extraction/extraction-queue.service";
import { PrismaService } from "../prisma/prisma.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { UploadsService } from "../uploads/uploads.service";
import { AiService } from "../ai/ai.service";
import { AI_PROVIDERS } from "../ai/ai-providers";
import { type CreateOfficeDocumentDto, type OfficeConfigDto, type OfficePreferencesDto } from "./dto/office.dto";
import {
  OFFICE_AI_MAX_IMAGES,
  OFFICE_AI_MAX_PROMPT,
  OFFICE_AI_MODEL_ID,
  ONLYOFFICE_AI_PLUGIN_GUID,
  bearerFromHeaders,
  chatCompletion,
  chatCompletionStream,
  chatToPrompt,
  modelList,
  officeAiPluginOptions,
  officeAiTarget,
  openAiError,
} from "./office-ai";
import { OfficeTextConverter } from "./office-text-converter";
import {
  editableFormats,
  formatInfo,
  viewableFormats,
  MAX_VERSIONS,
  NEW_DOCUMENT_MIME,
  type NewDocumentFormat,
  type OfficeCallbackBody,
  buildEditorConfig,
  callbackCarriesFile,
  callbackEndsSession,
  documentKey,
  documentTypeOf,
  effectiveAccess,
  fileFormat,
  newDocumentName,
  newOfficeKey,
  planVersionSave,
  parseFontFamilies,
  resolveBackendUrl,
  templateTarget,
  toInternalUrl,
  versionsToPrune,
} from "./office-logic";

/** Templat kosong (A4, locale id-ID) dari image ONLYOFFICE: `backend/templates/office/new.<format>`. */
const TEMPLATE_DIR = join(__dirname, "..", "..", "templates", "office");
/** Header JWT dari ONLYOFFICE (`JWT_HEADER` di container) — terpisah dari Bearer milik LifeOS. */
export const ONLYOFFICE_JWT_HEADER = "authorizationjwt";
/** Konteks berkas templat dokumen yang diunggah user di Tools → ONLYOFFICE. */
export const OFFICE_TEMPLATE_CONTEXT = "office-template";
const FILE_TOKEN_TTL = "1d";
// Sesi edit bisa terbuka lama; ONLYOFFICE tetap memanggil callback saat editor terakhir ditutup
const CALLBACK_TOKEN_TTL = "30d";
const DOWNLOAD_TIMEOUT_MS = 120_000;
const FORCESAVE_WAIT_MS = 15_000;
// Token sesi plugin AI LifeOS (selama editor terbuka); bukan API key provider
const AI_TOKEN_TTL = "12h";
/** Batas ukuran templat yang disalin/dikonversi. */
const MAX_TEMPLATE_BYTES = 50 * 1024 * 1024;

type OfficeTokenPayload = {
  assetId: string;
  purpose: "office-file" | "office-callback" | "office-ai";
  /** Pemilik sesi AI (hanya purpose office-ai). */
  userId?: string;
};

/**
 * Editor dokumen ONLYOFFICE Docs (menu Tools → ONLYOFFICE). Berkas tetap Asset LifeOS di object storage; ONLYOFFICE
 * mengunduhnya lewat link bertoken dan mengirim hasil edit lewat callback. Hak akses mengikuti pemilik/berbagi berkas.
 * Detail alur & keputusan: docs/ONLYOFFICE.md.
 */
@Injectable()
export class OfficeService {
  private readonly logger = new Logger(OfficeService.name);
  private readonly publicUrl?: string;
  private readonly internalUrl?: string;
  private readonly secret?: string;
  /** Callback per berkas diproses berurutan (force save & simpan akhir bisa datang hampir bersamaan). */
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly uploads: UploadsService,
    private readonly extraction: ExtractionQueueService,
    private readonly jwt: JwtService,
    private readonly ai: AiService,
    private readonly converter: OfficeTextConverter,
  ) {
    this.publicUrl = config.get<string>("ONLYOFFICE_URL")?.replace(/\/+$/, "") || undefined;
    this.internalUrl = config.get<string>("ONLYOFFICE_INTERNAL_URL")?.replace(/\/+$/, "") || this.publicUrl;
    this.secret = config.get<string>("ONLYOFFICE_JWT_SECRET") || undefined;
  }

  status() {
    return {
      enabled: !!this.publicUrl,
      documentServerUrl: this.publicUrl ?? null,
      editableFormats: editableFormats(),
      viewableFormats: viewableFormats(),
    };
  }

  /**
   * Diagnosis untuk halaman Tools → ONLYOFFICE: server sehat? versi? Detail teknis (alamat) hanya untuk admin.
   */
  async diagnose(user: AuthUser) {
    const admin = user.role === "super_admin" || user.role === "admin";
    const base = { ...this.status(), jwtConfigured: !!this.secret };
    if (!this.internalUrl) return { ...base, healthy: false, version: null, details: null };
    const healthy = await fetch(`${this.internalUrl}/healthcheck`, { signal: AbortSignal.timeout(5000) })
      .then(async (res) => res.ok && (await res.text()).trim() === "true")
      .catch(() => false);
    let version: string | null = null;
    if (healthy && this.secret) {
      const command = { c: "version" };
      version = await fetch(`${this.internalUrl}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...command, token: await this.jwt.signAsync(command, { secret: this.secret }) }),
        signal: AbortSignal.timeout(5000),
      })
        .then((res) => res.json() as Promise<{ version?: string }>)
        .then((data) => data.version ?? null)
        .catch(() => null);
    }
    return {
      ...base,
      healthy,
      version,
      details: admin
        ? { internalUrl: this.internalUrl, backendUrl: this.backendUrl(), maxVersions: MAX_VERSIONS }
        : null,
    };
  }

  /**
   * Dokumen baru milik user: kosong (Dokumen / Spreadsheet / Presentasi / PDF, templat bawaan id-ID) atau salinan
   * berkas templat yang boleh dibaca user (Resource bertag Templat). Templat format lain dikonversi ONLYOFFICE.
   */
  async createDocument(user: AuthUser, dto: CreateOfficeDocumentDto) {
    this.ensureEnabled();
    let buffer: Buffer;
    let format: NewDocumentFormat;
    let title = dto.title;
    if (dto.templateId) {
      const { asset } = await this.uploads.findWithPermission(dto.templateId, user);
      const source = fileFormat(asset.originalName);
      const target = templateTarget(source);
      if (!target) {
        throw new BadRequestException("Templat harus berupa dokumen, spreadsheet, presentasi, atau PDF.");
      }
      if (asset.size > MAX_TEMPLATE_BYTES) throw new BadRequestException("Berkas templat terlalu besar (maks. 50 MB).");
      format = target;
      title ||= asset.originalName.replace(/\.[^.]+$/, "");
      if (target === source) {
        buffer = Buffer.concat(await (await this.storage.getObject(asset.objectKey)).toArray());
      } else {
        const converted = await this.converter.convertFile(asset, target, MAX_TEMPLATE_BYTES);
        if (!converted) throw new UnprocessableEntityException("Templat gagal dikonversi oleh ONLYOFFICE.");
        buffer = converted;
      }
    } else {
      if (!dto.format) throw new BadRequestException("Pilih jenis dokumen.");
      format = dto.format;
      buffer = await readFile(join(TEMPLATE_DIR, `new.${format}`));
    }
    return this.uploads.createFromBuffer(
      buffer,
      newDocumentName(title, format),
      NEW_DOCUMENT_MIME[format],
      user,
      dto.context || "office",
      dto.ownerId,
    );
  }

  /**
   * Templat dokumen milik user: berkas yang diunggah di Tools → ONLYOFFICE (konteks `office-template`) dengan format yang
   * bisa menjadi dokumen baru (`templateTarget`). Dipakai "Buat Dokumen" → "Dari templat".
   */
  async templates(user: AuthUser) {
    const assets = await this.prisma.asset.findMany({
      where: { userId: user.id, context: OFFICE_TEMPLATE_CONTEXT },
      select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true, updatedAt: true },
      orderBy: { originalName: "asc" },
    });
    return assets.flatMap((asset) => {
      const target = templateTarget(fileFormat(asset.originalName));
      return target ? [{ ...asset, name: asset.originalName.replace(/\.[^.]+$/, ""), target }] : [];
    });
  }

  /** Keluarga font yang terpasang di server ONLYOFFICE (halaman Tools → ONLYOFFICE). */
  async fonts() {
    if (!this.internalUrl) return { available: false, families: [] as string[] };
    const script = await fetch(`${this.internalUrl}/sdkjs/common/AllFonts.js`, { signal: AbortSignal.timeout(5000) })
      .then((res) => (res.ok ? res.text() : null))
      .catch(() => null);
    return script ? { available: true, families: parseFontFamilies(script) } : { available: false, families: [] };
  }

  // ---------------------------------------------------------------- Preferensi & AI di editor

  /** Sakelar AI di editor milik user + provider/model AI LifeOS yang akan menjawab (null = belum diatur). */
  async preferences(user: AuthUser) {
    const profile = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { officeAi: true, aiProvider: true, aiCredentials: { select: { provider: true, model: true } } },
    });
    const credential = profile.aiCredentials.find((c) => c.provider === profile.aiProvider);
    const provider = credential ? AI_PROVIDERS[credential.provider] : null;
    return {
      ai: profile.officeAi,
      aiReady: !!credential,
      provider: provider ? { label: provider.label, model: credential!.model || provider.defaultModel } : null,
    };
  }

  async updatePreferences(user: AuthUser, dto: OfficePreferencesDto) {
    await this.prisma.user.update({ where: { id: user.id }, data: { officeAi: dto.ai } });
    return this.preferences(user);
  }

  /**
   * Permintaan tab AI ONLYOFFICE (plugin resmi dalam mode pengaturan server) — dibungkus plugin sebagai
   * `{ target, method, headers, data }`. Autentikasi = token sesi AI di `headers.Authorization` (dititipkan lewat config
   * editor bertanda tangan); isi Chat Completions diterjemahkan ke `AiService.generate` milik user. Selalu menjawab
   * format OpenAI (error = `{ error: { message } }`) agar plugin bisa menampilkannya.
   */
  async aiProxy(body: Record<string, unknown>): Promise<{ status: number; json?: unknown; sse?: string }> {
    const token = bearerFromHeaders(body.headers);
    let payload: OfficeTokenPayload | null = null;
    if (token) payload = await this.verifyToken(token, undefined, "office-ai").catch(() => null);
    if (!payload?.userId) {
      return { status: 401, json: openAiError("Sesi AI editor berakhir. Tutup lalu buka ulang dokumen.") };
    }
    const owner = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, officeAi: true },
    });
    if (!owner) return { status: 401, json: openAiError("Sesi AI editor tidak valid.") };
    if (!owner.officeAi) {
      return { status: 403, json: openAiError("AI di editor sedang dimatikan (Tools → ONLYOFFICE).") };
    }

    const target = officeAiTarget(body.target);
    if (target === "models") return { status: 200, json: modelList("AI LifeOS") };
    if (target !== "chat") {
      return { status: 400, json: openAiError("Fitur ini belum didukung AI LifeOS (hanya teks & gambar masukan).") };
    }
    let data: Record<string, unknown>;
    try {
      data = (typeof body.data === "string" ? JSON.parse(body.data) : body.data) as Record<string, unknown>;
    } catch {
      return { status: 400, json: openAiError("Isi permintaan AI tidak valid.") };
    }
    const { prompt, images } = chatToPrompt(data?.messages);
    if (!prompt.trim()) return { status: 400, json: openAiError("Permintaan AI kosong.") };
    if (prompt.length > OFFICE_AI_MAX_PROMPT) {
      return {
        status: 400,
        json: openAiError("Teks terlalu panjang untuk AI — pilih bagian dokumen yang lebih kecil."),
      };
    }
    if (images.length > OFFICE_AI_MAX_IMAGES) {
      return { status: 400, json: openAiError(`Maksimal ${OFFICE_AI_MAX_IMAGES} gambar per permintaan AI.`) };
    }
    try {
      const result = await this.ai.generate(
        owner.id,
        prompt,
        images.map((image, index) => ({
          originalname: `gambar-${index + 1}.${image.mimeType.split("/")[1] ?? "png"}`,
          mimetype: image.mimeType,
          size: image.data.length,
          buffer: image.data,
        })),
      );
      return data?.stream === true
        ? { status: 200, sse: chatCompletionStream(result.text, OFFICE_AI_MODEL_ID) }
        : { status: 200, json: chatCompletion(result.text, OFFICE_AI_MODEL_ID) };
    } catch (error) {
      const status = (error as { getStatus?: () => number }).getStatus?.() ?? 422;
      const message = error instanceof Error ? error.message : "AI gagal menjawab.";
      return { status, json: openAiError(message) };
    }
  }

  /** Origin aplikasi yang dipanggil tab AI editor: origin browser bila terdaftar di CORS_ORIGIN, selain itu yang pertama. */
  private appOrigin(requested?: string) {
    const origins = this.config
      .getOrThrow<string>("CORS_ORIGIN")
      .split(",")
      .map((origin) => origin.trim().replace(/\/+$/, ""));
    const wanted = requested?.replace(/\/+$/, "");
    return wanted && origins.includes(wanted) ? wanted : origins[0];
  }

  /**
   * Simpan paksa sesi edit yang sedang terbuka (dipanggil saat modal editor ditutup): perintah `forcesave` ke Command
   * Service ONLYOFFICE → ONLYOFFICE segera memanggil callback (status 6) → versi tersimpan. Menunggu sampai tersimpan
   * (maks. `FORCESAVE_WAIT_MS`) agar user tahu dokumennya aman sebelum modal hilang.
   */
  async forceSave(user: AuthUser, id: string) {
    this.ensureEnabled();
    const { asset, permission } = await this.uploads.findWithPermission(id, user, true);
    if (permission !== "edit") throw new ForbiddenException("Butuh izin edit untuk menyimpan dokumen.");
    if (!asset.officeKey) return { status: "no-session" as const };
    const before = asset.versionedAt?.getTime() ?? 0;

    const command = { c: "forcesave", key: documentKey(asset.id, asset.officeKey), userdata: user.id };
    const response = await fetch(`${this.internalUrl}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...command, token: await this.jwt.signAsync(command, { secret: this.secret }) }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!response?.ok) throw new UnprocessableEntityException("Server ONLYOFFICE tidak dapat dihubungi.");
    const result = (await response.json().catch(() => ({}))) as { error?: number };
    // 4 = tidak ada perubahan sejak penyimpanan terakhir; 1 = tidak ada sesi edit untuk kunci ini
    if (result.error === 4) return { status: "no-changes" as const };
    if (result.error === 1) return { status: "no-session" as const };
    if (result.error !== 0)
      throw new UnprocessableEntityException(`ONLYOFFICE menolak penyimpanan (kode ${result.error}).`);

    const deadline = Date.now() + FORCESAVE_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const current = await this.prisma.asset.findUnique({ where: { id }, select: { versionedAt: true } });
      if ((current?.versionedAt?.getTime() ?? 0) > before) return { status: "saved" as const };
    }
    // Callback belum selesai diproses (berkas besar / server sibuk) — tetap tersimpan sebentar lagi
    return { status: "pending" as const };
  }

  /** Config editor bertanda tangan untuk satu berkas yang boleh diakses user. */
  async editorConfig(user: AuthUser, dto: OfficeConfigDto) {
    const { publicUrl, secret } = this.ensureEnabled();
    const { asset, permission } = await this.uploads.findWithPermission(dto.uploadId, user);
    const format = fileFormat(asset.originalName);
    const documentType = documentTypeOf(format);
    if (!documentType) throw new BadRequestException("Format berkas ini tidak dapat dibuka di ONLYOFFICE.");

    const officeKey = asset.officeKey ?? (await this.ensureOfficeKey(asset.id));
    const access = effectiveAccess({ format, permission, requestedMode: dto.mode });
    const profile = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, officeAi: true },
    });
    const aiOn = !!profile?.officeAi;
    const aiToken = aiOn
      ? await this.sign({ assetId: asset.id, purpose: "office-ai", userId: user.id }, AI_TOKEN_TTL)
      : undefined;
    const backendUrl = this.backendUrl();
    const [fileToken, callbackToken] = await Promise.all([
      this.sign({ assetId: asset.id, purpose: "office-file" }, FILE_TOKEN_TTL),
      this.sign({ assetId: asset.id, purpose: "office-callback" }, CALLBACK_TOKEN_TTL),
    ]);

    const config = buildEditorConfig({
      asset: { id: asset.id, originalName: asset.originalName, officeKey },
      format,
      documentType,
      access,
      user: { id: user.id, name: profile?.name ?? user.email },
      fileUrl: `${backendUrl}/api/v1/office/files/${asset.id}/content?token=${encodeURIComponent(fileToken)}`,
      callbackUrl: `${backendUrl}/api/v1/office/callback?token=${encodeURIComponent(callbackToken)}`,
      mobile: dto.mobile,
      theme: dto.theme,
      ai: {
        enabled: aiOn,
        guid: ONLYOFFICE_AI_PLUGIN_GUID,
        pluginOptions: aiToken
          ? officeAiPluginOptions({ appOrigin: this.appOrigin(dto.appOrigin), token: aiToken, modelName: "AI LifeOS" })
          : undefined,
      },
    });
    const token = await this.jwt.signAsync(config, { secret, algorithm: "HS256" });
    return {
      documentServerUrl: publicUrl,
      access,
      // Format yang bisa disunting tetapi sebagian format bisa hilang saat disimpan (mis. ODT, RTF, CSV, TXT)
      lossy: access === "edit" && formatInfo(format)?.mode === "lossy",
      version: asset.version,
      ai: aiOn,
      config: { ...config, token },
    };
  }

  /** Isi berkas untuk ONLYOFFICE (link bertoken di `document.url`). */
  async openFile(id: string, token: string) {
    await this.verifyToken(token, id, "office-file");
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException("File tidak ditemukan.");
    return { asset, stream: await this.storage.getObject(asset.objectKey) };
  }

  /**
   * Callback ONLYOFFICE. Isi callback hanya dipercaya dari JWT ONLYOFFICE (header `AuthorizationJwt` atau field
   * `token`); token di URL mengikat callback ke satu berkas. Jawaban wajib `{ error: 0 }` (selain itu editor
   * menampilkan galat dan ONLYOFFICE mencoba lagi).
   */
  async handleCallback(token: string, headerJwt: string | undefined, rawBody: Record<string, unknown>) {
    const { assetId } = await this.verifyToken(token, undefined, "office-callback");
    const body = await this.verifyCallbackBody(headerJwt, rawBody);
    return this.withLock(assetId, async () => {
      const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
      // Berkas sudah dihapus selagi diedit: tidak ada yang bisa disimpan
      if (!asset) return { error: 0 };
      try {
        if (callbackCarriesFile(body)) await this.saveFromCallback(asset, body);
        const currentKey = asset.officeKey ? documentKey(asset.id, asset.officeKey) : null;
        if (callbackEndsSession(body.status) && body.key === currentKey) {
          await this.prisma.asset.update({ where: { id: asset.id }, data: { officeKey: newOfficeKey() } });
        }
        return { error: 0 };
      } catch (error) {
        this.logger.error(
          `Callback ONLYOFFICE ${asset.id} (status ${body.status}) gagal: ${error instanceof Error ? error.message : error}`,
        );
        return { error: 1 };
      }
    });
  }

  /** Versi isi berkas: saat ini + riwayat (terbaru dulu). */
  async listVersions(user: AuthUser, id: string) {
    const { asset, permission } = await this.uploads.findWithPermission(id, user);
    const history = await this.prisma.assetVersion.findMany({ where: { assetId: id }, orderBy: { version: "desc" } });
    const authorIds = [
      asset.versionAuthorId ?? asset.uploadedById ?? asset.userId,
      ...history.map((v) => v.authorId ?? asset.uploadedById ?? asset.userId),
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(authorIds)] } },
      select: { id: true, name: true },
    });
    const nameOf = (authorId: string) => users.find((u) => u.id === authorId)?.name ?? null;
    return {
      canRestore: permission === "edit",
      versions: [
        {
          version: asset.version,
          current: true,
          size: asset.size,
          createdAt: asset.versionedAt ?? asset.createdAt,
          authorName: nameOf(authorIds[0]),
        },
        ...history.map((v, i) => ({
          version: v.version,
          current: false,
          size: v.size,
          createdAt: v.createdAt,
          authorName: nameOf(authorIds[i + 1]),
        })),
      ],
    };
  }

  /** Isi versi lama (untuk dilihat/diunduh). */
  async openVersion(user: AuthUser, id: string, version: number) {
    const { asset } = await this.uploads.findWithPermission(id, user);
    if (version === asset.version) return { asset, stream: await this.storage.getObject(asset.objectKey) };
    const row = await this.prisma.assetVersion.findUnique({ where: { assetId_version: { assetId: id, version } } });
    if (!row) throw new NotFoundException("Versi tidak ditemukan.");
    return { asset: { ...asset, size: row.size }, stream: await this.storage.getObject(row.objectKey) };
  }

  /** Pulihkan versi lama sebagai versi terbaru (isi saat ini masuk riwayat, tidak ada yang hilang). */
  async restoreVersion(user: AuthUser, id: string, version: number) {
    const { permission } = await this.uploads.findWithPermission(id, user, true);
    if (permission !== "edit") throw new ForbiddenException("Butuh izin edit untuk memulihkan versi.");
    return this.withLock(id, async () => {
      const asset = await this.prisma.asset.findUniqueOrThrow({ where: { id } });
      if (version === asset.version) throw new BadRequestException("Versi ini sudah menjadi versi saat ini.");
      const source = await this.prisma.assetVersion.findUnique({
        where: { assetId_version: { assetId: id, version } },
      });
      if (!source) throw new NotFoundException("Versi tidak ditemukan.");

      const history = await this.prisma.assetVersion.findMany({ where: { assetId: id } });
      const prune = versionsToPrune(history);
      const objectKey = this.uploads.newObjectKey(asset.userId, asset.originalName);
      await this.storage.copyObject(source.objectKey, objectKey);
      try {
        await this.replaceContent(asset, {
          objectKey,
          size: source.size,
          checksum: source.checksum,
          authorId: user.id,
          pushSessionKey: null,
          prune: prune.map((v) => v.version),
          rotateKey: true,
        });
      } catch (error) {
        await this.storage.deleteObject(objectKey).catch(() => undefined);
        throw error;
      }
      await this.deleteObjects(prune.map((v) => v.objectKey));
      return this.listVersions(user, id);
    });
  }

  // ---------------------------------------------------------------- internal

  private async saveFromCallback(
    asset: {
      id: string;
      userId: string;
      originalName: string;
      mimeType: string;
      objectKey: string;
      checksum: string;
      officeKey: string | null;
    },
    body: OfficeCallbackBody,
  ) {
    const format = fileFormat(asset.originalName);
    if (body.filetype && body.filetype.toLowerCase() !== format) {
      throw new Error(`ONLYOFFICE mengembalikan format ${body.filetype}, berkas aslinya ${format}.`);
    }
    const url = toInternalUrl(body.url!, this.publicUrl!, this.internalUrl!);
    const file = await this.download(url);
    try {
      const sessionKey = body.key?.startsWith(`${asset.id}-`) ? body.key.slice(asset.id.length + 1) : (body.key ?? "");
      const history = await this.prisma.assetVersion.findMany({ where: { assetId: asset.id } });
      const plan = planVersionSave({
        currentChecksum: asset.checksum,
        newChecksum: file.checksum,
        sessionKey,
        history,
        stale: !asset.officeKey || body.key !== documentKey(asset.id, asset.officeKey),
      });
      if (plan.action === "unchanged") return;

      const objectKey = this.uploads.newObjectKey(asset.userId, asset.originalName);
      await this.storage.putObject({
        key: objectKey,
        body: createReadStream(file.path),
        contentLength: file.size,
        contentType: asset.mimeType,
        checksum: file.checksum,
      });
      try {
        if (plan.action === "archive") {
          await this.archiveContent(asset.id, {
            objectKey,
            size: file.size,
            checksum: file.checksum,
            authorId: body.users?.[0] ?? null,
            sessionKey,
            prune: plan.prune.map((v) => v.version),
          });
          await this.deleteObjects(plan.prune.map((v) => v.objectKey));
          return;
        }
        await this.replaceContent(asset, {
          objectKey,
          size: file.size,
          checksum: file.checksum,
          authorId: body.users?.[0] ?? null,
          pushSessionKey: plan.action === "push" ? sessionKey : undefined,
          prune: plan.action === "push" ? plan.prune.map((v) => v.version) : [],
          rotateKey: false,
        });
      } catch (error) {
        await this.storage.deleteObject(objectKey).catch(() => undefined);
        throw error;
      }
      // "replace": isi sebelumnya hanya simpanan antara di sesi yang sama → objeknya tidak disimpan
      await this.deleteObjects([
        ...(plan.action === "replace" ? [asset.objectKey] : []),
        ...(plan.action === "push" ? plan.prune.map((v) => v.objectKey) : []),
      ]);
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  /**
   * Ganti isi berkas dengan objek baru. `pushSessionKey` terdefinisi → isi lama masuk riwayat (dengan sesi yang
   * menggantikannya); `undefined` → isi lama ditimpa (versi tetap). Ekstraksi teks & indeks AI diulang.
   */
  private async replaceContent(
    asset: { id: string },
    next: {
      objectKey: string;
      size: number;
      checksum: string;
      authorId: string | null;
      pushSessionKey: string | null | undefined;
      prune: number[];
      rotateKey: boolean;
    },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.asset.findUniqueOrThrow({ where: { id: asset.id } });
      const push = next.pushSessionKey !== undefined;
      if (push) {
        await tx.assetVersion.create({
          data: {
            assetId: current.id,
            version: current.version,
            objectKey: current.objectKey,
            size: current.size,
            checksum: current.checksum,
            authorId: current.versionAuthorId ?? current.uploadedById,
            sessionKey: next.pushSessionKey,
            createdAt: current.versionedAt ?? current.createdAt,
          },
        });
      }
      if (next.prune.length) {
        await tx.assetVersion.deleteMany({ where: { assetId: current.id, version: { in: next.prune } } });
      }
      await tx.asset.update({
        where: { id: current.id },
        data: {
          objectKey: next.objectKey,
          size: next.size,
          checksum: next.checksum,
          version: push ? current.version + 1 : current.version,
          versionAuthorId: next.authorId,
          versionedAt: new Date(),
          status: AssetStatus.queued,
          ...(next.rotateKey ? { officeKey: newOfficeKey() } : {}),
        },
      });
      await tx.assetExtraction.updateMany({
        where: { assetId: current.id },
        data: { status: AssetExtractionStatus.pending, error: null },
      });
    });
    await this.extraction.enqueue(asset.id, { rerun: true }).catch((error: unknown) => {
      this.logger.error(`Gagal enqueue ekstraksi ${asset.id}: ${error instanceof Error ? error.message : error}`);
    });
  }

  /**
   * Isi dari sesi edit lama (setelah versi dipulihkan) → hanya ke riwayat: menjadi versi tepat di bawah isi saat ini,
   * nomor versi isi saat ini naik satu (isinya tetap).
   */
  private async archiveContent(
    assetId: string,
    entry: {
      objectKey: string;
      size: number;
      checksum: string;
      authorId: string | null;
      sessionKey: string;
      prune: number[];
    },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.asset.findUniqueOrThrow({ where: { id: assetId } });
      if (entry.prune.length) {
        await tx.assetVersion.deleteMany({ where: { assetId, version: { in: entry.prune } } });
      }
      await tx.assetVersion.create({
        data: {
          assetId,
          version: current.version,
          objectKey: entry.objectKey,
          size: entry.size,
          checksum: entry.checksum,
          authorId: entry.authorId,
          sessionKey: entry.sessionKey,
          createdAt: new Date(),
        },
      });
      await tx.asset.update({ where: { id: assetId }, data: { version: current.version + 1 } });
    });
  }

  /** Unduh berkas hasil edit dari ONLYOFFICE ke berkas sementara (streaming, dengan batas ukuran) + SHA-256. */
  private async download(url: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), redirect: "error" });
    if (!response.ok || !response.body) throw new Error(`Unduh berkas dari ONLYOFFICE gagal (${response.status}).`);
    const maxBytes = this.config.getOrThrow<number>("UPLOAD_MAX_MB") * 1024 * 1024;
    const dir = join(tmpdir(), "lifeos-office");
    await mkdir(dir, { recursive: true });
    const path = join(dir, randomUUID());
    const hasher = createHash("sha256");
    let size = 0;
    try {
      await pipeline(
        Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            size += chunk.length;
            if (size > maxBytes) return callback(new Error("Berkas hasil edit melebihi batas ukuran upload."));
            hasher.update(chunk);
            callback(null, chunk);
          },
        }),
        createWriteStream(path),
      );
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    }
    return { path, size: (await stat(path)).size, checksum: hasher.digest("hex") };
  }

  private async deleteObjects(keys: string[]) {
    for (const key of keys) {
      await this.storage
        .deleteObject(key)
        .catch((error) =>
          this.logger.warn(`Objek ${key} gagal dihapus: ${error instanceof Error ? error.message : error}`),
        );
    }
  }

  /** Kunci sesi pertama (berkas yang belum pernah dibuka di ONLYOFFICE). Aman dipanggil bersamaan. */
  private async ensureOfficeKey(assetId: string) {
    await this.prisma.asset.updateMany({
      where: { id: assetId, officeKey: null },
      data: { officeKey: newOfficeKey() },
    });
    return (await this.prisma.asset.findUniqueOrThrow({ where: { id: assetId }, select: { officeKey: true } }))
      .officeKey!;
  }

  private backendUrl() {
    return resolveBackendUrl(
      this.config.getOrThrow<string>("ONLYOFFICE_BACKEND_URL"),
      this.config.getOrThrow<number>("PORT"),
      networkInterfaces(),
    );
  }

  private ensureEnabled() {
    if (!this.publicUrl || !this.secret) {
      throw new ServiceUnavailableException("Editor ONLYOFFICE belum diatur di server (ONLYOFFICE_URL).");
    }
    return { publicUrl: this.publicUrl, secret: this.secret };
  }

  private sign(payload: OfficeTokenPayload, expiresIn: string) {
    return this.jwt.signAsync(payload, { expiresIn: expiresIn as `${number}d` | `${number}h` });
  }

  private async verifyToken(token: string, assetId: string | undefined, purpose: OfficeTokenPayload["purpose"]) {
    let payload: OfficeTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<OfficeTokenPayload>(token);
    } catch {
      throw new UnauthorizedException("Token ONLYOFFICE tidak valid atau kedaluwarsa.");
    }
    if (payload.purpose !== purpose || (assetId && payload.assetId !== assetId)) {
      throw new UnauthorizedException("Token ONLYOFFICE tidak valid.");
    }
    return payload;
  }

  /** Isi callback dari JWT ONLYOFFICE: header berisi `{ payload: body }`, field `token` berisi body itu sendiri. */
  private async verifyCallbackBody(headerJwt: string | undefined, rawBody: Record<string, unknown>) {
    const { secret } = this.ensureEnabled();
    const bearer = headerJwt?.replace(/^Bearer\s+/i, "");
    const token = bearer || (typeof rawBody.token === "string" ? rawBody.token : undefined);
    if (!token) throw new UnauthorizedException("Callback ONLYOFFICE tanpa token.");
    try {
      const decoded = await this.jwt.verifyAsync<Record<string, unknown>>(token, { secret, algorithms: ["HS256"] });
      const body = bearer && decoded.payload && typeof decoded.payload === "object" ? decoded.payload : decoded;
      return body as OfficeCallbackBody;
    } catch {
      throw new UnauthorizedException("Token callback ONLYOFFICE tidak valid.");
    }
  }

  private withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    this.locks.set(key, run);
    const release = () => {
      if (this.locks.get(key) === run) this.locks.delete(key);
    };
    run.then(release, release);
    return run;
  }
}
