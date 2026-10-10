import { IsISO8601, IsOptional, IsString } from "class-validator";

export class ListRecordsQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
