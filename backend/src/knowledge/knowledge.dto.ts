import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  Matches,
  Max,
  Min,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class SetVaultDto {
  @ApiProperty({ nullable: true, description: "Nama subfolder vault di folder vault server; null = lepas vault" })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  folder: string | null;
}

export class CreateVaultDto {
  @ApiProperty({ description: "Nama folder vault baru (dibuat dari templat)" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  folder: string;
}

export class KnowledgeNotesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class InboxNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: "Judul wajib diisi." })
  @MaxLength(120)
  title: string;

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: "Isi wajib diisi." })
  @MaxLength(100_000)
  content: string;

  @ApiPropertyOptional({ description: "Pertanyaan asal (bila catatan berasal dari jawaban chat)" })
  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  question?: string;
}

export class KnowledgeSearchQueryDto {
  @ApiProperty({ description: "Kata/frasa + operator path:, tag:, status:, jenis:, file:" })
  @IsString()
  @MaxLength(300)
  q: string;

  @ApiPropertyOptional({ enum: ["text", "semantic"] })
  @IsOptional()
  @IsIn(["text", "semantic"])
  mode?: "text" | "semantic";
}

export class SaveNoteDto {
  @ApiProperty({ description: "Isi lengkap berkas (termasuk properti)" })
  @IsString()
  @MaxLength(2_000_000)
  content: string;

  @ApiProperty({ description: "Hash isi saat dibuka (penolak tulisan bentrok)" })
  @IsString()
  @Length(64, 64)
  baseHash: string;
}

export class NotePropertiesDto {
  @ApiPropertyOptional({ description: "Properti yang ditambah/diganti; nilai kosong = dihapus" })
  @IsOptional()
  @IsObject()
  set?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  remove?: string[];

  @ApiProperty()
  @IsString()
  @Length(64, 64)
  baseHash: string;
}

export class CreateNoteDto {
  @ApiPropertyOptional({ description: "Folder tujuan (kosong = akar vault)" })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  folder?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: "Judul wajib diisi." })
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  content?: string;

  @ApiPropertyOptional({ description: "Id catatan templat (folder 90-Templat)" })
  @IsOptional()
  @IsString()
  templateId?: string;
}

export class MoveNoteDto {
  @ApiProperty({ description: "Path baru di dalam vault" })
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  path: string;

  @ApiPropertyOptional({ description: "Perbarui [[tautan]] di catatan lain (bawaan ya)" })
  @IsOptional()
  @IsBoolean()
  updateLinks?: boolean;
}

export class FolderDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  path: string;
}

export class MoveFolderDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  from: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  to: string;
}

export class LinkMentionDto {
  @ApiProperty({ description: "Catatan yang menyebut judul (akan diberi [[tautan]])" })
  @IsString()
  sourceId: string;
}

/** Jenis data cermin 80-LifeOS (sama dengan `EXPORT_KINDS`). */
export class ExportKindsDto {
  @IsOptional() @IsBoolean() notes?: boolean;
  @IsOptional() @IsBoolean() lists?: boolean;
  @IsOptional() @IsBoolean() aiNotes?: boolean;
  @IsOptional() @IsBoolean() notebooks?: boolean;
  @IsOptional() @IsBoolean() productivity?: boolean;
}

export class ExportSettingsDto {
  @ApiPropertyOptional({ description: "Nyalakan cermin hasil kerja LifeOS ke folder 80-LifeOS di vault" })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: ExportKindsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExportKindsDto)
  kinds?: ExportKindsDto;
}

export class DailyNoteDto {
  @ApiProperty({ description: "Tanggal lokal user (YYYY-MM-DD)" })
  @IsString()
  @Length(10, 10)
  date: string;
}

export class ToggleTaskDto {
  @ApiProperty({ description: "Id catatan pemilik tugas" })
  @IsString()
  @MaxLength(64)
  noteId: string;

  @ApiProperty({ description: "Urutan tugas di catatan (0 = pertama)" })
  @IsInt()
  @Min(0)
  @Max(100_000)
  index: number;

  @ApiProperty({ description: "Baris tugas apa adanya saat dibaca (kunci pencocokan)" })
  @IsString()
  @MaxLength(5000)
  raw: string;

  @ApiProperty()
  @IsBoolean()
  done: boolean;

  @ApiProperty({ description: "Tanggal lokal user (YYYY-MM-DD) untuk ✅ tanggal selesai" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  today: string;
}

export class BaseFileDto {
  @ApiProperty({ description: "Path berkas .base di vault" })
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  path: string;
}

export class CreateBaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  folder?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
}

export class SaveBaseDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  path: string;

  @ApiProperty({ description: "Isi base (filters, formulas, properties, views)" })
  @IsObject()
  data: Record<string, unknown>;

  @ApiProperty()
  @IsString()
  @Length(64, 64)
  baseHash: string;
}

export class RestoreVersionDto {
  @ApiProperty({ description: "Hash isi berkas sekarang (berubah di disk → 409)" })
  @IsString()
  @Length(64, 64)
  baseHash: string;
}
