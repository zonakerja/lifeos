import { addDays, formatLocalYMD, formatShortDate, parseLocalYMD, WEEKDAY_SHORT } from "@/lib/dates";
import type { AttachedResource, Schedule, ScheduleRecurrence } from "@/types/entities";
import { dayInMonth, scheduleEnd, scheduleStart } from "./planner-logic";

/**
 * Agenda berulang (mis. kuliah mingguan). Setiap pertemuan disimpan sebagai **agenda tersendiri** dengan `seriesId` &
 * pola `recurrence` yang sama, sehingga tiap pertemuan punya hasil, Notes AI, dan lampiran sendiri, sementara daftar
 * Harian, kalender, Overview, notifikasi, Productivity, dan berbagi tetap bekerja per agenda.
 */

/** Batas pertemuan per seri (mencegah ribuan record tak sengaja). */
export const MAX_OCCURRENCES = 200;
/** Jangkauan maksimum pencarian tanggal (hari) — pengaman perulangan. */
const MAX_SPAN_DAYS = 366 * 5;

export const RECURRENCE_LABELS: Record<ScheduleRecurrence["frequency"], { label: string; unit: string }> = {
  daily: { label: "Harian", unit: "hari" },
  weekly: { label: "Mingguan", unit: "minggu" },
  monthly: { label: "Bulanan", unit: "bulan" },
};

/** Urutan hari di form (Senin dulu). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Pola default untuk agenda baru yang dijadikan berulang: mingguan di hari yang sama, ± 3 bulan. */
export const defaultRecurrence = (startYmd: string): ScheduleRecurrence => {
  const start = parseLocalYMD(startYmd);
  const until = new Date(start.getFullYear(), start.getMonth() + 3, start.getDate());
  return { frequency: "weekly", interval: 1, days: [start.getDay()], until: formatLocalYMD(until) };
};

/** Tanggal (YYYY-MM-DD) semua pertemuan sesuai pola, mulai `startYmd` (urut, maks. `MAX_OCCURRENCES`). */
export const occurrenceDates = (startYmd: string, rule: ScheduleRecurrence): string[] => {
  const start = parseLocalYMD(startYmd);
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  const limit = Math.min(rule.count && rule.count > 0 ? rule.count : MAX_OCCURRENCES, MAX_OCCURRENCES);
  const until = rule.until && rule.until >= startYmd ? rule.until : null;
  // Tanpa batas tanggal maupun jumlah → dianggap satu pertemuan (form selalu mengisi salah satunya)
  if (!until && !(rule.count && rule.count > 0)) return [startYmd];
  const dates: string[] = [];
  const push = (d: Date) => {
    const ymd = formatLocalYMD(d);
    if (until && ymd > until) return false;
    if (ymd >= startYmd) dates.push(ymd);
    return dates.length < limit;
  };

  if (rule.frequency === "daily") {
    for (let i = 0; i * interval <= MAX_SPAN_DAYS; i++) if (!push(addDays(start, i * interval))) break;
  } else if (rule.frequency === "weekly") {
    const days = new Set(rule.days?.length ? rule.days : [start.getDay()]);
    const weekStart = addDays(start, -start.getDay()); // Minggu di pekan tanggal mulai
    for (let i = 0; i <= MAX_SPAN_DAYS; i++) {
      const date = addDays(weekStart, i);
      if (Math.floor(i / 7) % interval !== 0 || !days.has(date.getDay()) || formatLocalYMD(date) < startYmd) continue;
      if (!push(date)) break;
    }
  } else {
    for (let m = 0; m * interval <= MAX_SPAN_DAYS / 28; m++) {
      const month = new Date(start.getFullYear(), start.getMonth() + m * interval, 1);
      // Tanggal 29–31 jatuh ke hari terakhir bulan yang lebih pendek (sama dengan rutinitas)
      const date = new Date(month.getFullYear(), month.getMonth(), dayInMonth(start.getDate(), month));
      if (!push(date)) break;
    }
  }
  return dates;
};

/** "Mingguan · Sel, Kam · s.d. 27 Jan 2027" / "Setiap 2 minggu · 16 kali". */
export const describeRecurrence = (rule: ScheduleRecurrence) => {
  const interval = Math.max(1, rule.interval || 1);
  const parts = [
    interval > 1
      ? `Setiap ${interval} ${RECURRENCE_LABELS[rule.frequency].unit}`
      : RECURRENCE_LABELS[rule.frequency].label,
  ];
  if (rule.frequency === "weekly" && rule.days?.length) {
    parts.push(
      WEEK_ORDER.filter((d) => rule.days?.includes(d))
        .map((d) => WEEKDAY_SHORT[d])
        .join(", "),
    );
  }
  if (rule.count) parts.push(`${rule.count} kali`);
  else if (rule.until) parts.push(`s.d. ${formatShortDate(parseLocalYMD(rule.until))}`);
  return parts.join(" · ");
};

