import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import {
  CreateNoteDto,
  CreateVaultDto,
  ExportSettingsDto,
  FolderDto,
  InboxNoteDto,
  KnowledgeNotesQueryDto,
  KnowledgeSearchQueryDto,
  LinkMentionDto,
  MoveFolderDto,
  MoveNoteDto,
  NotePropertiesDto,
  SaveNoteDto,
  SetVaultDto,
} from "./knowledge.dto";
import { KnowledgeExportService } from "./knowledge-export.service";
import { KnowledgeVaultService } from "./knowledge-vault.service";

/** Basis pengetahuan: vault Obsidian milik user (Tools → Basis Pengetahuan). Setiap user hanya melihat vault-nya. */
@ApiTags("knowledge")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("knowledge")
export class KnowledgeController {
  constructor(
    private readonly vault: KnowledgeVaultService,
    private readonly mirror: KnowledgeExportService,
  ) {}

  /** Cermin hasil kerja LifeOS → folder 80-LifeOS di vault (satu arah). */
  @Get("export")
  exportSettings(@CurrentUser() user: AuthUser) {
    return this.mirror.settings(user.id);
  }

  @Put("export")
  updateExport(@CurrentUser() user: AuthUser, @Body() dto: ExportSettingsDto) {
    return this.mirror.updateSettings(user.id, { enabled: dto.enabled, kinds: dto.kinds });
  }

  @Post("export/run")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async runExport(@CurrentUser() user: AuthUser) {
    await this.mirror.run(user.id);
    return this.mirror.settings(user.id);
  }

  /** Hapus semua berkas cermin (bertanda sumber: lifeos) dari vault; pengaturan tidak berubah. */
  @Delete("export/files")
  async clearExport(@CurrentUser() user: AuthUser) {
    await this.mirror.clear(user.id);
    return this.mirror.settings(user.id);
  }

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
  // ---------------------------------------------------------------- Menu Pengetahuan

  @Get("tree")
  tree(@CurrentUser() user: AuthUser) {
    return this.vault.tree(user.id);
  }

  @Get("graph")
  graph(@CurrentUser() user: AuthUser) {
    return this.vault.graph(user.id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Get("search")
  search(@CurrentUser() user: AuthUser, @Query() query: KnowledgeSearchQueryDto) {
    return this.vault.search(user.id, query.q, query.mode);
  }

  @Get("attachment")
  async attachment(@CurrentUser() user: AuthUser, @Query() dto: FolderDto, @Res() res: Response) {
    const file = await this.vault.attachment(user.id, dto.path);
    res.setHeader("Content-Type", file.mime);
    res.setHeader("Content-Security-Policy", "sandbox");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(file.data);
  }

  @Get("health")
  health(@CurrentUser() user: AuthUser) {
    return this.vault.health(user.id);
  }

  @Get("prefs")
  prefs(@CurrentUser() user: AuthUser) {
    return this.vault.prefs(user.id);
  }

  @Put("prefs")
  setPrefs(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.vault.setPrefs(user.id, body);
  }

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post("notes")
  createNote(@CurrentUser() user: AuthUser, @Body() dto: CreateNoteDto) {
    return this.vault.createNote(user.id, dto);
  }

  @Get("notes/:id/source")
  source(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.vault.source(user.id, id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Put("notes/:id")
  save(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: SaveNoteDto) {
    return this.vault.save(user.id, id, dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Patch("notes/:id/properties")
  properties(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: NotePropertiesDto) {
    return this.vault.setProperties(user.id, id, dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @HttpCode(200)
  @Post("notes/:id/move")
  move(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: MoveNoteDto) {
    return this.vault.moveNote(user.id, id, dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Delete("notes/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.vault.deleteNote(user.id, id);
  }

  @Get("notes/:id/unlinked")
  unlinked(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.vault.unlinked(user.id, id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @HttpCode(200)
  @Post("notes/:id/link-mention")
  linkMention(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: LinkMentionDto) {
    return this.vault.linkMention(user.id, id, dto.sourceId);
  }

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post("folders")
  createFolder(@CurrentUser() user: AuthUser, @Body() dto: FolderDto) {
    return this.vault.createFolder(user.id, dto.path);
  }

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @HttpCode(200)
  @Post("folders/move")
  moveFolder(@CurrentUser() user: AuthUser, @Body() dto: MoveFolderDto) {
    return this.vault.moveFolder(user.id, dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Delete("folders")
  deleteFolder(@CurrentUser() user: AuthUser, @Query() dto: FolderDto) {
    return this.vault.deleteFolder(user.id, dto.path);
  }
}
