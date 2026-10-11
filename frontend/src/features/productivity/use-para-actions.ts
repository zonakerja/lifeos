import {
  useActivities,
  useAreas,
  useParaArchiveLogs,
  useParaArchives,
  useProjects,
  useProjectTasks,
  useResources,
  useSchedules,
} from "@/data/collections";
import { ownedFiles } from "@/features/resources/attachment-cleanup";
import { useAttachmentCleanup } from "@/features/resources/use-attachment-cleanup";
import { generateId } from "@/lib/ids";
import { useAuthStore } from "@/stores/auth-store";
import type { Activity, Area, ParaArchive, Project, Resource } from "@/types/entities";
import {
  archiveAreaPlan,
  archiveLogEntry,
  archiveProjectPlan,
  archiveResourcePlan,
  mergeById,
  type ParaRemoval,
  restorePlan,
} from "./lib/para-archive";
import { activityTreeAttachments, activityTreeIds, levelCounts, projectAttachments } from "./lib/para";

/**
 * Operasi arsip/pulihkan PARA.
 * Item yang diarsipkan dipindahkan ke koleksi `para_archive` sebagai snapshot `data`, beserta turunannya
 * di `related` (lihat `lib/para-archive.ts`). Setiap arsip & pemulihan dicatat di `para_archive_log`.
 */
export function useParaActions() {
  const projects = useProjects();
  const areas = useAreas();
  const activities = useActivities();
  const tasks = useProjectTasks();
  const resources = useResources();
  const schedules = useSchedules();
  const archives = useParaArchives();
  const logs = useParaArchiveLogs();
  const actorName = useAuthStore((s) => s.user?.name);
  const cleanup = useAttachmentCleanup();

  const meta = () => ({ id: generateId("arch"), archivedAt: new Date().toISOString() });
  const active = () => ({
    projects: projects.items,
    activities: activities.items,
    tasks: tasks.items,
    schedules: schedules.items,
  });

  const without = <T extends { id: string }>(removeIds: string[]) => {
    const set = new Set(removeIds);
    return (prev: T[]) => (set.size === 0 ? prev : prev.filter((x) => !set.has(x.id)));
  };

  /** Catat riwayat arsip/pulihkan (append-only). */
  const log = (action: "archived" | "restored", item: ParaArchive) => {
    const entry = archiveLogEntry(action, item, { id: generateId("alog"), at: new Date().toISOString(), actorName });
    logs.setItems((prev) => [...prev, entry]);
  };

  const apply = ({ archive, removal }: { archive: ParaArchive; removal: ParaRemoval }) => {
    archives.setItems((prev) => [...prev, archive]);
    log("archived", archive);
    if (removal.taskIds.length) tasks.setItems(without(removal.taskIds));
    if (removal.scheduleIds.length) schedules.setItems(without(removal.scheduleIds));
    if (removal.activityIds.length) activities.setItems(without(removal.activityIds));
    if (removal.projectIds.length) projects.setItems(without(removal.projectIds));
    if (removal.areaIds.length) areas.setItems(without(removal.areaIds));
    if (removal.resourceIds.length) resources.setItems(without(removal.resourceIds));
  };

  return {
    /** Area beserta project, sub area/kegiatan/sub kegiatan, semua task & agenda-nya dipindahkan ke arsip (satu entri). */
    archiveArea(area: Area) {
      apply(archiveAreaPlan(area, active(), meta()));
    },
    /** Project beserta action & agenda-nya dipindahkan ke arsip. */
    archiveProject(project: Project) {
      apply(archiveProjectPlan(project, active(), meta()));
    },
    archiveResource(resource: Resource) {
      apply(archiveResourcePlan(resource, meta()));
    },
    /** Turunan yang ikut terhapus bila project / item area dihapus (untuk teks konfirmasi). */
    deleteImpact(id: string) {
      const ids = new Set(activityTreeIds(activities.items, id));
      const descendants = activities.items.filter((a) => a.id !== id && ids.has(a.id));
      return {
        children: levelCounts(activities.items, descendants),
        taskCount: tasks.items.filter((t) => ids.has(t.projectId)).length,
        scheduleCount: schedules.items.filter((sc) => !!sc.projectId && ids.has(sc.projectId)).length,
      };
    },
    /** Semua lampiran yang ikut terhapus bila project / item area dihapus (untuk dialog konfirmasi berkas). */
    deleteAttachments(kind: "project" | "activity", item: Project | Activity) {
      return kind === "project"
        ? projectAttachments(item as Project, tasks.items, schedules.items)
        : activityTreeAttachments(activities.items, tasks.items, item.id, schedules.items);
    },
    /**
     * Hapus project beserta action & agenda-nya (tidak meninggalkan item yatim). Berkas lampiran project, action, dan
     * agenda ikut dihapus dari storage kecuali `keepIds` (→ Resource Global "Project") atau masih dipakai di tempat lain.
     */
    deleteProject(project: Project, keepIds: string[] = []) {
      const attachments = projectAttachments(project, tasks.items, schedules.items);
      tasks.setItems((prev) => prev.filter((t) => t.projectId !== project.id));
      schedules.setItems((prev) => prev.filter((sc) => sc.projectId !== project.id));
      projects.setItems(without([project.id]));
      cleanup.release(ownedFiles(attachments), keepIds, {
        contextTag: "Project",
        exclude: attachments,
        ownerId: project.userId,
      });
    },
    /** Hapus item area (Sub Area / Kegiatan / Sub Kegiatan) beserta semua turunan, task, agenda, dan berkasnya. */
    deleteActivity(activity: Activity, keepIds: string[] = []) {
      const attachments = activityTreeAttachments(activities.items, tasks.items, activity.id, schedules.items);
      const ids = activityTreeIds(activities.items, activity.id);
      const idSet = new Set(ids);
      tasks.setItems((prev) => prev.filter((t) => !idSet.has(t.projectId)));
      schedules.setItems((prev) => prev.filter((sc) => !sc.projectId || !idSet.has(sc.projectId)));
      activities.setItems(without(ids));
      cleanup.release(ownedFiles(attachments), keepIds, {
        contextTag: "Area",
        exclude: attachments,
        ownerId: activity.userId,
      });
    },
    /** Masukkan project (mis. Free Project) ke area, atau lepaskan dari area bila `areaId` kosong. */
    setProjectArea(projectId: string, areaId: string | undefined) {
      projects.setItems((prev) => prev.map((p) => (p.id === projectId ? { ...p, areaId: areaId ?? "" } : p)));
    },
    /** Pulihkan item beserta turunannya. */
    restore(item: ParaArchive) {
      const r = restorePlan(item);
      if (r.areas.length) areas.setItems((prev) => mergeById(prev, r.areas));
      if (r.projects.length) projects.setItems((prev) => mergeById(prev, r.projects));
      if (r.activities.length) activities.setItems((prev) => mergeById(prev, r.activities));
      if (r.tasks.length) tasks.setItems((prev) => mergeById(prev, r.tasks));
      if (r.schedules.length) schedules.setItems((prev) => mergeById(prev, r.schedules));
      if (r.resources.length) resources.setItems((prev) => mergeById(prev, r.resources));
      archives.setItems((prev) => prev.filter((a) => a.id !== item.id));
      log("restored", item);
    },
  };
}
