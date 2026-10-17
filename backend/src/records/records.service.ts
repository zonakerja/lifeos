import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "../generated/prisma/client";
import { AiIndexQueueService } from "../ai/index/ai-index-queue.service";
import { isIndexedType } from "../ai/index/index-text";
import { AuthUser } from "../common/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { ShareAccessService } from "../sharing/share-access.service";
import { type SharePermission, accessKey, atLeast, parentRefsOf } from "../sharing/share-graph";
import { ListRecordsQueryDto } from "./dto/list-records-query.dto";
import { RecordOwnerQueryDto } from "./dto/record-owner-query.dto";
import { UpsertRecordDto } from "./dto/upsert-record.dto";
import { domainDelegate } from "./record-delegate";
import { preserveFields, toLightPayload } from "./record-light";
import { MERGE_ARRAY_KEYS, mergePayload } from "./record-merge";
import { type Payload, payloadToRow, rowToPayload, toApiRecord } from "./record-mapper";
import { RECORD_TABLES, type RecordType, type TableSpec, fieldName } from "./record-schema";

/** Penanda item milik user lain yang dibagikan (dikirim bersama record). */
type SharedMeta = { ownerId: string; ownerName: string; permission: SharePermission; root: boolean };
/** Record di respons daftar: `partial` = key payload yang tidak utuh (daftar ringan). */
type ApiRecord = ReturnType<typeof toApiRecord> & { share?: SharedMeta; partial?: string[] };

/** Metadata akses yang ditempelkan ke respons (bukan bagian data) — dibuang bila ikut terkirim saat menulis. */
const META_KEYS = ["share"];

const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical((value as Payload)[k])]),
        )
      : value;
const sameValue = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** Perubahan per field: { field: { from, to } }. */
function diffPayload(before: Payload, after: Payload) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === "userId") continue;
    if (!sameValue(before[key], after[key])) changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
  }
  return changes;
}

/** Resource/snapshot PARA hanya diaudit bila menyangkut arsip (File Control). */
function isArchivalData(type: RecordType, payload?: Payload) {
  if (!payload) return false;
  if (type === "para_resource") return !!payload.archivalStatus;
  if (type === "para_archive") return (payload.data as Payload | undefined)?.type === "file";
  return true;
}

/**
 * Data domain terisolasi per user: setiap user (termasuk admin) hanya membaca & menulis datanya sendiri, ditambah
 * item milik user lain yang dibagikan kepadanya (`shares`, lihat `src/sharing/`).
 */
@Injectable()
export class RecordsService {
  constructor(
    private readonly prisma: PrismaService,
    // Perubahan data diindeks ulang untuk RAG di latar belakang (tidak menahan respons)
    private readonly indexQueue: AiIndexQueueService,
    private readonly shareAccess: ShareAccessService,
  ) {}

  parseType(type: string): RecordType {
    if (!Object.hasOwn(RECORD_TABLES, type)) {
      throw new NotFoundException(`Record type '${type}' tidak dikenal.`);
    }
    return type as RecordType;
  }

