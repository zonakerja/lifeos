import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { SharingModule } from "../sharing/sharing.module";
import { ArchiveAuditController } from "./archive-audit.controller";
import { RecordsController } from "./records.controller";
import { RecordsService } from "./records.service";

@Module({
  imports: [AiModule, SharingModule],
  controllers: [RecordsController, ArchiveAuditController],
  providers: [RecordsService],
})
export class RecordsModule {}
