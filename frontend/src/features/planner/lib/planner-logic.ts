import { formatLocalYMD, parseLocalYMD, startOfDay } from "@/lib/dates";
import type { FreezePeriod, ProjectTask, Routine, Schedule, Todo } from "@/types/entities";

/** Tanggal mulai/selesai agenda (juga mendukung agenda yang hanya punya `date`). */
export const scheduleStart = (s: Schedule) => s.startDate || s.date || "";
export const scheduleEnd = (s: Schedule) => s.endDate || s.date || scheduleStart(s);
export const scheduleTime = (s: Schedule) => s.startTime || s.time || "";

/** "All Day" atau "09:00 - 10:00". */
export const scheduleTimeLabel = (s: Schedule) =>
  s.isAllDay ? "All Day" : `${scheduleTime(s) || "??:??"}${s.endTime ? ` - ${s.endTime}` : ""}`;

export const isScheduleOnDate = (s: Schedule, ymd: string) => ymd >= scheduleStart(s) && ymd <= scheduleEnd(s);

/** Urutkan agenda berdasarkan jam (all-day paling atas). */
export const compareScheduleTime = (a: Schedule, b: Schedule) =>
  (a.isAllDay ? "00:00" : scheduleTime(a) || "00:00").localeCompare(b.isAllDay ? "00:00" : scheduleTime(b) || "00:00");

/** Urutan kronologis agenda: tanggal mulai, lalu jam (all-day lebih dulu). */
export const compareSchedule = (a: Schedule, b: Schedule) =>
  scheduleStart(a).localeCompare(scheduleStart(b)) || compareScheduleTime(a, b);

/** Agenda sudah lewat bila tanggal selesainya sebelum hari ini (agenda yang sedang berjalan belum lewat). */
export const isSchedulePast = (s: Schedule, todayYmd: string) => scheduleEnd(s) < todayYmd;

export type ScheduleFilter = "upcoming" | "past" | "all";

export const SCHEDULE_FILTER_LABELS: Record<ScheduleFilter, string> = {
  upcoming: "Akan Datang",
  past: "Sudah Lewat",
  all: "Semua",
};

/**
 * Agenda untuk tab Jadwal: akan datang diurutkan dari yang terdekat, sudah lewat dari yang terbaru.
 * "Semua" = akan datang lalu sudah lewat.
 */
export const filterSchedules = (schedules: Schedule[], filter: ScheduleFilter, todayYmd: string) => {
  const upcoming = schedules.filter((s) => !isSchedulePast(s, todayYmd)).sort(compareSchedule);
  const past = schedules.filter((s) => isSchedulePast(s, todayYmd)).sort((a, b) => compareSchedule(b, a));
  if (filter === "upcoming") return upcoming;
  if (filter === "past") return past;
  return [...upcoming, ...past];
};

/** Item to-do yang punya tanggal jatuh tempo (todo atau task/action). */
interface DueItem {
  completed?: boolean;
  /** Waktu diselesaikan (ISO) */
  completedAt?: string;
}

/** Tanggal jatuh tempo todo (YYYY-MM-DD). */
export const todoYMD = (t: Todo) => formatLocalYMD(t.date);
const taskYMD = (t: ProjectTask) => t.dueDate ?? "";

/** Tanggal (YYYY-MM-DD) item diselesaikan; data lama tanpa `completedAt` dianggap selesai pada tanggal jatuh temponya. */
export const doneOn = (item: DueItem, dueYmd: string) =>
  item.completed ? formatLocalYMD(item.completedAt) || dueYmd : "";

/** Diselesaikan setelah tanggal jatuh temponya (terlambat). */
export const isDoneLate = (item: DueItem, dueYmd: string) => !!item.completed && doneOn(item, dueYmd) > dueYmd;

/**
 * Item terlambat yang tampil pada tanggal `viewYmd` (jatuh tempo sebelum `viewYmd`):
 * - belum selesai → hanya saat melihat hari ini;
 * - diselesaikan terlambat tepat pada `viewYmd` → tetap tampil (tercentang) sebagai item terlambat hari itu.
 * Urutan: belum selesai dulu, lalu yang tertua.
 */
const lateItemsOn = <T extends DueItem>(items: T[], dueOf: (t: T) => string, viewYmd: string, todayYmd: string) =>
  items
    .filter((t) => {
      const due = dueOf(t);
      if (!due || due >= viewYmd) return false;
      return t.completed ? doneOn(t, due) === viewYmd : viewYmd === todayYmd;
    })
    .sort((a, b) => Number(!!a.completed) - Number(!!b.completed) || dueOf(a).localeCompare(dueOf(b)));

/** Todo terlambat pada `viewYmd` (lihat `lateItemsOn`); `todayYmd` default = `viewYmd`. */
export const overdueTodos = (todos: Todo[], viewYmd: string, todayYmd = viewYmd) =>
  lateItemsOn(todos, todoYMD, viewYmd, todayYmd);

/** Task/action produktivitas terlambat pada `viewYmd` (lihat `lateItemsOn`). */
export const overdueTasks = (tasks: ProjectTask[], viewYmd: string, todayYmd = viewYmd) =>
  lateItemsOn(tasks, taskYMD, viewYmd, todayYmd);

/**
 * Tanggal `day` pada bulan milik `date`; bila bulan itu lebih pendek, jatuh ke hari terakhirnya
 * (tanggal 31 → 30 Nov / 28 Feb; 29 Feb → 28 Feb di tahun biasa).
 */
export const dayInMonth = (day: number, date: Date) =>
  Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate());

