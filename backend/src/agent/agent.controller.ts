import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeController, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import type { Request, Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import { API_SCOPES, bearerToken } from "../integrations/api-token-logic";
import { ApiTokensService } from "../integrations/api-tokens.service";
import { AgentService } from "./agent.service";

class AgentChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8_000)
  message!: string;

  /** Nama percakapan (sesi Hermes per user); kosong = percakapan utama */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  conversation?: string;
}

class AgentSetupDto {
  /** Izin agen (kosong = semua izin) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(API_SCOPES.length)
  @IsIn(API_SCOPES, { each: true, message: "Cakupan izin tidak dikenal." })
  scopes?: string[];
}

class AgentSkillRunDto {
  @Matches(/^[a-z0-9][a-z0-9-]{0,63}$/, { message: "Nama skill tidak valid." })
  skill!: string;
}

/** Asisten Agen (Hermes) — hanya pemilik agen (`HERMES_OWNER_EMAIL`). docs/AI-AGENT.md §23. */
@ApiTags("agent")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("agent")
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Get("status")
  status(@CurrentUser() user: AuthUser) {
    return this.agent.status(user);
  }

  /** Siapkan agen: token akses "Agen Hermes" dari kunci bersama (tanpa terminal / menyalin token). */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post("setup")
  setup(@CurrentUser() user: AuthUser, @Body() dto: AgentSetupDto) {
    return this.agent.setup(user, dto.scopes);
  }

  @Get("skills")
  skills(@CurrentUser() user: AuthUser) {
    return this.agent.skills(user);
  }

  @Get("runs")
  recent(@CurrentUser() user: AuthUser) {
    return this.agent.recent(user);
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(200)
  @Post("chat")
  chat(@CurrentUser() user: AuthUser, @Body() dto: AgentChatDto) {
    return this.agent.chat(user, dto.message, dto.conversation ?? "");
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post("requests/:id/run")
  runSkill(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: AgentSkillRunDto) {
    return this.agent.runSkill(user, id, dto.skill);
  }

  @Get("runs/:runId")
  run(@CurrentUser() user: AuthUser, @Param("runId") runId: string) {
    return this.agent.run(user, runId);
  }

  @HttpCode(200)
  @Post("runs/:runId/stop")
  stop(@CurrentUser() user: AuthUser, @Param("runId") runId: string) {
    return this.agent.stop(user, runId);
  }
}

/**
 * Endpoint model OpenAI-compatible untuk Hermes (`model.base_url` = `…/api/v1/agent/llm/v1`). Autentikasi Bearer
 * token akses berizin `ai:model` (token "Agen Hermes" = `HERMES_API_KEY`); bukan login aplikasi.
 */
@ApiExcludeController()
@Controller("agent/llm/v1")
export class AgentLlmController {
  constructor(
    private readonly agent: AgentService,
    private readonly tokens: ApiTokensService,
  ) {}

  private async principal(req: Request, res: Response) {
    const token = bearerToken(req.headers.authorization);
    const principal = token ? await this.tokens.authenticate(token) : null;
    if (!principal) {
      res.status(401).json({ error: { message: "Token agen tidak dikenal — tekan Siapkan agen di LifeOS." } });
    }
    return principal;
  }

  @Get("models")
  async models(@Req() req: Request, @Res() res: Response) {
    const principal = await this.principal(req, res);
    if (principal) res.json(await this.agent.models(principal));
  }

  @Throttle({ default: { ttl: 60_000, limit: 300 } })
  @HttpCode(200)
  @Post("chat/completions")
  async chat(@Req() req: Request, @Res() res: Response) {
    const principal = await this.principal(req, res);
    if (principal) await this.agent.proxyChat(principal, req.body, res);
  }
}
