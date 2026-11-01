import { Module } from "@nestjs/common";
import { RobotModule } from "../robot/robot.module";
import { AutomationController } from "./automation.controller";
import { AutomationService } from "./automation.service";
import { AutomationWorkerService } from "./automation-worker.service";

/** Otomasi terjadwal (cron BullMQ) untuk sinkron robot baca-saja — Tools → Otomasi. */
@Module({
  imports: [RobotModule],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationWorkerService],
})
export class AutomationModule {}
