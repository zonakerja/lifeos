import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatLocalYMD, parseLocalYMD } from "@/lib/dates";

/** Filter waktu File Control: semua / tahun tertentu / bulan tertentu / rentang. */
interface ArchiveTimeFilterValue {
  mode: "all" | "year" | "month" | "range";
  year: number;
  /** 0-11 */
  month: number;
  start: string;
  end: string;
}

export const defaultTimeFilter = (now: Date): ArchiveTimeFilterValue => ({
  mode: "all",
  year: now.getFullYear(),
  month: now.getMonth(),
  start: "",
  end: "",
});

export function matchesTimeFilter(value: string | undefined, filter: ArchiveTimeFilterValue) {
  if (filter.mode === "all" || !value) return true;
  const d = parseLocalYMD(value) ?? new Date(value);
  if (Number.isNaN(d.getTime())) return true;
  if (filter.mode === "year") return d.getFullYear() === filter.year;
  if (filter.mode === "month") return d.getFullYear() === filter.year && d.getMonth() === filter.month;
  if (filter.start && filter.end) {
    const ymd = formatLocalYMD(d);
    return ymd >= filter.start && ymd <= filter.end;
  }
  return true;
}

export function ArchiveTimeFilter({
  value,
  onChange,
}: {
  value: ArchiveTimeFilterValue;
  onChange: (value: ArchiveTimeFilterValue) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value.mode}
        onValueChange={(mode) => onChange({ ...value, mode: mode as ArchiveTimeFilterValue["mode"] })}
      >
        <SelectTrigger className="w-40">
          <CalendarDays />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Semua Waktu</SelectItem>
          <SelectItem value="year">Per Tahun</SelectItem>
          <SelectItem value="month">Per Bulan</SelectItem>
          <SelectItem value="range">Rentang</SelectItem>
        </SelectContent>
      </Select>
      {value.mode === "year" && (
        <Input
          type="number"
          aria-label="Tahun"
          className="w-24"
          value={value.year}
          onChange={(e) => onChange({ ...value, year: Number(e.target.value) || value.year })}
        />
      )}
      {value.mode === "month" && (
        <Input
          type="month"
          aria-label="Bulan"
          className="w-44"
          value={`${value.year}-${String(value.month + 1).padStart(2, "0")}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split("-").map(Number);
            if (y && m) onChange({ ...value, year: y, month: m - 1 });
          }}
        />
      )}
      {value.mode === "range" && (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            aria-label="Dari tanggal"
            className="w-40"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            aria-label="Sampai tanggal"
            className="w-40"
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
