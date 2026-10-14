import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

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

  /** Logo sebagai data URL gambar (maks ~1 MB file). String kosong menghapus logo; tidak dikirim = tetap. */
  @IsOptional()
  @IsString()
  @MaxLength(1_500_000)
  @Matches(/^(data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/]+={0,2})?$/, {
    message: "Logo harus berupa gambar PNG, JPG, WEBP, GIF, atau SVG.",
  })
  appLogo?: string;
}
