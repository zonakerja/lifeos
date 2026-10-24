import { parseLocalYMD } from "@/lib/dates";
import type { Activity, Area, AttachedResource, Project, ProjectTask, Resource, Schedule } from "@/types/entities";

/** Palet warna proyek (token desain) — dipilih stabil berdasarkan hash ID. */
const PROJECT_COLORS = [
  "bg-mod-overview",
  "bg-mod-planner",
  "bg-mod-productivity",
  "bg-mod-notes",
  "bg-mod-files",
  "bg-mod-settings",
  "bg-info",
  "bg-success",
  "bg-warning",
  "bg-primary",
];

export const projectColorClass = (id?: string) => {
  if (!id) return "bg-muted-foreground";
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
};

export type TaskKind = "project-action" | "area-task" | "unknown";

export interface EnrichedTask extends ProjectTask {
  kind: TaskKind;
  parentName: string;
}

/** Tandai task sebagai Action (milik Project) atau Task (milik Kegiatan/Activity). */
export const enrichTasks = (tasks: ProjectTask[], projects: Project[], activities: Activity[]): EnrichedTask[] => {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const activityById = new Map(activities.map((a) => [a.id, a]));
  return tasks.map((t) => {
    const project = projectById.get(t.projectId);
    if (project) return { ...t, kind: "project-action", parentName: project.title };
    const activity = activityById.get(t.projectId);
    if (activity) return { ...t, kind: "area-task", parentName: activity.title };
    return { ...t, kind: "unknown", parentName: "" };
  });
};

/** Project berjalan pada tanggal (YMD) bila ada startDate & deadline yang mencakupnya. */
export const isProjectRunningOn = (p: Project, ymd: string) =>
  !!p.startDate && !!p.deadline && ymd >= p.startDate && ymd <= p.deadline;

