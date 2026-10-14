import { AlertTriangle, CalendarClock } from "lucide-react";
import { type FormEvent, useState } from "react";
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
import { useRetained } from "@/hooks/use-retained";
import { formatFullDate, parseLocalYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Schedule } from "@/types/entities";
import {
  compareScheduleTime,
  isScheduleOnDate,
  scheduleStart,
  scheduleTime,
  scheduleTimeLabel,
} from "../lib/planner-logic";
import { applyReschedule, dayDiff, shiftYmd } from "../lib/reschedule";

/** Waktu perubahan (helper modul — aturan purity oxlint). */
const nowIso = () => new Date().toISOString();

const QUICK_SHIFTS = [
  { label: "−1 minggu", days: -7 },
  { label: "−1 hari", days: -1 },
  { label: "+1 hari", days: 1 },
  { label: "+1 minggu", days: 7 },
];

/** Dua rentang jam (HH:mm) beririsan; tanpa jam selesai dianggap 1 jam. */
const overlaps = (aStart?: string, aEnd?: string, bStart?: string, bEnd?: string) => {
  if (!aStart || !bStart) return false;
  const plusHour = (t: string) => `${String(Math.min(23, Number(t.slice(0, 2)) + 1)).padStart(2, "0")}${t.slice(2)}`;
  return aStart < (bEnd || plusHour(bStart)) && bStart < (aEnd || plusHour(aStart));
};

/**
 * Jadwal ulang satu agenda (dimajukan/dimundurkan) — untuk agenda biasa maupun satu pertemuan dalam seri berulang
 * (pertemuan lain & pola seri tidak berubah). `schedule` null = tertutup.
 */
export function RescheduleDialog({
  schedule: scheduleProp,
  schedules,
  onOpenChange,
  onSave,
}: {
  schedule: Schedule | null;
  /** Semua agenda (untuk menampilkan agenda lain di tanggal tujuan) */
  schedules: Schedule[];
  onOpenChange: (open: boolean) => void;
  onSave: (next: Schedule) => void;
}) {
  const schedule = useRetained(scheduleProp);
  return (
    <Dialog open={!!scheduleProp} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-5 text-module" /> Jadwal Ulang
          </DialogTitle>
          <DialogDescription className="truncate">{schedule?.title}</DialogDescription>
        </DialogHeader>
        {scheduleProp && schedule && (
          <RescheduleForm
            key={schedule.id}
            schedule={schedule}
            schedules={schedules}
            onCancel={() => onOpenChange(false)}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RescheduleForm({
  schedule,
  schedules,
  onCancel,
  onSave,
}: {
  schedule: Schedule;
  schedules: Schedule[];
  onCancel: () => void;
  onSave: (next: Schedule) => void;
}) {
  const currentDate = scheduleStart(schedule);
  const [date, setDate] = useState(currentDate);
  const [startTime, setStartTime] = useState(scheduleTime(schedule));
  const [endTime, setEndTime] = useState(schedule.endTime ?? "");
  const [reason, setReason] = useState("");

  const changed = date !== currentDate || startTime !== scheduleTime(schedule) || endTime !== (schedule.endTime ?? "");
  const shift = date ? dayDiff(currentDate, date) : 0;
  const others = date
    ? schedules.filter((s) => s.id !== schedule.id && isScheduleOnDate(s, date)).sort(compareScheduleTime)
    : [];
  const clash = (s: Schedule) =>
    !schedule.isAllDay && !s.isAllDay && overlaps(startTime, endTime, scheduleTime(s), s.endTime);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!date || !changed) return;
    onSave(applyReschedule(schedule, { startDate: date, startTime, endTime, reason }, nowIso()));
  };

  return (
    <form onSubmit={submit}>
      <FieldGroup className="gap-4">
        <div className="rounded-xl bg-muted/50 p-3 text-sm">
          <p className="text-xs font-semibold text-muted-foreground">Jadwal saat ini</p>
          <p className="font-medium">
            {formatFullDate(parseLocalYMD(currentDate))} · {scheduleTimeLabel(schedule)}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {QUICK_SHIFTS.map((q) => (
            <Button
              key={q.label}
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => setDate(shiftYmd(currentDate, q.days))}
            >
              {q.label}
            </Button>
          ))}
        </div>

        <Field>
          <FieldLabel htmlFor="resch-date">Tanggal Baru</FieldLabel>
          <Input id="resch-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {shift !== 0 && (
            <p className="text-xs text-module">
              {shift > 0 ? `Dimundurkan ${shift} hari` : `Dimajukan ${-shift} hari`}
            </p>
          )}
        </Field>

        {!schedule.isAllDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="resch-start">Jam Mulai</FieldLabel>
              <Input id="resch-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="resch-end">Jam Selesai</FieldLabel>
              <Input id="resch-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </Field>
          </div>
        )}

        <Field>
          <FieldLabel htmlFor="resch-reason">Alasan (Opsional)</FieldLabel>
          <Input
            id="resch-reason"
            placeholder="Contoh: Dosen berhalangan, diganti hari Kamis"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>

        {date && date !== currentDate && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-muted-foreground">
              Agenda lain pada {formatFullDate(parseLocalYMD(date))} ({others.length})
            </p>
            {others.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Tidak ada — tanggal ini kosong.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {others.slice(0, 5).map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs",
                      clash(s) && "border-warning/50 bg-warning/10",
                    )}
                  >
                    <span className="shrink-0 font-semibold">{s.isAllDay ? "All Day" : scheduleTimeLabel(s)}</span>
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    {clash(s) && (
                      <span className="flex shrink-0 items-center gap-1 font-semibold text-warning-foreground dark:text-warning">
                        <AlertTriangle className="size-3" /> Bentrok
                      </span>
                    )}
                  </li>
                ))}
                {others.length > 5 && <li className="text-xs text-muted-foreground">+{others.length - 5} lainnya</li>}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Batal
          </Button>
          <Button type="submit" disabled={!date || !changed}>
            <CalendarClock /> Jadwal Ulang
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}
