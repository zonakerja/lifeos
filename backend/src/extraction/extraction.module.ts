import { forwardRef, Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { ExtractionQueueService } from "./extraction-queue.service";
import { ExtractionWorkerService } from "./extraction-worker.service";

@Module({
  imports: [forwardRef(() => AiModule)],
  providers: [ExtractionQueueService, ExtractionWorkerService],
  exports: [ExtractionQueueService],
})
export class ExtractionModule {}
