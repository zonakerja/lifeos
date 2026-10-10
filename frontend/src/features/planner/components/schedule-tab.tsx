import { CalendarDays, CalendarRange, Clock, Link2, MapPin, PencilLine, Plus, Trash2, Video } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSchedules } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import { useSearchParam } from "@/hooks/use-search-param";
import { formatDayMonth, todayYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Schedule } from "@/types/entities";
import { scheduleEnd, scheduleStart, scheduleTime, scheduleTimeLabel } from "../lib/planner-logic";
import { scheduleTypeStyle } from "../lib/schedule-style";
import { useAgendaTypeList } from "../use-agenda-types";
import { useRetained } from "@/hooks/use-retained";

const emptySchedule = (type: string): Schedule => ({
  id: "",
  title: "",
  startDate: todayYMD(),
  endDate: todayYMD(),
  startTime: "",
  endTime: "",
  isAllDay: false,
  type,
  location: "",
  media: "",
});

export function ScheduleTab() {
  const { items: schedules, setItems, upsert } = useSchedules();
  const { names: agendaTypes } = useAgendaTypeList();
  const { canEdit } = usePermissions();
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  // Dialog edit dikendalikan URL: ?edit=<id> | ?edit=new (mendukung deep link)
  const [editId, setEditId] = useSearchParam("edit");
  const editing: Schedule | null =
    editId === "new" ? emptySchedule(agendaTypes[0] ?? "Meeting") : (schedules.find((s) => s.id === editId) ?? null);

  const sorted = useMemo(
    () => [...schedules].sort((a, b) => new Date(scheduleStart(a)).getTime() - new Date(scheduleStart(b)).getTime()),
    [schedules],
  );

  return (
    <SectionCard
      icon={CalendarRange}
      title="Agenda"
      description="Atur janji temu dan kegiatan berwaktu."
      action={
        canEdit && (
          <Button onClick={() => setEditId("new")}>
            <Plus /> Tambah
          </Button>
        )
      }
    >
      {sorted.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="bg-module-soft text-module">
              <CalendarDays />
            </EmptyMedia>
            <EmptyTitle>Belum ada agenda</EmptyTitle>
            <EmptyDescription>Tambahkan agenda pertama Anda.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((sch) => {
            const start = scheduleStart(sch);
            const end = scheduleEnd(sch);
            const { icon: TypeIcon, className } = scheduleTypeStyle(sch.type);
            return (
              <li
                key={sch.id}
                className="group flex flex-col gap-4 rounded-2xl border bg-card p-4 transition-all hover:border-module/30 hover:shadow-md md:flex-row md:items-center md:justify-between"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    className={cn(
                      "flex size-12 shrink-0 rotate-3 items-center justify-center rounded-2xl shadow-lg transition-transform group-hover:rotate-0",
                      className,
                    )}
                  >
                    <TypeIcon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-base font-bold">{sch.title}</h4>
                      {sch.type && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                          {sch.type}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="size-3.5 text-module" />
                        {formatDayMonth(start)}
                        {start !== end && ` - ${formatDayMonth(end)}`}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-3.5 text-module" /> {scheduleTimeLabel(sch)}
                      </span>
                      {sch.location && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="size-3.5 text-module" /> {sch.location}
                        </span>
                      )}
                    </div>
                    {sch.media && (
                      <a
                        href={sch.media}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex max-w-full items-center gap-1 truncate rounded-md bg-info/10 px-2 py-1 text-xs text-info hover:underline"
                      >
                        <Link2 className="size-3 shrink-0" /> {sch.media}
                      </a>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex justify-end gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <Button variant="ghost" size="icon" title="Ubah" onClick={() => setEditId(sch.id)}>
                      <PencilLine />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Hapus"
                      className="hover:text-destructive"
                      onClick={() => setDeleting(sch)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ScheduleFormDialog
        schedule={editing}
        agendaTypes={agendaTypes}
        onOpenChange={(open) => !open && setEditId(null)}
        onSave={(schedule) => {
          upsert(schedule);
          setEditId(null);
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Jadwal?"
        description="Anda yakin ingin menghapus jadwal ini?"
        itemName={deleting?.title}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting) setItems((prev) => prev.filter((s) => s.id !== deleting.id));
          setDeleting(null);
        }}
      />
    </SectionCard>
  );
}

function ScheduleFormDialog({
  schedule: scheduleProp,
  agendaTypes,
  onOpenChange,
  onSave,
}: {
  schedule: Schedule | null;
  agendaTypes: string[];
  onOpenChange: (open: boolean) => void;
  onSave: (schedule: Schedule) => void;
}) {
  const schedule = useRetained(scheduleProp);
  return (
    <Dialog open={!!scheduleProp} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{schedule?.id ? "Ubah Agenda" : "Tambah Agenda"}</DialogTitle>
          <DialogDescription>Isi detail waktu, lokasi, dan media agenda.</DialogDescription>
        </DialogHeader>
        {schedule && (
          <ScheduleForm
            schedule={schedule}
            agendaTypes={agendaTypes}
            onSave={onSave}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleForm({
  schedule,
  agendaTypes,
  onSave,
  onCancel,
}: {
  schedule: Schedule;
  agendaTypes: string[];
  onSave: (schedule: Schedule) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Schedule>(() => ({
    ...schedule,
    startDate: scheduleStart(schedule),
    endDate: scheduleEnd(schedule),
    startTime: scheduleTime(schedule),
    endTime: schedule.endTime || "",
    isAllDay: schedule.isAllDay || false,
  }));
  const isNew = !schedule.id;
  const patch = (values: Partial<Schedule>) => setForm((prev) => ({ ...prev, ...values }));
  const typeOptions = form.type && !agendaTypes.includes(form.type) ? [...agendaTypes, form.type] : agendaTypes;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.startDate) {
      toast.error("Judul dan Tanggal Mulai wajib diisi.");
      return;
    }
    const endDate = !form.endDate || form.endDate < form.startDate ? form.startDate : form.endDate;
    onSave({ ...form, title: form.title.trim(), endDate, id: form.id || `sch-${Date.now()}` });
  };

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="sch-title">Nama Kegiatan</FieldLabel>
            <Input
              id="sch-title"
              placeholder="Contoh: Meeting Klien"
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>Tipe</FieldLabel>
            <Select value={form.type} onValueChange={(v) => patch({ type: v })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih tipe" />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="sch-start">Tanggal Mulai</FieldLabel>
            <Input
              id="sch-start"
              type="date"
              value={form.startDate}
              onChange={(e) =>
                patch({
                  startDate: e.target.value,
                  endDate: e.target.value > (form.endDate ?? "") ? e.target.value : form.endDate,
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sch-end">Tanggal Selesai (Opsional)</FieldLabel>
            <Input
              id="sch-end"
              type="date"
              min={form.startDate}
              value={form.endDate}
              onChange={(e) => patch({ endDate: e.target.value })}
            />
          </Field>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="sch-allday"
            checked={!!form.isAllDay}
            onCheckedChange={(c) => patch({ isAllDay: c === true })}
          />
          <Label htmlFor="sch-allday">Sepanjang Hari (All Day)</Label>
        </div>

        {!form.isAllDay && (
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="sch-start-time">Jam Mulai</FieldLabel>
              <Input
                id="sch-start-time"
                type="time"
                value={form.startTime}
                onChange={(e) => patch({ startTime: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="sch-end-time">Jam Selesai (Opsional)</FieldLabel>
              <Input
                id="sch-end-time"
                type="time"
                value={form.endTime}
                onChange={(e) => patch({ endTime: e.target.value })}
              />
            </Field>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="sch-location">Lokasi</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <MapPin />
              </InputGroupAddon>
              <InputGroupInput
                id="sch-location"
                placeholder="Kantor / Jakarta"
                value={form.location}
                onChange={(e) => patch({ location: e.target.value })}
              />
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="sch-media">Media / Link (Opsional)</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <Video />
              </InputGroupAddon>
              <InputGroupInput
                id="sch-media"
                placeholder="Link media"
                value={form.media}
                onChange={(e) => patch({ media: e.target.value })}
              />
            </InputGroup>
          </Field>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Batal
          </Button>
          <Button type="submit">
            {isNew ? <Plus /> : <PencilLine />} {isNew ? "Tambah" : "Update"}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}
