import { Module } from "@nestjs/common";
import { ExtractionQueueService } from "./extraction-queue.service";
import { ExtractionWorkerService } from "./extraction-worker.service";

@Module({
  providers: [ExtractionQueueService, ExtractionWorkerService],
  exports: [ExtractionQueueService],
})
export class ExtractionModule {}
