import { parseLocalYMD } from "@/lib/dates";
import type { Project, ProjectTask } from "@/types/entities";

/**
 * Progres penyelesaian task (berbasis bobot; fallback jumlah task). 0–100.
 * Dipakai bersama oleh overview, notifikasi, dan kartu project.
 */
export const taskProgress = (tasks: ProjectTask[]) => {
  const totalWeight = tasks.reduce((acc, t) => acc + (Number(t.weight) || 0), 0);
  if (totalWeight > 0) {
    const done = tasks.filter((t) => t.completed).reduce((acc, t) => acc + (Number(t.weight) || 0), 0);
    return (done / totalWeight) * 100;
  }
  return tasks.length > 0 ? (tasks.filter((t) => t.completed).length / tasks.length) * 100 : 0;
};

export const projectTaskProgress = (project: Project, tasks: ProjectTask[]) =>
  taskProgress(tasks.filter((t) => t.projectId === project.id));

/** Persentase waktu berjalan antara startDate dan deadline. 0–100. */
export const projectTimeProgress = (project: Project, now: Date) => {
  if (!project.startDate || !project.deadline) return 0;
  // Dari awal hari mulai sampai akhir hari deadline (YMD dibaca sebagai tanggal lokal)
  const start = parseLocalYMD(project.startDate).getTime();
  const end = parseLocalYMD(project.deadline).getTime() + 24 * 60 * 60 * 1000 - 1;
  if (end <= start) return 100;
  return Math.min(100, Math.max(0, ((now.getTime() - start) / (end - start)) * 100));
};
