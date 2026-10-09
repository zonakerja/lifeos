import { formatLocalYMD } from "@/lib/dates";

/** Filter waktu standar (dipakai Productivity & File Control). */
export type DateFilterMode = "all" | "month" | "year" | "custom";

export interface DateFilterValue {
  mode: DateFilterMode;
  /** YYYY-MM-DD, hanya untuk mode custom */
  start: string;
  end: string;
}

export const DEFAULT_DATE_FILTER: DateFilterValue = { mode: "all", start: "", end: "" };

/**
 * Cocokkan satu tanggal dengan filter. Item tanpa tanggal hanya lolos pada mode "all".
 */
export function matchesDateFilter(value: string | Date | null | undefined, filter: DateFilterValue, now: Date) {
  if (!value) return filter.mode === "all";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return filter.mode === "all";
  switch (filter.mode) {
    case "month":
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    case "year":
      return date.getFullYear() === now.getFullYear();
    case "custom": {
      if (!filter.start || !filter.end) return true;
      const ymd = formatLocalYMD(date);
      return ymd >= filter.start && ymd <= filter.end;
    }
    default:
      return true;
  }
}

/** Rentang [start, end] untuk filter berbasis periode (mis. project aktif dalam periode). */
export function dateFilterRange(filter: DateFilterValue, now: Date): [Date, Date] | null {
  if (filter.mode === "month") {
    return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0)];
  }
  if (filter.mode === "year") return [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31)];
  if (filter.mode === "custom" && filter.start && filter.end) return [new Date(filter.start), new Date(filter.end)];
  return null;
}
