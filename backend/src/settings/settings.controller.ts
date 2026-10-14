import { Body, Controller, Get, Patch, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { UserRole } from "../generated/prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { UpdateAppSettingsDto } from "./dto/update-app-settings.dto";
import { SettingsService } from "./settings.service";

@ApiTags("settings")
@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Publik: branding dibutuhkan halaman login sebelum user masuk. */
  @Get("app")
  getAppSettings() {
    return this.settings.getAppSettings();
  }

  /** Publik: gambar logo. URL memuat `?v=<logoVersion>` sehingga aman di-cache lama. */
  @Get("app/logo")
  async getLogo(@Res({ passthrough: true }) res: Response) {
    const { mimeType, data } = await this.settings.getLogo();
    res.set({
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Logo SVG yang dibuka langsung tidak boleh menjalankan skrip
      "Content-Security-Policy": "sandbox",
    });
    return new StreamableFile(data, { type: mimeType, length: data.length });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.super_admin, UserRole.admin)
  @Patch("app")
  updateAppSettings(@Body() dto: UpdateAppSettingsDto) {
    return this.settings.updateAppSettings(dto);
  }
}
