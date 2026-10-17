import { Body, Controller, Delete, Get, Param, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import { ListRecordsQueryDto } from "./dto/list-records-query.dto";
import { RecordOwnerQueryDto } from "./dto/record-owner-query.dto";
import { UpsertRecordDto } from "./dto/upsert-record.dto";
import { RecordsService } from "./records.service";

@ApiTags("records")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("records")
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Get(":type")
  findMany(@Param("type") type: string, @Query() query: ListRecordsQueryDto, @CurrentUser() user: AuthUser) {
    return this.records.findMany(this.records.parseType(type), query, user);
  }

  /** Satu entitas utuh (`?userId=` = pemilik item yang dibagikan) — melengkapi daftar ringan (`?light=1`). */
  @Get(":type/:clientId")
  findOne(
    @Param("type") type: string,
    @Param("clientId") clientId: string,
    @Query() query: RecordOwnerQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.records.findOne(this.records.parseType(type), clientId, query, user);
  }

  /** Buat atau perbarui satu entitas berdasarkan ID buatan client (idempotent). */
  @Put(":type/:clientId")
  upsert(
    @Param("type") type: string,
    @Param("clientId") clientId: string,
    @Body() dto: UpsertRecordDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.records.upsert(this.records.parseType(type), clientId, dto, user);
  }

  @Delete(":type/:clientId")
  remove(
    @Param("type") type: string,
    @Param("clientId") clientId: string,
    @Query() query: RecordOwnerQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.records.remove(this.records.parseType(type), clientId, query, user);
  }
}
