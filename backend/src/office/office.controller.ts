import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import { CreateOfficeDocumentDto, OfficeConfigDto } from "./dto/office.dto";
import { ONLYOFFICE_JWT_HEADER, OfficeService } from "./office.service";

const contentDisposition = (name: string, disposition: "inline" | "attachment") =>
  `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`;

/** Editor dokumen ONLYOFFICE (menu Tools → ONLYOFFICE). Detail: docs/ONLYOFFICE.md. */
@ApiTags("office")
@Controller("office")
export class OfficeController {
  constructor(private readonly office: OfficeService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("status")
  status() {
    return this.office.status();
  }

  /** Kesehatan & versi server ONLYOFFICE (halaman Tools → ONLYOFFICE); alamat teknis hanya untuk admin. */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("diagnostics")
  diagnostics(@CurrentUser() user: AuthUser) {
    return this.office.diagnose(user);
  }

  /** Dokumen kosong baru (menjadi berkas milik user; frontend menjadikannya Resource Global). */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("documents")
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOfficeDocumentDto) {
    return this.office.createDocument(user, dto);
  }

  /** Config `DocsAPI.DocEditor` bertanda tangan untuk satu berkas. */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post("config")
  config(@CurrentUser() user: AuthUser, @Body() dto: OfficeConfigDto) {
    return this.office.editorConfig(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("files/:id/versions")
  versions(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.office.listVersions(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("files/:id/versions/:version")
  async version(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("version", ParseIntPipe) version: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { asset, stream } = await this.office.openVersion(user, id, version);
    res.set({
      "Content-Disposition": contentDisposition(`v${version}-${asset.originalName}`, "attachment"),
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
    });
    return new StreamableFile(stream, { type: asset.mimeType, length: asset.size });
  }

  /** Simpan paksa sesi edit yang terbuka (modal editor ditutup). */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post("files/:id/forcesave")
  forceSave(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.office.forceSave(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post("files/:id/versions/:version/restore")
  restore(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("version", ParseIntPipe) version: number) {
    return this.office.restoreVersion(user, id, version);
  }

  /** Dipanggil server ONLYOFFICE (`document.url`), divalidasi token bertanda tangan. */
  @ApiExcludeEndpoint()
  @SkipThrottle()
  @Get("files/:id/content")
  async content(@Param("id") id: string, @Query("token") token: string, @Res({ passthrough: true }) res: Response) {
    if (!token) throw new BadRequestException("Token wajib diisi.");
    const { asset, stream } = await this.office.openFile(id, token);
    res.set({
      "Content-Disposition": contentDisposition(asset.originalName, "attachment"),
      "Cache-Control": "private, no-store",
    });
    return new StreamableFile(stream, { type: asset.mimeType, length: asset.size });
  }

  /** Dipanggil server ONLYOFFICE saat status dokumen berubah (diedit, disimpan, ditutup). */
  @ApiExcludeEndpoint()
  @SkipThrottle()
  @HttpCode(200)
  @Post("callback")
  callback(
    @Query("token") token: string,
    @Headers(ONLYOFFICE_JWT_HEADER) headerJwt: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    if (!token) throw new BadRequestException("Token wajib diisi.");
    return this.office.handleCallback(token, headerJwt, body ?? {});
  }
}
