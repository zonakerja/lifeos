import { IsOptional, IsString, MaxLength } from "class-validator";

export class UploadFileDto {
  /** Konteks asal upload, mis. "resource", "ai_note", "archive". */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  context?: string;

  /**
   * Pemilik berkas bila diunggah ke item milik user lain yang dibagikan dengan izin edit (mis. lampiran action di
   * project bersama). Kosong = milik pengunggah.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ownerId?: string;
}
