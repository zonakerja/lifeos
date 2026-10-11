import { useCallback } from "react";
import { toast } from "sonner";
import {
  useActivities,
  useParaArchives,
  useProjects,
  useProjectTasks,
  useResources,
  useSchedules,
} from "@/data/collections";
import { uploadsApi } from "@/lib/api/endpoints";
import { generateId } from "@/lib/ids";
import { useAuthStore } from "@/stores/auth-store";
import type { AttachedResource, Resource } from "@/types/entities";
import { describeCleanup, planAttachmentCleanup, referencedUploadIds } from "./attachment-cleanup";

/** Semua `uploadId` di dalam nilai bersarang (snapshot arsip PARA menyimpan lampiran di `data`/`related`). */
const collectUploadIds = (value: unknown, into: Set<string>, depth = 0) => {
  if (!value || typeof value !== "object" || depth > 6) return;
  if (Array.isArray(value)) {
    for (const item of value) collectUploadIds(item, into, depth + 1);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "uploadId" && typeof child === "string" && child) into.add(child);
    else collectUploadIds(child, into, depth + 1);
  }
};

/** Hapus berkas dari storage tanpa mengganggu user bila gagal (mis. sudah terhapus). */
const removeUploadsQuietly = (ids: string[]) => {
  ids.forEach((id) => void uploadsApi.remove(id).catch(() => undefined));
};

/** Lampiran berkas → Resource global (pemilik = pemilik item asal bila diketahui). */
const toGlobalResource = (att: AttachedResource, contextTag: string, ownerId?: string): Resource => ({
  id: generateId("res"),
  number: att.number,
  title: att.name || att.title || "Untitled",
  content: att.description,
  type: "file",
  uploadId: att.uploadId,
  mimeType: att.mimeType,
  date: att.date || new Date().toISOString().slice(0, 10),
  createdAt: new Date().toISOString(),
  tags: [contextTag],
  aiSummary: att.aiSummary,
  ...(ownerId ? { userId: ownerId } : {}),
});

/**
 * Pembersihan berkas lampiran (dipakai bersama Planner & Productivity, aturan di `attachment-cleanup.ts`).
 * - `referenced(exclude, excludeResourceIds?)` → `uploadId` yang masih dipakai di luar lampiran `exclude` (dan di luar
 *   Resource global `excludeResourceIds`, mis. resource yang sedang dihapus) — untuk menandai berkas "dipakai di tempat
 *   lain" di dialog.
 * - `release(files, keepIds, { contextTag, exclude?, ownerId?, excludeResourceIds? })` → hapus berkas yang tidak
 *   dipertahankan & tidak dipakai di tempat lain, jadikan yang dipertahankan Resource global (tag `contextTag`),
 *   tampilkan ringkasan.
 */
export function useAttachmentCleanup() {
  const { items: resources, setItems: setResources } = useResources();
  const { items: schedules } = useSchedules();
  const { items: tasks } = useProjectTasks();
  const { items: projects } = useProjects();
  const { items: activities } = useActivities();
  const { items: archives } = useParaArchives();
  const meId = useAuthStore((st) => st.user?.id);

  const referenced = useCallback(
    (exclude: AttachedResource[], excludeResourceIds: string[] = []) => {
      const skip = new Set(excludeResourceIds);
      const ids = referencedUploadIds(
        skip.size ? resources.filter((r) => !skip.has(r.id)) : resources,
        [
          ...schedules.flatMap((s) => [s.resources, s.results]),
          ...tasks.map((t) => t.resources),
          ...projects.map((p) => p.resources),
          ...activities.map((a) => a.resources),
        ],
        exclude.map((a) => a.id),
      );
      for (const archive of archives) collectUploadIds([archive.data, archive.related], ids);
      return ids;
    },
    [resources, schedules, tasks, projects, activities, archives],
  );

  const release = useCallback(
    (
      files: AttachedResource[],
      keepIds: Iterable<string>,
      options: { contextTag: string; exclude?: AttachedResource[]; ownerId?: string; excludeResourceIds?: string[] },
    ) => {
      const plan = planAttachmentCleanup(
        files,
        keepIds,
        referenced(options.exclude ?? files, options.excludeResourceIds),
      );
      // Item milik user lain (berbagi): berkas tetap milik pemiliknya — kolaborator tidak membuat Resource Global
      // atas nama pemilik; penghapusan berkas pemilik ditolak server (diabaikan diam-diam)
      const foreign = !!options.ownerId && options.ownerId !== meId;
      if (plan.keep.length && !foreign) {
        setResources((prev) => {
          const known = new Set(prev.map((r) => r.uploadId).filter(Boolean));
          const added = plan.keep
            .filter((att) => !known.has(att.uploadId))
            .map((att) => toGlobalResource(att, options.contextTag, options.ownerId));
          return [...prev, ...added];
        });
      }
      removeUploadsQuietly(plan.remove);
      const summary = describeCleanup(plan);
      if (summary) toast.info("Lampiran berkas", { description: summary });
      return plan;
    },
    [meId, referenced, setResources],
  );

  /** Hapus berkas yang baru diunggah tetapi tidak jadi disimpan (tanpa pertanyaan, tanpa ringkasan). */
  const discardUploads = useCallback((uploadIds: string[]) => removeUploadsQuietly(uploadIds), []);

  return { referenced, release, discardUploads };
}
