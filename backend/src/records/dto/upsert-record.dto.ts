import { IsObject, IsOptional, IsString } from "class-validator";

export class UpsertRecordDto {
  /** Data entitas apa adanya. `payload.id` diselaraskan dengan clientId pada URL. */
  @IsObject()
  payload: Record<string, unknown>;

  /** Pemilik record (hanya admin/super_admin). Default: user yang login. */
  @IsOptional()
  @IsString()
  userId?: string;
}
