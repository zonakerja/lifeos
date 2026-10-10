import { IsOptional, IsString, MaxLength } from "class-validator";

export class UploadFileDto {
  /** Konteks asal upload, mis. "resource", "ai_note", "archive". */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  context?: string;
}
