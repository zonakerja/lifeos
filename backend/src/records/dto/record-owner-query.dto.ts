import { IsOptional, IsString } from "class-validator";

export class RecordOwnerQueryDto {
  /** Pemilik record bila item milik user lain yang dibagikan (izin edit). Default: user yang login. */
  @IsOptional()
  @IsString()
  userId?: string;
}
