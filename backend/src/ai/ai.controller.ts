import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { memoryStorage } from "multer";
import { AiProvider } from "../generated/prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/types/auth-user";
import { AI_MAX_ATTACHMENT_BYTES, AI_MAX_ATTACHMENTS, AiService } from "./ai.service";
import { GenerateAiDto, SaveAiProviderDto, SearchAiIndexDto, UpdateAiSettingsDto } from "./dto/ai.dto";
import { AiIndexQueueService } from "./index/ai-index-queue.service";
import { AiIndexService } from "./index/ai-index.service";

const providerPipe = new ParseEnumPipe(AiProvider);

/**
 * AI multi-provider. API key milik user disimpan terenkripsi dan hanya dipakai di server — browser tidak pernah
 * menerima key maupun memanggil provider secara langsung.
 */
@ApiTags("ai")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("ai")
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly index: AiIndexService,
    private readonly indexQueue: AiIndexQueueService,
  ) {}

  @Get("settings")
  getSettings(@CurrentUser() user: AuthUser) {
    return this.ai.getSettings(user.id);
  }

  @Patch("settings")
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateAiSettingsDto) {
    return this.ai.updateSettings(user.id, dto);
  }

  @Put("settings/:provider")
  saveProvider(
    @CurrentUser() user: AuthUser,
    @Param("provider", providerPipe) provider: AiProvider,
    @Body() dto: SaveAiProviderDto,
  ) {
    return this.ai.saveProvider(user.id, provider, dto);
  }

  @Delete("settings/:provider")
  removeProvider(@CurrentUser() user: AuthUser, @Param("provider", providerPipe) provider: AiProvider) {
    return this.ai.removeProvider(user.id, provider);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post("settings/:provider/test")
  testProvider(@CurrentUser() user: AuthUser, @Param("provider", providerPipe) provider: AiProvider) {
    return this.ai.testProvider(user.id, provider);
  }

  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string" },
        files: { type: "array", items: { type: "string", format: "binary" } },
      },
    },
  })
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @UseInterceptors(
    FilesInterceptor("files", AI_MAX_ATTACHMENTS, {
      storage: memoryStorage(),
      // Prompt (field teks) bisa memuat konteks data user yang panjang
      limits: { fileSize: AI_MAX_ATTACHMENT_BYTES, fieldSize: 5 * 1024 * 1024 },
    }),
  )
  @HttpCode(200)
  @Post("generate")
  generate(
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateAiDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.ai.generate(user.id, dto.prompt, files ?? []);
  }

  // ---------------------------------------------------------------- Indeks pengetahuan (RAG)

  @Get("index")
  indexStatus(@CurrentUser() user: AuthUser) {
    return this.index.status(user.id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(202)
  @Post("index/rebuild")
  async rebuildIndex(@CurrentUser() user: AuthUser) {
    await this.indexQueue.enqueueRebuild(user.id);
    return { queued: true };
  }

  /** Uji pencarian indeks (gabungan makna + kata persis) — dasar chatbot RAG. */
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get("index/search")
  searchIndex(@CurrentUser() user: AuthUser, @Query() query: SearchAiIndexDto) {
    return this.index.search(user.id, query.q, query.limit);
  }
}
