import { formatFullDate, parseLocalYMD } from "@/lib/dates";
import { getAppIcon } from "@/lib/icons/icon-registry";
import type { AgendaType, Routine, Schedule } from "@/types/entities";
import { describeFrequency, scheduleEnd, scheduleLinks, scheduleStart } from "./planner-logic";
import { describeRecurrence } from "./recurrence";
import { resolveAgendaStyle } from "./schedule-style";

/**
 * Pencarian tab Jadwal, Rutinitas, dan Referensi: per kata (semua kata harus ditemukan, urutan bebas), tanpa
 * membedakan huruf besar/kecil maupun aksen — "kuliah selasa" cocok dengan agenda "Kuliah Statistika" hari Selasa.
 */

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Kata-kata kueri (kosong = semua cocok). */
export const queryWords = (query: string) => normalize(query).split(/\s+/).filter(Boolean);

/** Semua kata kueri ada di gabungan teks. */
export const matchesWords = (words: string[], ...texts: (string | undefined | null)[]) => {
  if (words.length === 0) return true;
  const haystack = normalize(texts.filter(Boolean).join(" "));
  return words.every((w) => haystack.includes(w));
};

/** Teks yang bisa dicari untuk satu agenda. */
const scheduleText = (s: Schedule) => {
  const start = scheduleStart(s);
  const end = scheduleEnd(s);
  return [
    s.title,
    s.type,
    s.location,
    s.description,
    s.outcome,
    ...scheduleLinks(s),
    // Nama hari & bulan ("Selasa, 13 Oktober 2026") agar bisa dicari dengan kata tanggal
    start ? formatFullDate(parseLocalYMD(start)) : "",
    end && end !== start ? formatFullDate(parseLocalYMD(end)) : "",
    s.recurrence ? `berulang ${describeRecurrence(s.recurrence)}` : "",
    s.reschedules?.length ? "dijadwal ulang" : "",
  ];
};

export const searchSchedules = (schedules: Schedule[], query: string) => {
  const words = queryWords(query);
  return words.length ? schedules.filter((s) => matchesWords(words, ...scheduleText(s))) : schedules;
};

export const searchRoutines = (routines: Routine[], query: string) => {
  const words = queryWords(query);
  return words.length ? routines.filter((r) => matchesWords(words, r.title, describeFrequency(r))) : routines;
};

/** Tipe agenda: nama + label ikonnya (mis. "Online", "Perjalanan Dinas"). */
export const searchAgendaTypes = (types: AgendaType[], query: string) => {
  const words = queryWords(query);
  return words.length
    ? types.filter((t) => matchesWords(words, t.name, getAppIcon(resolveAgendaStyle(t.name, t).icon).label))
    : types;
};
