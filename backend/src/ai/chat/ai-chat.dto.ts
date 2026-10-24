import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
import { MAX_PROFILE_CHARS, MAX_SNAPSHOT_CHARS } from "./ai-chat-context";

export class AiChatDto {
  @ApiPropertyOptional({ description: "Percakapan yang dilanjutkan; kosong = percakapan baru" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  conversationId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: "Pertanyaan wajib diisi." })
  @MaxLength(8_000, { message: "Pertanyaan terlalu panjang (maks. 8.000 karakter)." })
  message: string;

  @ApiPropertyOptional({ description: "Ringkasan data aplikasi dari browser (agenda, to-do, project + ID tautan)" })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SNAPSHOT_CHARS + 5_000)
  snapshot?: string;

  @ApiPropertyOptional({ description: 'Tanggal hari ini menurut perangkat pengguna, mis. "Sabtu, 24 Oktober 2026"' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  today?: string;
}

export class AiMessagesQueryDto {
  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}

export class AiProfileDto {
  @ApiProperty({ nullable: true, description: "Profil kerja & instruksi tetap; null/kosong = hapus" })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_PROFILE_CHARS, {
    message: `Profil kerja maks. ${MAX_PROFILE_CHARS.toLocaleString("id-ID")} karakter.`,
  })
  profile: string | null;
}
