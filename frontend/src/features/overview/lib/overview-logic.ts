import { PRIORITY_RANK } from "@/components/common/priority-badge";
import { addDays, formatLocalYMD } from "@/lib/dates";
import {
  scheduleEnd,
  scheduleStart,
  scheduleTime,
  scheduleTimeLabel,
  todoYMD,
} from "@/features/planner/lib/planner-logic";
import type { Project, ProjectTask, Schedule, Todo } from "@/types/entities";

/** Status project yang tidak lagi dianggap berjalan. */
const STOPPED_STATUSES = new Set(["completed", "on-hold", "archived"]);

export const isProjectRunning = (p: Project) => !STOPPED_STATUSES.has(p.status ?? "active");

/** Project berjalan, urut deadline terdekat (tanpa deadline paling akhir), lalu judul. */
export const runningProjects = (projects: Project[]) =>
  projects
    .filter(isProjectRunning)
    .sort(
      (a, b) =>
        (a.deadline || "9999-12-31").localeCompare(b.deadline || "9999-12-31") || a.title.localeCompare(b.title),
    );

/** Satu baris tugas di Overview: todo Planner atau task/action Productivity. */
export type OverviewTask =
  { kind: "todo"; id: string; item: Todo; due: string } | { kind: "task"; id: string; item: ProjectTask; due: string };

const toEntries = (todos: Todo[], tasks: ProjectTask[]): OverviewTask[] => [
  ...todos.map((t) => ({ kind: "todo" as const, id: `todo-${t.id}`, item: t, due: todoYMD(t) })),
  ...tasks.map((t) => ({ kind: "task" as const, id: `task-${t.id}`, item: t, due: t.dueDate ?? "" })),
];

const priorityRank = (e: OverviewTask) => PRIORITY_RANK[e.item.priority ?? "low"] ?? 0;

/** Jumlah hari ke depan (setelah hari ini) yang masih dihitung untuk tugas prioritas tinggi. */
export const URGENT_HORIZON_DAYS = 7;

export const isOverdue = (e: OverviewTask, todayYmd: string) => !!e.due && e.due < todayYmd;

/**
 * Tugas mendesak (belum selesai): semua yang **terlambat** (tenggat sebelum hari ini, prioritas apa pun) +
 * prioritas **tinggi** yang jatuh tempo besok s.d. `URGENT_HORIZON_DAYS` hari ke depan atau tanpa tenggat.
 * Yang jatuh tempo hari ini tidak termasuk — tampil di kartu "To-do Hari Ini".
 * Urutan: terlambat dulu (tertua), lalu tenggat terdekat (tanpa tenggat terakhir), lalu prioritas.
 */
export const urgentTasks = (todos: Todo[], tasks: ProjectTask[], today: Date): OverviewTask[] => {
  const todayYmd = formatLocalYMD(today);
  const horizon = formatLocalYMD(addDays(today, URGENT_HORIZON_DAYS));
  return toEntries(todos, tasks)
    .filter((e) => {
      if (e.item.completed) return false;
      if (isOverdue(e, todayYmd)) return true;
      return e.item.priority === "high" && (!e.due || (e.due > todayYmd && e.due <= horizon));
    })
    .sort(
      (a, b) =>
        Number(isOverdue(b, todayYmd)) - Number(isOverdue(a, todayYmd)) ||
        (a.due || "9999-12-31").localeCompare(b.due || "9999-12-31") ||
        priorityRank(b) - priorityRank(a),
    );
};

/** Todo & task/action yang jatuh tempo hari ini: belum selesai dulu, lalu prioritas tertinggi. */
export const todayTasks = (todos: Todo[], tasks: ProjectTask[], todayYmd: string): OverviewTask[] =>
  toEntries(todos, tasks)
    .filter((e) => e.due === todayYmd)
    .sort((a, b) => Number(!!a.item.completed) - Number(!!b.item.completed) || priorityRank(b) - priorityRank(a));

export type AgendaStatus = "upcoming" | "ongoing" | "done";

const at = (ymd: string, hhmm: string) => `${ymd}T${hhmm}`;

/**
 * Status agenda terhadap waktu sekarang (dibandingkan sebagai teks "YYYY-MM-DDTHH:mm" waktu lokal).
 * Mulai = tanggal mulai + jam mulai (tanpa jam / sepanjang hari = 00:00); selesai = tanggal selesai + jam selesai
 * (tanpa jam selesai / sepanjang hari = akhir hari, jadi agenda yang sudah mulai dianggap berlangsung sampai harinya habis).
 */
export const agendaStatus = (s: Schedule, now: Date): AgendaStatus => {
  const nowKey = at(
    formatLocalYMD(now),
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
  );
  const start = at(scheduleStart(s), s.isAllDay ? "00:00" : scheduleTime(s) || "00:00");
  const end = at(scheduleEnd(s), s.isAllDay || !s.endTime ? "23:59:59" : s.endTime);
  if (nowKey < start) return "upcoming";
  return nowKey < end ? "ongoing" : "done";
};

export const AGENDA_STATUS_LABEL: Record<AgendaStatus, string> = {
  upcoming: "Akan datang",
  ongoing: "Berlangsung",
  done: "Selesai",
};

/** Label jam agenda berbahasa Indonesia ("Sepanjang hari" untuk agenda all-day). */
export const agendaTimeLabel = (s: Schedule) => (s.isAllDay ? "Sepanjang hari" : scheduleTimeLabel(s));
