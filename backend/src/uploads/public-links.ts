import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";
import type { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { fileHeaders } from "./file-headers";

/**
 * Tautan publik baca-saja ke satu berkas (tahap 6 docs/AI-AGENT.md §21): dipakai sebagai "link dokumen" bukti kinerja di
 * e-Kinerja yang harus bisa dibuka atasan/penilai tanpa akun LifeOS. Token acak 32 byte hanya ditampilkan sekali (yang
 * disimpan hash-nya), bisa diberi masa berlaku, dan dicabut kapan saja.
 */
const TOKEN_PREFIX = "lp_";
const MAX_LINKS_PER_FILE = 20;
export const PUBLIC_FILE_PATH = "/api/v1/public/files/";

export const hashPublicToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newPublicToken = () => `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;

export class CreatePublicLinkDto {
  @ApiPropertyOptional({ description: "Masa berlaku (hari); kosong/null = tanpa batas", nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

@Injectable()
export class PublicLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  /** Hanya pemilik berkas yang boleh membuat/melihat/mencabut tautan publiknya. */
  private async ownAsset(userId: string, assetId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, userId: true } });
    if (!asset) throw new NotFoundException("File tidak ditemukan.");
    if (asset.userId !== userId) throw new ForbiddenException("Hanya pemilik berkas yang dapat membuat tautan publik.");
    return asset;
  }

  async create(userId: string, assetId: string, dto: CreatePublicLinkDto) {
    await this.ownAsset(userId, assetId);
    const count = await this.prisma.publicLink.count({ where: { assetId } });
    if (count >= MAX_LINKS_PER_FILE) throw new BadRequestException("Tautan publik berkas ini sudah terlalu banyak.");
    const token = newPublicToken();
    const link = await this.prisma.publicLink.create({
      data: {
        userId,
        assetId,
        tokenHash: hashPublicToken(token),
        prefix: token.slice(0, 10),
        label: dto.label?.trim() || null,
        expiresAt: dto.days ? new Date(Date.now() + dto.days * 24 * 3600 * 1000) : null,
      },
    });
    return { ...this.view(link), path: `${PUBLIC_FILE_PATH}${token}` };
  }

  async list(userId: string, assetId: string) {
    await this.ownAsset(userId, assetId);
    const links = await this.prisma.publicLink.findMany({ where: { assetId }, orderBy: { createdAt: "desc" } });
    return links.map((l) => this.view(l));
  }

  async revoke(userId: string, id: string) {
    const link = await this.prisma.publicLink.findUnique({ where: { id } });
    if (!link || link.userId !== userId) throw new NotFoundException("Tautan tidak ditemukan.");
    await this.prisma.publicLink.delete({ where: { id } });
    return { success: true };
  }

  async open(token: string) {
    const link = await this.prisma.publicLink.findUnique({
      where: { tokenHash: hashPublicToken(token) },
      include: { asset: { select: { objectKey: true, originalName: true, mimeType: true, size: true } } },
    });
    if (!link || (link.expiresAt && link.expiresAt.getTime() <= Date.now())) {
      throw new NotFoundException("Tautan tidak ditemukan atau sudah tidak berlaku.");
    }
    await this.prisma.publicLink.update({
      where: { id: link.id },
      data: { accessCount: { increment: 1 }, lastAccessAt: new Date() },
    });
    return { asset: link.asset, stream: await this.storage.getObject(link.asset.objectKey) };
  }

  private view(l: {
    id: string;
    prefix: string;
    label: string | null;
    expiresAt: Date | null;
    accessCount: number;
    lastAccessAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: l.id,
      prefix: l.prefix,
      label: l.label,
      expiresAt: l.expiresAt,
      accessCount: l.accessCount,
      lastAccessAt: l.lastAccessAt,
      createdAt: l.createdAt,
    };
  }
}

@ApiTags("uploads")
@Controller()
export class PublicLinksController {
  constructor(private readonly links: PublicLinksService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("uploads/:id/public-links")
  create(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: CreatePublicLinkDto) {
    return this.links.create(user.id, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("uploads/:id/public-links")
  list(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.links.list(user.id, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete("public-links/:id")
  revoke(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.links.revoke(user.id, id);
  }

  /** Publik (tanpa login): berkas disajikan dengan header aman yang sama dengan unduhan biasa. */
  @Get("public/files/:token")
  async open(@Param("token") token: string, @Res({ passthrough: true }) res: Response) {
    if (!/^lp_[A-Za-z0-9_-]{30,60}$/.test(token)) throw new NotFoundException("Tautan tidak ditemukan.");
    const { asset, stream } = await this.links.open(token);
    res.set({ ...fileHeaders(asset), "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" });
    return new StreamableFile(stream, { type: asset.mimeType, length: asset.size });
  }
}
