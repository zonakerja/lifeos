import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthUser } from "../common/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { domainDelegate } from "../records/record-delegate";
import { RECORD_TABLES, type RecordType } from "../records/record-schema";
import { CommentTargetQueryDto, CreateCommentDto, UpdateCommentDto } from "./dto/sharing.dto";
import { ShareAccessService } from "./share-access.service";
import { type SharePermission, accessKey, atLeast } from "./share-graph";

const AUTHOR = { select: { id: true, name: true } } as const;

/**
 * Komentar pada item: pemilik dan penerima berbagi (izin `comment`/`edit`) boleh menulis; izin `view` hanya membaca.
 * Penulis boleh mengubah/menghapus komentarnya; pemilik item boleh menghapus komentar siapa pun.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ShareAccessService,
  ) {}

  async list(user: AuthUser, query: CommentTargetQueryDto) {
    const ownerId = query.ownerId || user.id;
    await this.requirePermission(user, ownerId, query.recordType, query.recordId, "view");
    return this.prisma.recordComment.findMany({
      where: { ownerId, recordType: query.recordType, recordId: query.recordId },
      include: { author: AUTHOR },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(user: AuthUser, dto: CreateCommentDto) {
    const ownerId = dto.ownerId || user.id;
    await this.requirePermission(user, ownerId, dto.recordType, dto.recordId, "comment");
    return this.prisma.recordComment.create({
      data: {
        ownerId,
        recordType: dto.recordType,
        recordId: dto.recordId,
        authorId: user.id,
        body: dto.body.trim(),
      },
      include: { author: AUTHOR },
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateCommentDto) {
    const comment = await this.prisma.recordComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException("Komentar tidak ditemukan.");
    if (comment.authorId !== user.id) throw new ForbiddenException("Hanya penulis yang dapat mengubah komentar.");
    return this.prisma.recordComment.update({
      where: { id },
      data: { body: dto.body.trim() },
      include: { author: AUTHOR },
    });
  }

  async remove(user: AuthUser, id: string) {
    const comment = await this.prisma.recordComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException("Komentar tidak ditemukan.");
    if (comment.authorId !== user.id && comment.ownerId !== user.id) {
      throw new ForbiddenException("Anda tidak dapat menghapus komentar ini.");
    }
    await this.prisma.recordComment.delete({ where: { id } });
    return { success: true };
  }

  private async requirePermission(
    user: AuthUser,
    ownerId: string,
    type: string,
    recordId: string,
    need: SharePermission,
  ) {
    if (ownerId === user.id) {
      if (!Object.hasOwn(RECORD_TABLES, type)) throw new NotFoundException("Item tidak ditemukan.");
      const row = await domainDelegate(this.prisma, type as RecordType).findUnique({
        where: { userId_clientId: { userId: ownerId, clientId: recordId } },
      });
      if (!row || row.deletedAt) throw new NotFoundException("Item tidak ditemukan.");
      return;
    }
    const entry = (await this.access.forUser(user.id)).get(ownerId)?.records.get(accessKey(type, recordId));
    if (!entry) throw new NotFoundException("Item tidak ditemukan.");
    if (!atLeast(entry.permission, need)) {
      throw new ForbiddenException("Izin Anda atas item ini tidak mencakup menulis komentar.");
    }
  }
}
