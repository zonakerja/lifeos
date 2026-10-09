import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma, UserRole } from "../generated/prisma/client";
import { AuthUser } from "../common/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { ListRecordsQueryDto } from "./dto/list-records-query.dto";
import { RecordOwnerQueryDto } from "./dto/record-owner-query.dto";
import { UpsertRecordDto } from "./dto/upsert-record.dto";
import { type DomainRow, type Payload, payloadToRow, rowToPayload, toApiRecord } from "./record-mapper";
import { RECORD_TABLES, type RecordType, type TableSpec, fieldName } from "./record-schema";

/**
 * Bentuk minimal delegate Prisma yang dipakai service generik ini. Semua tabel domain
 * dibuat dari spesifikasi yang sama sehingga punya kolom sistem yang identik
 * (user_id, client_id, extra, timestamps, deleted_at).
 */
interface DomainDelegate {
  findMany(args: object): Promise<DomainRow[]>;
  findUnique(args: object): Promise<DomainRow | null>;
  upsert(args: object): Promise<DomainRow>;
  update(args: object): Promise<DomainRow>;
  updateMany(args: object): Promise<{ count: number }>;
}
type Db = Prisma.TransactionClient | PrismaService;

const isAdmin = (user: AuthUser) => user.role === UserRole.super_admin || user.role === UserRole.admin;

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

@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService) {}

  parseType(type: string): RecordType {
    if (!Object.hasOwn(RECORD_TABLES, type)) {
      throw new NotFoundException(`Record type '${type}' tidak dikenal.`);
    }
    return type as RecordType;
  }

  async findMany(type: RecordType, query: ListRecordsQueryDto, user: AuthUser) {
    const spec: TableSpec = RECORD_TABLES[type];
    // Admin tanpa filter userId melihat data semua user
    const userId = isAdmin(user) ? query.userId : user.id;
    const where: Record<string, unknown> = {
      deletedAt: null,
      ...(userId ? { userId } : {}),
    };

    const dateField = spec.fields.find((f) => f.key === spec.dateKey);
    if (dateField && (query.from || query.to)) {
      where[fieldName(dateField)] = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const rows = await this.delegate(this.prisma, type).findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => toApiRecord(type, spec, row));
  }

  async upsert(type: RecordType, clientId: string, dto: UpsertRecordDto, user: AuthUser) {
    this.ensureCanWrite(user);
    const spec: TableSpec = RECORD_TABLES[type];
    const userId = await this.resolveOwner(user, dto.userId ?? dto.payload.userId);
    const payload = { ...dto.payload, id: dto.payload.id ?? clientId };
    const data = { ...payloadToRow(spec, payload, clientId), deletedAt: null };

    const row = await this.prisma.$transaction(async (tx) => {
      const table = this.delegate(tx, type);
      const key = { userId_clientId: { userId, clientId } };
      const before = spec.audit ? await table.findUnique({ where: key }) : null;
      const saved = await table.upsert({
        where: key,
        create: { userId, clientId, ...data },
        update: data,
      });
      if (spec.audit) {
        const beforePayload = before && !before.deletedAt ? rowToPayload(spec, before) : undefined;
        await this.audit(tx, type, user, saved.userId, clientId, beforePayload, rowToPayload(spec, saved));
      }
      return saved;
    });
    return toApiRecord(type, spec, row);
  }

  async remove(type: RecordType, clientId: string, query: RecordOwnerQueryDto, user: AuthUser) {
    this.ensureCanWrite(user);
    const spec: TableSpec = RECORD_TABLES[type];
    const ownerFilter = isAdmin(user) ? (query.userId ? { userId: query.userId } : {}) : { userId: user.id };

    await this.prisma.$transaction(async (tx) => {
      const table = this.delegate(tx, type);
      const candidates = await table.findMany({
        where: { clientId, deletedAt: null, ...ownerFilter },
      });
      // Admin tanpa userId: prioritaskan record miliknya sendiri
      const row = candidates.find((c) => c.userId === user.id) ?? candidates[0];
      if (!row) throw new NotFoundException("Record tidak ditemukan.");
      await table.update({
        where: { id: row.id },
        data: { deletedAt: new Date() },
      });
      if (spec.audit) await this.audit(tx, type, user, row.userId, clientId, rowToPayload(spec, row), undefined);
    });
    return { success: true };
  }

  /** Riwayat audit kearsipan (pemilik data, atau admin untuk semua). */
  auditLog(user: AuthUser, query: { entityType?: string; entityId?: string; take?: number }) {
    return this.prisma.archiveAuditLog.findMany({
      where: {
        ...(isAdmin(user) ? {} : { userId: user.id }),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(query.take ?? 100, 500),
    });
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

  private delegate(db: Db, type: RecordType): DomainDelegate {
    const model = RECORD_TABLES[type].model;
    const key = model.charAt(0).toLowerCase() + model.slice(1);
    return (db as unknown as Record<string, DomainDelegate>)[key];
  }

  private async resolveOwner(user: AuthUser, requested: unknown) {
    if (!isAdmin(user) || typeof requested !== "string" || requested === user.id) return user.id;
    const owner = await this.prisma.user.findUnique({
      where: { id: requested },
      select: { id: true },
    });
    return owner?.id ?? user.id;
  }

  private ensureCanWrite(user: AuthUser) {
    if (user.role === UserRole.viewer) {
      throw new ForbiddenException("Viewer tidak memiliki akses tulis.");
    }
  }
}
