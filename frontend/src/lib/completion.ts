/**
 * Status selesai todo/task/action (dipakai bersama Planner & Productivity).
 * `completedAt` dipakai Planner untuk menandai item yang diselesaikan terlambat; data tanpa `completedAt` dianggap
 * selesai di tanggal tenggatnya.
 */

/** Patch status selesai: catat `completedAt` saat dicentang, hapus saat dibatalkan. */
export const completionPatch = (completed: boolean, now = new Date()) =>
  completed ? { completed: true, completedAt: now.toISOString() } : { completed: false, completedAt: undefined };

/** Patch hanya bila status selesai berubah (centang ulang tidak menggeser `completedAt`). */
export const completionChangePatch = (before: { completed?: boolean }, completed: boolean, now = new Date()) =>
  !!before.completed === completed ? {} : completionPatch(completed, now);
