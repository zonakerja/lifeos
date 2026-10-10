import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiCredential, AiProvider } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AiCrypto, keyHint } from "./ai-crypto";
import { AI_PROVIDER_IDS, AI_PROVIDERS, type AttachmentKind, attachmentKind } from "./ai-providers";
import { isFallbackError, providerCandidates } from "./ai-routing";
import { SaveAiProviderDto, UpdateAiSettingsDto } from "./dto/ai.dto";
import { AiIndexQueueService } from "./index/ai-index-queue.service";
import { type AiAttachment, type AiClient, AiProviderError } from "./providers/ai-client";
import { anthropicClient } from "./providers/anthropic.client";
import { geminiClient } from "./providers/gemini.client";
import { openaiClient } from "./providers/openai.client";

const CLIENTS: Record<AiProvider, AiClient> = {
  gemini: geminiClient,
  anthropic: anthropicClient,
  openai: openaiClient,
};

/** Batas total lampiran per permintaan (dikirim inline ke provider). */
export const AI_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const AI_MAX_ATTACHMENTS = 5;

const TEST_PROMPT = "Balas hanya dengan satu kata: OK";

const OCR_PROMPT =
  "Salin seluruh teks yang terlihat pada dokumen/gambar ini apa adanya, pertahankan urutan, baris, dan tabel (tulis tabel dengan pemisah |). Bila tidak ada teks sama sekali, tulis deskripsi singkat isi gambar diawali 'Deskripsi gambar:'. Jangan menambahkan komentar lain.";

const KIND_LABELS: Record<AttachmentKind, string> = { image: "gambar", pdf: "PDF", audio: "audio", text: "teks" };

