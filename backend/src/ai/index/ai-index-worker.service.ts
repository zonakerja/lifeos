import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, UnrecoverableError, Worker } from "bullmq";
import { redisConnectionOptions } from "../../redis/redis.module";
import { isFallbackError } from "../ai-routing";
import { AiProviderError } from "../providers/ai-client";
import { AI_INDEX_QUEUE, type AiIndexJob } from "./ai-index-queue.service";
import { AiIndexService } from "./ai-index.service";

/**
 * Worker pengindeksan RAG (in-process). Satu job sekaligus agar kuota embedding Gemini tidak terlampaui; kuota habis /
 * Gemini tidak terjangkau dicoba ulang dengan backoff, key ditolak tidak diulang (dicatat sebagai error di status).
 */
@Injectable()
export class AiIndexWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiIndexWorkerService.name);
  private worker?: Worker<AiIndexJob>;

  constructor(
    private readonly config: ConfigService,
    private readonly index: AiIndexService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<AiIndexJob>(AI_INDEX_QUEUE, (job) => this.process(job), {
      concurrency: 1,
      connection: redisConnectionOptions(this.config),
    });
    this.worker.on("failed", (job, error) => {
      this.logger.warn(
        `Job indeks AI ${job?.name ?? "?"} gagal (percobaan ${job?.attemptsMade ?? "?"}): ${error.message}`,
      );
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<AiIndexJob>) {
    const data = job.data;
    try {
      if (data.kind === "source") await this.index.indexSource(data.userId, data.sourceType, data.sourceId);
      else if (data.kind === "rebuild") await this.index.rebuild(data.userId);
      else await this.index.purge(data.userId);
    } catch (error) {
      await this.index.markError(data.userId, error).catch(() => undefined);
      if (error instanceof AiProviderError && !isFallbackError(error.kind)) {
        throw new UnrecoverableError(`${error.kind}: ${error.providerMessage}`);
      }
      throw error;
    }
  }
}
