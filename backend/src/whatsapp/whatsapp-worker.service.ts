import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker } from "bullmq";
import { redisConnectionOptions } from "../redis/redis.module";
import { WHATSAPP_INBOUND_QUEUE } from "./whatsapp-queue.service";
import { WhatsappService } from "./whatsapp.service";

/** Memproses pesan WhatsApp masuk satu per satu per kontak (konkurensi kecil; jawaban AI memakai kuota pemilik). */
@Injectable()
export class WhatsappWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappWorkerService.name);
  private worker?: Worker<{ messageId: string }>;

  constructor(
    private readonly config: ConfigService,
    private readonly whatsapp: WhatsappService,
  ) {}

  onModuleInit() {
    this.worker = new Worker(WHATSAPP_INBOUND_QUEUE, (job) => this.whatsapp.process(job.data.messageId), {
      concurrency: 2,
      connection: redisConnectionOptions(this.config),
    });
    this.worker.on("failed", (job, error) =>
      this.logger.error(`WhatsApp job ${job?.id ?? "unknown"} failed: ${error.message}`),
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
