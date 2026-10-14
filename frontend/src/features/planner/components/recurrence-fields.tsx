import { Repeat } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatShortDate, parseLocalYMD, todayYMD, WEEKDAY_SHORT } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ScheduleRecurrence } from "@/types/entities";
import {
  defaultRecurrence,
  MAX_OCCURRENCES,
  occurrenceDates,
  RECURRENCE_LABELS,
  type SeriesScope,
  SCOPE_LABELS,
  WEEK_ORDER,
} from "../lib/recurrence";

/** Bagian "Berulang" di form agenda: pola harian/mingguan/bulanan, interval, hari, dan batas (tanggal / jumlah). */
export function RecurrenceFields({
  startDate,
  value,
  onChange,
}: {
  startDate: string;
  value?: ScheduleRecurrence;
  onChange: (rule: ScheduleRecurrence | undefined) => void;
}) {
  const enabled = !!value;
  const rule = value ?? defaultRecurrence(startDate || todayYMD());
  const patch = (values: Partial<ScheduleRecurrence>) => onChange({ ...rule, ...values });
  const endMode: "until" | "count" = rule.count ? "count" : "until";
  const dates = enabled && startDate ? occurrenceDates(startDate, rule) : [];

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-4",
        enabled ? "border-module/30 bg-module-soft/30" : "bg-muted/40",
      )}
    >
      <div className="flex items-center gap-2">
        <Checkbox
          id="sch-repeat"
          checked={enabled}
          onCheckedChange={(c) => onChange(c === true ? defaultRecurrence(startDate) : undefined)}
        />
        <Label htmlFor="sch-repeat" className="flex items-center gap-1.5 font-semibold">
          <Repeat className="size-4 text-module" /> Berulang
        </Label>
        <span className="text-xs text-muted-foreground">mis. kuliah atau rapat rutin</span>
      </div>

      {enabled && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Setiap</span>
            <Input
              type="number"
              min={1}
              max={52}
              aria-label="Interval"
              className="w-16 text-center"
              value={rule.interval}
              onChange={(e) => patch({ interval: Math.max(1, parseInt(e.target.value) || 1) })}
            />
            <Select
              value={rule.frequency}
              onValueChange={(v) => patch({ frequency: v as ScheduleRecurrence["frequency"] })}
            >
              <SelectTrigger className="w-32" aria-label="Frekuensi">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RECURRENCE_LABELS) as ScheduleRecurrence["frequency"][]).map((f) => (
                  <SelectItem key={f} value={f}>
                    {RECURRENCE_LABELS[f].unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {rule.frequency === "weekly" && (
            <Field>
              <FieldLabel>Hari</FieldLabel>
              <ToggleGroup
                type="multiple"
                variant="outline"
                spacing={2}
                value={(rule.days ?? []).map(String)}
                onValueChange={(v) => v.length && patch({ days: v.map(Number) })}
                className="flex-wrap"
              >
                {WEEK_ORDER.map((d) => (
                  <ToggleGroupItem
                    key={d}
                    value={String(d)}
                    className="w-12 data-[state=on]:bg-module data-[state=on]:text-module-foreground"
                  >
                    {WEEKDAY_SHORT[d]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Berakhir</span>
            <Select
              value={endMode}
              onValueChange={(v) =>
                v === "count"
                  ? patch({ count: dates.length || 10, until: undefined })
                  : patch({ count: undefined, until: dates.at(-1) ?? defaultRecurrence(startDate).until })
              }
            >
              <SelectTrigger className="w-40" aria-label="Batas pengulangan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="until">Pada tanggal</SelectItem>
                <SelectItem value="count">Setelah sejumlah</SelectItem>
              </SelectContent>
            </Select>
            {endMode === "until" ? (
              <Input
                type="date"
                aria-label="Tanggal terakhir"
                className="w-40"
                min={startDate}
                value={rule.until ?? ""}
                onChange={(e) => patch({ until: e.target.value })}
              />
            ) : (
              <>
                <Input
                  type="number"
                  min={1}
                  max={MAX_OCCURRENCES}
                  aria-label="Jumlah pertemuan"
                  className="w-20 text-center"
                  value={rule.count ?? 1}
                  onChange={(e) =>
                    patch({ count: Math.min(MAX_OCCURRENCES, Math.max(1, parseInt(e.target.value) || 1)) })
                  }
                />
                <span className="text-muted-foreground">kali</span>
              </>
            )}
          </div>

          <p className="text-xs font-medium text-module">
            {dates.length === 0
              ? "Tidak ada pertemuan pada pola ini — periksa hari & tanggal."
              : `${dates.length} pertemuan · ${formatShortDate(parseLocalYMD(dates[0]))} – ${formatShortDate(
                  parseLocalYMD(dates.at(-1)!),
                )}`}
            {dates.length >= MAX_OCCURRENCES && ` (dibatasi ${MAX_OCCURRENCES})`}
          </p>
        </>
      )}
    </div>
  );
}

/** Pilihan cakupan perubahan/penghapusan agenda dalam seri. */
export function SeriesScopePicker({
  value,
  onChange,
  disabled = [],
  note,
}: {
  value: SeriesScope;
  onChange: (scope: SeriesScope) => void;
  disabled?: SeriesScope[];
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Cakupan agenda berulang">
      {(Object.keys(SCOPE_LABELS) as SeriesScope[]).map((scope) => {
        const off = disabled.includes(scope);
        return (
          <button
            key={scope}
            type="button"
            role="radio"
            aria-checked={value === scope}
            disabled={off}
            onClick={() => onChange(scope)}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              value === scope ? "border-module bg-module-soft" : "bg-card hover:bg-muted/50",
            )}
          >
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                value === scope ? "border-module" : "border-muted-foreground/40",
              )}
            >
              {value === scope && <span className="size-2 rounded-full bg-module" />}
            </span>
            <span>
              <span className="block text-sm font-semibold">{SCOPE_LABELS[scope].label}</span>
              <span className="block text-xs text-muted-foreground">{SCOPE_LABELS[scope].hint}</span>
            </span>
          </button>
        );
      })}
      {note && <p className="text-xs text-warning-foreground dark:text-warning">{note}</p>}
    </div>
  );
}
