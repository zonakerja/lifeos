import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import { UploadFileDto } from "./dto/upload-file.dto";
import { UploadsService } from "./uploads.service";

/** Tipe yang bisa menjalankan script bila dibuka inline → selalu diunduh sebagai lampiran. */
const ACTIVE_CONTENT = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/xml",
  "application/xml",
  "text/javascript",
  "application/javascript",
]);
const isActiveContent = (mimeType: string) => ACTIVE_CONTENT.has(mimeType.split(";")[0].trim().toLowerCase());

/**
 * Header aman untuk menyajikan berkas user dari origin aplikasi: CSP sandbox mencegah
 * berkas berbahaya menjalankan script/akses sesi (XSS), konten aktif dipaksa attachment.
 */
const fileHeaders = (asset: { originalName: string; mimeType: string }) => ({
  "Content-Disposition": `${isActiveContent(asset.mimeType) ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`,
  "Content-Security-Policy":
    "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'",
  "Cache-Control": "private, no-store",
});

@ApiTags("uploads")
@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @ApiBearerAuth()
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        context: { type: "string" },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor("file"))
  @Post()
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadFileDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException("Field 'file' wajib diisi.");
    return this.uploads.upload(file, user, dto.context);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query("take", new ParseIntPipe({ optional: true })) take?: number) {
    return this.uploads.list(user, take);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(":id/metadata")
  metadata(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.uploads.getMetadata(id, user);
  }

  /** Buat link unduhan sementara (10 menit) yang bisa dibuka tanpa header Authorization. */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(":id/link")
  link(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.uploads.createDownloadLink(id, user);
  }

  /** Publik, divalidasi oleh token bertanda tangan dari endpoint `link`. */
  @Get(":id/download")
  async download(@Param("id") id: string, @Query("token") token: string, @Res({ passthrough: true }) res: Response) {
    if (!token) throw new BadRequestException("Token wajib diisi.");
    const { asset, stream } = await this.uploads.openStreamWithToken(id, token);
    res.set(fileHeaders(asset));
    return new StreamableFile(stream, {
      type: asset.mimeType,
      length: asset.size,
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(":id")
  async stream(@Param("id") id: string, @CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const { asset, stream } = await this.uploads.openStream(id, user);
    res.set(fileHeaders(asset));
    return new StreamableFile(stream, {
      type: asset.mimeType,
      length: asset.size,
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.uploads.remove(id, user);
  }
}
