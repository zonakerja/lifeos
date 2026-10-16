import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";
import { NEW_DOCUMENT_FORMATS, type NewDocumentFormat } from "../office-logic";

export class CreateOfficeDocumentDto {
  /** Jenis dokumen kosong: docx (Dokumen), xlsx (Spreadsheet), pptx (Presentasi), pdf (PDF/formulir). */
  @ValidateIf((dto: CreateOfficeDocumentDto) => !dto.templateId)
  @IsIn(NEW_DOCUMENT_FORMATS)
  format?: NewDocumentFormat;

  /** Berkas templat (Resource bertag Templat) yang disalin isinya; format mengikuti templat. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  templateId?: string;

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

  /** Origin aplikasi di browser (tab AI editor memanggil backend lewat origin ini; harus terdaftar di CORS_ORIGIN). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  appOrigin?: string;
}

export class OfficePreferencesDto {
  /** AI di editor (tab AI ONLYOFFICE memakai provider & key di Pengaturan → AI). */
  @IsBoolean()
  ai: boolean;
}
