import { Injectable, NotFoundException } from "@nestjs/common";
import type { AppSettings } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateAppSettingsDto } from "./dto/update-app-settings.dto";

/**
 * Bentuk publik pengaturan: logo (data URL hingga ~1 MB) tidak ikut dikirim di setiap respons —
 * cukup `logoVersion`; gambarnya diambil lewat `GET /settings/app/logo?v=<logoVersion>` yang bisa di-cache.
 */
export type PublicAppSettings = Omit<AppSettings, "appLogo"> & { logoVersion: string | null };

const DATA_URL = /^data:([a-z0-9.+/-]+);base64,(.*)$/s;

const toPublic = ({ appLogo, ...rest }: AppSettings): PublicAppSettings => ({
  ...rest,
  logoVersion: appLogo ? String(rest.updatedAt.getTime()) : null,
});

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private load() {
    return this.prisma.appSettings.upsert({ where: { id: "global" }, create: {}, update: {} });
  }

  async getAppSettings() {
    return toPublic(await this.load());
  }

  /** Logo sebagai biner + jenisnya; 404 bila belum diatur. */
  async getLogo() {
    const match = (await this.load()).appLogo?.match(DATA_URL);
    if (!match) throw new NotFoundException("Logo belum diatur.");
    return { mimeType: match[1], data: Buffer.from(match[2], "base64") };
  }

  /** `appLogo`: tidak dikirim = tetap, string kosong = hapus, data URL gambar = ganti. */
  async updateAppSettings(dto: UpdateAppSettingsDto) {
    const data = { ...dto, appLogo: dto.appLogo === "" ? null : dto.appLogo };
    return toPublic(await this.prisma.appSettings.upsert({ where: { id: "global" }, create: data, update: data }));
  }
}
