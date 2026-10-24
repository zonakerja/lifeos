import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { KnowledgeModule } from "../knowledge/knowledge.module";
import { RequestsModule } from "../requests/requests.module";
import { UploadsModule } from "../uploads/uploads.module";
import { WhatsappQueueService } from "./whatsapp-queue.service";
import { WhatsappWorkerService } from "./whatsapp-worker.service";
import { WhatsappController, WhatsappWebhookController } from "./whatsapp.controller";
import { WhatsappService } from "./whatsapp.service";

/** Bot WhatsApp (grup: satker/instansi/masyarakat/…) lewat WhatsApp Cloud API resmi (docs/AI-AGENT.md tahap 5). */
@Module({
  imports: [AiModule, KnowledgeModule, RequestsModule, UploadsModule],
  controllers: [WhatsappWebhookController, WhatsappController],
  providers: [WhatsappService, WhatsappQueueService, WhatsappWorkerService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
