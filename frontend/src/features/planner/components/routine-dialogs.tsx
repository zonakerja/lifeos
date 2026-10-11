import { AlertTriangle, Info, PencilLine, Snowflake, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToday } from "@/hooks/use-today";
import { formatDayMonth, formatLocalYMD, formatShortDate, parseLocalYMD, todayYMD, WEEKDAY_SHORT } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { FreezePeriod, IntervalType, Routine, RoutineFrequency } from "@/types/entities";
import { FREQUENCY_LABELS, INTERVAL_LABELS, isPeriodActiveOn, overlappingFreezes } from "../lib/planner-logic";
import { useRetained } from "@/hooks/use-retained";

// ============================================================================
// Form rutinitas
// ============================================================================

type RoutineForm = Pick<
  Routine,
  "title" | "frequency" | "days" | "interval" | "intervalType" | "monthDates" | "startDate"
>;

const emptyForm = (): RoutineForm => ({
  title: "",
  frequency: "daily",
  days: [],
  interval: 1,
  intervalType: "days",
  monthDates: [],
  startDate: todayYMD(),
});

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const initialForm = (routine: Routine | "new"): RoutineForm =>
  routine === "new"
    ? emptyForm()
    : {
        title: routine.title,
        frequency: routine.frequency,
        days: routine.days ?? [],
        interval: routine.interval || 1,
        intervalType: routine.intervalType || "days",
        monthDates: routine.monthDates ?? [],
        startDate: routine.startDate || (routine.createdAt ? formatLocalYMD(routine.createdAt) : todayYMD()),
      };

interface RoutineFormDialogProps {
  /** null = tertutup, "new" = buat baru */
  routine: Routine | "new" | null;
  onOpenChange: (open: boolean) => void;
  onSave: (values: RoutineForm) => void;
}

