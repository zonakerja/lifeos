import { forwardRef, Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { ExtractionQueueService } from "./extraction-queue.service";
import { ExtractionWorkerService } from "./extraction-worker.service";
import { OfficeTextConverter } from "../office/office-text-converter";

@Module({
  imports: [forwardRef(() => AiModule)],
  providers: [ExtractionQueueService, ExtractionWorkerService, OfficeTextConverter],
  // OfficeTextConverter juga dipakai OfficeService (dokumen dari templat format lain)
  exports: [ExtractionQueueService, OfficeTextConverter],
})
export class ExtractionModule {}