/** Pola sama (untuk mendeteksi perubahan pola saat mengubah seri). */
export const sameRecurrence = (a?: ScheduleRecurrence, b?: ScheduleRecurrence) =>
  JSON.stringify(normalizeRule(a)) === JSON.stringify(normalizeRule(b));

const normalizeRule = (r?: ScheduleRecurrence) =>
  r
    ? {
        frequency: r.frequency,
        interval: Math.max(1, r.interval || 1),
        days: r.frequency === "weekly" ? [...(r.days ?? [])].sort() : [],
        until: r.count ? "" : (r.until ?? ""),
        count: r.count ?? 0,
      }
    : null;

/** Satu baris per seri (pertemuan pertama yang muncul dalam urutan `list`); agenda biasa tetap. */
export const collapseSeries = (list: Schedule[]) => {
  const seen = new Set<string>();
  return list.filter((s) => {
    if (!s.seriesId) return true;
    if (seen.has(s.seriesId)) return false;
    seen.add(s.seriesId);
    return true;
  });
};

/** Anggota seri, urut tanggal. */
export const seriesMembers = (schedules: Schedule[], seriesId?: string) =>
  seriesId
    ? schedules
        .filter((s) => s.seriesId === seriesId)
        .sort((a, b) => scheduleStart(a).localeCompare(scheduleStart(b)) || a.id.localeCompare(b.id))
    : [];

/** Posisi pertemuan dalam seri: { index (1-based), total }. */
export const seriesPosition = (schedules: Schedule[], schedule: Schedule) => {
  const members = seriesMembers(schedules, schedule.seriesId);
  const index = members.findIndex((s) => s.id === schedule.id);
  return index < 0 ? null : { index: index + 1, total: members.length, members };
};

/** Salin lampiran dengan ID unik per pertemuan (berkas yang sama tetap terlindung saat satu pertemuan dihapus). */
export const cloneAttachments = (list: AttachedResource[] | undefined, suffix: string) =>
  (list ?? []).map((att) => ({ ...att, id: `${att.id.split("~")[0]}~${suffix}` }));

/** Durasi agenda (hari) — agenda multi-hari tetap sepanjang itu di setiap pertemuan. */
const spanDays = (s: Schedule) =>
  Math.round((parseLocalYMD(scheduleEnd(s)).getTime() - parseLocalYMD(scheduleStart(s)).getTime()) / 86_400_000);

/** Field yang disamakan ke anggota seri saat "ubah beberapa pertemuan" (tanggal, hasil & ID tetap per pertemuan). */
const SHARED_KEYS = [
  "title",
  "type",
  "startTime",
  "endTime",
  "isAllDay",
  "location",
  "media",
  "description",
  "projectId",
] as const satisfies readonly (keyof Schedule)[];

export const sharedFields = (s: Schedule): Partial<Schedule> =>
  Object.fromEntries(SHARED_KEYS.map((k) => [k, s[k]])) as Partial<Schedule>;

/** Agenda untuk satu tanggal pertemuan berdasarkan templat (`base`). */
export const occurrenceFrom = (base: Schedule, date: string, id: string, extra: Partial<Schedule> = {}): Schedule => ({
  ...base,
  id,
  startDate: date,
  endDate: formatLocalYMD(addDays(parseLocalYMD(date), spanDays(base))),
  resources: cloneAttachments(base.resources, id),
  results: [],
  outcome: "",
  // Riwayat jadwal ulang milik pertemuan asal tidak ikut disalin
  reschedules: undefined,
  ...extra,
});

export type SeriesScope = "this" | "following" | "all";

export const SCOPE_LABELS: Record<SeriesScope, { label: string; hint: string }> = {
  this: { label: "Hanya agenda ini", hint: "Pertemuan lain tidak berubah" },
  following: { label: "Agenda ini & berikutnya", hint: "Pertemuan sebelumnya tidak berubah" },
  all: { label: "Semua agenda dalam seri", hint: "Seluruh pertemuan" },
};

/** Anggota seri yang terkena cakupan, relatif terhadap `anchor`. */
export const membersInScope = (members: Schedule[], anchor: Schedule, scope: SeriesScope) => {
  if (scope === "this") return members.filter((m) => m.id === anchor.id);
  if (scope === "all") return members;
  const from = scheduleStart(anchor);
  return members.filter((m) => m.id === anchor.id || scheduleStart(m) >= from);
};

export interface SeriesPlan {
  upsert: Schedule[];
  remove: Schedule[];
}

