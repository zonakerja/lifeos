import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import type { AuthUser } from "../common/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import {
  type ApiScope,
  expiryFrom,
  generateToken,
  hashToken,
  isExpired,
  MAX_TOKENS_PER_USER,
  normalizeScopes,
  shouldTouch,
  summarizeArgs,
  tokenPrefix,
} from "./api-token-logic";

/** Token yang lolos autentikasi: user pemilik + cakupan izinnya. */
export interface TokenPrincipal {
  user: AuthUser;
  tokenId: string;
  tokenName: string;
  scopes: ApiScope[];
}

const TOKEN_SELECT = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  expiresAt: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

/**
 * Token akses pribadi (Pengaturan → Integrasi) untuk agen AI / program luar yang memakai MCP LifeOS atas nama user.
 * Token bertindak sebagai user pemiliknya dengan cakupan terbatas — aturan isolasi data tetap berlaku.
 */
@Injectable()
export class ApiTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.apiToken.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: TOKEN_SELECT,
    });
    return rows.map((r) => ({ ...r, scopes: normalizeScopes(r.scopes) }));
  }

  /** Buat token baru; token utuh hanya dikembalikan sekali (yang disimpan hanya hash-nya). */
  async create(userId: string, input: { name: string; scopes: string[]; expiresInDays?: number | null }) {
    const scopes = normalizeScopes(input.scopes);
    if (!scopes.length) throw new BadRequestException("Pilih minimal satu cakupan izin.");
    const count = await this.prisma.apiToken.count({ where: { userId } });
    if (count >= MAX_TOKENS_PER_USER) {
      throw new BadRequestException(`Maksimal ${MAX_TOKENS_PER_USER} token. Cabut token yang tidak dipakai dulu.`);
    }
    const token = generateToken();
    const row = await this.prisma.apiToken.create({
      data: {
        userId,
        name: input.name.trim(),
        tokenHash: hashToken(token),
        prefix: tokenPrefix(token),
        scopes,
        expiresAt: expiryFrom(input.expiresInDays, new Date()),
      },
      select: TOKEN_SELECT,
    });
    return { ...row, scopes, token };
  }

  async revoke(userId: string, id: string) {
    const { count } = await this.prisma.apiToken.deleteMany({ where: { id, userId } });
    if (!count) throw new NotFoundException("Token tidak ditemukan.");
    return { success: true };
  }

  /** Cek token dari header Bearer; null bila tidak dikenal / kedaluwarsa. */
  async authenticate(token: string): Promise<TokenPrincipal | null> {
    const row = await this.prisma.apiToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true, role: true } } },
    });
    const now = new Date();
    if (!row || isExpired(row.expiresAt, now)) return null;
    if (shouldTouch(row.lastUsedAt, now)) {
      await this.prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
    }
    return { user: row.user, tokenId: row.id, tokenName: row.name, scopes: normalizeScopes(row.scopes) };
  }

  // ---------------------------------------------------------------- Log aktivitas agen

  async log(principal: TokenPrincipal, tool: string, input: unknown, status: "ok" | "error", message?: string) {
    await this.prisma.agentActivityLog.create({
      data: {
        userId: principal.user.id,
        tokenId: principal.tokenId,
        tokenName: principal.tokenName,
        tool,
        input: (summarizeArgs(input) ?? Prisma.DbNull) as Prisma.InputJsonValue,
        status,
        message: message?.slice(0, 500),
      },
    });
  }

  activity(userId: string, take = 50) {
    return this.prisma.agentActivityLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(take, 1), 200),
      select: { id: true, tokenName: true, tool: true, input: true, status: true, message: true, createdAt: true },
    });
  }
}
