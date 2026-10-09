import { formatLocalYMD, parseLocalYMD, startOfDay } from "@/lib/dates";
import type { FreezePeriod, Routine, Schedule } from "@/types/entities";

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
  const start = startOfDay(new Date(routine.startDate || routine.createdAt || ""));
  if (Number.isNaN(start.getTime()) || target < start) return false;
  if (isRoutineFrozenOn(routine, target)) return false;

  switch (routine.frequency) {
    case "daily":
      return true;
    case "weekly":
      return routine.days?.includes(target.getDay()) ?? false;
    case "monthly":
      return routine.monthDates?.includes(target.getDate().toString()) ?? false;
    case "interval": {
      const diffDays = Math.ceil(Math.abs(target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const interval = routine.interval || 1;
      const type = routine.intervalType || "days";
      if (type === "days") return diffDays % interval === 0;
      if (type === "weeks") return diffDays % (interval * 7) === 0;
      if (type === "months") {
        if (target.getDate() !== start.getDate()) return false;
        const diffMonths = (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
        return diffMonths >= 0 && diffMonths % interval === 0;
      }
      if (type === "years") {
        if (target.getDate() !== start.getDate() || target.getMonth() !== start.getMonth()) return false;
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
