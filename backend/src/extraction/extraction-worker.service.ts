import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AssetExtractionStatus, AssetStatus } from "@prisma/client";
import { Job, Worker } from "bullmq";
import { redisConnectionOptions } from "../redis/redis.module";
import { ASSET_EXTRACTION_QUEUE } from "./extraction-queue.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { PrismaService } from "../prisma/prisma.service";

/** Batas ukuran berkas teks yang dibaca ke memori untuk ekstraksi (lebih besar → unsupported). */
const MAX_EXTRACT_BYTES = 20 * 1024 * 1024;

@Injectable()
export class ExtractionWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExtractionWorkerService.name);
  private worker?: Worker<{ assetId: string }>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
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

    try {
      const extractedText =
        asset.size > MAX_EXTRACT_BYTES ? null : await this.extractText(asset.objectKey, asset.mimeType);
      const status = extractedText === null ? AssetExtractionStatus.unsupported : AssetExtractionStatus.completed;

      await this.prisma.assetExtraction.update({
        where: { assetId: asset.id },
        data: {
          status,
          extractedText,
          summary: extractedText ? this.createSummary(extractedText) : null,
          metadata: {
            mimeType: asset.mimeType,
            extractedCharacters: extractedText?.length ?? 0,
          },
          completedAt: new Date(),
        },
      });
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: { status: AssetStatus.ready },
      });
    } catch (error) {
      await this.prisma.assetExtraction.update({
        where: { assetId: asset.id },
        data: {
          status: AssetExtractionStatus.failed,
          error: error instanceof Error ? error.message : "Unknown extraction error",
          completedAt: new Date(),
        },
      });
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: { status: AssetStatus.failed },
      });
      throw error;
    }
  }

  private async extractText(objectKey: string, mimeType: string) {
    if (!this.isPlainText(mimeType)) return null;

    const buffer = await this.storage.getObjectBuffer(objectKey);
    return buffer.toString("utf8");
  }

  private isPlainText(mimeType: string) {
    return (
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      mimeType === "application/xml" ||
      mimeType === "application/yaml"
    );
  }

  private createSummary(text: string) {
    return text.replace(/\s+/g, " ").trim().slice(0, 500);
  }
}
