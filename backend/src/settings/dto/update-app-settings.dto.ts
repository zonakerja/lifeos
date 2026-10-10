import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateAppSettingsDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  navSub?: string;

  @IsOptional()
  @IsString()
  loginSub?: string;

  @IsOptional()
  @IsString()
  motto?: string;

  @IsOptional()
  @IsString()
  welcomeTitle?: string;

  @IsOptional()
  @IsString()
  welcomeSub?: string;

  @IsOptional()
  @IsString()
  footerText?: string;

  /** Logo sebagai data URL (maks ~1 MB file). String kosong menghapus logo. */
  @IsOptional()
  @IsString()
  @MaxLength(1_500_000)
  appLogo?: string;
}
