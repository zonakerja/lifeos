import { Body, Controller, Get, HttpCode, Module, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiProperty, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { IsString, MaxLength, MinLength } from "class-validator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AuthUser } from "../../common/types/auth-user";
import { UploadsModule } from "../../uploads/uploads.module";
import { AiModule } from "../ai.module";
import { TranscribeService } from "./transcribe.service";

class TranscribeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  uploadId: string;
}

@ApiTags("ai")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("ai")
export class TranscribeController {
  constructor(private readonly transcriber: TranscribeService) {}

  /** Mulai pekerjaan latar belakang (audio panjang memakan banyak menit); hasil diambil lewat GET. */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(202)
  @Post("transcribe")
  start(@CurrentUser() user: AuthUser, @Body() dto: TranscribeDto) {
    return this.transcriber.start(user, dto.uploadId);
  }

  @Get("transcribe/:uploadId")
  status(@CurrentUser() user: AuthUser, @Param("uploadId") uploadId: string) {
    const job = this.transcriber.status(user.id, uploadId);
    if (!job) throw new NotFoundException("Tidak ada transkrip yang berjalan untuk berkas ini.");
    return job;
  }
}

/** Modul terpisah: AI & Uploads sudah saling bergantung lewat ekstraksi, jadi keduanya diimpor dari sini. */
@Module({
  imports: [AiModule, UploadsModule],
  controllers: [TranscribeController],
  providers: [TranscribeService],
})
export class TranscribeModule {}
