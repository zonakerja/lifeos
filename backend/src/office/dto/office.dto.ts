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

/** Tautkan dokumen final ke konsepnya (`draftId`), atau lepaskan (`null`). */
export class OfficeDraftLinkDto {
  @ValidateIf((dto: OfficeDraftLinkDto) => dto.draftId !== null)
  @IsString()
  @MaxLength(100)
  draftId: string | null;
}

export class OfficeLinkCandidatesQuery {
  /** `draft` = calon konsep (dokumen ONLYOFFICE), `final` = calon dokumen final (berkas lain). */
  @IsIn(["draft", "final"])
  role: "draft" | "final";

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
