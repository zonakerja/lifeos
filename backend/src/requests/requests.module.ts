import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { UploadsModule } from "../uploads/uploads.module";
import { RequestsController } from "./requests.controller";
import { RequestsService } from "./requests.service";

/** Pengajuan satker, mesin templat & Antrian Verifikasi (docs/AI-AGENT.md tahap 4). */
@Module({
  imports: [AiModule, UploadsModule],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
