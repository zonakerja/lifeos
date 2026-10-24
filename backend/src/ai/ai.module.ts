import { forwardRef, Module } from "@nestjs/common";
import { ExtractionModule } from "../extraction/extraction.module";
import { AiChatController } from "./chat/ai-chat.controller";
import { AiChatService } from "./chat/ai-chat.service";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { AiIndexQueueService } from "./index/ai-index-queue.service";
import { AiIndexWorkerService } from "./index/ai-index-worker.service";
import { AiIndexService } from "./index/ai-index.service";

@Module({
  // Siklus modul: ekstraksi memakai OCR Gemini & antrian indeks, indeks memakai antrian ekstraksi ulang
  imports: [forwardRef(() => ExtractionModule)],
  controllers: [AiController, AiChatController],
  providers: [AiService, AiIndexQueueService, AiIndexService, AiIndexWorkerService, AiChatService],
  exports: [AiService, AiIndexQueueService, AiIndexService],
})
export class AiModule {}
