import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { GROUP_KINDS } from "./whatsapp-logic";

export class GroupDto {
  @ApiProperty({ description: "Kode grup (mis. kode satker SIMAN, UMUM, LOKET-1)" })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,40}$/, { message: "Kode grup hanya huruf, angka, titik, garis (maks. 40)." })
  code: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;

  @ApiPropertyOptional({ enum: GROUP_KINDS })
  @IsOptional()
  @IsIn(GROUP_KINDS, { message: "Jenis grup tidak dikenal." })
  kind?: string;

  @ApiPropertyOptional({ description: "Anggota boleh mengirim berkas pengajuan lewat bot (bawaan true)" })
  @IsOptional()
  @IsBoolean()
  allowRequests?: boolean;

  @ApiPropertyOptional({
    description: "Anggota boleh melihat status pengajuan seluruh grup (bawaan false = milik sendiri)",
  })
  @IsOptional()
  @IsBoolean()
  shareRequests?: boolean;
}

export class UpdateGroupDto extends PartialType(GroupDto) {}

export class BotProfileDto {
  @ApiPropertyOptional({ description: "Nama layanan yang disebut bot" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serviceName?: string;

  @ApiPropertyOptional({ description: "Topik yang boleh dijawab bot" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  topic?: string;
}

export class ContactDto {
  @ApiProperty({ description: "Nomor WhatsApp, mis. 0812-3456-7890 atau +62 812…" })
  @IsString()
  @MaxLength(30)
  phone: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  position?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  groupId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;
}

export class UpdateContactDto extends PartialType(ContactDto) {}

class SaveToInboxDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  question?: string;
}

export class ReplyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(8_000)
  text: string;

  @ApiPropertyOptional({ description: "Simpan juga jawaban ini sebagai usulan FAQ di 00-Inbox vault" })
  @IsOptional()
  @ValidateNested()
  @Type(() => SaveToInboxDto)
  saveToInbox?: SaveToInboxDto;
}

export class SimulateDto {
  @ApiProperty()
  @IsString()
  @MaxLength(30)
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  text?: string;

  @ApiPropertyOptional({ type: [String], description: "Berkas yang sudah diunggah (seolah dikirim lewat WhatsApp)" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  uploadIds?: string[];
}
