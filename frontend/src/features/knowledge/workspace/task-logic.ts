import { addDays, formatLocalYMD, parseLocalYMD } from "@/lib/dates";
import type { KnowledgeTask } from "@/types/api";

/** Tugas lintas vault (K3): pengelompokan & penyaringan murni untuk tab Tugas dan Planner Harian. */

export type TaskStatusFilter = "open" | "done" | "all";
export type TaskGroupBy = "date" | "note";
export type TaskTone = "destructive" | "warning" | "info" | "muted" | "success";

export interface TaskGroup {
  key: string;
  label: string;
  tone: TaskTone;
  tasks: KnowledgeTask[];
}

export const PRIORITY_INFO: Record<NonNullable<KnowledgeTask["priority"]>, { label: string; rank: number }> = {
  highest: { label: "Tertinggi", rank: 0 },
  high: { label: "Tinggi", rank: 1 },
  medium: { label: "Sedang", rank: 2 },
  low: { label: "Rendah", rank: 4 },
  lowest: { label: "Terendah", rank: 5 },
};
const priorityRank = (t: KnowledgeTask) => (t.priority ? PRIORITY_INFO[t.priority].rank : 3);

export const isOpenTask = (t: KnowledgeTask) => t.status === "todo" || t.status === "in_progress";
/** Tanggal acuan tugas: tenggat, lalu tanggal dijadwalkan (seperti plugin Tasks). */
export const taskDate = (t: KnowledgeTask) => t.due ?? t.scheduled;
/** Kunci unik tugas di daftar. */
export const taskKey = (t: KnowledgeTask) => `${t.noteId}:${t.index}`;

export function matchesTaskQuery(t: KnowledgeTask, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${t.text} ${t.noteTitle} ${t.path} ${t.heading ?? ""}`.toLowerCase();
  const tags = t.tags.map((tag) => tag.toLowerCase());
  return words.every((w) =>
    w.startsWith("#") ? tags.some((tag) => tag === w.slice(1) || tag.startsWith(`${w.slice(1)}/`)) : hay.includes(w),
  );
}

const byDateThenPriority = (a: KnowledgeTask, b: KnowledgeTask) =>
  (taskDate(a) ?? "9999").localeCompare(taskDate(b) ?? "9999") ||
  priorityRank(a) - priorityRank(b) ||
  a.text.localeCompare(b.text, "id");

/** Tugas yang perlu dikerjakan pada `date` (YMD): jatuh tempo/dijadwalkan hari itu, plus yang terlambat bila hari ini. */
export function tasksForDay(tasks: KnowledgeTask[], date: string, today: string) {
  const open = tasks.filter(isOpenTask);
  return {
    due: open.filter((t) => taskDate(t) === date).sort(byDateThenPriority),
    overdue: date === today ? open.filter((t) => (taskDate(t) ?? "9999") < today).sort(byDateThenPriority) : [],
    doneToday: tasks.filter((t) => t.status === "done" && t.doneDate === date),
  };
}

export function groupTasks(
  tasks: KnowledgeTask[],
  options: { today: string; status: TaskStatusFilter; query: string; groupBy: TaskGroupBy },
): TaskGroup[] {
  const visible = tasks.filter(
    (t) =>
      (options.status === "all" || (options.status === "open" ? isOpenTask(t) : t.status === "done")) &&
      matchesTaskQuery(t, options.query),
  );

  if (options.groupBy === "note") {
    const byNote = new Map<string, TaskGroup>();
    for (const t of visible) {
      const group = byNote.get(t.path) ?? { key: t.path, label: t.noteTitle, tone: "muted", tasks: [] };
      group.tasks.push(t);
      byNote.set(t.path, group);
    }
    return [...byNote.values()]
      .map((g) => ({ ...g, tasks: g.tasks.sort((a, b) => a.index - b.index) }))
      .sort((a, b) => a.label.localeCompare(b.label, "id"));
  }

  const week = formatLocalYMD(addDays(parseLocalYMD(options.today), 7));
  const groups: TaskGroup[] = [
    { key: "overdue", label: "Terlambat", tone: "destructive", tasks: [] },
    { key: "today", label: "Hari ini", tone: "warning", tasks: [] },
    { key: "week", label: "7 hari ke depan", tone: "info", tasks: [] },
    { key: "later", label: "Nanti", tone: "muted", tasks: [] },
    { key: "nodate", label: "Tanpa tanggal", tone: "muted", tasks: [] },
    { key: "done", label: "Selesai", tone: "success", tasks: [] },
    { key: "cancelled", label: "Dibatalkan", tone: "muted", tasks: [] },
  ];
  const at = (key: string) => groups.find((g) => g.key === key)!.tasks;
  for (const t of visible) {
    if (t.status === "done") at("done").push(t);
    else if (t.status === "cancelled") at("cancelled").push(t);
    else {
      const date = taskDate(t);
      if (!date) at("nodate").push(t);
      else if (date < options.today) at("overdue").push(t);
      else if (date === options.today) at("today").push(t);
      else if (date <= week) at("week").push(t);
      else at("later").push(t);
    }
  }
  for (const g of groups) {
    if (g.key === "done") g.tasks.sort((a, b) => (b.doneDate ?? "").localeCompare(a.doneDate ?? ""));
    else g.tasks.sort(byDateThenPriority);
  }
  return groups.filter((g) => g.tasks.length);
}

/** Ringkasan jumlah untuk header tab. */
export function taskCounts(tasks: KnowledgeTask[], today: string) {
  const open = tasks.filter(isOpenTask);
  return {
    open: open.length,
    overdue: open.filter((t) => (taskDate(t) ?? "9999") < today).length,
    today: open.filter((t) => taskDate(t) === today).length,
  };
}
