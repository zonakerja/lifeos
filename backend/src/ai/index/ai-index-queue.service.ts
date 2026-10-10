import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { redisConnectionOptions } from "../../redis/redis.module";

export const AI_INDEX_QUEUE = "ai-index";

export type AiIndexJob =
  | { kind: "source"; userId: string; sourceType: string; sourceId: string }
  | { kind: "rebuild"; userId: string }
  | { kind: "purge"; userId: string };

/** Jeda sebelum mengindeks perubahan, agar ketikan beruntun cukup diproses sekali. */
const SOURCE_DELAY_MS = 3000;

/**
 * Antrian pengindeksan RAG. Deduplikasi per sumber: job yang masih menunggu tidak digandakan, dan perubahan saat job
 * sedang berjalan menghasilkan satu job lanjutan (`keepLastIfActive`) — worker selalu membaca data terbaru dari DB.
 */
@Injectable()
export class AiIndexQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(AiIndexQueueService.name);
  readonly queue: Queue<AiIndexJob>;

  constructor(config: ConfigService) {
    this.queue = new Queue(AI_INDEX_QUEUE, {
      connection: redisConnectionOptions(config),
      defaultJobOptions: {
        attempts: 6,
        backoff: { type: "exponential", delay: 15_000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    });
  }

  /** Indeks ulang satu sumber (record atau asset); dipanggil setelah data berubah/dihapus. Tidak pernah melempar. */
  enqueueSource(userId: string, sourceType: string, sourceId: string) {
    const id = `source|${userId}|${sourceType}|${sourceId}`;
    return this.add({ kind: "source", userId, sourceType, sourceId }, id, SOURCE_DELAY_MS);
  }

  enqueueRebuild(userId: string) {
    return this.add({ kind: "rebuild", userId }, `rebuild|${userId}`);
  }

  enqueuePurge(userId: string) {
    return this.add({ kind: "purge", userId }, `purge|${userId}`);
  }

  /** Jumlah job yang belum selesai (semua user). */
  pendingCount() {
    return this.queue.getJobCountByTypes("waiting", "delayed", "active", "prioritized");
  }

  private async add(data: AiIndexJob, dedupId: string, delay = 0) {
    try {
      await this.queue.add(data.kind, data, { delay, deduplication: { id: dedupId, keepLastIfActive: true } });
    } catch (error) {
      // Gagal mengantre tidak boleh menggagalkan penyimpanan data; indeks bisa dibangun ulang dari Pengaturan → AI
      this.logger.error(`Gagal mengantre indeks AI (${dedupId}): ${error instanceof Error ? error.message : error}`);
    }
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
