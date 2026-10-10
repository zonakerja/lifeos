import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateAppSettingsDto } from "./dto/update-app-settings.dto";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  getAppSettings() {
    return this.prisma.appSettings.upsert({
      where: { id: "global" },
      create: {},
      update: {},
    });
  }

  updateAppSettings(dto: UpdateAppSettingsDto) {
    const data = { ...dto, appLogo: dto.appLogo === "" ? null : dto.appLogo };
    return this.prisma.appSettings.upsert({
      where: { id: "global" },
      create: data,
      update: data,
    });
  }
}
