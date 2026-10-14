import { FolderOpen, Link2, MapPin, PencilLine, Plus, Repeat } from "lucide-react";
import { type FormEvent, type RefObject, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LinkListInput } from "@/components/common/link-list-input";
import { AddAttachmentButton, AttachmentForm } from "@/features/resources/attachment-form";
import { AttachmentTable } from "@/features/resources/attachment-table";
import { ownedFiles } from "@/features/resources/attachment-cleanup";
import { DeleteWithFilesDialog } from "@/features/resources/delete-with-files-dialog";
import { useAttachmentCleanup } from "@/features/resources/use-attachment-cleanup";
import { useOpenSession, useRetained } from "@/hooks/use-retained";
import { addDays, formatLocalYMD, parseLocalYMD, todayYMD } from "@/lib/dates";
import { toExternalHref } from "@/lib/urls";
import { cn } from "@/lib/utils";
import type { AttachedResource, Schedule } from "@/types/entities";

/** Berkas lampiran yang dilepas dari agenda di form; dieksekusi (hapus / jadikan Resource global) setelah disimpan. */
export interface ReleasedFiles {
  files: AttachedResource[];
  keepIds: string[];
}
import { joinLinks, linkLabel, scheduleEnd, scheduleLinks, scheduleStart, scheduleTime } from "../lib/planner-logic";
import { planSeriesSave, sameRecurrence, type SeriesScope } from "../lib/recurrence";
import { RecurrenceFields, SeriesScopePicker } from "./recurrence-fields";

/** Tanggal selesai baru saat tanggal mulai diganti: durasi (selisih hari) dipertahankan. */
const shiftEnd = (oldStart = "", oldEnd = "", newStart: string) => {
  if (!newStart || !oldStart || !oldEnd || oldEnd < oldStart) return newStart;
  const span = Math.round((parseLocalYMD(oldEnd).getTime() - parseLocalYMD(oldStart).getTime()) / 86_400_000);
  return formatLocalYMD(addDays(parseLocalYMD(newStart), span));
};

/** ID agenda baru (helper modul: `Date.now()` tidak boleh dipanggil di badan komponen — aturan purity oxlint). */
const newScheduleId = () => `sch-${Date.now()}`;

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

