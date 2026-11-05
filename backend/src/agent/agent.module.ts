import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { RecordsModule } from "../records/records.module";
import { RequestsModule } from "../requests/requests.module";
import { RobotModule } from "../robot/robot.module";
import { AgentController, AgentLlmController } from "./agent.controller";
import { AgentPolicyService } from "./agent-policy.service";
import { AgentService } from "./agent.service";

/** Asisten Agen: jembatan backend ↔ Hermes + Kebijakan Otomatis (docs/AI-AGENT.md §23–§24). */
@Module({
  imports: [AiModule, IntegrationsModule, RequestsModule, RecordsModule, RobotModule],
  controllers: [AgentController, AgentLlmController],
  providers: [AgentService, AgentPolicyService],
})
export class AgentModule {}
