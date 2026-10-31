import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { RequestsModule } from "../requests/requests.module";
import { AgentController, AgentLlmController } from "./agent.controller";
import { AgentService } from "./agent.service";

/** Asisten Agen: jembatan backend ↔ Hermes (docs/AI-AGENT.md §23). */
@Module({
  imports: [AiModule, IntegrationsModule, RequestsModule],
  controllers: [AgentController, AgentLlmController],
  providers: [AgentService],
})
export class AgentModule {}
