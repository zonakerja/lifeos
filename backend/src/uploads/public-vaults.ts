import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import type { Request, Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { fileHeaders } from "./file-headers";
import { hashPublicToken } from "./public-links";
import {
  type GeoInfo,
  isPrivateIp,
  locationLabel,
  MAX_VAULT_FILES,
  normalizeIp,
  parseGeo,
  shortUserAgent,
  VAULT_PATH,
} from "./vault-logic";
import { randomBytes } from "node:crypto";

/**
 * Brankas digital (bukti data dukung renaksi e-Kinerja): satu tautan publik baca-saja per poin renaksi berisi beberapa
 * berkas yang terisolasi (hanya berkas brankas itu yang bisa diakses lewat tokennya). Dibuka atasan / pejabat pembina
 * kepegawaian tanpa akun; setiap pembukaan & unduhan dicatat (IP, perkiraan lokasi dari IP, peramban) dan pengunjung
 * diberi tahu lewat halaman brankas.
 */
const TOKEN_PREFIX = "bv_";
const newVaultToken = () => `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
const TOKEN_PATTERN = /^bv_[A-Za-z0-9_-]{24,48}$/;

export class VaultDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: "ID entri renaksi asal" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  entryId?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(MAX_VAULT_FILES)
  @IsString({ each: true })
  assetIds!: string[];
}

export class UpdateVaultDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_VAULT_FILES)
  @IsString({ each: true })
  assetIds?: string[];
}

interface Visitor {
  ip: string | null;
  userAgent: string | null;
}

@Injectable()
export class PublicVaultsService {
  private readonly logger = new Logger(PublicVaultsService.name);
  private readonly geoCache = new Map<string, { at: number; geo: GeoInfo | null }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly config: ConfigService,
  ) {}

  /** Berkas brankas harus milik pemilik brankas (bukan berkas bersama milik orang lain). */
  private async ownAssets(userId: string, assetIds: string[]) {
    const ids = [...new Set(assetIds)];
    if (!ids.length) throw new BadRequestException("Pilih minimal satu berkas untuk brankas.");
    const assets = await this.prisma.asset.findMany({ where: { id: { in: ids } }, select: { id: true, userId: true } });
    if (assets.length !== ids.length || assets.some((a) => a.userId !== userId)) {
      throw new ForbiddenException("Brankas hanya boleh berisi berkas milik Anda sendiri.");
    }
    return ids;
  }

  private async ownVault(userId: string, id: string) {
    const vault = await this.prisma.publicVault.findUnique({ where: { id } });
    if (!vault || vault.userId !== userId) throw new NotFoundException("Brankas tidak ditemukan.");
    return vault;
  }

  async create(userId: string, dto: VaultDto) {
    const ids = await this.ownAssets(userId, dto.assetIds);
    const token = newVaultToken();
    const vault = await this.prisma.publicVault.create({
      data: {
        userId,
        tokenHash: hashPublicToken(token),
        prefix: token.slice(0, 8),
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        entryId: dto.entryId ?? null,
        files: { create: ids.map((assetId, order) => ({ assetId, order })) },
      },
    });
    return { ...(await this.detail(userId, vault.id)), path: `${VAULT_PATH}${token}` };
  }

  async update(userId: string, id: string, dto: UpdateVaultDto) {
    await this.ownVault(userId, id);
    const ids = dto.assetIds ? await this.ownAssets(userId, dto.assetIds) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.publicVault.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        },
      });
      if (ids) {
        await tx.publicVaultFile.deleteMany({ where: { vaultId: id } });
        await tx.publicVaultFile.createMany({ data: ids.map((assetId, order) => ({ vaultId: id, assetId, order })) });
      }
    });
    return this.detail(userId, id);
  }

  /** Tautan baru (tautan lama langsung tidak berlaku) — mis. tautan terlanjur tersebar. */
  async rotate(userId: string, id: string) {
    await this.ownVault(userId, id);
    const token = newVaultToken();
    await this.prisma.publicVault.update({
      where: { id },
      data: { tokenHash: hashPublicToken(token), prefix: token.slice(0, 8) },
    });
    return { ...(await this.detail(userId, id)), path: `${VAULT_PATH}${token}` };
  }

  async remove(userId: string, id: string) {
    await this.ownVault(userId, id);
    await this.prisma.publicVault.delete({ where: { id } });
    return { success: true };
  }

  async list(userId: string) {
    const vaults = await this.prisma.publicVault.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { files: true, accesses: true } } },
    });
    return vaults.map((v) => ({
      id: v.id,
      title: v.title,
      entryId: v.entryId,
      files: v._count.files,
      accessCount: v.accessCount,
      lastAccessAt: v.lastAccessAt,
      createdAt: v.createdAt,
    }));
  }

  async detail(userId: string, id: string) {
    await this.ownVault(userId, id);
    const vault = await this.prisma.publicVault.findUniqueOrThrow({
      where: { id },
      include: {
        files: {
          orderBy: { order: "asc" },
          include: { asset: { select: { id: true, originalName: true, mimeType: true, size: true } } },
        },
      },
    });
    return {
      id: vault.id,
      prefix: vault.prefix,
      title: vault.title,
      description: vault.description,
      entryId: vault.entryId,
      accessCount: vault.accessCount,
      lastAccessAt: vault.lastAccessAt,
      createdAt: vault.createdAt,
      files: vault.files.map((f) => ({
        id: f.asset.id,
        name: f.asset.originalName,
        mimeType: f.asset.mimeType,
        size: f.asset.size,
      })),
    };
  }

  async accesses(userId: string, id: string, take = 200) {
    await this.ownVault(userId, id);
    const rows = await this.prisma.publicVaultAccess.findMany({
      where: { vaultId: id },
      orderBy: { at: "desc" },
      take: Math.min(Math.max(take, 1), 500),
    });
    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      action: r.action,
      fileName: r.fileName,
      ip: r.ip,
      location: locationLabel(
        r.country || r.city || r.region
          ? { country: r.country ?? undefined, region: r.region ?? undefined, city: r.city ?? undefined }
          : null,
        r.ip,
      ),
      network: r.network,
      browser: shortUserAgent(r.userAgent),
    }));
  }

  // ---------------------------------------------------------------- Publik

  private async byToken(token: string) {
    if (!TOKEN_PATTERN.test(token)) throw new NotFoundException("Brankas tidak ditemukan.");
    const vault = await this.prisma.publicVault.findUnique({
      where: { tokenHash: hashPublicToken(token) },
      include: {
        user: { select: { name: true } },
        files: {
          orderBy: { order: "asc" },
          include: { asset: { select: { id: true, objectKey: true, originalName: true, mimeType: true, size: true } } },
        },
      },
    });
    if (!vault || (vault.expiresAt && vault.expiresAt.getTime() <= Date.now())) {
      throw new NotFoundException("Brankas tidak ditemukan atau sudah tidak berlaku.");
    }
    return vault;
  }

  /** Perkiraan lokasi dari IP (layanan `GEOIP_PROVIDER`, bawaan ipapi.co; di-cache 24 jam). IP privat tidak dicari. */
  private async geo(ip: string | null): Promise<GeoInfo | null> {
    if (!ip || isPrivateIp(ip) || (this.config.get<string>("GEOIP_PROVIDER") ?? "ipapi") === "none") return null;
    const cached = this.geoCache.get(ip);
    if (cached && Date.now() - cached.at < 24 * 3600 * 1000) return cached.geo;
    let geo: GeoInfo | null = null;
    try {
      const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
        headers: { "User-Agent": "LifeOS-brankas/1.0" },
        signal: AbortSignal.timeout(2500),
      });
      geo = res.ok ? parseGeo(await res.json()) : null;
    } catch (error) {
      this.logger.warn(`Lokasi IP tidak tersedia: ${(error as Error).message}`);
    }
    this.geoCache.set(ip, { at: Date.now(), geo });
    return geo;
  }

  private async log(vaultId: string, visitor: Visitor, action: string, fileName?: string) {
    const geo = await this.geo(visitor.ip);
    await this.prisma.$transaction([
      this.prisma.publicVaultAccess.create({
        data: {
          vaultId,
          action,
          fileName: fileName ?? null,
          ip: visitor.ip,
          userAgent: visitor.userAgent?.slice(0, 400) ?? null,
          country: geo?.country ?? null,
          region: geo?.region ?? null,
          city: geo?.city ?? null,
          network: geo?.network ?? null,
        },
      }),
      this.prisma.publicVault.update({
        where: { id: vaultId },
        data: { accessCount: { increment: 1 }, lastAccessAt: new Date() },
      }),
    ]);
    return geo;
  }

  /** Halaman brankas dibuka: dicatat, lalu isi brankas + catatan akses pengunjung sendiri dikembalikan. */
  async open(token: string, visitor: Visitor) {
    const vault = await this.byToken(token);
    const geo = await this.log(vault.id, visitor, "open");
    return {
      title: vault.title,
      description: vault.description,
      owner: vault.user.name,
      updatedAt: vault.updatedAt,
      files: vault.files.map((f) => ({
        id: f.asset.id,
        name: f.asset.originalName,
        mimeType: f.asset.mimeType,
        size: f.asset.size,
      })),
      visitor: {
        ip: visitor.ip,
        location: locationLabel(geo, visitor.ip),
        browser: shortUserAgent(visitor.userAgent),
        at: new Date().toISOString(),
      },
    };
  }

  /** Satu berkas brankas (hanya berkas milik brankas ini) — dicatat sebagai lihat / unduh. */
  async file(token: string, fileId: string, download: boolean, visitor: Visitor) {
    const vault = await this.byToken(token);
    const file = vault.files.find((f) => f.asset.id === fileId);
    if (!file) throw new NotFoundException("Berkas tidak ada di brankas ini.");
    await this.log(vault.id, visitor, download ? "download" : "view", file.asset.originalName);
    return { asset: file.asset, stream: await this.storage.getObject(file.asset.objectKey) };
  }
}

const visitorOf = (req: Request): Visitor => ({
  ip: normalizeIp(req.ip),
  userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
});

@ApiTags("uploads")
@Controller()
export class PublicVaultsController {
  constructor(private readonly vaults: PublicVaultsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("vaults")
  create(@CurrentUser() user: AuthUser, @Body() dto: VaultDto) {
    return this.vaults.create(user.id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("vaults")
  list(@CurrentUser() user: AuthUser) {
    return this.vaults.list(user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("vaults/:id")
  detail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.vaults.detail(user.id, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch("vaults/:id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateVaultDto) {
    return this.vaults.update(user.id, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post("vaults/:id/rotate")
  rotate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.vaults.rotate(user.id, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete("vaults/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.vaults.remove(user.id, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("vaults/:id/accesses")
  accesses(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("take") take?: string) {
    return this.vaults.accesses(user.id, id, take ? Number(take) : undefined);
  }

  /** Publik (tanpa login): isi brankas; setiap pembukaan dicatat. */
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get("public/vaults/:token")
  async open(@Param("token") token: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" });
    return this.vaults.open(token, visitorOf(req));
  }

  /** Publik: satu berkas brankas (`?download=1` = unduh); header aman sama dengan unduhan biasa. */
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get("public/vaults/:token/files/:fileId")
  async file(
    @Param("token") token: string,
    @Param("fileId") fileId: string,
    @Query("download") download: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const wantsDownload = download === "1";
    const { asset, stream } = await this.vaults.file(token, fileId, wantsDownload, visitorOf(req));
    const headers = fileHeaders(asset);
    if (wantsDownload) {
      headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`;
    }
    res.set({ ...headers, "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" });
    return new StreamableFile(stream, { type: asset.mimeType, length: asset.size });
  }
}
