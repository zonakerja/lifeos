import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DateFilterMode, DateFilterValue } from "@/lib/date-filter";

const DEFAULT_LABELS: Record<DateFilterMode, string> = {
  all: "Semua Waktu",
  month: "Bulan Ini",
  year: "Tahun Ini",
  custom: "Custom Range",
};

/** Pemilih filter waktu (Semua / Bulan ini / Tahun ini / Custom range). */
export function DateRangeFilter({
  value,
  onChange,
  labels,
}: {
  value: DateFilterValue;
  onChange: (value: DateFilterValue) => void;
  labels?: Partial<Record<DateFilterMode, string>>;
}) {
  const text = { ...DEFAULT_LABELS, ...labels };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.mode} onValueChange={(mode) => onChange({ ...value, mode: mode as DateFilterMode })}>
        <SelectTrigger className="w-40">
          <CalendarDays />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(text) as DateFilterMode[]).map((mode) => (
            <SelectItem key={mode} value={mode}>
              {text[mode]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.mode === "custom" && (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            aria-label="Tanggal mulai"
            className="w-38"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            aria-label="Tanggal akhir"
            className="w-38"
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
