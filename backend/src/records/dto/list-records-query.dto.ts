import { IsIn, IsISO8601, IsOptional } from "class-validator";

export class ListRecordsQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /** `1` = daftar ringan: field berat (dokumen, coretan, teks dokumen) tidak ikut (`record-light.ts`) */
  @IsOptional()
  @IsIn(["1"])
  light?: string;
}
