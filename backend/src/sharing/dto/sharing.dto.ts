import { IsEmail, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { SharePermission } from "../../generated/prisma/client";
import { SHAREABLE_TYPES } from "../share-graph";

export class ShareTargetQueryDto {
  @IsIn(SHAREABLE_TYPES)
  recordType: string;

  @IsString()
  @IsNotEmpty()
  recordId: string;
}

export class CreateShareDto extends ShareTargetQueryDto {
  /** Email akun penerima */
  @IsEmail()
  email: string;

  @IsEnum(SharePermission)
  permission: SharePermission;
}

export class UpdateShareDto {
  @IsEnum(SharePermission)
  permission: SharePermission;
}

export class CommentTargetQueryDto {
  @IsString()
  @IsNotEmpty()
  recordType: string;

  @IsString()
  @IsNotEmpty()
  recordId: string;

  /** Pemilik item; kosong = milik sendiri */
  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class CreateCommentDto extends CommentTargetQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;
}

export class UpdateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;
}
