import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthUser } from "../common/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { domainDelegate } from "../records/record-delegate";
import { RECORD_TABLES, type RecordType } from "../records/record-schema";
import { toApiRecord } from "../records/record-mapper";
import { CreateShareDto, ShareTargetQueryDto, UpdateShareDto } from "./dto/sharing.dto";
import { ShareAccessService } from "./share-access.service";
import { SERIES_TYPE } from "./share-graph";

const PERSON = { select: { id: true, name: true, email: true } } as const;

/** Mengelola berbagi item: hanya pemilik yang membagikan; penerima boleh keluar dari berbagi. */
@Injectable()
export class SharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ShareAccessService,
  ) {}

  /** Daftar penerima satu item milik user. */
  async listForItem(user: AuthUser, query: ShareTargetQueryDto) {
    await this.ensureOwnItem(user.id, query.recordType, query.recordId);
    return this.prisma.share.findMany({
      where: { ownerId: user.id, recordType: query.recordType, recordId: query.recordId },
      include: { recipient: PERSON },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(user: AuthUser, dto: CreateShareDto) {
    await this.ensureOwnItem(user.id, dto.recordType, dto.recordId);
    const recipient = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!recipient) throw new NotFoundException("Tidak ada akun dengan email tersebut.");
    if (recipient.id === user.id) throw new BadRequestException("Tidak dapat membagikan ke diri sendiri.");
    const share = await this.prisma.share.upsert({
      where: {
        ownerId_recordType_recordId_recipientId: {
          ownerId: user.id,
          recordType: dto.recordType,
          recordId: dto.recordId,
          recipientId: recipient.id,
        },
      },
      create: {
        ownerId: user.id,
        recipientId: recipient.id,
        recordType: dto.recordType,
        recordId: dto.recordId,
        permission: dto.permission,
      },
      update: { permission: dto.permission },
      include: { recipient: PERSON },
    });
    this.access.invalidate();
    return share;
  }

  async update(user: AuthUser, id: string, dto: UpdateShareDto) {
    const share = await this.prisma.share.findUnique({ where: { id } });
    if (!share) throw new NotFoundException("Berbagi tidak ditemukan.");
    if (share.ownerId !== user.id) throw new ForbiddenException("Hanya pemilik yang dapat mengubah izin.");
    const updated = await this.prisma.share.update({
      where: { id },
      data: { permission: dto.permission },
      include: { recipient: PERSON },
    });
    this.access.invalidate();
    return updated;
  }

  /** Pemilik mencabut berbagi, atau penerima keluar dari berbagi. */
  async remove(user: AuthUser, id: string) {
    const share = await this.prisma.share.findUnique({ where: { id } });
    if (!share) throw new NotFoundException("Berbagi tidak ditemukan.");
    if (share.ownerId !== user.id && share.recipientId !== user.id) {
      throw new ForbiddenException("Anda tidak dapat menghapus berbagi ini.");
    }
    await this.prisma.share.delete({ where: { id } });
    this.access.invalidate();
    return { success: true };
  }

  /** Semua item yang dibagikan user ke orang lain. */
  async outgoing(user: AuthUser) {
    const shares = await this.prisma.share.findMany({
      where: { ownerId: user.id },
      include: { recipient: PERSON },
      orderBy: { createdAt: "desc" },
    });
    const titles = await this.describe(shares.map((s) => ({ ownerId: s.ownerId, type: s.recordType, id: s.recordId })));
    return shares.map((s) => ({ ...s, item: titles.get(`${s.ownerId}:${s.recordType}:${s.recordId}`) ?? null }));
  }

  /** Semua item milik orang lain yang dibagikan ke user. */
  async incoming(user: AuthUser) {
    const shares = await this.prisma.share.findMany({
      where: { recipientId: user.id },
      include: { owner: PERSON },
      orderBy: { createdAt: "desc" },
    });
    const titles = await this.describe(shares.map((s) => ({ ownerId: s.ownerId, type: s.recordType, id: s.recordId })));
    return shares.map((s) => ({ ...s, item: titles.get(`${s.ownerId}:${s.recordType}:${s.recordId}`) ?? null }));
  }

  /** Judul & tanggal item (null = sudah dihapus / diarsipkan pemilik). */
  private async describe(items: { ownerId: string; type: string; id: string }[]) {
    const result = new Map<string, { title: string | null; date: string | null }>();
    // Seri agenda: judul pertemuan pertama + jumlah pertemuan
    for (const item of items.filter((i) => i.type === SERIES_TYPE)) {
      const members = await this.seriesMembers(item.ownerId, item.id);
      if (!members.length) continue;
      const first = toApiRecord("schedule", RECORD_TABLES.schedule, members[0]);
      result.set(`${item.ownerId}:${item.type}:${item.id}`, {
        title: `${first.title ?? "Agenda"} (seri · ${members.length} pertemuan)`,
        date: first.date,
      });
    }
    const groups = new Map<string, { ownerId: string; type: RecordType; ids: string[] }>();
    for (const item of items) {
      if (!Object.hasOwn(RECORD_TABLES, item.type)) continue;
      const key = `${item.ownerId}:${item.type}`;
      const group = groups.get(key) ?? { ownerId: item.ownerId, type: item.type as RecordType, ids: [] };
      group.ids.push(item.id);
      groups.set(key, group);
    }
    for (const { ownerId, type, ids } of groups.values()) {
      const rows = await domainDelegate(this.prisma, type).findMany({
        where: { userId: ownerId, clientId: { in: ids }, deletedAt: null },
      });
      for (const row of rows) {
        const record = toApiRecord(type, RECORD_TABLES[type], row);
        result.set(`${ownerId}:${type}:${row.clientId}`, { title: record.title, date: record.date });
      }
    }
    return result;
  }

  /** Pertemuan seri agenda berulang milik `ownerId` (urut tanggal). */
  private seriesMembers(ownerId: string, seriesId: string) {
    return this.prisma.schedule.findMany({
      where: { userId: ownerId, deletedAt: null, extra: { path: ["seriesId"], equals: seriesId } },
      orderBy: [{ startDate: "asc" }, { clientId: "asc" }],
    });
  }

  private async ensureOwnItem(userId: string, type: string, clientId: string) {
    if (type === SERIES_TYPE) {
      if ((await this.seriesMembers(userId, clientId)).length) return;
      throw new NotFoundException("Seri agenda tidak ditemukan atau bukan milik Anda.");
    }
    if (!Object.hasOwn(RECORD_TABLES, type)) throw new BadRequestException("Jenis item tidak dikenal.");
    const row = await domainDelegate(this.prisma, type as RecordType).findUnique({
      where: { userId_clientId: { userId, clientId } },
    });
    if (!row || row.deletedAt) throw new NotFoundException("Item tidak ditemukan atau bukan milik Anda.");
  }
}
