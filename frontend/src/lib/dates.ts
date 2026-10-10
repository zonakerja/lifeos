/**
 * Utilitas tanggal. Format penyimpanan:
 * - Tanggal "YMD" lokal: "2026-10-08" (schedule, routine.startDate, task.dueDate)
 * - "Date key": hasil Date.toDateString(), mis. "Thu Oct 08 2026" (todo.date, completion.date)
 */

/** Date → "YYYY-MM-DD" berdasarkan zona waktu lokal. */
export const formatLocalYMD = (date: Date | string | number | null | undefined) => {
  if (date === null || date === undefined || date === "") return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split("T")[0];
};

/** "YYYY-MM-DD" → Date lokal (00:00). String kosong → hari ini. */
export const parseLocalYMD = (value?: string | null) => {
  if (!value) return new Date();
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Kunci tanggal (format Date.toDateString()). */
export const toDateKey = (date: Date) => date.toDateString();

export const todayYMD = () => formatLocalYMD(new Date());

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Sel kalender bulan (null = sel kosong sebelum tanggal 1). Minggu sebagai hari pertama. */
export const generateCalendarDays = (year: number, month: number) => {
  const firstDayIndex = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) days.push(null);
  for (let i = 1; i <= lastDay; i++) days.push(i);
  return days;
};

export const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export const WEEKDAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const fmt = (options: Intl.DateTimeFormatOptions) => (value: Date | string | number) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("id-ID", options);
};

/** "8 Okt" */
export const formatDayMonth = fmt({ day: "numeric", month: "short" });
/** "8 Okt 2026" */
export const formatShortDate = fmt({ day: "numeric", month: "short", year: "numeric" });
/** "Kamis, 8 Oktober 2026" */
export const formatFullDate = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
/** "8/10/2026" */
export const formatNumericDate = fmt({});

/** Selisih hari kalender (b - a). */
export const diffInDays = (a: Date, b: Date) =>
  Math.ceil((startOfDay(b).getTime() - startOfDay(a).getTime()) / (1000 * 60 * 60 * 24));

/** "8 Okt 2026, 14.05" */
export const formatDateTime = (value: Date | string | number) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

const RELATIVE_UNITS: [limitSeconds: number, unit: Intl.RelativeTimeFormatUnit, seconds: number][] = [
  [3600, "minute", 60],
  [86400, "hour", 3600],
  [604800, "day", 86400],
  [2629800, "week", 604800],
  [31557600, "month", 2629800],
  [Infinity, "year", 31557600],
];

/** Waktu relatif terhadap `now`: "baru saja", "5 menit yang lalu", "kemarin", "3 minggu yang lalu". */
export const formatRelative = (value: Date | string | number, now: Date) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const diff = (d.getTime() - now.getTime()) / 1000;
  // `now` bisa sedikit tertinggal dari aksi terbaru (mis. useToday saat mount) → anggap baru saja
  if (diff > -60) return "baru saja";
  const rtf = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });
  const [, unit, seconds] = RELATIVE_UNITS.find(([limit]) => Math.abs(diff) < limit)!;
  return rtf.format(Math.round(diff / seconds), unit);
};
