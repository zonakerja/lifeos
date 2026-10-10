import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { redisConnectionOptions } from "../redis/redis.module";

export const ASSET_EXTRACTION_QUEUE = "asset-extraction";

@Injectable()
export class ExtractionQueueService implements OnModuleDestroy {
  private readonly queue: Queue<{ assetId: string }>;

  constructor(config: ConfigService) {
    this.queue = new Queue(ASSET_EXTRACTION_QUEUE, {
      connection: redisConnectionOptions(config),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }

  /** `rerun`: ekstrak ulang berkas yang dulu belum didukung (job lama dengan id yang sama masih tersimpan). */
  async enqueue(assetId: string, options: { rerun?: boolean } = {}) {
    const jobId = options.rerun ? `${assetId}-rerun-${Date.now()}` : assetId;
    await this.queue.add("extract", { assetId }, { jobId });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
