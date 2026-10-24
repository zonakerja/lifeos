import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import {
  CreateRequestDocumentDto,
  CreateRequestDto,
  ListRequestsQueryDto,
  TemplateRefDto,
  UpdateRequestDto,
} from "./requests.dto";
import { RequestsService } from "./requests.service";

/** Pengajuan & Antrian Verifikasi (data milik user sendiri). */
@ApiTags("requests")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("requests")
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListRequestsQueryDto) {
    return this.requests.list(user.id, query.status);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRequestDto) {
    return this.requests.create(user, dto);
  }

  @Get("templates/:templateId/fields")
  templateFields(@CurrentUser() user: AuthUser, @Param("templateId") templateId: string) {
    return this.requests.templateFields(user, templateId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.requests.get(user.id, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateRequestDto) {
    return this.requests.update(user, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.requests.remove(user, id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post(":id/analyze")
  analyze(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.requests.analyze(user, id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post(":id/review")
  review(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.requests.review(user, id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post(":id/suggest-values")
  suggest(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: TemplateRefDto) {
    return this.requests.suggestValues(user, id, dto.templateId);
  }

  @Post(":id/documents")
  createDocument(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: CreateRequestDocumentDto) {
    return this.requests.createDocument(user, id, dto);
  }

  @Delete(":id/documents/:uploadId")
  removeDocument(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("uploadId") uploadId: string) {
    return this.requests.removeDocument(user, id, uploadId);
  }
}
