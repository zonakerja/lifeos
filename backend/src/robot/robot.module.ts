import { Module } from "@nestjs/common";
import { RecordsModule } from "../records/records.module";
import { UploadsModule } from "../uploads/uploads.module";
import { RobotClient } from "./robot-client";
import { RobotController } from "./robot.controller";
import { RobotService } from "./robot.service";

/** Konektor robot SRIKANDI & e-Kinerja lewat service robot Playwright (docs/AI-AGENT.md tahap 6 §21). */
@Module({
  imports: [RecordsModule, UploadsModule],
  controllers: [RobotController],
  providers: [RobotService, RobotClient],
  exports: [RobotService],
})
export class RobotModule {}
