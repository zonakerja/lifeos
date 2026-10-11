import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { domainDelegate } from "../records/record-delegate";
import { rowToPayload } from "../records/record-mapper";
import { RECORD_TABLES, type RecordType } from "../records/record-schema";
import {
  type AccessEntry,
  type SharePermission,
  type ShareRoot,
  type ShareStructure,
  accessKey,
  addReference,
  expandDescendants,
  mergeUploadPermissions,
  referencesOf,
} from "./share-graph";

/** Akses seorang penerima ke data satu pemilik. */
export interface OwnerAccess {
  ownerId: string;
  ownerName: string;
  /** Kunci `type:clientId` */
  records: Map<string, AccessEntry>;
  /** ID asset → izin */
  uploads: Map<string, SharePermission>;
}

/** Akses user ke data user lain, per pemilik. */
export type UserShareAccess = Map<string, OwnerAccess>;

const CACHE_TTL_MS = 3_000;

/**
 * Menghitung data milik user lain yang boleh diakses seorang user lewat berbagi (`shares`). Hasil untuk BACA disimpan
 * sebentar (beberapa koleksi dimuat bersamaan saat aplikasi dibuka); pemeriksaan TULIS selalu dihitung ulang agar item
 * yang baru dibuat kolaborator langsung bisa diubah.
 */
@Injectable()
export class ShareAccessService {
  private readonly cache = new Map<string, { at: number; value: Promise<UserShareAccess> }>();

  constructor(private readonly prisma: PrismaService) {}

  /** Akses baca (di-cache singkat). */
  forUser(userId: string): Promise<UserShareAccess> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
    const value = this.compute(userId);
    this.cache.set(userId, { at: Date.now(), value });
    value.catch(() => this.cache.delete(userId));
    return value;
  }

  /** Akses terkini ke data satu pemilik (untuk pemeriksaan tulis). */
  async forOwner(userId: string, ownerId: string): Promise<OwnerAccess | undefined> {
    return (await this.compute(userId, ownerId)).get(ownerId);
  }

  /** Bersihkan cache setelah berbagi berubah. */
  invalidate() {
    this.cache.clear();
  }

  private async compute(userId: string, onlyOwner?: string): Promise<UserShareAccess> {
    const shares = await this.prisma.share.findMany({
      where: { recipientId: userId, ...(onlyOwner ? { ownerId: onlyOwner } : {}) },
      include: { owner: { select: { name: true } } },
    });
    const byOwner = new Map<string, { name: string; roots: ShareRoot[] }>();
    for (const share of shares) {
      const entry = byOwner.get(share.ownerId) ?? { name: share.owner.name, roots: [] };
      entry.roots.push({ type: share.recordType, id: share.recordId, permission: share.permission });
      byOwner.set(share.ownerId, entry);
    }

    const result: UserShareAccess = new Map();
    for (const [ownerId, { name, roots }] of byOwner) {
      result.set(ownerId, await this.computeOwner(ownerId, name, roots));
    }
    return result;
  }

  private async computeOwner(ownerId: string, ownerName: string, roots: ShareRoot[]): Promise<OwnerAccess> {
    const records = expandDescendants(roots, await this.loadStructure(ownerId, roots));
    const uploads = new Map<string, SharePermission>();

    // Muat payload item yang dapat diakses → rujukan (dimuat di putaran berikutnya) & berkas
    const loaded = new Set<string>();
    for (;;) {
      const pending = new Map<RecordType, string[]>();
      for (const entry of records.values()) {
        const key = accessKey(entry.type, entry.id);
        if (loaded.has(key)) continue;
        loaded.add(key);
        if (!Object.hasOwn(RECORD_TABLES, entry.type)) {
          records.delete(key);
          continue;
        }
        const type = entry.type as RecordType;
        pending.set(type, [...(pending.get(type) ?? []), entry.id]);
      }
      if (pending.size === 0) break;

      for (const [type, ids] of pending) {
        const rows = await domainDelegate(this.prisma, type).findMany({
          where: { userId: ownerId, clientId: { in: ids }, deletedAt: null },
        });
        const found = new Set(rows.map((row) => row.clientId));
        // Item yang sudah dihapus pemilik tidak bisa diakses
        for (const id of ids) if (!found.has(id)) records.delete(accessKey(type, id));
        for (const row of rows) {
          const entry = records.get(accessKey(type, row.clientId));
          if (!entry) continue;
          const payload = rowToPayload(RECORD_TABLES[type], row);
          mergeUploadPermissions(uploads, payload, entry.permission);
          for (const [refType, refId] of referencesOf(type, payload)) addReference(records, refType, refId);
        }
      }
    }
    return { ownerId, ownerName, records, uploads };
  }

  /** Kolom relasi pemilik yang diperlukan untuk menurunkan turunan root. */
  private async loadStructure(ownerId: string, roots: ShareRoot[]): Promise<ShareStructure> {
    const types = new Set(roots.map((r) => r.type));
    const needPara = types.has("para_project") || types.has("para_area");
    const where = { userId: ownerId, deletedAt: null };
    const [projects, activities, tasks, aiNotes] = await Promise.all([
      types.has("para_area")
        ? this.prisma.project.findMany({ where, select: { clientId: true, areaId: true } })
        : Promise.resolve([]),
      types.has("para_area")
        ? this.prisma.activity.findMany({ where, select: { clientId: true, areaId: true, parentId: true } })
        : Promise.resolve([]),
      needPara
        ? this.prisma.task.findMany({ where, select: { clientId: true, projectId: true } })
        : Promise.resolve([]),
      types.has("schedule")
        ? this.prisma.aiNote.findMany({ where, select: { clientId: true, linkedScheduleId: true } })
        : Promise.resolve([]),
    ]);
    return {
      projects: projects.map((p) => ({ id: p.clientId, areaId: p.areaId })),
      activities: activities.map((a) => ({ id: a.clientId, areaId: a.areaId, parentId: a.parentId })),
      tasks: tasks.map((t) => ({ id: t.clientId, projectId: t.projectId })),
      aiNotes: aiNotes.map((n) => ({ id: n.clientId, linkedScheduleId: n.linkedScheduleId })),
    };
  }
}
