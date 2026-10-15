import { forwardRef, Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { ExtractionQueueService } from "./extraction-queue.service";
import { ExtractionWorkerService } from "./extraction-worker.service";
import { OfficeTextConverter } from "../office/office-text-converter";

@Module({
  imports: [forwardRef(() => AiModule)],
  providers: [ExtractionQueueService, ExtractionWorkerService, OfficeTextConverter],
  exports: [ExtractionQueueService],
})
export class ExtractionModule {}
