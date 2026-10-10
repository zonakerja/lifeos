import {
  useActivities,
  useAreas,
  useParaArchiveLogs,
  useParaArchives,
  useProjects,
  useProjectTasks,
  useResources,
} from "@/data/collections";
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
import { activityTreeIds, levelCounts } from "./lib/para";

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
  const archives = useParaArchives();
  const logs = useParaArchiveLogs();
  const actorName = useAuthStore((s) => s.user?.name);

  const meta = () => ({ id: generateId("arch"), archivedAt: new Date().toISOString() });
  const active = () => ({ projects: projects.items, activities: activities.items, tasks: tasks.items });

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
    if (removal.activityIds.length) activities.setItems(without(removal.activityIds));
    if (removal.projectIds.length) projects.setItems(without(removal.projectIds));
    if (removal.areaIds.length) areas.setItems(without(removal.areaIds));
    if (removal.resourceIds.length) resources.setItems(without(removal.resourceIds));
  };

  return {
    /** Area beserta project, sub area/kegiatan/sub kegiatan, dan semua task-nya dipindahkan ke arsip (satu entri). */
    archiveArea(area: Area) {
      apply(archiveAreaPlan(area, active(), meta()));
    },
    /** Project beserta action-nya dipindahkan ke arsip. */
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
      };
    },
    /** Hapus project beserta action-nya (tidak meninggalkan task yatim). */
    deleteProject(project: Project) {
      tasks.setItems((prev) => prev.filter((t) => t.projectId !== project.id));
      projects.setItems(without([project.id]));
    },
    /** Hapus item area (Sub Area / Kegiatan / Sub Kegiatan) beserta semua turunan dan task-nya. */
    deleteActivity(activity: Activity) {
      const ids = activityTreeIds(activities.items, activity.id);
      const idSet = new Set(ids);
      tasks.setItems((prev) => prev.filter((t) => !idSet.has(t.projectId)));
      activities.setItems(without(ids));
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
      if (r.resources.length) resources.setItems((prev) => mergeById(prev, r.resources));
      archives.setItems((prev) => prev.filter((a) => a.id !== item.id));
      log("restored", item);
    },
  };
}
