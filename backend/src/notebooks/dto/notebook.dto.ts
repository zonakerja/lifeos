import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { NotebookSourceKind } from "../../generated/prisma/client";

/** Item LifeOS yang bisa dijadikan sumber notebook. */
export const NOTEBOOK_RECORD_TYPES = ["free_note", "ai_note", "list", "para_resource"] as const;
export type NotebookRecordType = (typeof NOTEBOOK_RECORD_TYPES)[number];

/** Batas teks tempel (karakter). */
export const MAX_TEXT_SOURCE_CHARS = 500_000;

export class CreateNotebookDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: "Judul notebook wajib diisi." })
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: "Key ikon dari paket ikon aplikasi" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string;
}

export class UpdateNotebookDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "Judul notebook wajib diisi." })
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(60)
  icon?: string | null;
}

export class AddNotebookSourceDto {
  @ApiProperty({ enum: NotebookSourceKind })
  @IsEnum(NotebookSourceKind, { message: "Jenis sumber tidak dikenal." })
  kind!: NotebookSourceKind;

  @ApiPropertyOptional({ description: "kind=upload: ID berkas hasil POST /uploads" })
  @ValidateIf((o: AddNotebookSourceDto) => o.kind === NotebookSourceKind.upload)
  @IsString()
  @MaxLength(100)
  assetId?: string;

  @ApiPropertyOptional({ enum: NOTEBOOK_RECORD_TYPES })
  @ValidateIf((o: AddNotebookSourceDto) => o.kind === NotebookSourceKind.record)
  @IsIn(NOTEBOOK_RECORD_TYPES, { message: "Jenis item tidak bisa dijadikan sumber." })
  recordType?: NotebookRecordType;

  @ApiPropertyOptional()
  @ValidateIf((o: AddNotebookSourceDto) => o.kind === NotebookSourceKind.record)
  @IsString()
  @MaxLength(200)
  recordId?: string;

  @ApiPropertyOptional({ description: "kind=text: judul (opsional)" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({ description: "kind=text: isi teks" })
  @ValidateIf((o: AddNotebookSourceDto) => o.kind === NotebookSourceKind.text)
  @IsString()
  @MinLength(20, { message: "Teks sumber terlalu pendek (min. 20 karakter)." })
  @MaxLength(MAX_TEXT_SOURCE_CHARS, { message: "Teks sumber maksimal 500.000 karakter." })
  content?: string;

  @ApiPropertyOptional({ description: "kind=web: alamat halaman" })
  @ValidateIf((o: AddNotebookSourceDto) => o.kind === NotebookSourceKind.web)
  @IsString()
  @MaxLength(2000)
  url?: string;
}

export class UpdateNotebookSourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;
}

/** Lampiran per pesan chat (backend AI menerima maks. 5 lampiran / 20 MB per permintaan). */
export const MAX_CHAT_FILES = 4;
export const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_CHAT_FILE_BYTES = 20 * 1024 * 1024;
/** Context upload untuk berkas yang diunggah langsung ke notebook (ikut terhapus bersama notebook). */
export const NOTEBOOK_UPLOAD_CONTEXT = "notebook";
/** Context upload lampiran chat notebook — hanya berkas ini yang boleh dilampirkan & ikut terhapus bersama chat. */
export const NOTEBOOK_CHAT_CONTEXT = "notebook_chat";
/** Riwayat chat yang dimuat sekaligus (pesan terbaru); "Muat pesan lama" menambah per kelipatan ini. */
export const NOTEBOOK_MESSAGES_PAGE = 100;

export class NotebookChatDto {
  @ApiProperty({ description: "Boleh kosong bila ada lampiran" })
  @IsString()
  @MaxLength(4000, { message: "Pertanyaan maksimal 4.000 karakter." })
  message!: string;

  @ApiPropertyOptional({
    description: "ID berkas (hasil POST /uploads) yang dilampirkan ke pertanyaan: gambar, PDF, DOCX, XLSX, teks",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CHAT_FILES, { message: "Maksimal 4 lampiran per pesan." })
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  fileIds?: string[];
}

export class SaveNotebookNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: "Judul catatan wajib diisi." })
  @MaxLength(300)
  title!: string;

  @ApiProperty({ description: "Markdown" })
  @IsString()
  @MaxLength(200_000)
  content!: string;

  @ApiPropertyOptional({ enum: ["chat", "summary", "manual"] })
  @IsOptional()
  @IsIn(["chat", "summary", "manual"])
  origin?: "chat" | "summary" | "manual";
}

export class UpdateNotebookNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "Judul catatan wajib diisi." })
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  content?: string;
}
