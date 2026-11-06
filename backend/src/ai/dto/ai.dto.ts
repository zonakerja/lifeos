import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  Max,
  Min,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
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

  @ApiPropertyOptional({
    nullable: true,
    description: "Alamat API router (mis. https://router.example.com/v1); null/kosong = langsung ke API resmi provider",
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsString()
  @MaxLength(300)
  baseUrl?: string | null;

  @ApiPropertyOptional({ enum: ["openai", "anthropic"], description: "Format API router (anthropic hanya Claude)" })
  @IsOptional()
  @IsIn(["openai", "anthropic"], { message: "Format API hanya openai atau anthropic." })
  apiFormat?: "openai" | "anthropic";

  @ApiPropertyOptional({ nullable: true, description: "ID model embedding di router; kosong = ID resmi provider" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsString()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9._:/-]+$/, { message: "Nama model hanya boleh huruf, angka, dan . _ : / -" })
  embeddingModel?: string | null;
}

/** Pembagian tugas AI; null = kembali ke bawaan (provider aktif / urutan bawaan). Field yang tidak dikirim = tetap. */
export class AiRoutingDto {
  @ApiPropertyOptional({ enum: AiProvider, nullable: true, description: "Chat asisten LifeOS & My Notebook" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(AiProvider, { message: "Provider AI tidak dikenal." })
  chat?: AiProvider | null;

  @ApiPropertyOptional({ enum: AiProvider, nullable: true, description: "Fitur AI lain (ringkasan, Notes AI, editor)" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(AiProvider, { message: "Provider AI tidak dikenal." })
  general?: AiProvider | null;

  @ApiPropertyOptional({ enum: AiProvider, nullable: true, description: "Model agen Hermes (lewat proxy LifeOS)" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(AiProvider, { message: "Provider AI tidak dikenal." })
  agent?: AiProvider | null;

  @ApiPropertyOptional({ enum: AiProvider, nullable: true, description: "Baca gambar & PDF hasil scan (OCR)" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(AiProvider, { message: "Provider AI tidak dikenal." })
  ocr?: AiProvider | null;

  @ApiPropertyOptional({ enum: AiProvider, nullable: true, description: "Cadangan pertama chat" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(AiProvider, { message: "Provider AI tidak dikenal." })
  chatBackup?: AiProvider | null;

  @ApiPropertyOptional({ enum: AiProvider, nullable: true, description: "Cadangan pertama fitur AI lain" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(AiProvider, { message: "Provider AI tidak dikenal." })
  generalBackup?: AiProvider | null;

  @ApiPropertyOptional({ enum: AiProvider, nullable: true, description: "Cadangan pertama model agen Hermes" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(AiProvider, { message: "Provider AI tidak dikenal." })
  agentBackup?: AiProvider | null;

  @ApiPropertyOptional({ enum: ["gemini", "openai"], nullable: true, description: "Embedding indeks pengetahuan" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(["gemini", "openai"], { message: "Embedding hanya Gemini atau OpenAI." })
  embedding?: "gemini" | "openai" | null;
}

export class UpdateAiSettingsDto {
  @ApiPropertyOptional({ type: AiRoutingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AiRoutingDto)
  routing?: AiRoutingDto;

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
