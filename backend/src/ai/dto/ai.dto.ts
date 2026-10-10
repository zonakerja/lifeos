import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  Max,
  Min,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { AiProvider } from "../../generated/prisma/client";

export class SaveAiProviderDto {
  @ApiPropertyOptional({ description: "API key baru; kosongkan untuk mempertahankan key yang tersimpan" })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: "API key terlalu pendek." })
  @MaxLength(500)
  apiKey?: string;

  @ApiPropertyOptional({ nullable: true, description: "ID model; null/kosong = model default provider" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsString()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9._:/-]+$/, { message: "Nama model hanya boleh huruf, angka, dan . _ : / -" })
  model?: string | null;
}

export class UpdateAiSettingsDto {
  @ApiPropertyOptional({ enum: AiProvider, nullable: true, description: "null = matikan AI" })
  @IsOptional()
  @IsEnum(AiProvider, { message: "Provider AI tidak dikenal." })
  activeProvider?: AiProvider | null;

  @ApiPropertyOptional({ description: "Cadangan otomatis ke provider lain yang punya key" })
  @IsOptional()
  @IsBoolean()
  fallbackEnabled?: boolean;

  @ApiPropertyOptional({ description: "Indeks pengetahuan (RAG) dengan embedding Gemini" })
  @IsOptional()
  @IsBoolean()
  indexEnabled?: boolean;
}

/** Field teks pada request multipart `POST /ai/generate` (berkas di field `files`). */
export class GenerateAiDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: "Prompt wajib diisi." })
  @MaxLength(1_000_000)
  prompt: string;
}

export class SearchAiIndexDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: "Kata kunci wajib diisi." })
  @MaxLength(500)
  q: string;

  @ApiPropertyOptional({ default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number;
}