export interface AiFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Alasan jawaban diberikan oleh provider selain provider aktif. */
export type AiFallbackReason = "attachment" | "quota" | "unavailable" | "credential";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly crypto: AiCrypto;

  constructor(
    private readonly prisma: PrismaService,
    private readonly indexQueue: AiIndexQueueService,
    config: ConfigService,
  ) {
    this.crypto = new AiCrypto(config.getOrThrow<string>("AI_ENCRYPTION_KEY"));
  }

  // ---------------------------------------------------------------- Pengaturan

  async getSettings(userId: string) {
    const [user, credentials] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { aiProvider: true, aiFallback: true, aiIndexEnabled: true },
      }),
      this.prisma.aiCredential.findMany({ where: { userId } }),
    ]);
    return {
      activeProvider: user.aiProvider,
      fallbackEnabled: user.aiFallback,
      indexEnabled: user.aiIndexEnabled,
      providers: AI_PROVIDER_IDS.map((id) => {
        const info = AI_PROVIDERS[id];
        const credential = credentials.find((c) => c.provider === id);
        return {
          ...info,
          configured: !!credential,
          keyHint: credential?.keyHint ?? null,
          model: credential?.model ?? null,
          updatedAt: credential?.updatedAt ?? null,
        };
      }),
    };
  }

  async saveProvider(userId: string, provider: AiProvider, dto: SaveAiProviderDto) {
    const apiKey = dto.apiKey?.trim();
    const model = dto.model === undefined ? undefined : dto.model?.trim() || null;
    const existing = await this.findCredential(userId, provider);
    if (!existing && !apiKey) throw new BadRequestException("API key wajib diisi.");

    const secret = apiKey ? { encryptedKey: this.crypto.encrypt(apiKey), keyHint: keyHint(apiKey) } : {};
    await this.prisma.aiCredential.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, encryptedKey: "", keyHint: "", ...secret, model: model ?? null },
      update: { ...secret, ...(model !== undefined ? { model } : {}) },
    });
    // Provider pertama yang dikonfigurasi langsung aktif
    await this.prisma.user.updateMany({ where: { id: userId, aiProvider: null }, data: { aiProvider: provider } });
    // Embedding indeks pengetahuan memakai key Gemini: key baru → indeks dibangun (ulang)
    if (provider === AiProvider.gemini && apiKey) await this.indexQueue.enqueueRebuild(userId);
    return this.getSettings(userId);
  }

  async removeProvider(userId: string, provider: AiProvider) {
    await this.prisma.aiCredential.deleteMany({ where: { userId, provider } });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { aiProvider: true } });
    if (user.aiProvider === provider) {
      // Pindah ke provider lain yang masih punya key, atau matikan AI
      const next = await this.prisma.aiCredential.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
      await this.prisma.user.update({ where: { id: userId }, data: { aiProvider: next?.provider ?? null } });
    }
    return this.getSettings(userId);
  }

  /** Ganti provider aktif, sakelar cadangan otomatis, dan/atau sakelar indeks pengetahuan. */
  async updateSettings(userId: string, dto: UpdateAiSettingsDto) {
    const provider = dto.activeProvider;
    if (provider && !(await this.findCredential(userId, provider))) {
      throw new BadRequestException(`Simpan API key ${AI_PROVIDERS[provider].label} terlebih dahulu.`);
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(provider !== undefined ? { aiProvider: provider } : {}),
        ...(dto.fallbackEnabled !== undefined ? { aiFallback: dto.fallbackEnabled } : {}),
        ...(dto.indexEnabled !== undefined ? { aiIndexEnabled: dto.indexEnabled } : {}),
      },
    });
    // Dimatikan → indeks dihapus; dinyalakan → dibangun dari awal
    if (dto.indexEnabled === false) await this.indexQueue.enqueuePurge(userId);
    if (dto.indexEnabled === true) await this.indexQueue.enqueueRebuild(userId);
    return this.getSettings(userId);
  }

  /** Uji key & model satu provider dengan prompt singkat (tanpa cadangan). */
  async testProvider(userId: string, provider: AiProvider) {
    const credential = await this.findCredential(userId, provider);
    if (!credential) throw new BadRequestException(`API key ${AI_PROVIDERS[provider].label} belum disimpan.`);
    try {
      const result = await this.call(credential, TEST_PROMPT, []);
      return { ...result, text: result.text.slice(0, 200) };
    } catch (error) {
      throw this.toHttpError(error, credential);
    }
  }

  // ---------------------------------------------------------------- Dipakai indeks & ekstraksi

  async hasCredential(userId: string, provider: AiProvider) {
    return !!(await this.findCredential(userId, provider));
  }

  /** API key terdekripsi + model user untuk satu provider (null bila belum ada / tidak bisa didekripsi). */
  async getCredentialKey(userId: string, provider: AiProvider) {
    const credential = await this.findCredential(userId, provider);
    if (!credential) return null;
    try {
      return {
        apiKey: this.crypto.decrypt(credential.encryptedKey),
        model: credential.model || AI_PROVIDERS[provider].defaultModel,
      };
    } catch {
      return null;
    }
  }

  /**
   * Baca teks dari gambar / PDF hasil scan memakai Gemini milik pemilik berkas. Null bila user tidak punya key Gemini
   * (berkas tetap tersimpan, hanya tidak terindeks). Error provider dilempar sebagai `AiProviderError`.
   */
  async ocr(userId: string, data: Buffer, mimeType: string, name: string) {
    const credential = await this.getCredentialKey(userId, AiProvider.gemini);
    if (!credential) return null;
    const kind = mimeType === "application/pdf" ? "pdf" : "image";
    return geminiClient({
      ...credential,
      prompt: OCR_PROMPT,
      attachments: [{ kind, mimeType, name, data }],
    });
  }

  // ---------------------------------------------------------------- Generate

  /**
   * Jawab prompt dengan provider aktif. Bila cadangan otomatis menyala: lampiran yang tidak didukung provider aktif
   * diproses provider lain yang mendukung, dan kuota habis / provider tidak terjangkau dialihkan ke provider berikutnya
   * yang punya key. `fallback` di respons menjelaskan pengalihan agar user tahu siapa yang menjawab.
   */
  async generate(userId: string, prompt: string, files: AiFile[] = []) {
    const [user, credentials] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { aiProvider: true, aiFallback: true } }),
      this.prisma.aiCredential.findMany({ where: { userId } }),
    ]);
    const active = user.aiProvider;
    if (!active || !credentials.some((c) => c.provider === active)) {
      throw new BadRequestException("AI belum diatur. Pilih provider dan simpan API key di Pengaturan → AI.");
    }

    const attachments = this.toAttachments(files);
    const kinds = [...new Set(attachments.map((a) => a.kind))];
    const candidates = providerCandidates(
      active,
      credentials.map((c) => c.provider),
      kinds,
      user.aiFallback,
    );
    if (candidates.length === 0) throw this.unsupportedAttachments(active, kinds, user.aiFallback);

    let primaryError: unknown;
    for (const [index, provider] of candidates.entries()) {
      const credential = credentials.find((c) => c.provider === provider)!;
      try {
        const result = await this.call(credential, prompt, attachments);
        if (provider === active) return { ...result, fallback: null };
        // Provider aktif dilewati karena lampiran, atau gagal dengan error yang boleh dialihkan (isFallbackError)
        const reason = (
          candidates.includes(active) ? (primaryError as AiProviderError).kind : "attachment"
        ) as AiFallbackReason;
        return {
          ...result,
          fallback: { from: active, reason, message: this.fallbackMessage(active, provider, reason, kinds) },
        };
      } catch (error) {
        primaryError ??= error;
        const last = index === candidates.length - 1;
        if (last || !(error instanceof AiProviderError) || !isFallbackError(error.kind)) {
          // Tampilkan error provider pertama yang dicoba (biasanya provider aktif) — itu yang perlu dibereskan user
          const first = credentials.find((c) => c.provider === candidates[0])!;
          throw this.toHttpError(primaryError, first, index > 0 ? candidates.length - 1 : 0);
        }
      }
    }
    throw new UnprocessableEntityException("AI tidak memberikan jawaban.");
  }

  private toAttachments(files: AiFile[]): AiAttachment[] {
    if (files.length > AI_MAX_ATTACHMENTS) {
      throw new BadRequestException(`Maksimal ${AI_MAX_ATTACHMENTS} lampiran per permintaan AI.`);
    }
    if (files.reduce((sum, f) => sum + f.size, 0) > AI_MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException("Total lampiran untuk AI maksimal 20 MB.");
    }
    return files.map((file) => {
      // Multer mendekode nama file sebagai latin1; kembalikan ke UTF-8
      const name = Buffer.from(file.originalname, "latin1").toString("utf8");
      const kind = attachmentKind(file.mimetype);
      if (!kind) {
        throw new BadRequestException(`Format "${name}" tidak didukung AI. Gunakan PDF, gambar, audio, atau teks.`);
      }
      return { kind, mimeType: file.mimetype.split(";")[0].trim().toLowerCase(), name, data: file.buffer };
    });
  }

  private unsupportedAttachments(active: AiProvider, kinds: AttachmentKind[], fallbackEnabled: boolean) {
    const missing = kinds.filter((k) => !AI_PROVIDERS[active].supports[k]).map((k) => KIND_LABELS[k]);
    const supporters = AI_PROVIDER_IDS.filter((id) => kinds.every((k) => AI_PROVIDERS[id].supports[k])).map(
      (id) => AI_PROVIDERS[id].label,
    );
    const hint = fallbackEnabled
      ? `Simpan API key ${supporters.join(" / ")} di Pengaturan → AI agar dipakai otomatis untuk lampiran ini.`
      : `Nyalakan "Cadangan otomatis" atau ganti provider ke ${supporters.join(" / ")} di Pengaturan → AI.`;
    return new BadRequestException(
      `${AI_PROVIDERS[active].label} tidak mendukung lampiran ${missing.join(", ")}. ${hint}`,
    );
  }

  private fallbackMessage(from: AiProvider, to: AiProvider, reason: AiFallbackReason, kinds: AttachmentKind[]) {
    const fromLabel = AI_PROVIDERS[from].label;
    const toLabel = AI_PROVIDERS[to].label;
    if (reason === "attachment") {
      const missing = kinds.filter((k) => !AI_PROVIDERS[from].supports[k]).map((k) => KIND_LABELS[k]);
      return `Lampiran ${missing.join(", ")} diproses oleh ${toLabel} karena ${fromLabel} tidak mendukungnya.`;
    }
    const why = {
      quota: "kehabisan kuota/limit",
      unavailable: "tidak dapat dihubungi",
      credential: "API key-nya perlu dimasukkan ulang",
    }[reason];
    return `Dijawab oleh ${toLabel} (cadangan) karena ${fromLabel} ${why}.`;
  }

  /** Panggil satu provider; error dilempar sebagai `AiProviderError` (diterjemahkan ke HTTP oleh pemanggil). */
  private async call(credential: AiCredential, prompt: string, attachments: AiAttachment[]) {
    const info = AI_PROVIDERS[credential.provider];
    const model = credential.model || info.defaultModel;

    let apiKey: string;
    try {
      apiKey = this.crypto.decrypt(credential.encryptedKey);
    } catch {
      throw new AiProviderError("credential", "kunci enkripsi server berubah");
    }

    const started = Date.now();
    try {
      const text = await CLIENTS[credential.provider]({ apiKey, model, prompt, attachments });
      this.logger.log(`AI ${credential.provider}/${model} selesai (${Date.now() - started} ms)`);
      return { text, provider: credential.provider, model };
    } catch (error) {
      if (error instanceof AiProviderError) {
        this.logger.warn(
          `AI ${credential.provider}/${model} gagal (${error.kind}, ${Date.now() - started} ms): ${error.providerMessage}`,
        );
      }
      throw error;
    }
  }

  /**
   * Error provider → HTTP. Tidak memakai 401 (memicu refresh sesi di frontend) maupun ≥ 502 (disamarkan frontend
   * sebagai "server tidak dapat dihubungi"): kuota → 429, lainnya → 422 dengan pesan yang bisa ditindaklanjuti.
   * `failedFallbacks` = jumlah provider cadangan yang juga gagal.
   */
  private toHttpError(error: unknown, credential: AiCredential, failedFallbacks = 0) {
    if (!(error instanceof AiProviderError)) return error;
    const label = AI_PROVIDERS[credential.provider].label;
    const model = credential.model || AI_PROVIDERS[credential.provider].defaultModel;
    const detail = error.providerMessage;
    const suffix = failedFallbacks > 0 ? ` Provider cadangan juga gagal.` : "";
    switch (error.kind) {
      case "auth":
        return new UnprocessableEntityException(
          `API key ${label} ditolak. Periksa key di Pengaturan → AI. (${detail})${suffix}`,
        );
      case "quota":
        return new HttpException(
          `Kuota/limit API ${label} habis atau terlalu banyak permintaan. Coba lagi nanti. (${detail})${suffix}`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      case "model":
        return new UnprocessableEntityException(
          `Model "${model}" tidak tersedia di ${label}. Ganti model di Pengaturan → AI. (${detail})${suffix}`,
        );
      case "refusal":
        return new UnprocessableEntityException(`${label} menolak permintaan ini. (${detail})${suffix}`);
      case "invalid":
        return new UnprocessableEntityException(`${label} tidak dapat memproses permintaan: ${detail}${suffix}`);
      case "credential":
        return new UnprocessableEntityException(
          `API key ${label} tersimpan tidak bisa dibaca (kunci enkripsi server berubah). Masukkan ulang key di Pengaturan → AI.${suffix}`,
        );
      default:
        return new UnprocessableEntityException(
          `${label} tidak dapat dihubungi. Coba lagi nanti. (${detail})${suffix}`,
        );
    }
  }

  private findCredential(userId: string, provider: AiProvider) {
    return this.prisma.aiCredential.findUnique({ where: { userId_provider: { userId, provider } } });
  }
}
