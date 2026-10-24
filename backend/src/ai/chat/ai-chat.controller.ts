import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AuthUser } from "../../common/types/auth-user";
import { PrismaService } from "../../prisma/prisma.service";
import { AiChatDto, AiMessagesQueryDto, AiProfileDto } from "./ai-chat.dto";
import { AiChatService } from "./ai-chat.service";

/** Chatbot LifeOS (RAG atas basis pengetahuan + data kerja) dan profil kerja yang selalu ikut di chat AI. */
@ApiTags("ai")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("ai")
export class AiChatController {
  constructor(
    private readonly chat: AiChatService,
    private readonly prisma: PrismaService,
  ) {}

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(200)
  @Post("chat")
  send(@CurrentUser() user: AuthUser, @Body() dto: AiChatDto) {
    return this.chat.chat(user.id, dto);
  }

  @Get("chat/conversations")
  conversations(@CurrentUser() user: AuthUser) {
    return this.chat.conversations(user.id);
  }

  @Get("chat/conversations/:id/messages")
  messages(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query() query: AiMessagesQueryDto) {
    return this.chat.messages(user.id, id, query.take);
  }

  @Delete("chat/conversations/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.chat.remove(user.id, id);
  }

  @Get("profile")
  async profile(@CurrentUser() user: AuthUser) {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { aiProfile: true } });
    return { profile: row.aiProfile };
  }

  @Put("profile")
  async saveProfile(@CurrentUser() user: AuthUser, @Body() dto: AiProfileDto) {
    const profile = dto.profile?.trim() || null;
    await this.prisma.user.update({ where: { id: user.id }, data: { aiProfile: profile } });
    return { profile };
  }
}
