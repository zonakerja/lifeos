import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { KnowledgeModule } from "../knowledge/knowledge.module";
import { RecordsModule } from "../records/records.module";
import { ApiTokensService } from "./api-tokens.service";
import { IntegrationsController, McpController } from "./integrations.controller";
import { LifeosMcpService } from "./lifeos-mcp.service";

/** Integrasi agen: token akses pribadi + MCP server LifeOS (docs/AI-AGENT.md tahap 3). */
@Module({
  imports: [AiModule, KnowledgeModule, RecordsModule],
  controllers: [IntegrationsController, McpController],
  providers: [ApiTokensService, LifeosMcpService],
})
export class IntegrationsModule {}