  /** Data milik user + item yang dibagikan kepadanya (bertanda `share`). */
  async findMany(type: RecordType, query: ListRecordsQueryDto, user: AuthUser) {
    const spec: TableSpec = RECORD_TABLES[type];
    const where: Record<string, unknown> = { deletedAt: null };
    const dateField = spec.fields.find((f) => f.key === spec.dateKey);
    if (dateField && (query.from || query.to)) {
      where[fieldName(dateField)] = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    const table = domainDelegate(this.prisma, type);
    const orderBy = [{ createdAt: "asc" }, { id: "asc" }];

    const own = await table.findMany({ where: { ...where, userId: user.id }, orderBy });
    const result: ApiRecord[] = own.map((row) => toApiRecord(type, spec, row));

    for (const access of (await this.shareAccess.forUser(user.id)).values()) {
      const entries = [...access.records.values()].filter((e) => e.type === type);
      if (entries.length === 0) continue;
      const rows = await table.findMany({
        where: { ...where, userId: access.ownerId, clientId: { in: entries.map((e) => e.id) } },
        orderBy,
      });
      for (const row of rows) {
        const entry = access.records.get(accessKey(type, row.clientId))!;
        result.push({
          ...toApiRecord(type, spec, row),
          share: {
            ownerId: access.ownerId,
            ownerName: access.ownerName,
            permission: entry.permission,
            root: entry.root,
          },
        });
      }
    }
    return query.light ? result.map((record) => this.lighten(type, record)) : result;
  }

  /** Versi daftar: field berat dipotong, ditandai `partial`. */
  private lighten(type: RecordType, record: ApiRecord): ApiRecord {
    const { payload, partial } = toLightPayload(type, record.payload);
    return partial.length ? { ...record, payload, partial } : record;
  }

  /** Satu record utuh (milik sendiri atau dibagikan kepada user) — dipakai editor setelah daftar ringan. */
  async findOne(type: RecordType, clientId: string, query: RecordOwnerQueryDto, user: AuthUser) {
    const spec: TableSpec = RECORD_TABLES[type];
    const ownerId = query.userId ?? user.id;
    let share: SharedMeta | undefined;
    if (ownerId !== user.id) {
      const access = await this.shareAccess.forOwner(user.id, ownerId);
      const entry = access?.records.get(accessKey(type, clientId));
      if (!access || !entry) throw new NotFoundException("Record tidak ditemukan.");
      share = { ownerId, ownerName: access.ownerName, permission: entry.permission, root: entry.root };
    }
    const row = await domainDelegate(this.prisma, type).findUnique({
      where: { userId_clientId: { userId: ownerId, clientId } },
    });
    if (!row || row.deletedAt) throw new NotFoundException("Record tidak ditemukan.");
    return { ...toApiRecord(type, spec, row), ...(share ? { share } : {}) };
  }

  async upsert(type: RecordType, clientId: string, dto: UpsertRecordDto, user: AuthUser) {
    const spec: TableSpec = RECORD_TABLES[type];
    const payload: Payload = { ...dto.payload, id: dto.payload.id ?? clientId };
    for (const key of META_KEYS) delete payload[key];
    const userId = await this.resolveWriteOwner(type, clientId, dto.userId ?? payload.userId, payload, user);
    const mergeKeys = dto.base ? MERGE_ARRAY_KEYS[type] : undefined;
    const preserve = dto.preserve?.length ? dto.preserve : undefined;

    const row = await this.prisma.$transaction(async (tx) => {
      const table = domainDelegate(tx, type);
      const key = { userId_clientId: { userId, clientId } };
      const before = spec.audit || mergeKeys || preserve ? await table.findUnique({ where: key }) : null;
      const current = before && !before.deletedAt ? rowToPayload(spec, before) : undefined;
      let next = payload;
      // Perubahan client diterapkan di atas isi terkini (perubahan orang lain tidak tertimpa)
      if (mergeKeys && dto.base) {
        const base = { ...dto.base };
        for (const meta of META_KEYS) delete base[meta];
        next = { ...mergePayload(current, base, next, mergeKeys), id: next.id };
      }
      if (preserve) next = preserveFields(type, next, current, preserve);
      const data = { ...payloadToRow(spec, next, clientId), deletedAt: null };
      const saved = await table.upsert({
        where: key,
        create: { userId, clientId, ...data },
        update: data,
      });
      if (spec.audit) await this.audit(tx, type, user, saved.userId, clientId, current, rowToPayload(spec, saved));
      return saved;
    });
    if (userId !== user.id) this.shareAccess.invalidate();
    if (isIndexedType(type)) void this.indexQueue.enqueueSource(row.userId, type, clientId);
    return toApiRecord(type, spec, row);
  }

  async remove(type: RecordType, clientId: string, query: RecordOwnerQueryDto, user: AuthUser) {
    const spec: TableSpec = RECORD_TABLES[type];
    const ownerId = query.userId ?? user.id;
    if (ownerId !== user.id) {
      const entry = (await this.shareAccess.forOwner(user.id, ownerId))?.records.get(accessKey(type, clientId));
      if (!entry) throw new NotFoundException("Record tidak ditemukan.");
      if (!atLeast(entry.permission, "edit")) throw new ForbiddenException("Anda hanya memiliki akses lihat.");
      if (entry.root) throw new ForbiddenException("Hanya pemilik yang dapat menghapus item yang dibagikan.");
    }

    await this.prisma.$transaction(async (tx) => {
      const table = domainDelegate(tx, type);
      const row = await table.findUnique({ where: { userId_clientId: { userId: ownerId, clientId } } });
      if (!row || row.deletedAt) throw new NotFoundException("Record tidak ditemukan.");
      await table.update({
        where: { id: row.id },
        data: { deletedAt: new Date() },
      });
      if (spec.audit) await this.audit(tx, type, user, row.userId, clientId, rowToPayload(spec, row), undefined);
    });
    if (ownerId !== user.id) this.shareAccess.invalidate();
    if (isIndexedType(type)) void this.indexQueue.enqueueSource(ownerId, type, clientId);
    return { success: true };
  }

  /** Riwayat audit kearsipan atas data milik user sendiri. */
  auditLog(user: AuthUser, query: { entityType?: string; entityId?: string; take?: number }) {
    return this.prisma.archiveAuditLog.findMany({
      where: {
        userId: user.id,
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(query.take ?? 100, 500),
    });
  }

  /**
   * Pemilik record yang ditulis:
   * - `userId` user lain → harus punya izin edit atas item itu (atau atas induknya bila item baru);
   * - tanpa `userId` → milik sendiri, kecuali item BARU yang induknya (project/kegiatan/area) adalah item bersama
   *   yang boleh diubah → ikut pemilik induk (mis. kolaborator menambah action ke project yang dibagikan).
   */
  private async resolveWriteOwner(
    type: RecordType,
    clientId: string,
    requested: unknown,
    payload: Payload,
    user: AuthUser,
  ): Promise<string> {
    if (typeof requested === "string" && requested && requested !== user.id) {
      await this.assertCanWrite(user, requested, type, clientId, payload);
      return requested;
    }
    const exists = (t: RecordType, id: string, ownerId: string) =>
      domainDelegate(this.prisma, t)
        .findUnique({ where: { userId_clientId: { userId: ownerId, clientId: id } } })
        .then((row) => !!row);
    if (await exists(type, clientId, user.id)) return user.id;

    const parents = parentRefsOf(type, payload) as [RecordType, string][];
    for (const [parentType, parentId] of parents) {
      // Induk virtual (seri agenda) tidak punya tabel — kepemilikan ditentukan dari berbagi di bawah
      if (!Object.hasOwn(RECORD_TABLES, parentType)) continue;
      if (await exists(parentType, parentId, user.id)) return user.id;
    }
    if (parents.length === 0) return user.id;
    const owners = await this.prisma.share.findMany({
      where: { recipientId: user.id, permission: "edit" },
      select: { ownerId: true },
      distinct: ["ownerId"],
    });
    for (const { ownerId } of owners) {
      const access = await this.shareAccess.forOwner(user.id, ownerId);
      const editable = parents.some(([t, id]) => atLeast(access?.records.get(accessKey(t, id))?.permission, "edit"));
      if (editable) return ownerId;
    }
    return user.id;
  }

  private async assertCanWrite(user: AuthUser, ownerId: string, type: RecordType, clientId: string, payload: Payload) {
    const access = await this.shareAccess.forOwner(user.id, ownerId);
    const entry = access?.records.get(accessKey(type, clientId));
    if (entry) {
      if (atLeast(entry.permission, "edit")) return;
      throw new ForbiddenException("Anda hanya memiliki akses lihat atas item ini.");
    }
    // Item baru di dalam item bersama: induknya harus boleh diubah dan ID belum dipakai pemilik
    const existing = await domainDelegate(this.prisma, type).findUnique({
      where: { userId_clientId: { userId: ownerId, clientId } },
    });
    const parentEditable = parentRefsOf(type, payload).some(([t, id]) =>
      atLeast(access?.records.get(accessKey(t, id))?.permission, "edit"),
    );
    if ((!existing || existing.deletedAt) && parentEditable) return;
    throw new ForbiddenException("Anda tidak memiliki akses ke data user lain.");
  }

  private async audit(
    tx: Prisma.TransactionClient,
    type: RecordType,
    actor: AuthUser,
    ownerId: string,
    clientId: string,
    before: Payload | undefined,
    after: Payload | undefined,
  ) {
    if (!isArchivalData(type, before) && !isArchivalData(type, after)) return;
    let action: AuditAction;
    let changes: Prisma.InputJsonValue;
    if (!before && after) {
      action = AuditAction.created;
      changes = after as Prisma.InputJsonObject;
    } else if (before && !after) {
      action = AuditAction.deleted;
      changes = before as Prisma.InputJsonObject;
    } else if (before && after) {
      const diff = diffPayload(before, after);
      if (Object.keys(diff).length === 0) return;
      action = AuditAction.updated;
      changes = diff as Prisma.InputJsonObject;
    } else {
      return;
    }
    await tx.archiveAuditLog.create({
      data: {
        userId: ownerId,
        actorId: actor.id,
        entityType: type,
        entityId: clientId,
        action,
        changes,
      },
    });
  }
}
