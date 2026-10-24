import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import { API_SCOPES, bearerToken, SCOPE_LABELS } from "./api-token-logic";
import { ApiTokensService } from "./api-tokens.service";
import { ActivityQueryDto, CreateApiTokenDto } from "./integrations.dto";
import { LifeosMcpService } from "./lifeos-mcp.service";

/** Pengaturan → Integrasi: token akses pribadi & log aktivitas agen (login aplikasi biasa). */
@ApiTags("integrations")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("integrations")
export class IntegrationsController {
  constructor(private readonly tokens: ApiTokensService) {}

  @Get("scopes")
  scopes() {
    return API_SCOPES.map((id) => ({ id, label: SCOPE_LABELS[id] }));
  }

  @Get("tokens")
  list(@CurrentUser() user: AuthUser) {
    return this.tokens.list(user.id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post("tokens")
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateApiTokenDto) {
    return this.tokens.create(user.id, dto);
  }

  @Delete("tokens/:id")
  revoke(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.tokens.revoke(user.id, id);
  }

  @Get("activity")
  activity(@CurrentUser() user: AuthUser, @Query() query: ActivityQueryDto) {
    return this.tokens.activity(user.id, query.take);
  }
}

const jsonRpcError = (res: Response, status: number, message: string) =>
  res.status(status).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });

/**
 * MCP server LifeOS (Streamable HTTP, stateless): `POST /api/v1/mcp` dengan `Authorization: Bearer lifeos_pat_…`.
 * Dipakai agen AI (Hermes, Claude Desktop, n8n, …). Setiap permintaan membuat server & transport baru.
 */
@ApiTags("integrations")
@Controller("mcp")
export class McpController {
  constructor(
    private readonly tokens: ApiTokensService,
    private readonly mcp: LifeosMcpService,
  ) {}

  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @ApiExcludeEndpoint()
  @HttpCode(200)
  @Post()
  async handle(@Req() req: Request, @Res() res: Response) {
    const token = bearerToken(req.headers.authorization);
    const principal = token ? await this.tokens.authenticate(token) : null;
    if (!principal) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="LifeOS MCP"');
      return jsonRpcError(res, 401, "Token akses tidak valid atau sudah kedaluwarsa (Pengaturan → Integrasi).");
    }
    const server = this.mcp.createServer(principal);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  /** Mode stateless: tidak ada aliran SSE / sesi yang bisa dibuka atau ditutup. */
  @ApiExcludeEndpoint()
  @Get()
  get(@Res() res: Response) {
    return jsonRpcError(res, 405, "Method not allowed.");
  }

  @ApiExcludeEndpoint()
  @Delete()
  remove(@Res() res: Response) {
    return jsonRpcError(res, 405, "Method not allowed.");
  }
}
