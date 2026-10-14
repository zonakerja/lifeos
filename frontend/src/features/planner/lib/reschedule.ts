import { addDays, formatLocalYMD, parseLocalYMD } from "@/lib/dates";
import type { Schedule, ScheduleReschedule } from "@/types/entities";
import { scheduleEnd, scheduleStart, scheduleTime } from "./planner-logic";

/**
 * Jadwal ulang (realisasi agenda dimajukan/dimundurkan) — untuk agenda biasa maupun satu pertemuan dalam seri berulang.
 * Tanggal & jam agenda diganti langsung (semua konsumen otomatis mengikuti), sedangkan riwayat perpindahan disimpan di
 * `reschedules` (entri pertama = jadwal semula) sehingga bisa ditampilkan dan dikembalikan.
 */

export interface RescheduleInput {
  /** YYYY-MM-DD */
  startDate: string;
  /** HH:mm (kosong = tanpa jam) */
  startTime?: string;
  endTime?: string;
  reason?: string;
}

const spanDays = (s: Schedule) =>
  Math.max(
    0,
    Math.round((parseLocalYMD(scheduleEnd(s)).getTime() - parseLocalYMD(scheduleStart(s)).getTime()) / 86_400_000),
  );

/** Selisih hari antara dua YMD (b − a). */
export const dayDiff = (a: string, b: string) =>
  Math.round((parseLocalYMD(b).getTime() - parseLocalYMD(a).getTime()) / 86_400_000);

/** Geser YMD sejumlah hari. */
export const shiftYmd = (ymd: string, days: number) => formatLocalYMD(addDays(parseLocalYMD(ymd), days));

/** Pindahkan agenda ke tanggal/jam baru; durasi (multi-hari) tetap, riwayat bertambah. */
export const applyReschedule = (s: Schedule, input: RescheduleInput, at: string): Schedule => {
  const entry: ScheduleReschedule = {
    fromDate: scheduleStart(s),
    fromStartTime: scheduleTime(s) || undefined,
    fromEndTime: s.endTime || undefined,
    toDate: input.startDate,
    toStartTime: input.startTime || undefined,
    reason: input.reason?.trim() || undefined,
    at,
  };
  return {
    ...s,
    startDate: input.startDate,
    endDate: shiftYmd(input.startDate, spanDays(s)),
    ...(s.isAllDay ? {} : { startTime: input.startTime ?? "", endTime: input.endTime ?? "" }),
    reschedules: [...(s.reschedules ?? []), entry],
  };
};

/** Jadwal semula (sebelum dipindah pertama kali), atau null bila belum pernah dijadwal ulang. */
export const originalSlot = (s: Schedule) => s.reschedules?.[0] ?? null;

/** Perpindahan terakhir (untuk alasan & waktu terbaru). */
export const lastReschedule = (s: Schedule) => s.reschedules?.at(-1) ?? null;

/** Kembalikan ke jadwal semula & hapus riwayat. */
export const revertReschedule = (s: Schedule): Schedule => {
  const first = originalSlot(s);
  if (!first) return s;
  return {
    ...s,
    startDate: first.fromDate,
    endDate: shiftYmd(first.fromDate, spanDays(s)),
    ...(s.isAllDay ? {} : { startTime: first.fromStartTime ?? "", endTime: first.fromEndTime ?? "" }),
    reschedules: undefined,
  };
};

/**
 * Agenda yang **dipindahkan dari** tanggal `ymd` (jadwal semula di tanggal itu, kini di tanggal lain) — ditampilkan
 * samar di Harian agar user tahu agendanya pindah.
 */
export const movedAwayFrom = (schedules: Schedule[], ymd: string) =>
  schedules.filter((s) => {
    const first = originalSlot(s);
    return !!first && first.fromDate === ymd && scheduleStart(s) !== ymd;
  });
