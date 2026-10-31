import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class UpdateConnectorDto {
  @ApiPropertyOptional({ description: "Alamat utama sistem (https://…)" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string;

  @ApiPropertyOptional({ type: [String], description: "Host tambahan yang boleh dibuka (mis. server SSO)" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  extraHosts?: string[];

  @ApiPropertyOptional({ type: [String], description: "Penanda alamat halaman login (mis. /auth/login)" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  loginMarkers?: string[];
}

export class CaptureDto {
  @ApiPropertyOptional({ description: "Alamat halaman di dalam sistem (kosong = halaman utama)" })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  url?: string;
}

/** Masukan browser jarak jauh (divalidasi ulang ketat di service robot). */
export class RobotInputDto {
  @IsIn(["click", "dblclick", "move", "scroll", "type", "key", "goto", "back", "reload"])
  type: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(4000)
  x?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(4000)
  y?: number;

  @IsOptional()
  @IsNumber()
  @Min(-5000)
  @Max(5000)
  dy?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  url?: string;
}

/** Kredensial sistem untuk brankas; `accountPassword` = kata sandi akun LifeOS (konfirmasi, tidak disimpan). */
export class CredentialsDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  username: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;

  @ApiProperty({ description: "Kata sandi akun LifeOS Anda (konfirmasi)" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  accountPassword: string;
}

export class AnswerDto {
  @IsIn(["captcha", "otp"])
  kind: "captcha" | "otp";

  @IsString()
  @Matches(/^\S{1,12}$/, { message: "Jawaban tidak valid." })
  value: string;
}

export class FillRenaksiDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "Periode harus YYYY-MM." })
  period!: string;

  /** true = hanya membaca isi bulan & rencana langkah, tanpa mengisi */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class RegisterOutgoingDto {
  /** true = isi formulir SRIKANDI lalu berhenti (tidak disimpan) untuk diperiksa lewat tangkapan layar */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class SyncSkpDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}
