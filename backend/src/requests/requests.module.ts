import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { UploadsModule } from "../uploads/uploads.module";
import { RequestsController } from "./requests.controller";
import { AssetVerificationService } from "./asset-verification.service";
import { RequestsService } from "./requests.service";

/** Pengajuan, mesin templat & Antrian Verifikasi (docs/AI-AGENT.md tahap 4). */
@Module({
  imports: [AiModule, UploadsModule],
  controllers: [RequestsController],
  providers: [RequestsService, AssetVerificationService],
  exports: [RequestsService, AssetVerificationService],
})
export class RequestsModule {}
