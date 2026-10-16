import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import { CreateOfficeDocumentDto, OfficeConfigDto, OfficePreferencesDto } from "./dto/office.dto";
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

  /** Templat dokumen milik user (diunggah lewat /uploads dengan context `office-template`). */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("templates")
  templates(@CurrentUser() user: AuthUser) {
    return this.office.templates(user);
  }

  /** Font yang terpasang di server ONLYOFFICE. */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("fonts")
  fonts() {
    return this.office.fonts();
  }

  /** Pilihan AI di editor milik user (halaman Tools → ONLYOFFICE). */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("preferences")
  preferences(@CurrentUser() user: AuthUser) {
    return this.office.preferences(user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch("preferences")
  updatePreferences(@CurrentUser() user: AuthUser, @Body() dto: OfficePreferencesDto) {
    return this.office.updatePreferences(user, dto);
  }

  /**
   * Dipanggil tab AI ONLYOFFICE (plugin resmi, mode pengaturan server) untuk setiap permintaan AI. Tanpa token login:
   * autentikasi = token sesi AI di `headers.Authorization` isi permintaan. CORS untuk origin ONLYOFFICE diatur di main.ts.
   */
  @ApiExcludeEndpoint()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post("ai/proxy")
  async aiProxy(@Body() raw: unknown, @Res() res: Response) {
    // Isi dibaca sebagai teks (lihat main.ts) lalu di-parse di sini
    let body: Record<string, unknown>;
    try {
      body = (typeof raw === "string" ? JSON.parse(raw) : (raw ?? {})) as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: { message: "Isi permintaan AI tidak valid.", type: "lifeos_error" } });
      return;
    }
    const result = await this.office.aiProxy(body);
    if (result.sse !== undefined) {
      res.status(200).set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" });
      res.send(result.sse);
      return;
    }
    res.status(result.status).json(result.json);
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
