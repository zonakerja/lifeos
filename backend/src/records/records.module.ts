import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { ArchiveAuditController } from "./archive-audit.controller";
import { RecordsController } from "./records.controller";
import { RecordsService } from "./records.service";

@Module({
  imports: [AiModule],
  controllers: [RecordsController, ArchiveAuditController],
  providers: [RecordsService],
})
export class RecordsModule {}
