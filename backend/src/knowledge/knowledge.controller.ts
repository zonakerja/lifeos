import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import { CreateVaultDto, InboxNoteDto, KnowledgeNotesQueryDto, SetVaultDto } from "./knowledge.dto";
import { KnowledgeVaultService } from "./knowledge-vault.service";

/** Basis pengetahuan: vault Obsidian milik user (Tools → Basis Pengetahuan). Setiap user hanya melihat vault-nya. */
@ApiTags("knowledge")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("knowledge")
export class KnowledgeController {
  constructor(private readonly vault: KnowledgeVaultService) {}

  @Get("status")
  status(@CurrentUser() user: AuthUser) {
    return this.vault.statusOf(user.id);
  }

  @Get("folders")
  folders() {
    return this.vault.folders();
  }

  @Put("vault")
  setVault(@CurrentUser() user: AuthUser, @Body() dto: SetVaultDto) {
    return this.vault.setVault(user.id, dto.folder?.trim() || null);
  }

  @Post("vault/create")
  createVault(@CurrentUser() user: AuthUser, @Body() dto: CreateVaultDto) {
    return this.vault.createVault(user.id, dto.folder.trim());
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post("scan")
  async scan(@CurrentUser() user: AuthUser) {
    await this.vault.scanNow(user.id);
    return this.vault.statusOf(user.id);
  }

  @Get("notes")
  notes(@CurrentUser() user: AuthUser, @Query() query: KnowledgeNotesQueryDto) {
    return this.vault.notes(user.id, query.q);
  }

  @Get("notes/:id")
  note(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.vault.note(user.id, id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post("inbox")
  inbox(@CurrentUser() user: AuthUser, @Body() dto: InboxNoteDto) {
    return this.vault.addToInbox(user.id, dto);
  }
}
