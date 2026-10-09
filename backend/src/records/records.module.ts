import { Module } from "@nestjs/common";
import { ArchiveAuditController } from "./archive-audit.controller";
import { RecordsController } from "./records.controller";
import { RecordsService } from "./records.service";

@Module({
  controllers: [RecordsController, ArchiveAuditController],
  providers: [RecordsService],
})
export class RecordsModule {}
