import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { redisConnectionOptions } from "../redis/redis.module";

export const WHATSAPP_INBOUND_QUEUE = "whatsapp-inbound";

/**
 * Antrian pesan WhatsApp masuk: webhook Meta harus dijawab cepat (≤ beberapa detik), sedangkan jawaban AI bisa puluhan
 * detik. Satu percobaan saja — mengulang job berisiko membalas dua kali; kegagalan dicatat sebagai "perlu dijawab".
 */
@Injectable()
export class WhatsappQueueService implements OnModuleDestroy {
  private readonly queue: Queue<{ messageId: string }>;

  constructor(config: ConfigService) {
    this.queue = new Queue(WHATSAPP_INBOUND_QUEUE, {
      connection: redisConnectionOptions(config),
      defaultJobOptions: { attempts: 1, removeOnComplete: 1000, removeOnFail: 5000 },
    });
  }

  async enqueue(messageId: string) {
    await this.queue.add("process", { messageId }, { jobId: messageId });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
