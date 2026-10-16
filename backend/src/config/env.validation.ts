import { plainToInstance, Transform } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from "class-validator";

const DURATION_PATTERN = /^\d+(ms|s|m|h|d)?$/;

/** String kosong = tidak diisi (compose mengirim `VAR=""` untuk env opsional yang tidak dipakai). */
const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const toBoolean = ({ value }: { value: unknown }) =>
  typeof value === "boolean" ? value : String(value).toLowerCase() !== "false";

class EnvironmentVariables {
  @IsIn(["development", "production", "test"])
  NODE_ENV: "development" | "production" | "test" = "development";

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 4000;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  @MinLength(16)
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(16)
  JWT_REFRESH_SECRET: string;

  @Matches(DURATION_PATTERN)
  JWT_ACCESS_EXPIRES_IN = "15m";

  @Matches(DURATION_PATTERN)
  JWT_REFRESH_EXPIRES_IN = "7d";

  @IsString()
  CORS_ORIGIN = "http://localhost:5173";

  @IsString()
  REDIS_HOST = "localhost";

  @Transform(({ value }) => Number(value))
  @IsInt()
  REDIS_PORT = 6379;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  EXTRACTION_CONCURRENCY = 2;

  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  @IsString()
  S3_REGION = "us-east-1";

  @IsString()
  S3_ACCESS_KEY_ID: string;

  @IsString()
  S3_SECRET_ACCESS_KEY: string;

  @Transform(toBoolean)
  @IsBoolean()
  S3_FORCE_PATH_STYLE = true;

  @IsString()
  ASSET_BUCKET = "lifeos-assets";

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  UPLOAD_MAX_MB = 100;

  /** Kunci AES-256 (64 karakter hex, `openssl rand -hex 32`) untuk mengenkripsi API key AI milik user. */
  @Matches(/^[0-9a-fA-F]{64}$/, { message: "AI_ENCRYPTION_KEY harus 64 karakter hex (openssl rand -hex 32)." })
  AI_ENCRYPTION_KEY: string;

  @IsOptional()
  @IsIn(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
  LOG_LEVEL?: string;

  /** Cookie refresh hanya via HTTPS. Default: true bila NODE_ENV=production. */
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === ""
      ? undefined
      : value === true || ["true", "1"].includes(String(value).toLowerCase()),
  )
  @IsBoolean()
  COOKIE_SECURE?: boolean;

  /**
   * ONLYOFFICE Docs (menu Tools → ONLYOFFICE, docs/ONLYOFFICE.md). Kosong = fitur editor dokumen nonaktif.
   * URL yang dibuka BROWSER (dev `http://localhost:8080`, produksi `https://<domain>/office`).
   */
  @Transform(emptyToUndefined)
  @IsOptional()
  @Matches(/^https?:\/\/\S+$/, { message: "ONLYOFFICE_URL harus URL http(s)." })
  ONLYOFFICE_URL?: string;

  /** URL ONLYOFFICE yang dihubungi BACKEND (produksi `http://onlyoffice`). Kosong = sama dengan ONLYOFFICE_URL. */
  @Transform(emptyToUndefined)
  @IsOptional()
  @Matches(/^https?:\/\/\S+$/, { message: "ONLYOFFICE_INTERNAL_URL harus URL http(s)." })
  ONLYOFFICE_INTERNAL_URL?: string;

  /** Secret JWT bersama ONLYOFFICE (= `JWT_SECRET` container). Wajib bila ONLYOFFICE_URL diisi. */
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MinLength(32)
  ONLYOFFICE_JWT_SECRET?: string;

  /**
   * Alamat backend yang dihubungi container ONLYOFFICE. `auto` = development di Windows + Docker WSL (IP gateway WSL
   * dibaca otomatis); produksi `http://backend:4000`.
   */
  @IsString()
  ONLYOFFICE_BACKEND_URL = "auto";

  /**
   * Folder font tambahan yang juga di-mount ke container ONLYOFFICE (`/usr/share/fonts/truetype/custom`). Admin
   * mengunggah font ke sini dari Tools → ONLYOFFICE; ONLYOFFICE membuat ulang daftar font otomatis. Kosong = unggah font
   * nonaktif. Dev: `../infra/onlyoffice/fonts`; produksi: `/app/office-fonts` (volume bersama).
   */
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  ONLYOFFICE_FONTS_DIR?: string;

  /** true bila API berada di belakang reverse proxy (nginx) agar IP klien asli terbaca (rate limit). */
  @Transform(({ value }) => value === true || ["true", "1"].includes(String(value).toLowerCase()))
  @IsBoolean()
  TRUST_PROXY = false;
}

export function validateEnv(config: Record<string, unknown>) {
  const env = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false });

  env.COOKIE_SECURE ??= env.NODE_ENV === "production";

  if (env.ONLYOFFICE_URL && !env.ONLYOFFICE_JWT_SECRET) {
    throw new Error(
      "Konfigurasi environment tidak valid:\n- ONLYOFFICE_JWT_SECRET wajib diisi bila ONLYOFFICE_URL diisi.",
    );
  }

  if (errors.length > 0) {
    const details = errors
      .map((error) => `- ${error.property}: ${Object.values(error.constraints ?? {}).join(", ")}`)
      .join("\n");
    throw new Error(`Konfigurasi environment tidak valid:\n${details}`);
  }

  return env;
}
