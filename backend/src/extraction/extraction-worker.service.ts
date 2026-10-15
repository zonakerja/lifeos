import { forwardRef, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AssetExtractionStatus, AssetStatus } from "../generated/prisma/client";
import { Job, Worker } from "bullmq";
import { AiService } from "../ai/ai.service";
import { isFallbackError } from "../ai/ai-routing";
import { AiIndexQueueService } from "../ai/index/ai-index-queue.service";
import { ASSET_SOURCE } from "../ai/index/index-text";
import { AiProviderError } from "../ai/providers/ai-client";
import { redisConnectionOptions } from "../redis/redis.module";
import { ASSET_EXTRACTION_QUEUE } from "./extraction-queue.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { PrismaService } from "../prisma/prisma.service";
import { OfficeTextConverter } from "../office/office-text-converter";
import { type ExtractionMethod, extractDocumentText, isExtractable, normalizeMimeType } from "./text-extractors";

/** Batas ukuran berkas yang dibaca ke memori untuk ekstraksi (lebih besar → unsupported). */
const MAX_EXTRACT_BYTES = 20 * 1024 * 1024;
/** Batas teks yang disimpan per berkas. */
const MAX_EXTRACTED_CHARS = 2_000_000;

/** Alasan berkas tidak menghasilkan teks (disimpan di `metadata.reason`). */
type SkipReason = "unsupported_type" | "too_large" | "needs_gemini_key" | "empty";

/**
 * Ekstraksi teks berkas upload (in-process, BullMQ): teks polos, PDF (lapisan teks), DOCX, XLSX; gambar dan PDF hasil
 * scan dibaca lewat Gemini milik pemilik berkas (OCR). Hasilnya dipakai ringkasan AI dan indeks pengetahuan (RAG).
 */
@Injectable()
export class ExtractionWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExtractionWorkerService.name);
  private worker?: Worker<{ assetId: string }>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    @Inject(forwardRef(() => AiService)) private readonly ai: AiService,
    @Inject(forwardRef(() => AiIndexQueueService)) private readonly indexQueue: AiIndexQueueService,
    private readonly officeText: OfficeTextConverter,
  ) {}

  onModuleInit() {
    const concurrency = this.config.getOrThrow<number>("EXTRACTION_CONCURRENCY");
    this.worker = new Worker(ASSET_EXTRACTION_QUEUE, async (job) => this.extract(job), {
      concurrency,
      connection: redisConnectionOptions(this.config),
    });

    this.worker.on("failed", (job, error) => {
      this.logger.error(`Extraction job ${job?.id ?? "unknown"} failed: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async extract(job: Job<{ assetId: string }>) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: job.data.assetId },
    });
    if (!asset) return;

    await this.prisma.asset.update({
      where: { id: asset.id },
      data: { status: AssetStatus.extracting },
    });
    await this.prisma.assetExtraction.update({
      where: { assetId: asset.id },
      data: {
        status: AssetExtractionStatus.extracting,
        startedAt: new Date(),
        error: null,
      },
    });

    const mimeType = normalizeMimeType(asset.mimeType, asset.originalName);
    try {
      const result = await this.readText(asset, mimeType);
      const text = "text" in result ? result.text.slice(0, MAX_EXTRACTED_CHARS) : null;

      await this.prisma.assetExtraction.update({
        where: { assetId: asset.id },
        data: {
          status: text ? AssetExtractionStatus.completed : AssetExtractionStatus.unsupported,
          extractedText: text,
          summary: text ? this.createSummary(text) : null,
          metadata: {
            mimeType,
            extractedCharacters: text?.length ?? 0,
            ...("method" in result ? { method: result.method, pages: result.pages } : { reason: result.reason }),
          },
          completedAt: new Date(),
        },
      });
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: { status: AssetStatus.ready },
      });
      if (text) await this.indexQueue.enqueueSource(asset.userId, ASSET_SOURCE, asset.id);
    } catch (error) {
      const message =
        error instanceof AiProviderError
          ? `OCR Gemini: ${error.providerMessage}`
          : error instanceof Error
            ? error.message
            : "Unknown extraction error";
      await this.prisma.assetExtraction.update({
        where: { assetId: asset.id },
        data: {
          status: AssetExtractionStatus.failed,
          error: message,
          completedAt: new Date(),
        },
      });
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: { status: AssetStatus.failed },
      });
      // Key ditolak / berkas rusak tidak akan berhasil bila diulang; kuota habis & gangguan jaringan diulang BullMQ
      if (!(error instanceof AiProviderError) || isFallbackError(error.kind)) throw error;
    }
  }

  private async readText(
    asset: { id: string; userId: string; objectKey: string; size: number; originalName: string; checksum: string },
    mimeType: string,
  ): Promise<{ text: string; method: ExtractionMethod; pages?: number } | { reason: SkipReason }> {
    const { userId, objectKey, size, originalName: name } = asset;
    if (!isExtractable(mimeType)) {
      // Dokumen kantor lain (PPTX, ODT, RTF, DOC, ODS, XLS, …) dibaca lewat konversi ONLYOFFICE bila server diatur
      if (!this.officeText.canConvert(name)) return { reason: "unsupported_type" };
      if (size > MAX_EXTRACT_BYTES) return { reason: "too_large" };
      const text = await this.officeText.convert(asset);
      if (text === null) return { reason: "unsupported_type" };
      return text.trim() ? { text, method: "onlyoffice" } : { reason: "empty" };
    }
    if (size > MAX_EXTRACT_BYTES) return { reason: "too_large" };

    const buffer = await this.storage.getObjectBuffer(objectKey);
    const outcome = await extractDocumentText(buffer, mimeType);
    if (outcome === null) return { reason: "unsupported_type" };
    if (outcome === "ocr") {
      const text = await this.ai.ocr(userId, buffer, mimeType, name);
      if (text === null) return { reason: "needs_gemini_key" };
      return text.trim() ? { text, method: "ocr" } : { reason: "empty" };
    }
    return outcome.text.trim() ? outcome : { reason: "empty" };
  }

  private createSummary(text: string) {
    return text.replace(/\s+/g, " ").trim().slice(0, 500);
  }
}
