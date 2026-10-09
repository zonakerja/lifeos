import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "@node-rs/argon2";
import { User } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { AuthUser } from "../common/types/auth-user";
import { durationToSeconds } from "../config/duration";
import { PrismaService } from "../prisma/prisma.service";
import { toPublicUser } from "../users/user.mapper";
import { AccessTokenPayload, RefreshTokenPayload } from "./auth.types";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Refresh paralel (mis. dua tab dibuka bersamaan) memakai token yang sama: tab kedua
 * menerima token yang baru saja dirotasi. Dalam jendela ini dianggap wajar, bukan pencurian.
 */
const REUSE_GRACE_MS = 30_000;

export type Session = Awaited<ReturnType<AuthService["login"]>>;

@Injectable()
export class AuthService {
  private readonly refreshSecret: string;
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.refreshSecret = config.getOrThrow<string>("JWT_REFRESH_SECRET");
    this.refreshTtlSeconds = durationToSeconds(config.getOrThrow<string>("JWT_REFRESH_EXPIRES_IN"));
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user || !(await verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException("Email atau password salah.");
    }

    return this.createSession(user);
  }

  /** Rotasi refresh token. Token lama dicabut; pemakaian ulang token yang sudah dicabut mencabut semua sesi user. */
  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
      include: { user: true },
    });

    if (!record || record.tokenHash !== sha256(refreshToken)) {
      throw new UnauthorizedException("Refresh token tidak valid.");
    }
    if (record.expiresAt <= new Date()) {
      throw new UnauthorizedException("Sesi sudah berakhir. Silakan login kembali.");
    }
    if (record.revokedAt) {
      if (Date.now() - record.revokedAt.getTime() <= REUSE_GRACE_MS) return this.createSession(record.user);
      // Token lama dipakai ulang → kemungkinan dicuri: cabut semua sesi user
      await this.revokeAllSessions(record.userId);
      throw new UnauthorizedException("Sesi sudah berakhir. Silakan login kembali.");
    }

    await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return this.createSession(record.user);
  }

  async logout(refreshToken: string) {
    try {
      const payload = await this.verifyRefreshToken(refreshToken);
      await this.prisma.refreshToken.deleteMany({ where: { id: payload.jti } });
    } catch {
      // Logout bersifat idempotent: token tidak valid tetap dianggap berhasil.
    }
    return { success: true };
  }

  async getProfile(authUser: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.id },
    });
    if (!user) throw new NotFoundException("User tidak ditemukan.");
    return toPublicUser(user, { includeApiKey: true });
  }

  async updateProfile(authUser: AuthUser, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: authUser.id },
      data: { ...dto, email: dto.email?.toLowerCase() },
    });
    return toPublicUser(user, { includeApiKey: true });
  }

  async changePassword(authUser: AuthUser, dto: ChangePasswordDto, currentRefreshToken?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.id },
    });
    if (!user) throw new NotFoundException("User tidak ditemukan.");
    if (!(await verify(user.passwordHash, dto.currentPassword))) {
      throw new BadRequestException("Password saat ini salah.");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(dto.newPassword) },
    });
    // Cabut semua sesi lain; sesi perangkat yang sedang dipakai dipertahankan
    const currentJti = currentRefreshToken
      ? await this.verifyRefreshToken(currentRefreshToken)
          .then((p) => p.jti)
          .catch(() => undefined)
      : undefined;
    await this.prisma.refreshToken.deleteMany({
      where: { userId: user.id, ...(currentJti ? { id: { not: currentJti } } : {}) },
    });
    return { success: true };
  }

  /** Hapus semua sesi user. (`revokedAt` hanya dipakai untuk token hasil rotasi → deteksi reuse.) */
  async revokeAllSessions(userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  private async verifyRefreshToken(token: string) {
    try {
      return await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException("Refresh token tidak valid.");
    }
  }

  private async createSession(user: User) {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const jti = randomUUID();
    const accessToken = await this.jwt.signAsync(accessPayload);
    const refreshToken = await this.jwt.signAsync({ sub: user.id, jti } satisfies RefreshTokenPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshTtlSeconds,
    });

    // Bersihkan token user yang sudah kedaluwarsa agar tabel tidak terus membesar
    await this.prisma.refreshToken.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });
    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlSeconds * 1000),
      },
    });

    return {
      user: toPublicUser(user, { includeApiKey: true }),
      accessToken,
      refreshToken,
      refreshTtlSeconds: this.refreshTtlSeconds,
    };
  }
}
