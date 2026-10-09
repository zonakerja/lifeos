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
  const start = new Date(project.startDate).getTime();
  const end = new Date(project.deadline).getTime();
  if (end <= start) return 100;
  return Math.min(100, Math.max(0, ((now.getTime() - start) / (end - start)) * 100));
};