/** Apakah project aktif (beririsan) dalam rentang tanggal. */
export const isProjectActiveIn = (project: Project, rangeStart: Date, rangeEnd: Date, now: Date) => {
  const safe = (d?: string) => {
    if (!d) return null;
    // YMD dibaca sebagai tanggal lokal; createdAt (ISO lengkap) apa adanya
    const date = /^d{4}-d{2}-d{2}$/.test(d) ? parseLocalYMD(d) : new Date(d);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const start = safe(project.startDate) ?? safe(project.createdAt) ?? new Date(now);
  start.setHours(0, 0, 0, 0);
  const rStart = new Date(rangeStart);
  rStart.setHours(0, 0, 0, 0);
  const rEnd = new Date(rangeEnd);
  rEnd.setHours(23, 59, 59, 999);
  const end = safe(project.deadline);
  if (!end) return start <= rEnd;
  end.setHours(23, 59, 59, 999);
  return start <= rEnd && end >= rStart;
};

/** Deskripsi kategori PARA (ditampilkan di atas tiap tab). */
export const PARA_INFO = {
  projects: {
    title: "Projects",
    description:
      "Project adalah serangkaian tugas yang terhubung dengan tujuan tertentu dan memiliki tenggat waktu (deadline). Project harus diselesaikan, berbeda dengan Area yang harus dipertahankan. Contoh: Merenovasi Rumah, Menyelesaikan Skripsi, Meluncurkan Produk Baru.",
  },
  areas: {
    title: "Areas of Responsibility",
    description:
      "Area adalah lingkup tanggung jawab jangka panjang yang ingin Anda pertahankan dari waktu ke waktu. Berbeda dengan project, area tidak memiliki tenggat waktu (deadline). Contoh: Kesehatan, Keuangan, Pengembangan Diri, Rumah Tangga.",
  },
  resources: {
    title: "Resources",
    description:
      "Resource adalah topik atau tema minat yang berkelanjutan yang dapat dimanfaatkan untuk projects atau areas di masa depan. Termasuk aset, materi referensi, dokumen penting, atau koleksi ide. Contoh: Aset Desain, Invoice, Artikel Pemasaran, Catatan Kuliah.",
  },
  archives: {
    title: "Archives Repository",
    description: "Arsip berisi item tidak aktif. Anda dapat memulihkan item kembali ke dashboard utama kapan saja.",
  },
};

// ============================================================================
// Hierarki Area: Area → Sub Area → Kegiatan → Sub Kegiatan → Task
// Ketiga tingkat di bawah Area disimpan sebagai `para_activity`; tingkatnya ditentukan rantai `parentId`
// (tanpa induk = Sub Area). Task boleh melekat di tingkat mana pun.
// ============================================================================

export const AREA_LEVELS = ["Sub Area", "Kegiatan", "Sub Kegiatan"] as const;
export type AreaLevel = (typeof AREA_LEVELS)[number];
/** Kedalaman terdalam (Sub Kegiatan) — tidak bisa memiliki turunan lagi. */
export const MAX_AREA_DEPTH = AREA_LEVELS.length - 1;

/** Sub Area (tingkat teratas) dalam satu area. */
export const rootActivities = (activities: Activity[], areaId: string) =>
  activities.filter((a) => a.areaId === areaId && !a.parentId);

/** Turunan langsung satu item (Sub Area → Kegiatan, Kegiatan → Sub Kegiatan). */
export const childrenOf = (activities: Activity[], parentId: string) =>
  activities.filter((a) => a.parentId === parentId);

/** Rantai induk dari tingkat teratas sampai induk langsung (tidak termasuk item itu sendiri). */
export const activityAncestors = (activities: Activity[], activity: Activity) => {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const chain: Activity[] = [];
  let parent = activity.parentId ? byId.get(activity.parentId) : undefined;
  while (parent && !chain.includes(parent) && chain.length < MAX_AREA_DEPTH) {
    chain.unshift(parent);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return chain;
};

/** 0 = Sub Area, 1 = Kegiatan, 2 = Sub Kegiatan. */
export const activityDepth = (activities: Activity[], activity: Activity) =>
  Math.min(activityAncestors(activities, activity).length, MAX_AREA_DEPTH);

export const activityLevel = (activities: Activity[], activity: Activity): AreaLevel =>
  AREA_LEVELS[activityDepth(activities, activity)];

/** ID item beserta seluruh turunannya (untuk hapus berantai). */
export const activityTreeIds = (activities: Activity[], id: string) => {
  const ids = [id];
  for (let i = 0; i < ids.length; i++) {
    for (const child of childrenOf(activities, ids[i])) if (!ids.includes(child.id)) ids.push(child.id);
  }
  return ids;
};

/** Jumlah item per tingkat, mis. [{ label: "Kegiatan", count: 2 }] (urut dari tingkat teratas). */
export const levelCounts = (activities: Activity[], items: Activity[]) =>
  AREA_LEVELS.map((label, depth) => ({
    label,
    count: items.filter((a) => activityDepth(activities, a) === depth).length,
  })).filter((c) => c.count > 0);

/** Free Project = project tanpa area (atau area-nya sudah tidak ada, mis. diarsipkan/dihapus). */
export const freeProjectsOf = (projects: Project[], areas: Area[]) => {
  const areaIds = new Set(areas.map((a) => a.id));
  return projects.filter((p) => !p.areaId || !areaIds.has(p.areaId));
};

/** Gabung daftar: "a", "a dan b", "a, b dan c". */
const joinParts = (parts: string[]) =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} dan ${parts[parts.length - 1]}`;

/** Teks konfirmasi hapus project / item area beserta jumlah turunan yang ikut terhapus. */
export const deleteDescription = (
  label: "Project" | AreaLevel,
  impact: { taskCount: number; scheduleCount?: number; children?: { label: string; count: number }[] },
) => {
  const parts = [
    ...(impact.children ?? []).map((c) => `${c.count} ${c.label.toLowerCase()}`),
    impact.taskCount ? `${impact.taskCount} ${label === "Project" ? "action" : "task"}` : "",
    impact.scheduleCount ? `${impact.scheduleCount} agenda` : "",
  ].filter(Boolean);
  return parts.length > 0
    ? `${label} ini beserta ${joinParts(parts)} di dalamnya akan dihapus permanen. Gunakan Arsipkan bila ingin menyimpannya.`
    : "Anda yakin ingin menghapus item ini secara permanen?";
};

// ============================================================================
// Lampiran yang ikut terhapus (untuk pembersihan berkas, lihat features/resources/attachment-cleanup.ts)
// ============================================================================

/** Lampiran agenda (dasar pelaksanaan + hasil). */
const scheduleAttachments = (schedules: Schedule[]) =>
  schedules.flatMap((s) => [...(s.resources ?? []), ...(s.results ?? [])]);

/** Semua lampiran project beserta action & agenda-nya. */
export const projectAttachments = (
  project: Project,
  tasks: ProjectTask[],
  schedules: Schedule[] = [],
): AttachedResource[] => [
  ...(project.resources ?? []),
  ...tasks.filter((t) => t.projectId === project.id).flatMap((t) => t.resources ?? []),
  ...scheduleAttachments(schedules.filter((s) => s.projectId === project.id)),
];

/** Semua lampiran item area (Sub Area/Kegiatan/Sub Kegiatan) beserta seluruh turunan, task, dan agenda-nya. */
export const activityTreeAttachments = (
  activities: Activity[],
  tasks: ProjectTask[],
  id: string,
  schedules: Schedule[] = [],
): AttachedResource[] => {
  const ids = new Set(activityTreeIds(activities, id));
  return [
    ...activities.filter((a) => ids.has(a.id)).flatMap((a) => a.resources ?? []),
    ...tasks.filter((t) => ids.has(t.projectId)).flatMap((t) => t.resources ?? []),
    ...scheduleAttachments(schedules.filter((s) => !!s.projectId && ids.has(s.projectId))),
  ];
};

/**
 * Nilai awal dialog "Tandai Selesai": tanggal (hari ini bila kosong), prioritas (medium bila kosong), dan bobot action
 * project — bila belum berbobot, disarankan sisa bobot (100 − bobot action lain, minimal 0).
 */
export const completionDefaults = (task: ProjectTask, siblings: ProjectTask[], todayYmd: string) => {
  const otherWeight = siblings
    .filter((t) => t.id !== task.id && t.projectId === task.projectId)
    .reduce((sum, t) => sum + (Number(t.weight) || 0), 0);
  return {
    dueDate: task.dueDate || todayYmd,
    priority: task.priority ?? "medium",
    weight: Number(task.weight) || Math.max(0, 100 - otherWeight),
  };
};

/** Berkas milik Resource global dalam format lampiran (untuk pembersihan berkas), atau null bila bukan berkas. */
export const resourceFileAttachment = (
  resource: Pick<Resource, "id" | "uploadId" | "title" | "mimeType">,
): AttachedResource | null =>
  resource.uploadId
    ? {
        id: `resource-file-${resource.id}`,
        type: "file",
        uploadId: resource.uploadId,
        name: resource.title,
        mimeType: resource.mimeType,
      }
    : null;

/**
 * `uploadId` lama yang tidak lagi dipakai resource setelah disimpan (berkas diganti, atau tipe tidak lagi "file"),
 * atau null.
 */
export const replacedUploadId = (
  before: Pick<Resource, "uploadId"> | null,
  after: Pick<Resource, "uploadId" | "type">,
) => {
  const kept = after.type === "file" ? after.uploadId : undefined;
  return before?.uploadId && before.uploadId !== kept ? before.uploadId : null;
};

/** Induk agenda/task (`projectId`): Project atau item Area, untuk label "Bagian dari" dan tautan. */
export const paraParentOf = (id: string | undefined, projects: Project[], activities: Activity[]) => {
  if (!id) return null;
  const project = projects.find((p) => p.id === id);
  if (project) return { kind: "project" as const, label: "Project", title: project.title, project };
  const activity = activities.find((a) => a.id === id);
  if (activity)
    return { kind: "activity" as const, label: activityLevel(activities, activity), title: activity.title, activity };
  return null;
};

const agendaEnd = (s: Schedule) => s.endDate || s.startDate || "";

/**
 * Daftar/timeline Project & Area: agenda berulang (satu agenda per pertemuan, `seriesId`) diwakili **satu** baris per seri
 * agar daftar tidak penuh — pertemuan berikutnya yang belum lewat (`today` = YMD), atau pertemuan terakhir bila semua
 * sudah lewat. Agenda biasa tidak berubah; urutan asli dipertahankan (wakil menempati posisi wakilnya).
 */
export function collapseAgendaSeries(list: Schedule[], today: string): Schedule[] {
  const representative = new Map<string, Schedule>();
  const bySeries = new Map<string, Schedule[]>();
  for (const s of list) if (s.seriesId) bySeries.set(s.seriesId, [...(bySeries.get(s.seriesId) ?? []), s]);
  for (const [id, members] of bySeries) {
    const sorted = [...members].sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
    representative.set(id, sorted.find((s) => agendaEnd(s) >= today) ?? sorted[sorted.length - 1]);
  }
  return list.filter((s) => !s.seriesId || representative.get(s.seriesId) === s);
}

/**
 * Sub Area = wadah seperti Area (nama + deskripsi saja); Tanggal & Dasar Pelaksanaan hanya untuk Kegiatan / Sub Kegiatan.
 */
export const areaLevelHasSchedule = (level: AreaLevel) => level !== "Sub Area";

/** Isian item area yang disimpan sesuai tingkatnya (Sub Area: tanggal & lampiran dikosongkan). */
export function activityFields(
  level: AreaLevel,
  values: { title: string; description: string; deadline: string; resources: AttachedResource[] },
): Pick<Activity, "title" | "description" | "deadline" | "resources"> {
  const base = { title: values.title.trim(), description: values.description };
  return areaLevelHasSchedule(level)
    ? { ...base, deadline: values.deadline, resources: values.resources }
    : { ...base, deadline: undefined, resources: undefined };
}
