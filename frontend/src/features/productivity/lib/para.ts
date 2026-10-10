import type { Activity, Project, ProjectTask } from "@/types/entities";

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
    const date = new Date(d);
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
