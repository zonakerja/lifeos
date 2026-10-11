import { CalendarDays, CalendarRange, Clock, Link2, MapPin, PencilLine, Plus, Trash2, Video } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PaginationControl } from "@/components/common/pagination-control";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSchedules } from "@/data/collections";
import { usePagination } from "@/hooks/use-pagination";
import { usePermissions } from "@/hooks/use-permissions";
import { useRetained } from "@/hooks/use-retained";
import { useSearchParam } from "@/hooks/use-search-param";
import { useToday } from "@/hooks/use-today";
import { formatDayMonth, formatLocalYMD, todayYMD } from "@/lib/dates";
import { toExternalHref } from "@/lib/urls";
import { cn } from "@/lib/utils";
import type { Schedule } from "@/types/entities";
import {
  filterSchedules,
  isSchedulePast,
  SCHEDULE_FILTER_LABELS,
  type ScheduleFilter,
  scheduleEnd,
  scheduleStart,
  scheduleTime,
  scheduleTimeLabel,
} from "../lib/planner-logic";
import { scheduleTypeStyle } from "../lib/schedule-style";
import { useAgendaTypeList } from "../use-agenda-types";

/** Agenda baru kosong; `date` (YYYY-MM-DD) default hari ini. */
export const emptySchedule = (type: string, date = todayYMD()): Schedule => ({
  id: "",
  title: "",
  startDate: date,
  endDate: date,
  startTime: "",
  endTime: "",
  isAllDay: false,
  type,
  location: "",
  media: "",
});

const isScheduleFilter = (value: string | null): value is ScheduleFilter =>
  value === "upcoming" || value === "past" || value === "all";

export function ScheduleTab() {
  const { items: schedules, setItems, upsert } = useSchedules();
  const { items: types, names: agendaTypes } = useAgendaTypeList();
  const { canEdit } = usePermissions();
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  // Dialog edit dikendalikan URL: ?edit=<id> | ?edit=new (mendukung deep link)
  const [editId, setEditId] = useSearchParam("edit");
  const editing: Schedule | null =
    editId === "new" ? emptySchedule(agendaTypes[0] ?? "Meeting") : (schedules.find((s) => s.id === editId) ?? null);
  // Filter waktu di URL: ?sub=upcoming|past|all (default akan datang)
  const [subParam, setSubParam] = useSearchParam("sub");
  const filter: ScheduleFilter = isScheduleFilter(subParam) ? subParam : "upcoming";

  const today = formatLocalYMD(useToday());
  const counts = useMemo(() => {
    const past = schedules.filter((s) => isSchedulePast(s, today)).length;
    return { upcoming: schedules.length - past, past, all: schedules.length };
  }, [schedules, today]);
  const filtered = useMemo(() => filterSchedules(schedules, filter, today), [schedules, filter, today]);
  const { pageItems, setPage, controlProps } = usePagination(filtered, 10);

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
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={2}
        value={filter}
        onValueChange={(v) => {
          if (!isScheduleFilter(v)) return;
          setSubParam(v === "upcoming" ? null : v);
          setPage(1);
        }}
        className="mb-4 flex-wrap"
      >
        {(Object.keys(SCHEDULE_FILTER_LABELS) as ScheduleFilter[]).map((key) => (
          <ToggleGroupItem
            key={key}
            value={key}
            className="gap-1.5 data-[state=on]:bg-module data-[state=on]:text-module-foreground"
          >
            {SCHEDULE_FILTER_LABELS[key]}
            <span className="rounded-md bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
              {counts[key]}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {filtered.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="bg-module-soft text-module">
              <CalendarDays />
            </EmptyMedia>
            <EmptyTitle>
              {filter === "past"
                ? "Belum ada agenda yang lewat"
                : filter === "upcoming"
                  ? "Tidak ada agenda mendatang"
                  : "Belum ada agenda"}
            </EmptyTitle>
            {filter !== "past" && <EmptyDescription>Tambahkan agenda baru untuk mulai merencanakan.</EmptyDescription>}
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {pageItems.map((sch) => {
            const start = scheduleStart(sch);
            const end = scheduleEnd(sch);
            const past = isSchedulePast(sch, today);
            const ongoing = !past && start <= today;
            const { icon: TypeIcon, className } = scheduleTypeStyle(sch.type, types);
            return (
              <li
                key={sch.id}
                className={cn(
                  "group flex flex-col gap-4 rounded-2xl border bg-card p-4 transition-all hover:border-module/30 hover:shadow-md md:flex-row md:items-center md:justify-between",
                  past && "bg-muted/40",
                )}
              >
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    className={cn(
                      "flex size-12 shrink-0 rotate-3 items-center justify-center rounded-2xl shadow-lg transition-transform group-hover:rotate-0",
                      className,
                      past && "opacity-60",
                    )}
                  >
                    <TypeIcon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className={cn("truncate text-base font-bold", past && "text-muted-foreground")}>
                        {sch.title}
                      </h4>
                      {sch.type && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                          {sch.type}
                        </span>
                      )}
                      {ongoing && (
                        <Badge className="bg-success/15 text-success">
                          {start === end ? "Hari ini" : "Berlangsung"}
                        </Badge>
                      )}
                      {past && <Badge variant="secondary">Selesai</Badge>}
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
                    {sch.media && <MediaLink media={sch.media} />}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex justify-end gap-1 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100">
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
      <div className="mt-4">
        <PaginationControl {...controlProps} />
      </div>

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

/** Dialog tambah/ubah agenda (dipakai tab Jadwal & Harian). `schedule` null = tertutup. */
export function ScheduleFormDialog({
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
    // Agenda satu hari: jam selesai tidak boleh sebelum jam mulai
    if (
      !form.isAllDay &&
      endDate === form.startDate &&
      form.startTime &&
      form.endTime &&
      form.endTime < form.startTime
    ) {
      toast.error("Jam selesai tidak boleh sebelum jam mulai.");
      return;
    }
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

/** Link media agenda; link yang bukan http/https ditampilkan sebagai teks biasa. */
function MediaLink({ media }: { media: string }) {
  const href = toExternalHref(media);
  const className =
    "mt-2 inline-flex max-w-full items-center gap-1 truncate rounded-md bg-info/10 px-2 py-1 text-xs text-info";
  if (!href) {
    return (
      <span className={className}>
        <Link2 className="size-3 shrink-0" /> {media}
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn(className, "hover:underline")}>
      <Link2 className="size-3 shrink-0" /> {media}
    </a>
  );
}
