import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class UpdateAutomationJobDto {
  @ApiPropertyOptional({ description: "Aktifkan / matikan jadwal" })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description:
      "Jadwal: { mode: daily, time: 'HH:mm', days: [0–6] } | { mode: hourly, minute, from, to, days } | { mode: cron, pattern } + timezone",
  })
  @IsOptional()
  @IsObject()
  schedule?: Record<string, unknown>;
}

export class AutomationRunsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  kind?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  take?: number;
}
