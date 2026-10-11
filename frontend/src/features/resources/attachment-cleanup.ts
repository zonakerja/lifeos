import type { AttachedResource, Resource } from "@/types/entities";

/**
 * Aturan pembersihan berkas lampiran saat item (agenda, task, project, ...) atau lampirannya dihapus — dipakai bersama
 * Planner & Productivity agar perilakunya seragam:
 * - Hanya lampiran **berkas milik item** (punya `uploadId`, bukan rujukan "Resource Global" / `existing`) yang diproses.
 * - Berkas yang **masih dipakai** di tempat lain (Resource global atau lampiran item lain) tidak pernah dihapus.
 * - Berkas yang dipilih user untuk **dipertahankan** dipindah menjadi Resource global; sisanya dihapus dari storage
 *   (agar tidak menjadi sampah / duplikat saat diunggah ulang).
 */

/** Lampiran berkas milik item (unik per `uploadId`). */
export const ownedFiles = (attachments: (AttachedResource | undefined)[] = []): AttachedResource[] => {
  const seen = new Set<string>();
  const files: AttachedResource[] = [];
  for (const att of attachments) {
    if (!att?.uploadId || att.type === "existing" || att.existingId || seen.has(att.uploadId)) continue;
    seen.add(att.uploadId);
    files.push(att);
  }
  return files;
};

/**
 * `uploadId` yang dirujuk Resource global atau daftar lampiran lain, **tidak termasuk** lampiran dengan ID di
 * `excludeAttachmentIds` (lampiran milik item yang sedang dihapus).
 */
export const referencedUploadIds = (
  resources: Pick<Resource, "uploadId">[],
  attachmentLists: (AttachedResource[] | undefined)[],
  excludeAttachmentIds: Iterable<string>,
) => {
  const exclude = new Set(excludeAttachmentIds);
  const ids = new Set<string>();
  for (const r of resources) if (r.uploadId) ids.add(r.uploadId);
  for (const list of attachmentLists) {
    for (const att of list ?? []) if (att.uploadId && !exclude.has(att.id)) ids.add(att.uploadId);
  }
  return ids;
};

export interface CleanupPlan {
  /** `uploadId` yang dihapus dari storage */
  remove: string[];
  /** Lampiran yang dipertahankan → dijadikan Resource global */
  keep: AttachedResource[];
  /** Berkas yang masih dipakai di tempat lain (dibiarkan) */
  shared: AttachedResource[];
}

/** Rencana pembersihan: `keepIds` = ID lampiran yang dipilih user untuk dipertahankan. */
export const planAttachmentCleanup = (
  files: AttachedResource[],
  keepIds: Iterable<string>,
  referenced: Set<string>,
): CleanupPlan => {
  const keepSet = new Set(keepIds);
  const plan: CleanupPlan = { remove: [], keep: [], shared: [] };
  for (const file of files) {
    if (!file.uploadId) continue;
    if (referenced.has(file.uploadId)) plan.shared.push(file);
    else if (keepSet.has(file.id)) plan.keep.push(file);
    else plan.remove.push(file.uploadId);
  }
  return plan;
};

/** Ringkasan hasil pembersihan untuk toast, atau null bila tidak ada berkas. */
export const describeCleanup = (plan: CleanupPlan) => {
  const parts: string[] = [];
  if (plan.remove.length) parts.push(`${plan.remove.length} berkas dihapus`);
  if (plan.keep.length) parts.push(`${plan.keep.length} disimpan ke Resource Global`);
  if (plan.shared.length) parts.push(`${plan.shared.length} tetap (dipakai di tempat lain)`);
  return parts.length ? parts.join(", ") : null;
};
