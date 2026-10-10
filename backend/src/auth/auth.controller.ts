import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import { AuthService, type Session } from "./auth.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { REFRESH_COOKIE, clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "./refresh-cookie";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  private readonly secureCookie: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.secureCookie = config.getOrThrow<boolean>("COOKIE_SECURE");
  }

  /** Refresh token dikirim sebagai cookie httpOnly; body hanya berisi user + access token. */
  private respond(res: Response, session: Session) {
    setRefreshCookie(res, session.refreshToken, session.refreshTtlSeconds, this.secureCookie);
    return { user: session.user, accessToken: session.accessToken };
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.login(dto));
  }

  @ApiCookieAuth(REFRESH_COOKIE)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @HttpCode(200)
  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readRefreshCookie(req);
    if (!token) throw new UnauthorizedException("Sesi tidak ditemukan. Silakan login.");
    try {
      return this.respond(res, await this.auth.refresh(token));
    } catch (error) {
      clearRefreshCookie(res, this.secureCookie);
      throw error;
    }
  }

  @ApiCookieAuth(REFRESH_COOKIE)
  @HttpCode(200)
  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readRefreshCookie(req);
    if (token) await this.auth.logout(token);
    clearRefreshCookie(res, this.secureCookie);
    return { success: true };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getProfile(user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch("me")
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user, dto);
  }

  /** Ganti password; semua sesi lain dicabut, sesi perangkat ini tetap aktif. */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post("change-password")
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Req() req: Request) {
    return this.auth.changePassword(user, dto, readRefreshCookie(req));
  }
}