export function RoutineFormDialog({ routine: routineProp, onOpenChange, onSave }: RoutineFormDialogProps) {
  const routine = useRetained(routineProp);
  return (
    <Dialog open={routineProp !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {routine !== null && <RoutineFormBody routine={routine} onOpenChange={onOpenChange} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function RoutineFormBody({ routine, onOpenChange, onSave }: RoutineFormDialogProps & { routine: Routine | "new" }) {
  const [form, setForm] = useState<RoutineForm>(() => initialForm(routine));
  const isNew = routine === "new";

  const patch = (values: Partial<RoutineForm>) => setForm((prev) => ({ ...prev, ...values }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (form.frequency === "weekly" && !form.days?.length) {
      toast.error("Pilih minimal satu hari.");
      return;
    }
    if (form.frequency === "monthly" && !form.monthDates?.length) {
      toast.error("Pilih minimal satu tanggal.");
      return;
    }
    onSave({ ...form, title: form.title.trim(), startDate: form.startDate || todayYMD() });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isNew ? "Tambah Rutinitas" : "Ubah Rutinitas"}</DialogTitle>
        <DialogDescription>Tentukan nama dan pola pengulangan kebiasaan.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="routine-title">Nama</FieldLabel>
            <Input
              id="routine-title"
              placeholder="Contoh: Lari Pagi"
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="routine-start">Tanggal Mulai</FieldLabel>
              <Input
                id="routine-start"
                type="date"
                value={form.startDate}
                onChange={(e) => patch({ startDate: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>Frekuensi</FieldLabel>
              <Select value={form.frequency} onValueChange={(v) => patch({ frequency: v as RoutineFrequency })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FREQUENCY_LABELS) as RoutineFrequency[]).map((f) => (
                    <SelectItem key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {form.frequency === "interval" && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-muted-foreground">Setiap</span>
              <Input
                type="number"
                min={1}
                className="w-20 text-center"
                value={form.interval}
                onChange={(e) => patch({ interval: parseInt(e.target.value) || 1 })}
              />
              <Select value={form.intervalType} onValueChange={(v) => patch({ intervalType: v as IntervalType })}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(INTERVAL_LABELS) as IntervalType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {INTERVAL_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="font-medium text-muted-foreground">sekali</span>
              {(form.intervalType === "months" || form.intervalType === "years") &&
                Number(form.startDate?.slice(8, 10)) > 28 && (
                  <p className="w-full text-xs text-muted-foreground">
                    Tanggal mulai {Number(form.startDate?.slice(8, 10))} jatuh ke hari terakhir pada bulan yang lebih
                    pendek.
                  </p>
                )}
            </div>
          )}

          {form.frequency === "weekly" && (
            <Field>
              <FieldLabel>Hari</FieldLabel>
              <ToggleGroup
                type="multiple"
                variant="outline"
                spacing={2}
                value={(form.days ?? []).map(String)}
                onValueChange={(v) => patch({ days: v.map(Number) })}
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

          {form.frequency === "monthly" && (
            <Field>
              <FieldLabel>Pilih Tanggal</FieldLabel>
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => {
                  const active = form.monthDates?.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        patch({
                          monthDates: active
                            ? (form.monthDates ?? []).filter((x) => x !== d)
                            : [...(form.monthDates ?? []), d],
                        })
                      }
                      className={cn(
                        "rounded-lg border py-1.5 text-xs font-bold transition-colors",
                        active ? "border-module bg-module text-module-foreground" : "hover:bg-module-soft",
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              {(form.monthDates ?? []).some((d) => Number(d) > 28) && (
                <p className="text-xs text-muted-foreground">
                  Tanggal 29–31 jatuh ke hari terakhir pada bulan yang lebih pendek.
                </p>
              )}
            </Field>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit">{isNew ? "Simpan" : "Simpan Perubahan"}</Button>
          </DialogFooter>
        </FieldGroup>
      </form>
    </>
  );
}

// ============================================================================
// Freeze
// ============================================================================

export function FreezeDialog({
  routine: routineProp,
  onOpenChange,
  onSave,
}: {
  routine: Routine | null;
  onOpenChange: (open: boolean) => void;
  onSave: (period: FreezePeriod) => void;
}) {
  const routine = useRetained(routineProp);
  return (
    <Dialog open={!!routineProp} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Snowflake className="size-5 text-info" /> Freeze Rutinitas
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 rounded-xl bg-info/10 p-3 text-xs text-info">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Rutinitas "{routine?.title}" tidak akan muncul di agenda dan tidak memengaruhi performa selama periode ini.
          </p>
        </div>
        <FreezeForm existing={routine?.freezePeriods ?? []} onSave={onSave} />
      </DialogContent>
    </Dialog>
  );
}

function FreezeForm({ existing, onSave }: { existing: FreezePeriod[]; onSave: (period: FreezePeriod) => void }) {
  const [period, setPeriod] = useState<FreezePeriod>({ startDate: "", endDate: "", reason: "" });
  const overlaps = overlappingFreezes(existing, period);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!period.startDate || !period.endDate || !period.reason.trim()) {
      toast.error("Mohon lengkapi semua data.");
      return;
    }
    if (period.endDate < period.startDate) {
      toast.error("Tanggal selesai tidak boleh sebelum tanggal mulai.");
      return;
    }
    onSave({ ...period, reason: period.reason.trim() });
  };

  return (
    <form onSubmit={submit}>
      <FieldGroup className="gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="freeze-start">Mulai</FieldLabel>
            <Input
              id="freeze-start"
              type="date"
              value={period.startDate}
              onChange={(e) => setPeriod({ ...period, startDate: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="freeze-end">Selesai</FieldLabel>
            <Input
              id="freeze-end"
              type="date"
              value={period.endDate}
              onChange={(e) => setPeriod({ ...period, endDate: e.target.value })}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="freeze-reason">Alasan</FieldLabel>
          <Input
            id="freeze-reason"
            placeholder="Sakit, Liburan, Mudik..."
            value={period.reason}
            onChange={(e) => setPeriod({ ...period, reason: e.target.value })}
          />
        </Field>
        <OverlapWarning overlaps={overlaps} />
        <Button type="submit" className="w-full bg-info text-info-foreground hover:bg-info/85">
          Simpan Freeze
        </Button>
      </FieldGroup>
    </form>
  );
}

/** Riwayat freeze dengan edit & hapus per periode. Beri `key` per routine agar state ter-reset. */
export function FreezeHistoryDialog({
  routine: routineProp,
  onOpenChange,
  onChange,
}: {
  routine: Routine | null;
  onOpenChange: (open: boolean) => void;
  onChange: (periods: FreezePeriod[]) => void;
}) {
  const routine = useRetained(routineProp);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FreezePeriod>({ startDate: "", endDate: "", reason: "" });
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const today = useToday();

  const periods = (routine?.freezePeriods ?? [])
    .map((p, originalIndex) => ({ ...p, originalIndex }))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  const replaceAt = (index: number, next: FreezePeriod | null) => {
    const all = [...(routine?.freezePeriods ?? [])];
    if (next) all[index] = next;
    else all.splice(index, 1);
    onChange(all);
  };

  return (
    <>
      <Dialog open={!!routineProp} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Snowflake className="size-5 text-info" /> Riwayat Freeze
            </DialogTitle>
            <DialogDescription className="truncate">{routine?.title}</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60svh] flex-col gap-2 overflow-y-auto pr-1">
            {periods.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground italic">Belum ada data pembekuan.</p>
            )}
            {periods.map((p) => {
              const start = parseLocalYMD(p.startDate);
              const end = parseLocalYMD(p.endDate);
              const isActive = isPeriodActiveOn(p, today);
              const isValid = start <= end;

              if (editingIndex === p.originalIndex) {
                return (
                  <form
                    key={p.originalIndex}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editForm.endDate < editForm.startDate || !editForm.reason.trim()) return;
                      replaceAt(p.originalIndex, editForm);
                      setEditingIndex(null);
                    }}
                    className="flex flex-col gap-3 rounded-2xl border border-info/40 bg-muted/40 p-3"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        required
                        value={editForm.startDate}
                        onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                      />
                      <Input
                        type="date"
                        required
                        value={editForm.endDate}
                        onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                      />
                    </div>
                    <Input
                      required
                      value={editForm.reason}
                      onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                    />
                    <OverlapWarning
                      overlaps={overlappingFreezes(routine?.freezePeriods ?? [], editForm, p.originalIndex)}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => setEditingIndex(null)}
                      >
                        Batal
                      </Button>
                      <Button type="submit" size="sm" className="flex-1">
                        Simpan
                      </Button>
                    </div>
                  </form>
                );
              }

              return (
                <div
                  key={p.originalIndex}
                  className={cn(
                    "group relative rounded-2xl border p-3 transition-colors",
                    isActive ? "border-info/40 bg-info/10" : "bg-card hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 pr-16">
                    <span className={cn("text-xs font-bold", isActive && "text-info")}>
                      {isValid ? (
                        `${formatDayMonth(start)} - ${formatShortDate(end)}`
                      ) : (
                        <span className="line-through opacity-60">{formatDayMonth(start)} (Dibatalkan)</span>
                      )}
                    </span>
                    {isActive && <Badge className="bg-info text-info-foreground">Aktif</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground italic">"{p.reason}"</p>
                  <div className="absolute top-2 right-2 flex gap-0.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Edit"
                      onClick={() => {
                        setEditingIndex(p.originalIndex);
                        setEditForm({ startDate: p.startDate, endDate: p.endDate, reason: p.reason });
                      }}
                    >
                      <PencilLine />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Hapus"
                      className="hover:text-destructive"
                      onClick={() => setDeleteIndex(p.originalIndex)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteIndex !== null}
        onOpenChange={(open) => !open && setDeleteIndex(null)}
        title="Hapus Riwayat Freeze?"
        description="Data pembekuan rutinitas ini akan dihapus permanen. Performa rutinitas di masa lalu mungkin akan terpengaruh."
        confirmLabel="Konfirmasi Hapus"
        onConfirm={() => {
          if (deleteIndex !== null) replaceAt(deleteIndex, null);
          setDeleteIndex(null);
        }}
      />
    </>
  );
}

/** Peringatan periode freeze yang beririsan (tetap boleh disimpan; periode beririsan tidak mengubah hasil). */
function OverlapWarning({ overlaps }: { overlaps: FreezePeriod[] }) {
  if (overlaps.length === 0) return null;
  return (
    <div className="flex gap-2 rounded-xl bg-warning/15 p-3 text-xs text-warning-foreground dark:text-warning">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <p>
        Beririsan dengan freeze lain:{" "}
        {overlaps
          .map((p) => `${formatDayMonth(parseLocalYMD(p.startDate))} – ${formatShortDate(parseLocalYMD(p.endDate))}`)
          .join(", ")}
        . Pertimbangkan mengubah periode yang sudah ada.
      </p>
    </div>
  );
}
