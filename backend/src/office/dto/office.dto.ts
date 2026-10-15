import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { NEW_DOCUMENT_FORMATS, type NewDocumentFormat } from "../office-logic";

export class CreateOfficeDocumentDto {
  /** Jenis dokumen kosong: docx (Dokumen), xlsx (Spreadsheet), pptx (Presentasi), pdf (PDF/formulir). */
  @IsIn(NEW_DOCUMENT_FORMATS)
  format: NewDocumentFormat;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  /** Konteks lampiran (mis. "task", "schedule"); kosong = "office". */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  context?: string;

  /** Pemilik item bersama (izin edit) tempat dokumen dilampirkan; kosong = milik sendiri. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ownerId?: string;
}

export class OfficeConfigDto {
  @IsString()
  @MaxLength(100)
  uploadId: string;

  /** `view` = pratinjau baca-saja walau user punya izin edit. Default mengikuti izin. */
  @IsOptional()
  @IsIn(["edit", "view"])
  mode?: "edit" | "view";

  /** Tampilan seluler ONLYOFFICE (layar kecil). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  mobile?: boolean;

  @IsOptional()
  @IsIn(["light", "dark"])
  theme?: "light" | "dark";
}
