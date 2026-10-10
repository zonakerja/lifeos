import { IsOptional, IsString } from "class-validator";

export class RecordOwnerQueryDto {
  /** Pemilik record (hanya admin/super_admin). */
  @IsOptional()
  @IsString()
  userId?: string;
}
