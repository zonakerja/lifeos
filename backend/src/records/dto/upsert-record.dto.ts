import { ArrayMaxSize, IsArray, IsObject, IsOptional, IsString } from "class-validator";

export class UpsertRecordDto {
  /** Data entitas apa adanya. `payload.id` diselaraskan dengan clientId pada URL. */
  @IsObject()
  payload: Record<string, unknown>;

  /** Pemilik record bila item milik user lain yang dibagikan (izin edit). Default: user yang login. */
  @IsOptional()
  @IsString()
  userId?: string;

  /**
   * Isi item sebelum perubahan client. Untuk tipe yang mendukung penggabungan (List), server menerapkan selisih
   * base → payload di atas isi terkini sehingga perubahan orang lain tidak tertimpa (`record-merge.ts`).
   */
  @IsOptional()
  @IsObject()
  base?: Record<string, unknown>;

  /** Key yang tidak utuh di client (daftar ringan) → nilai tersimpan dipertahankan (`record-light.ts`). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  preserve?: string[];
}
