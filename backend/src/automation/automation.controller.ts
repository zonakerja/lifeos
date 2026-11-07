import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import { AutomationRunsQueryDto, UpdateAutomationJobDto } from "./automation.dto";
import { AutomationService } from "./automation.service";

/** Otomasi (tab Connector): jadwal sinkron robot milik user sendiri + riwayat run. */
@ApiTags("automation")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("automation")
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get("jobs")
  jobs(@CurrentUser() user: AuthUser) {
    return this.automation.list(user.id);
  }

  @Get("alerts")
  alerts(@CurrentUser() user: AuthUser) {
    return this.automation.alerts(user.id);
  }

  @Patch("jobs/:kind")
  update(@CurrentUser() user: AuthUser, @Param("kind") kind: string, @Body() dto: UpdateAutomationJobDto) {
    return this.automation.update(user.id, kind, dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @HttpCode(202)
  @Post("jobs/:kind/run")
  run(@CurrentUser() user: AuthUser, @Param("kind") kind: string) {
    return this.automation.runNow(user.id, kind);
  }

  @Get("runs")
  runs(@CurrentUser() user: AuthUser, @Query() query: AutomationRunsQueryDto) {
    return this.automation.runs(user.id, query.kind, query.take);
  }
}
