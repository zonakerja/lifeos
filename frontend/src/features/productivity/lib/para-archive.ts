import type { Activity, Area, ParaArchive, ParaArchiveLog, Project, ProjectTask, Resource } from "@/types/entities";
import { levelCounts } from "./para";

/**
 * Logika murni arsip PARA.
 * Item yang diarsipkan dikeluarkan dari koleksi aktif beserta turunannya (project → action;
 * area → project, sub area/kegiatan/sub kegiatan, dan semua task-nya) sehingga tidak ada task "yatim" yang masih muncul
 * di Planner, kalender, notifikasi, atau chatbot. Turunan disimpan di `related` dan ikut dipulihkan.
 */

export interface ParaActiveData {
  projects: Project[];
  activities: Activity[];
  tasks: ProjectTask[];
}

/** ID yang harus dikeluarkan dari koleksi aktif setelah pengarsipan. */
export interface ParaRemoval {
  areaIds: string[];
  projectIds: string[];
  activityIds: string[];
  taskIds: string[];
  resourceIds: string[];
}

/** Item yang dikembalikan ke koleksi aktif saat arsip dipulihkan. */
export interface ParaRestoration {
  areas: Area[];
  projects: Project[];
  activities: Activity[];
  tasks: ProjectTask[];
  resources: Resource[];
}

const EMPTY_REMOVAL: ParaRemoval = { areaIds: [], projectIds: [], activityIds: [], taskIds: [], resourceIds: [] };

const ids = (items: { id: string }[]) => items.map((i) => i.id);

/** Arsip milik pemilik item (penting saat super admin mengarsipkan data user lain). */
const owner = (item: { userId?: string }) => (item.userId ? { userId: item.userId } : {});

interface SnapshotMeta {
  id: string;
  archivedAt: string;
}

export function archiveProjectPlan(project: Project, data: ParaActiveData, meta: SnapshotMeta) {
  const tasks = data.tasks.filter((t) => t.projectId === project.id);
  const archive: ParaArchive = {
    ...meta,
    ...owner(project),
    originalType: "project",
    originalId: project.id,
    data: { ...project },
    related: { tasks },
  };
  const removal: ParaRemoval = { ...EMPTY_REMOVAL, projectIds: [project.id], taskIds: ids(tasks) };
  return { archive, removal };
}

export function archiveAreaPlan(area: Area, data: ParaActiveData, meta: SnapshotMeta) {
  const projects = data.projects.filter((p) => p.areaId === area.id);
  const activities = data.activities.filter((a) => a.areaId === area.id);
  const parentIds = new Set([...ids(projects), ...ids(activities)]);
  const tasks = data.tasks.filter((t) => parentIds.has(t.projectId));
  const archive: ParaArchive = {
    ...meta,
    ...owner(area),
    originalType: "area",
    originalId: area.id,
    data: { ...area },
    related: { projects, activities, tasks },
  };
  const removal: ParaRemoval = {
    ...EMPTY_REMOVAL,
    areaIds: [area.id],
    projectIds: ids(projects),
    activityIds: ids(activities),
    taskIds: ids(tasks),
  };
  return { archive, removal };
}

export function archiveResourcePlan(resource: Resource, meta: SnapshotMeta) {
  const archive: ParaArchive = {
    ...meta,
    ...owner(resource),
    originalType: "resource",
    originalId: resource.id,
    data: { ...resource },
  };
  return { archive, removal: { ...EMPTY_REMOVAL, resourceIds: [resource.id] } };
}

/** Item yang dipulihkan dari satu arsip (induk + turunannya). */
export function restorePlan(item: ParaArchive): ParaRestoration {
  const related = item.related ?? {};
  const data = item.data as unknown;
  return {
    areas: item.originalType === "area" ? [data as Area] : [],
    projects: [...(item.originalType === "project" ? [data as Project] : []), ...(related.projects ?? [])],
    activities: [...(item.originalType === "activity" ? [data as Activity] : []), ...(related.activities ?? [])],
    tasks: related.tasks ?? [],
    resources: item.originalType === "resource" ? [data as Resource] : [],
  };
}

/** Gabungkan item pulihan ke koleksi; item ber-ID sama diganti (tidak terduplikasi). */
export function mergeById<T extends { id: string }>(prev: T[], incoming: T[]) {
  if (incoming.length === 0) return prev;
  const incomingIds = new Set(ids(incoming));
  return [...prev.filter((p) => !incomingIds.has(p.id)), ...incoming];
}

/** Ringkasan turunan untuk ditampilkan di daftar arsip, mis. "2 project · 1 kegiatan · 5 task". */
export function relatedSummary(item: ParaArchive) {
  const r = item.related ?? {};
  return [
    r.projects?.length ? `${r.projects.length} project` : "",
    ...levelCounts(r.activities ?? [], r.activities ?? []).map((c) => `${c.count} ${c.label.toLowerCase()}`),
    r.tasks?.length ? `${r.tasks.length} ${item.originalType === "project" ? "action" : "task"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Nama item arsip untuk tampilan & log. */
export const archiveTitle = (item: ParaArchive) => String(item.data.title ?? item.data.name ?? "Untitled");

/** Entri log arsip/pulihkan untuk satu arsip (pemilik log = pemilik arsip). */
export function archiveLogEntry(
  action: ParaArchiveLog["action"],
  item: ParaArchive,
  meta: { id: string; at: string; actorName?: string },
): ParaArchiveLog {
  return {
    id: meta.id,
    ...owner(item),
    action,
    originalType: item.originalType,
    originalId: item.originalId ?? (typeof item.data.id === "string" ? item.data.id : undefined),
    archiveId: item.id,
    title: archiveTitle(item),
    summary: relatedSummary(item),
    actorName: meta.actorName,
    at: meta.at,
  };
}