/**
 * Rencana penyimpanan perubahan agenda yang (akan) berulang.
 * - `edited` = isi form; `original` = agenda sebelum diubah (null = baru); `members` = anggota seri saat ini.
 * - Pola berubah (atau agenda biasa dijadikan berulang) → tanggal dihitung ulang dari jangkar (agenda ini untuk
 *   "ini & berikutnya", pertemuan pertama untuk "semua"); pertemuan lama dipasangkan berurutan dengan tanggal baru
 *   (hasil & ID tetap), kelebihan dihapus, kekurangan dibuat baru.
 * - Pola tetap → field bersama (judul, jam, lokasi, link, …) disamakan ke anggota dalam cakupan; tanggal hanya
 *   berubah untuk agenda yang diedit.
 * - Pengulangan dimatikan → "ini": dilepas dari seri; "ini & berikutnya": pertemuan sesudahnya dihapus;
 *   "semua": pertemuan lain dihapus.
 */
export const planSeriesSave = (
  edited: Schedule,
  original: Schedule | null,
  members: Schedule[],
  scope: SeriesScope,
  newId: (index: number) => string,
  newSeriesId: () => string,
): SeriesPlan => {
  const wasSeries = !!original?.seriesId;
  const rule = edited.recurrence;

  // Bukan (lagi) berulang
  if (!rule) {
    const single = { ...edited, seriesId: undefined, recurrence: undefined };
    if (!wasSeries || scope === "this") return { upsert: [single], remove: [] };
    const others = members.filter((m) => m.id !== edited.id);
    const remove = scope === "all" ? others : others.filter((m) => scheduleStart(m) > scheduleStart(original!));
    return { upsert: [single], remove };
  }

  // Agenda baru / agenda biasa dijadikan berulang → buat seri dari tanggal agenda ini
  if (!wasSeries) {
    const seriesId = newSeriesId();
    const dates = occurrenceDates(edited.startDate ?? "", rule);
    const first = { ...edited, seriesId, recurrence: rule };
    const upsert = dates.map((date, i) =>
      i === 0
        ? { ...first, startDate: date, endDate: formatLocalYMD(addDays(parseLocalYMD(date), spanDays(edited))) }
        : occurrenceFrom(first, date, newId(i)),
    );
    return { upsert, remove: [] };
  }

  const targeted = membersInScope(members, original!, scope);
  const targetedIds = new Set(targeted.map((m) => m.id));
  const shared = sharedFields(edited);

  if (scope === "this" || sameRecurrence(original!.recurrence, rule)) {
    // Pola tetap: samakan field bersama; tanggal & lampiran dasar hanya untuk agenda ini, kecuali dasar ikut disamakan
    const upsert = targeted.map((m) =>
      m.id === edited.id
        ? { ...edited, recurrence: original!.recurrence }
        : {
            ...m,
            ...shared,
            // Durasi (multi-hari) mengikuti agenda yang diedit; tanggal mulai tiap pertemuan tetap
            endDate: formatLocalYMD(addDays(parseLocalYMD(scheduleStart(m)), spanDays(edited))),
            resources: cloneAttachments(edited.resources, m.id),
          },
    );
    return { upsert, remove: [] };
  }

  // Pola berubah: hitung ulang tanggal dari jangkar
  const anchor = scope === "all" ? (targeted[0] ?? edited) : edited;
  const anchorDate = anchor.id === edited.id ? (edited.startDate ?? "") : scheduleStart(anchor);
  const dates = occurrenceDates(anchorDate, rule);
  const ordered = [...targeted].sort((a, b) => scheduleStart(a).localeCompare(scheduleStart(b)));
  // Agenda yang diedit dipakai untuk tanggal pertama bila menjadi jangkar
  const pool = anchor.id === edited.id ? [edited, ...ordered.filter((m) => m.id !== edited.id)] : ordered;
  const template = { ...edited, recurrence: rule };
  const upsert = dates.map((date, i) => {
    const existing = pool[i];
    if (!existing) return occurrenceFrom(template, date, newId(i));
    const base = existing.id === edited.id ? edited : { ...existing, ...shared };
    return {
      ...base,
      recurrence: rule,
      // Tanggal dihitung ulang dari pola → riwayat jadwal ulang tidak berlaku lagi
      ...(scheduleStart(existing) !== date ? { reschedules: undefined } : {}),
      startDate: date,
      endDate: formatLocalYMD(addDays(parseLocalYMD(date), spanDays(edited))),
      resources: existing.id === edited.id ? edited.resources : cloneAttachments(edited.resources, existing.id),
    };
  });
  const keptIds = new Set(upsert.map((s) => s.id));
  const remove = pool.filter((m) => targetedIds.has(m.id) && !keptIds.has(m.id));
  return { upsert, remove };
};
