import { addDays, diffInDays, formatLocalYMD, parseLocalYMD } from "@/lib/dates";
import { projectTaskProgress } from "@/features/productivity/lib/progress";
import { compareSchedule, scheduleEnd, scheduleStart } from "@/features/planner/lib/planner-logic";
import type { ShareEntry } from "@/types/api";
import type { Project, ProjectTask, Schedule, Todo } from "@/types/entities";
import { isOverdue, isProjectRunning, type OverviewTask, urgentTasks } from "./overview-logic";

interface ProjectReminder {
  id: string;
  project: Project;
  daysLeft: number;
  progress: number;
  reminderType: string;
}

/** Agenda yang berlangsung dari hari ini sampai 3 hari ke depan, urut tanggal lalu jam. */
export const upcomingSchedules = (schedules: Schedule[], today: Date) => {
  const start = formatLocalYMD(today);
  const end = formatLocalYMD(addDays(today, 3));
  return schedules.filter((s) => scheduleStart(s) <= end && scheduleEnd(s) >= start).sort(compareSchedule);
};

/**
 * Pengingat deadline project yang masih berjalan (selesai / ditunda tidak diingatkan): overdue, hari H,
 * ≤30 hari tiap kelipatan 7 atau ≤3 hari, >30 hari tiap kelipatan 30.
 */
export const projectReminders = (projects: Project[], tasks: ProjectTask[], today: Date): ProjectReminder[] =>
  projects
    .filter((p) => !!p.deadline && isProjectRunning(p))
    .flatMap((p) => {
      const daysLeft = diffInDays(today, parseLocalYMD(p.deadline!));
      let reminderType = "";
      if (daysLeft < 0) reminderType = "Lewat deadline";
      else if (daysLeft === 0) reminderType = "Deadline hari ini";
      else if (daysLeft <= 30) {
        if (daysLeft % 7 === 0 || daysLeft <= 3) reminderType = "Pengingat mingguan";
      } else if (daysLeft % 30 === 0) reminderType = "Pengingat bulanan";
      return reminderType
        ? [{ id: `notif-proj-${p.id}`, project: p, daysLeft, progress: projectTaskProgress(p, tasks), reminderType }]
        : [];
    });

export const daysLeftLabel = (daysLeft: number) =>
  daysLeft < 0 ? `Lewat ${-daysLeft} hari` : daysLeft === 0 ? "Hari ini!" : `${daysLeft} hari lagi`;

/** Todo & task/action yang belum selesai dan sudah lewat tenggatnya (tertua dulu). */
export const overdueReminders = (todos: Todo[], tasks: ProjectTask[], today: Date): OverviewTask[] => {
  const todayYmd = formatLocalYMD(today);
  return urgentTasks(todos, tasks, today).filter((e) => isOverdue(e, todayYmd));
};

/** Berapa hari terakhir item yang dibagikan kepada user ditampilkan sebagai notifikasi. */
export const RECENT_SHARE_DAYS = 7;

/** Item yang dibagikan kepada user dalam `RECENT_SHARE_DAYS` hari terakhir (item yang sudah dihapus dilewati), terbaru dulu. */
export const recentIncomingShares = (shares: ShareEntry[], now: Date) => {
  const since = now.getTime() - RECENT_SHARE_DAYS * 24 * 60 * 60 * 1000;
  return shares
    .filter((s) => new Date(s.createdAt).getTime() >= since && s.item?.title !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};
