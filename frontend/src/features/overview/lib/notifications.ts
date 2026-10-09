import { addDays, diffInDays, formatLocalYMD } from "@/lib/dates";
import { projectTaskProgress } from "@/features/productivity/lib/progress";
import { scheduleEnd, scheduleStart } from "@/features/planner/lib/planner-logic";
import type { Project, ProjectTask, Schedule } from "@/types/entities";

interface ProjectReminder {
  id: string;
  project: Project;
  daysLeft: number;
  progress: number;
  reminderType: string;
}

/** Agenda yang berlangsung dari hari ini sampai 3 hari ke depan. */
export const upcomingSchedules = (schedules: Schedule[], today: Date) => {
  const start = formatLocalYMD(today);
  const end = formatLocalYMD(addDays(today, 3));
  return schedules
    .filter((s) => scheduleStart(s) <= end && scheduleEnd(s) >= start)
    .sort((a, b) => new Date(scheduleStart(a)).getTime() - new Date(scheduleStart(b)).getTime());
};

/**
 * Pengingat deadline project: overdue, hari H, ≤30 hari tiap kelipatan 7
 * atau ≤3 hari, >30 hari tiap kelipatan 30.
 */
export const projectReminders = (projects: Project[], tasks: ProjectTask[], today: Date): ProjectReminder[] =>
  projects
    .filter((p) => p.status !== "archived" && p.deadline)
    .flatMap((p) => {
      const daysLeft = diffInDays(today, new Date(p.deadline!));
      let reminderType = "";
      if (daysLeft < 0) reminderType = "Overdue";
      else if (daysLeft === 0) reminderType = "Deadline Hari Ini";
      else if (daysLeft <= 30) {
        if (daysLeft % 7 === 0 || daysLeft <= 3) reminderType = "Pengingat Mingguan";
      } else if (daysLeft % 30 === 0) reminderType = "Pengingat Bulanan";
      return reminderType
        ? [{ id: `notif-proj-${p.id}`, project: p, daysLeft, progress: projectTaskProgress(p, tasks), reminderType }]
        : [];
    });

export const daysLeftLabel = (daysLeft: number) =>
  daysLeft < 0 ? "Overdue" : daysLeft === 0 ? "Hari Ini!" : `${daysLeft} Hari Lagi`;
