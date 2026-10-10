import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import { AuditLogQueryDto } from "./dto/audit-log-query.dto";
import { RecordsService } from "./records.service";

/** Jejak audit perubahan data kearsipan (File Control). */
@ApiTags("archive-audit")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("archive-audit")
export class ArchiveAuditController {
  constructor(private readonly records: RecordsService) {}

  @Get()
  list(@Query() query: AuditLogQueryDto, @CurrentUser() user: AuthUser) {
    return this.records.auditLog(user, query);
  }
}