/** Dialog tambah/ubah agenda (dipakai tab Jadwal & Harian). `schedule` null = tertutup. */
export function ScheduleFormDialog({
  schedule: scheduleProp,
  agendaTypes,
  onOpenChange,
  onSave,
  seriesMembers = [],
}: {
  schedule: Schedule | null;
  agendaTypes: string[];
  onOpenChange: (open: boolean) => void;
  onSave: (schedule: Schedule, released: ReleasedFiles[], scope: SeriesScope) => void;
  /** Anggota seri agenda yang sedang diubah (untuk pratinjau cakupan) */
  seriesMembers?: Schedule[];
}) {
  const schedule = useRetained(scheduleProp);
  // key per sesi buka & per agenda: form selalu mulai dari props (isi lama yang belum sempat unmount tidak dipakai ulang)
  const session = useOpenSession(!!scheduleProp);
  // Dipasang oleh form yang sedang terbuka: buang berkas yang diunggah tetapi tidak jadi disimpan
  const discardRef = useRef<(() => void) | null>(null);
  const close = () => {
    discardRef.current?.();
    onOpenChange(false);
  };
  return (
    <Dialog open={!!scheduleProp} onOpenChange={(open) => (open ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{schedule?.id ? "Ubah Agenda" : "Tambah Agenda"}</DialogTitle>
          <DialogDescription>Isi detail waktu, lokasi, media, dan dasar pelaksanaan agenda.</DialogDescription>
        </DialogHeader>
        {schedule && (
          <ScheduleForm
            key={`${session}:${schedule.id}`}
            schedule={schedule}
            agendaTypes={agendaTypes}
            onSave={onSave}
            onCancel={close}
            discardRef={discardRef}
            seriesMembers={seriesMembers}
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
  discardRef,
  seriesMembers,
}: {
  schedule: Schedule;
  agendaTypes: string[];
  onSave: (schedule: Schedule, released: ReleasedFiles[], scope: SeriesScope) => void;
  onCancel: () => void;
  discardRef: RefObject<(() => void) | null>;
  seriesMembers: Schedule[];
}) {
  const cleanup = useAttachmentCleanup();
  // Berkas yang diunggah di sesi form ini: dibuang bila form ditutup tanpa disimpan
  const sessionUploadsRef = useRef(new Set<string>());
  const savedRef = useRef(false);
  const [released, setReleased] = useState<ReleasedFiles[]>([]);
  const [removing, setRemoving] = useState<AttachedResource | null>(null);
  const discardUnsaved = () => {
    if (savedRef.current) return;
    cleanup.discardUploads([...sessionUploadsRef.current]);
    sessionUploadsRef.current.clear();
  };
  // Dipanggil dialog saat ditutup (Batal / X / Esc); unmount = cadangan (mis. navigasi yang menutup dialog)
  useEffect(() => {
    discardRef.current = discardUnsaved;
    return () => {
      discardUnsaved();
      discardRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dipasang sekali per form
  }, []);
  const [form, setForm] = useState<Schedule>(() => ({
    ...schedule,
    startDate: scheduleStart(schedule),
    endDate: scheduleEnd(schedule),
    startTime: scheduleTime(schedule),
    endTime: schedule.endTime || "",
    isAllDay: schedule.isAllDay || false,
  }));
  const isNew = !schedule.id;
  const [addingBasis, setAddingBasis] = useState(false);
  const [links, setLinks] = useState(() => scheduleLinks(schedule));
  const [linkDraft, setLinkDraft] = useState("");
  // Agenda yang sudah menjadi bagian seri → simpan menanyakan cakupan (ini / ini & berikutnya / semua)
  const [pending, setPending] = useState<Schedule | null>(null);
  const [scope, setScope] = useState<SeriesScope>("this");
  const inSeries = !!schedule.seriesId && !isNew;
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
    if (form.recurrence?.frequency === "weekly" && !form.recurrence.days?.length) {
      toast.error("Pilih minimal satu hari pengulangan.");
      return;
    }
    // Link yang masih diketik ikut disimpan
    const allLinks = [...links, ...linkDraft.split(/\s+/).filter(Boolean)];
    const result: Schedule = {
      ...form,
      title: form.title.trim(),
      endDate,
      media: joinLinks(allLinks),
      id: form.id || newScheduleId(),
    };
    if (inSeries) {
      // Pola diubah → "hanya ini" tidak tersedia
      const changed = !!result.recurrence && !sameRecurrence(schedule.recurrence, result.recurrence);
      setScope(changed ? "following" : "this");
      setPending(result);
      return;
    }
    savedRef.current = true;
    onSave(result, released, "all");
  };

  const confirmScope = () => {
    if (!pending) return;
    savedRef.current = true;
    onSave(pending, released, scope);
    setPending(null);
  };
  const patternChanged = !!pending?.recurrence && !sameRecurrence(schedule.recurrence, pending.recurrence);
  // Pratinjau: berapa pertemuan yang dibuat/dihapus dengan cakupan terpilih
  const preview = pending
    ? planSeriesSave(
        pending,
        schedule,
        seriesMembers,
        scope,
        (i) => `preview-${i}`,
        () => "preview",
      )
    : null;
  const created = preview ? preview.upsert.filter((x) => x.id.startsWith("preview-")).length : 0;
  const previewNote = preview
    ? [
        created ? `${created} pertemuan baru dibuat.` : "",
        preview.remove.length
          ? `${preview.remove.length} pertemuan dihapus${
              preview.remove.some((x) => x.results?.length) ? " (berkas hasilnya disimpan ke Resource Global)" : ""
            }.`
          : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

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
                  // Durasi tetap: tanggal selesai ikut bergeser bersama tanggal mulai
                  endDate: shiftEnd(form.startDate, form.endDate, e.target.value),
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

        <div className="grid gap-4">
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
        </div>

        <Field>
          <FieldLabel htmlFor="sch-media">Link Meeting / Media (Opsional, bisa lebih dari satu)</FieldLabel>
          <LinkListInput
            id="sch-media"
            value={links}
            onChange={setLinks}
            draft={linkDraft}
            onDraftChange={setLinkDraft}
          />
        </Field>

        <RecurrenceFields
          startDate={form.startDate ?? ""}
          value={form.recurrence}
          onChange={(recurrence) => patch({ recurrence })}
        />

        <Field>
          <FieldLabel htmlFor="sch-desc">Keterangan (Opsional)</FieldLabel>
          <Textarea
            id="sch-desc"
            rows={3}
            placeholder="Susunan acara, peserta, hal yang perlu disiapkan..."
            value={form.description ?? ""}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </Field>

        <div className="flex flex-col gap-3 rounded-2xl border bg-muted/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="flex items-center gap-2 text-sm font-bold">
                <FolderOpen className="size-4 text-module" /> Dasar Pelaksanaan
              </h4>
              <p className="text-xs text-muted-foreground">Opsional: undangan, surat tugas, nota dinas, dll.</p>
            </div>
            {!addingBasis && <AddAttachmentButton onClick={() => setAddingBasis(true)} />}
          </div>
          {addingBasis && (
            <AttachmentForm
              defaultDate={form.startDate}
              uploadContext="schedule"
              offerAiSummary
              idPrefix="sb"
              onCancel={() => setAddingBasis(false)}
              onAdd={(att) => {
                if (att.uploadId && !att.existingId) sessionUploadsRef.current.add(att.uploadId);
                patch({ resources: [...(form.resources ?? []), att] });
                setAddingBasis(false);
              }}
            />
          )}
          <AttachmentTable
            resources={form.resources}
            emptyText="Belum ada dasar pelaksanaan."
            onRemove={(id) => {
              const att = form.resources?.find((r) => r.id === id);
              if (!att) return;
              const dropAttachment = () => patch({ resources: (form.resources ?? []).filter((r) => r.id !== id) });
              if (att.uploadId && sessionUploadsRef.current.has(att.uploadId)) {
                // Baru diunggah di form ini (belum pernah tersimpan) → langsung dibuang
                sessionUploadsRef.current.delete(att.uploadId);
                cleanup.discardUploads([att.uploadId]);
                dropAttachment();
              } else if (ownedFiles([att]).length) {
                setRemoving(att); // tanya: hapus berkas atau pertahankan sebagai Resource global
              } else {
                dropAttachment();
              }
            }}
          />
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
      <Dialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Repeat className="size-5 text-module" /> Ubah Agenda Berulang
            </DialogTitle>
            <DialogDescription>Terapkan perubahan ke pertemuan mana saja?</DialogDescription>
          </DialogHeader>
          <SeriesScopePicker
            value={scope}
            onChange={setScope}
            disabled={patternChanged ? ["this"] : []}
            note={[
              patternChanged
                ? "Perubahan pola pengulangan berlaku untuk pertemuan ini & seterusnya, atau seluruh seri."
                : "",
              previewNote,
            ]
              .filter(Boolean)
              .join(" ")}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPending(null)}>
              Batal
            </Button>
            <Button type="button" onClick={confirmScope}>
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeleteWithFilesDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Lepas Lampiran?"
        description="Lampiran dilepas dari agenda saat agenda disimpan. Berkas:"
        itemName={removing ? removing.name || removing.title : undefined}
        files={removing ? ownedFiles([removing]) : []}
        shared={removing ? cleanup.referenced([removing]) : undefined}
        confirmLabel="Lepas"
        onConfirm={(keepIds) => {
          const att = removing;
          if (!att) return;
          setReleased((prev) => [...prev, { files: [att], keepIds }]);
          patch({ resources: (form.resources ?? []).filter((r) => r.id !== att.id) });
          setRemoving(null);
        }}
      />
    </form>
  );
}

/** Satu link media agenda (label = host); link yang bukan http/https ditampilkan sebagai teks biasa. */
export function MediaLink({ media }: { media: string }) {
  const label = linkLabel(media);
  const href = toExternalHref(media);
  const className =
    "inline-flex max-w-full items-center gap-1 truncate rounded-md bg-info/10 px-2 py-1 text-xs text-info";
  if (!href) {
    return (
      <span className={className} title={media}>
        <Link2 className="size-3 shrink-0" /> {label}
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={media} className={cn(className, "hover:underline")}>
      <Link2 className="size-3 shrink-0" /> {label}
    </a>
  );
}
