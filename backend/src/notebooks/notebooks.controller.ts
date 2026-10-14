import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import {
  AddNotebookSourceDto,
  CreateNotebookDto,
  NotebookChatDto,
  SaveNotebookNoteDto,
  UpdateNotebookDto,
  UpdateNotebookNoteDto,
  UpdateNotebookSourceDto,
} from "./dto/notebook.dto";
import { NotebooksService } from "./notebooks.service";

/** My Notebook: sumber + chat RAG bersitasi + ringkasan Studio + catatan. Data hanya milik user sendiri. */
@ApiTags("notebooks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("notebooks")
export class NotebooksController {
  constructor(private readonly notebooks: NotebooksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notebooks.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateNotebookDto) {
    return this.notebooks.create(user.id, dto);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notebooks.get(user.id, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateNotebookDto) {
    return this.notebooks.update(user.id, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notebooks.remove(user, id);
  }

  // ---------------------------------------------------------------- Sumber

  /** Halaman web diambil server (dibatasi lebih ketat). */
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post(":id/sources")
  addSource(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: AddNotebookSourceDto) {
    return this.notebooks.addSource(user, id, dto);
  }

  @Patch(":id/sources/:sourceId")
  updateSource(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("sourceId") sourceId: string,
    @Body() dto: UpdateNotebookSourceDto,
  ) {
    return this.notebooks.updateSource(user.id, id, sourceId, dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post(":id/sources/:sourceId/refresh")
  refreshSource(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("sourceId") sourceId: string) {
    return this.notebooks.refreshSource(user.id, id, sourceId);
  }

  @Delete(":id/sources/:sourceId")
  removeSource(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("sourceId") sourceId: string) {
    return this.notebooks.removeSource(user, id, sourceId);
  }

  // ---------------------------------------------------------------- Chat

  @Get(":id/messages")
  messages(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notebooks.messages(user.id, id);
  }

  @Delete(":id/messages")
  clearMessages(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notebooks.clearMessages(user, id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(200)
  @Post(":id/chat")
  chat(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: NotebookChatDto) {
    return this.notebooks.chat(user.id, id, dto.message, dto.fileIds);
  }

  // ---------------------------------------------------------------- Studio

  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @HttpCode(200)
  @Post(":id/summary")
  summarize(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notebooks.summarize(user.id, id);
  }

  // ---------------------------------------------------------------- Catatan

  @Get(":id/notes")
  notes(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notebooks.notes(user.id, id);
  }

  @Post(":id/notes")
  createNote(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: SaveNotebookNoteDto) {
    return this.notebooks.createNote(user.id, id, dto);
  }

  @Patch(":id/notes/:noteId")
  updateNote(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("noteId") noteId: string,
    @Body() dto: UpdateNotebookNoteDto,
  ) {
    return this.notebooks.updateNote(user.id, id, noteId, dto);
  }

  @Delete(":id/notes/:noteId")
  removeNote(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("noteId") noteId: string) {
    return this.notebooks.removeNote(user.id, id, noteId);
  }
}
