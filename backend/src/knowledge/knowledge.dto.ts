import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";

export class SetVaultDto {
  @ApiProperty({ nullable: true, description: "Nama subfolder vault di folder vault server; null = lepas vault" })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  folder: string | null;
}

export class CreateVaultDto {
  @ApiProperty({ description: "Nama folder vault baru (dibuat dari templat)" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  folder: string;
}

export class KnowledgeNotesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class InboxNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: "Judul wajib diisi." })
  @MaxLength(120)
  title: string;

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: "Isi wajib diisi." })
  @MaxLength(100_000)
  content: string;

  @ApiPropertyOptional({ description: "Pertanyaan asal (bila catatan berasal dari jawaban chat)" })
  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  question?: string;
}
