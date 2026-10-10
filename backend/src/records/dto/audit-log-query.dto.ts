import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class AuditLogQueryDto {
  /** Record type, mis. `archive_borrowing` */
  @IsOptional()
  @IsString()
  entityType?: string;

  /** ID entitas buatan client */
  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}
