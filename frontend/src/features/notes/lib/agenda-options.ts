import type { SelectOption } from "@/components/common/searchable-select";
import { scheduleStart, scheduleTimeLabel } from "@/features/planner/lib/planner-logic";
import { formatShortDate, parseLocalYMD } from "@/lib/dates";
import type { Schedule } from "@/types/entities";

const startLabel = (s: Schedule) => {
  const start = scheduleStart(s);
  return start ? formatShortDate(parseLocalYMD(start)) : "Tanpa tanggal";
};

/** "Rapat Mingguan · 8 Okt 2026" (dipakai di badge dan prompt ringkasan). */
export const agendaLabel = (s: Schedule) => `${s.title} · ${startLabel(s)}`;

/** Pilihan agenda untuk dropdown: terbaru dulu, dengan tanggal & jam sebagai keterangan. */
export const agendaOptions = (schedules: Schedule[]): SelectOption[] =>
  [...schedules]
    .sort((a, b) => scheduleStart(b).localeCompare(scheduleStart(a)))
    .map((s) => ({ value: s.id, label: s.title || "Tanpa judul", hint: `${startLabel(s)} · ${scheduleTimeLabel(s)}` }));
