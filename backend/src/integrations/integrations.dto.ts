import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { API_SCOPES } from "./api-token-logic";

export class CreateApiTokenDto {
  @ApiProperty({ description: "Nama untuk mengenali token, mis. Hermes pribadi" })
  @IsString()
  @MinLength(1, { message: "Nama token wajib diisi." })
  @MaxLength(60)
  name: string;

  @ApiProperty({ enum: API_SCOPES, isArray: true })
  @IsArray()
  @ArrayMinSize(1, { message: "Pilih minimal satu cakupan izin." })
  @IsIn(API_SCOPES, { each: true, message: "Cakupan izin tidak dikenal." })
  scopes: string[];

  @ApiPropertyOptional({ nullable: true, description: "Masa berlaku (hari); null = tanpa batas" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number | null;
}

export class ActivityQueryDto {
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
