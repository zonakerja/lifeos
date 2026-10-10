import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
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

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.super_admin, UserRole.admin)
  @Patch("app")
  updateAppSettings(@Body() dto: UpdateAppSettingsDto) {
    return this.settings.updateAppSettings(dto);
  }
}
