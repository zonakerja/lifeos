import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { UploadsModule } from "../uploads/uploads.module";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeVaultService } from "./knowledge-vault.service";

@Module({
  imports: [AiModule, UploadsModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeVaultService],
})
export class KnowledgeModule {}