/** Periode freeze lain yang tanggalnya beririsan dengan `period` (kecuali indeks `exceptIndex`). */
export const overlappingFreezes = (periods: FreezePeriod[], period: FreezePeriod, exceptIndex?: number) =>
  !period.startDate || !period.endDate || period.endDate < period.startDate
    ? []
    : periods.filter(
        (p, i) =>
          i !== exceptIndex &&
          p.startDate <= p.endDate &&
          p.startDate <= period.endDate &&
          period.startDate <= p.endDate,
      );

export const isPeriodActiveOn = (period: FreezePeriod, date: Date) => {
  const target = startOfDay(date);
  const start = parseLocalYMD(period.startDate);
  const end = parseLocalYMD(period.endDate);
  end.setHours(23, 59, 59, 999);
  return target >= start && target <= end;
};

export const isRoutineFrozenOn = (routine: Routine, date: Date) =>
  (routine.freezePeriods ?? []).some((p) => isPeriodActiveOn(p, date));

/** Apakah rutinitas terjadwal pada tanggal tertentu. */
export const isRoutineActiveOnDate = (routine: Routine, date: Date) => {
  if (!routine.active && !routine.archived) return false;
  if (routine.archived) return false;

  const target = startOfDay(date);
  // startDate "YYYY-MM-DD" dibaca sebagai tanggal lokal (new Date() membacanya sebagai UTC → bergeser sehari di zona barat)
  const start = routine.startDate ? parseLocalYMD(routine.startDate) : startOfDay(new Date(routine.createdAt || ""));
  if (Number.isNaN(start.getTime()) || target < start) return false;
  if (isRoutineFrozenOn(routine, target)) return false;

  switch (routine.frequency) {
    case "daily":
      return true;
    case "weekly":
      return routine.days?.includes(target.getDay()) ?? false;
    case "monthly":
      return (routine.monthDates ?? []).some((d) => dayInMonth(Number(d), target) === target.getDate());
    case "interval": {
      const diffDays = Math.ceil(Math.abs(target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const interval = routine.interval || 1;
      const type = routine.intervalType || "days";
      if (type === "days") return diffDays % interval === 0;
      if (type === "weeks") return diffDays % (interval * 7) === 0;
      if (type === "months") {
        if (dayInMonth(start.getDate(), target) !== target.getDate()) return false;
        const diffMonths = (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
        return diffMonths >= 0 && diffMonths % interval === 0;
      }
      if (type === "years") {
        if (target.getMonth() !== start.getMonth() || dayInMonth(start.getDate(), target) !== target.getDate())
          return false;
        const diffYears = target.getFullYear() - start.getFullYear();
        return diffYears >= 0 && diffYears % interval === 0;
      }
      return false;
    }
    default:
      return false;
  }
};

export const FREQUENCY_LABELS: Record<Routine["frequency"], string> = {
  daily: "Setiap Hari",
  weekly: "Mingguan",
  monthly: "Bulanan",
  interval: "Interval",
};

export const INTERVAL_LABELS = { days: "Hari", weeks: "Minggu", months: "Bulan", years: "Tahun" } as const;

/** Ringkasan frekuensi untuk ditampilkan, mis. "Interval (2 Minggu)". */
export const describeFrequency = (r: Routine) => {
  if (r.frequency === "interval") {
    return `Interval (${r.interval || 1} ${INTERVAL_LABELS[r.intervalType || "days"]})`;
  }
  return FREQUENCY_LABELS[r.frequency] ?? r.frequency;
};

export const yesterdayYMD = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatLocalYMD(d);
};

export type IndicatorState = "none" | "open" | "done";

export interface DaySummary {
  agendas: Schedule[];
  routines: { routine: Routine; done: boolean }[];
  todos: { id: string; title: string; done: boolean }[];
  tasks: { id: string; title: string; done: boolean }[];
}

/**
 * Isi satu tanggal untuk kalender Planner (penanda & ringkasan saat hover) — sumber datanya sama dengan daftar Harian:
 * agenda yang mencakup tanggal itu, rutinitas terjadwal (+ status centang), todo bertanggal itu, dan task/action yang
 * jatuh tempo hari itu. Item yang sudah selesai tetap dihitung (ditandai `done`).
 */
export const summarizeDay = (
  date: Date,
  data: {
    schedules: Schedule[];
    routines: Routine[];
    todos: Todo[];
    tasks: ProjectTask[];
    completions: { routineId: string; date: string }[];
  },
): DaySummary => {
  const ymd = formatLocalYMD(date);
  const key = date.toDateString();
  const doneRoutines = new Set(data.completions.filter((c) => c.date === key).map((c) => c.routineId));
  return {
    agendas: data.schedules.filter((s) => isScheduleOnDate(s, ymd)).sort(compareScheduleTime),
    routines: data.routines
      .filter((r) => isRoutineActiveOnDate(r, date))
      .map((routine) => ({ routine, done: doneRoutines.has(routine.id) })),
    todos: data.todos.filter((t) => todoYMD(t) === ymd).map((t) => ({ id: t.id, title: t.title, done: !!t.completed })),
    tasks: data.tasks.filter((t) => t.dueDate === ymd).map((t) => ({ id: t.id, title: t.title, done: !!t.completed })),
  };
};

/** Status penanda: tidak ada item / ada yang belum selesai / semua selesai. */
export const indicatorState = (items: { done: boolean }[]): IndicatorState =>
  items.length === 0 ? "none" : items.some((i) => !i.done) ? "open" : "done";
