import {
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock,
  Copy,
  ExternalLink,
  FolderOpen,
  MapPin,
  PencilLine,
  Sparkles,
  Video,
  Layers,
  Repeat,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  Undo2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { useActivities, useAiNotes, useProjects, useResources, useSchedules } from "@/data/collections";
import { paraParentOf } from "@/features/productivity/lib/para";
import { AddAttachmentButton, AttachmentForm } from "@/features/resources/attachment-form";
import { AttachmentTable } from "@/features/resources/attachment-table";
import { ResourceAiDialog } from "@/features/resources/resource-ai-dialog";
import { ownedFiles } from "@/features/resources/attachment-cleanup";
import { DeleteWithFilesDialog } from "@/features/resources/delete-with-files-dialog";
import { mergeIntoGlobalResources } from "@/features/resources/resource-utils";
import { useAttachmentCleanup } from "@/features/resources/use-attachment-cleanup";
import { usePermissions } from "@/hooks/use-permissions";
import { useRetained } from "@/hooks/use-retained";
import { useSearchParam, useSetSearchParams } from "@/hooks/use-search-param";
import { useToday } from "@/hooks/use-today";
import { links } from "@/lib/deep-links";
import { formatFullDate, formatLocalYMD, formatShortDate, parseLocalYMD } from "@/lib/dates";
import { toExternalHref } from "@/lib/urls";
import { cn } from "@/lib/utils";
import type { AttachedResource, Schedule } from "@/types/entities";
import {
  isSchedulePast,
  linkLabel,
  scheduleEnd,
  scheduleLinks,
  scheduleStart,
  scheduleTimeLabel,
} from "../lib/planner-logic";
import { describeRecurrence, seriesPosition } from "../lib/recurrence";
import { lastReschedule, originalSlot, revertReschedule } from "../lib/reschedule";
import { RescheduleDialog } from "./reschedule-dialog";
import { scheduleTypeStyle } from "../lib/schedule-style";
import { useAgendaTypeList } from "../use-agenda-types";
import { emptySchedule, type ReleasedFiles, ScheduleFormDialog } from "./schedule-form";
import { planSeriesSave, seriesMembers, type SeriesScope } from "../lib/recurrence";
import { AccessScope } from "@/components/common/access-scope";
import { CommentsPanel } from "@/features/sharing/comments-panel";
import { ShareButton } from "@/features/sharing/share-dialog";
import { SharedBadge } from "@/features/sharing/shared-badge";
import { itemAccess } from "@/lib/sharing";

/** Tag konteks saat lampiran agenda disimpan ke Resource global. */
const GLOBAL_TAG = "Agenda";

/** Cap waktu untuk ID pertemuan baru (helper modul — aturan purity oxlint). */
const nowStamp = () => Date.now();

/**
 * Dialog agenda yang dikendalikan URL — pasang sekali di halaman yang menampilkan agenda (Overview, Planner Harian,
 * Jadwal):
 * - `?agenda=<id>` → tampilan **lihat** (link meeting bisa diklik, dasar pelaksanaan, hasil agenda)
 * - `?agenda=new`  → form agenda baru pada `defaultDate` (`&agendaParent=<id>` → agenda milik Project / item Area)
 * - `?edit=<id>`   → form ubah (tanpa izin ubah — agenda yang dibagikan dengan izin Lihat/Komentar — diarahkan ke tampilan lihat; `?edit=new` = agenda baru)
 */
export function ScheduleDialogs({ defaultDate }: { defaultDate?: string }) {
  const { items: schedules, upsert, setItems: setSchedules } = useSchedules();
  const { setItems: setResources } = useResources();
  const { names: agendaTypes } = useAgendaTypeList();
  const { canEdit } = usePermissions();
  const [agendaParam] = useSearchParam("agenda");
  const [editParam] = useSearchParam("edit");
  const [parentParam] = useSearchParam("agendaParent");
  // ?series=<seriesId> (mis. dari Pengaturan → Berbagi) → pertemuan terdekat yang belum lewat, atau yang terakhir
  const [seriesParam] = useSearchParam("series");
  const today = formatLocalYMD(useToday());
  const seriesTarget = seriesParam
    ? (() => {
        const members = seriesMembers(schedules, seriesParam);
        return members.find((m) => scheduleEnd(m) >= today) ?? members.at(-1) ?? null;
      })()
    : null;
  const setParams = useSetSearchParams();
  const { items: projects } = useProjects();
  const { items: activities } = useActivities();
  // Agenda baru di Project/item Area milik user lain (berbagi, izin edit) dimiliki pemilik item itu
  const parentItem = parentParam
    ? (projects.find((p) => p.id === parentParam) ?? activities.find((a) => a.id === parentParam))
    : undefined;
  const cleanup = useAttachmentCleanup();

  // Agenda milik user lain tanpa izin edit (berbagi) dibuka sebagai tampilan lihat
  const editTarget = editParam && editParam !== "new" ? schedules.find((s) => s.id === editParam) : undefined;
  const canEditTarget = canEdit && (!editTarget || itemAccess(editTarget).canEdit);
  const viewId = agendaParam && agendaParam !== "new" ? agendaParam : !canEditTarget ? editParam : null;
  const viewing = viewId ? (schedules.find((s) => s.id === viewId) ?? null) : seriesTarget;
  const editing: Schedule | null = !canEditTarget
    ? null
    : agendaParam === "new" || editParam === "new"
      ? {
          ...emptySchedule(agendaTypes[0] ?? "Meeting", defaultDate),
          ...(parentParam ? { projectId: parentParam } : {}),
          ...(parentItem?.share ? { userId: parentItem.userId } : {}),
        }
      : editParam
        ? (schedules.find((s) => s.id === editParam) ?? null)
        : null;

  /**
   * Simpan dari form. Agenda berulang (baru / bagian seri) → rencana seri: pertemuan dibuat, diperbarui, atau dihapus
   * sesuai cakupan. Berkas hasil dari pertemuan yang terhapus dipertahankan sebagai Resource global (tanpa kehilangan
   * data); berkas dasar yang masih dipakai pertemuan lain dilindungi oleh `useAttachmentCleanup`.
   */
  const saveFromForm = (schedule: Schedule, released: ReleasedFiles[], scope: SeriesScope) => {
    const original = schedules.find((s) => s.id === schedule.id) ?? null;
    if (!schedule.recurrence && !original?.seriesId) {
      save(schedule);
      for (const r of released)
        cleanup.release(r.files, r.keepIds, { contextTag: GLOBAL_TAG, ownerId: schedule.userId });
      return schedule.id;
    }
    const members = seriesMembers(schedules, original?.seriesId);
    const stamp = nowStamp();
    const plan = planSeriesSave(
      schedule,
      original,
      members,
      scope,
      (i) => `sch-${stamp}-${i}`,
      () => `series-${stamp}`,
    );
    const removeIds = new Set(plan.remove.map((s) => s.id));
    const byId = new Map(plan.upsert.map((s) => [s.id, s]));
    setSchedules((prev) => {
      const next = prev.filter((s) => !removeIds.has(s.id)).map((s) => byId.get(s.id) ?? s);
      const existing = new Set(prev.map((s) => s.id));
      return [...next, ...plan.upsert.filter((s) => !existing.has(s.id))];
    });
    const attachments = [...(schedule.resources ?? []), ...(schedule.results ?? [])];
    if (attachments.some((a) => a.addToGlobal)) {
      setResources((prev) => mergeIntoGlobalResources(prev, attachments, GLOBAL_TAG));
    }
    // Lampiran yang dilepas di form: pengecualian = lampiran lama semua pertemuan yang diperbarui (berkas yang masih
    // dirujuk pertemuan di luar cakupan tetap aman)
    const touched = members.filter((m) => byId.has(m.id) || removeIds.has(m.id));
    for (const r of released) {
      const uploadIds = new Set(r.files.map((f) => f.uploadId));
      const exclude = touched.flatMap((m) => (m.resources ?? []).filter((a) => uploadIds.has(a.uploadId)));
      cleanup.release(r.files, r.keepIds, {
        contextTag: GLOBAL_TAG,
        ownerId: schedule.userId,
        exclude: [...r.files, ...exclude],
      });
    }
    if (plan.remove.length) {
      const removedAttachments = plan.remove.flatMap((m) => [...(m.resources ?? []), ...(m.results ?? [])]);
      const files = ownedFiles(removedAttachments);
      cleanup.release(
        files,
        files.map((f) => f.id),
        {
          contextTag: GLOBAL_TAG,
          ownerId: schedule.userId,
          exclude: removedAttachments,
        },
      );
    }
    return schedule.id;
  };

  /** Simpan agenda + lampiran bertanda "Simpan ke Resource Global". */
  const save = (schedule: Schedule) => {
    upsert(schedule);
    const attachments = [...(schedule.resources ?? []), ...(schedule.results ?? [])];
    if (attachments.some((a) => a.addToGlobal)) {
      setResources((prev) => mergeIntoGlobalResources(prev, attachments, GLOBAL_TAG));
    }
  };

  return (
    <>
      <ScheduleDetailDialog
        schedule={viewing}
        canEdit={canEdit && itemAccess(viewing).canEdit}
        onOpenChange={(open) => !open && setParams({ agenda: null, series: null })}
        onEdit={(id) => setParams({ agenda: null, series: null, edit: id })}
        onOpen={(id) => setParams({ agenda: id, series: null })}
        onChange={save}
      />
      <AccessScope item={editing}>
        <ScheduleFormDialog
          schedule={editing}
          agendaTypes={agendaTypes}
          onOpenChange={(open) => !open && setParams({ agenda: null, edit: null, agendaParent: null })}
          seriesMembers={seriesMembers(schedules, editing?.seriesId)}
          onSave={(schedule, released, scope) => {
            const id = saveFromForm(schedule, released, scope);
            // Setelah disimpan tampilkan hasilnya
            setParams({ agenda: id, edit: null, agendaParent: null });
          }}
        />
      </AccessScope>
    </>
  );
}

interface ScheduleDetailDialogProps {
  /** null = tertutup */
  schedule: Schedule | null;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (id: string) => void;
  /** Buka agenda lain (pertemuan sebelumnya/berikutnya dalam seri) */
  onOpen: (id: string) => void;
  onChange: (schedule: Schedule) => void;
}

/** Tampilan detail agenda (read-only) + pengelolaan hasil agenda. */
function ScheduleDetailDialog({ schedule: scheduleProp, ...props }: ScheduleDetailDialogProps) {
  const schedule = useRetained(scheduleProp);
  return (
    <Dialog open={!!scheduleProp} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-3xl">
        {schedule && (
          <AccessScope item={schedule}>
            <ScheduleDetail key={schedule.id} schedule={schedule} {...props} />
          </AccessScope>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDetail({
  schedule,
  canEdit,
  onOpenChange,
  onEdit,
  onOpen,
  onChange,
}: ScheduleDetailDialogProps & { schedule: Schedule }) {
  const { items: allSchedules } = useSchedules();
  const series = seriesPosition(allSchedules, schedule);
  const [rescheduling, setRescheduling] = useState(false);
  const original = originalSlot(schedule);
  const latest = lastReschedule(schedule);
  const navigate = useNavigate();
  const { items: types } = useAgendaTypeList();
  const { items: aiNotes } = useAiNotes();
  const today = formatLocalYMD(useToday());
  const [addingResult, setAddingResult] = useState(false);
  const [outcome, setOutcome] = useState(schedule.outcome ?? "");
  const cleanup = useAttachmentCleanup();
  const [removingResult, setRemovingResult] = useState<AttachedResource | null>(null);
  const [aiTarget, setAiTarget] = useState<{ list: "resources" | "results"; item: AttachedResource } | null>(null);

  const start = scheduleStart(schedule);
  const end = scheduleEnd(schedule);
  const past = isSchedulePast(schedule, today);
  const status = past
    ? { label: "Selesai", className: "bg-muted text-muted-foreground" }
    : start <= today
      ? { label: start === end ? "Hari ini" : "Berlangsung", className: "bg-success/15 text-success" }
      : { label: "Akan datang", className: "bg-info/15 text-info" };
  const { icon: TypeIcon, className: typeClass } = scheduleTypeStyle(schedule.type, types);
  const mediaLinks = scheduleLinks(schedule);
  const linkedNotes = aiNotes.filter((n) => n.linkedScheduleId === schedule.id);
  // Agenda milik Project / item Area (Productivity)
  const { items: projects } = useProjects();
  const { items: activities } = useActivities();
  const parent = paraParentOf(schedule.projectId, projects, activities);
  const parentPath = parent
    ? parent.kind === "project"
      ? links.project(parent.project.id)
      : parent.activity.areaId
        ? links.area(parent.activity.areaId)
        : null
    : null;

  const update = (values: Partial<Schedule>) => onChange({ ...schedule, ...values });
  const goto = (path: string) => {
    onOpenChange(false);
    void navigate(path);
  };

  const copyMedia = async (link: string) => {
    try {
      await navigator.clipboard.writeText(toExternalHref(link) ?? link);
      toast.success("Link disalin.");
    } catch {
      toast.error("Gagal menyalin link.");
    }
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-start gap-3 pr-8">
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl shadow-md", typeClass)}>
            <TypeIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-xl leading-tight">{schedule.title}</DialogTitle>
            <DialogDescription className="mt-1 flex flex-wrap items-center gap-1.5">
              {schedule.type && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                  {schedule.type}
                </span>
              )}
              <Badge className={status.className}>{status.label}</Badge>
              {original && (
                <Badge className="bg-warning/15 text-warning-foreground dark:text-warning">
                  <CalendarClock /> Dijadwal ulang
                </Badge>
              )}
              <SharedBadge item={schedule} recordType="schedule" />
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="-mx-1 flex flex-1 flex-col gap-5 overflow-y-auto px-1">
        <div className="grid gap-3 rounded-2xl border bg-muted/30 p-4 text-sm sm:grid-cols-2">
          <InfoRow icon={CalendarDays} label="Tanggal">
            {formatFullDate(parseLocalYMD(start))}
            {start !== end && ` – ${formatShortDate(parseLocalYMD(end))}`}
          </InfoRow>
          <InfoRow icon={Clock} label="Waktu">
            {scheduleTimeLabel(schedule)}
          </InfoRow>
          {original && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 sm:col-span-2">
              <CalendarClock className="size-4 shrink-0 text-warning-foreground dark:text-warning" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-muted-foreground">
                  Jadwal semula{schedule.reschedules!.length > 1 ? ` · dipindah ${schedule.reschedules!.length}×` : ""}
                </span>
                <span className="font-medium">
                  {formatFullDate(parseLocalYMD(original.fromDate))}
                  {original.fromStartTime &&
                    ` · ${original.fromStartTime}${original.fromEndTime ? ` - ${original.fromEndTime}` : ""}`}
                </span>
                {latest?.reason && <span className="block text-xs text-muted-foreground">Alasan: {latest.reason}</span>}
              </span>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => {
                    onChange(revertReschedule(schedule));
                    toast.success("Agenda dikembalikan ke jadwal semula.");
                  }}
                >
                  <Undo2 /> Kembalikan
                </Button>
              )}
            </div>
          )}
          <InfoRow icon={MapPin} label="Lokasi">
            {schedule.location || <span className="text-muted-foreground">-</span>}
          </InfoRow>
          <InfoRow
            icon={Video}
            label={mediaLinks.length > 1 ? `Link Meeting / Media (${mediaLinks.length})` : "Link Meeting / Media"}
          >
            {mediaLinks.length ? (
              <ul className="flex flex-col gap-1.5">
                {mediaLinks.map((link, i) => {
                  const href = toExternalHref(link);
                  return (
                    <li key={`${link}-${i}`} className="flex min-w-0 items-center gap-1.5">
                      {href ? (
                        <Button size="sm" className="h-7 min-w-0 max-w-full justify-start" asChild>
                          <a href={href} target="_blank" rel="noopener noreferrer" title={link}>
                            <ExternalLink /> <span className="truncate">{linkLabel(link)}</span>
                          </a>
                        </Button>
                      ) : (
                        <span className="truncate text-sm" title={link}>
                          {link}
                        </span>
                      )}
                      <Button
                        size="icon-sm"
                        variant="outline"
                        className="shrink-0"
                        title="Salin link"
                        aria-label={`Salin ${link}`}
                        onClick={() => void copyMedia(link)}
                      >
                        <Copy />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </InfoRow>
          {series && schedule.recurrence && (
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <Repeat className="size-4 shrink-0 text-module" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-muted-foreground">Agenda Berulang</span>
                <span className="font-medium">
                  Pertemuan {series.index} dari {series.total} · {describeRecurrence(schedule.recurrence)}
                </span>
              </span>
              <span className="flex gap-1">
                <Button
                  size="icon-sm"
                  variant="outline"
                  title="Pertemuan sebelumnya"
                  aria-label="Pertemuan sebelumnya"
                  disabled={series.index <= 1}
                  onClick={() => onOpen(series.members[series.index - 2].id)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline"
                  title="Pertemuan berikutnya"
                  aria-label="Pertemuan berikutnya"
                  disabled={series.index >= series.total}
                  onClick={() => onOpen(series.members[series.index].id)}
                >
                  <ChevronRight />
                </Button>
              </span>
            </div>
          )}
          {parent && (
            <InfoRow icon={Layers} label={`Bagian dari ${parent.label}`}>
              {parentPath ? (
                <Button variant="link" className="h-auto p-0" onClick={() => goto(parentPath)}>
                  {parent.title}
                </Button>
              ) : (
                parent.title
              )}
            </InfoRow>
          )}
          {schedule.description && (
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-muted-foreground">Keterangan</p>
              <p className="mt-1 whitespace-pre-wrap">{schedule.description}</p>
            </div>
          )}
        </div>

        <section className="flex flex-col gap-3">
          <h4 className="flex items-center gap-2 text-sm font-bold">
            <FolderOpen className="size-4 text-module" /> Dasar Pelaksanaan
          </h4>
          <AttachmentTable
            resources={schedule.resources}
            emptyText={canEdit ? "Belum ada dasar pelaksanaan (opsional, tambahkan lewat Ubah)." : "Tidak ada."}
            onOpenAi={(item) => setAiTarget({ list: "resources", item })}
          />
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-module/25 bg-module-soft/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="flex items-center gap-2 text-sm font-bold">
                <ClipboardCheck className="size-4 text-module" /> Hasil Agenda
              </h4>
              <p className="text-xs text-muted-foreground">
                Ringkasan, catatan dari Notes Space, berkas, atau web link hasil agenda ini.
              </p>
            </div>
            {canEdit && !addingResult && (
              <AddAttachmentButton label="Tambah Hasil" onClick={() => setAddingResult(true)} />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground">Ringkasan Hasil</p>
            {canEdit ? (
              <>
                <Textarea
                  rows={3}
                  placeholder="Keputusan, tindak lanjut, poin penting..."
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                />
                {outcome !== (schedule.outcome ?? "") && (
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setOutcome(schedule.outcome ?? "")}>
                      Batal
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        update({ outcome: outcome.trim() });
                        toast.success("Ringkasan hasil disimpan.");
                      }}
                    >
                      <Check /> Simpan Ringkasan
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm whitespace-pre-wrap">
                {schedule.outcome || <span className="text-muted-foreground italic">Belum ada ringkasan.</span>}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground">Notes AI terhubung ({linkedNotes.length})</p>
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => goto(links.newAiNoteForSchedule(schedule.id))}
                >
                  <Sparkles /> Buat Notes AI
                </Button>
              )}
            </div>
            {linkedNotes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {linkedNotes.map((note) => (
                  <Button
                    key={note.id}
                    variant="secondary"
                    size="sm"
                    className="h-auto max-w-full justify-start py-1.5"
                    onClick={() => goto(links.note("ai", note.id))}
                  >
                    <Sparkles className="text-module" />
                    <span className="truncate">{note.title || "Tanpa judul"}</span>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Notes AI yang memilih agenda ini otomatis tampil di sini.
              </p>
            )}
          </div>

          {addingResult && (
            <AttachmentForm
              defaultDate={end}
              uploadContext="schedule-result"
              idPrefix="sr"
              types={["note", "file", "link", "existing"]}
              onCancel={() => setAddingResult(false)}
              onAdd={(att) => {
                update({ results: [...(schedule.results ?? []), att] });
                setAddingResult(false);
              }}
            />
          )}
          <AttachmentTable
            resources={schedule.results}
            emptyText="Belum ada lampiran hasil."
            onOpenAi={(item) => setAiTarget({ list: "results", item })}
            onRemove={
              canEdit
                ? (id) => {
                    const att = schedule.results?.find((r) => r.id === id);
                    if (!att) return;
                    // Lampiran berkas → konfirmasi (hapus berkas / pertahankan sebagai Resource global)
                    if (ownedFiles([att]).length) setRemovingResult(att);
                    else update({ results: (schedule.results ?? []).filter((r) => r.id !== id) });
                  }
                : undefined
            }
          />
          <DeleteWithFilesDialog
            open={!!removingResult}
            onOpenChange={(open) => !open && setRemovingResult(null)}
            title="Hapus Lampiran Hasil?"
            description="Lampiran dihapus dari hasil agenda"
            itemName={removingResult ? removingResult.name || removingResult.title : undefined}
            files={removingResult ? ownedFiles([removingResult]) : []}
            shared={removingResult ? cleanup.referenced([removingResult]) : undefined}
            onConfirm={(keepIds) => {
              const att = removingResult;
              if (!att) return;
              update({ results: (schedule.results ?? []).filter((r) => r.id !== att.id) });
              cleanup.release([att], keepIds, { contextTag: GLOBAL_TAG, ownerId: schedule.userId });
              setRemovingResult(null);
            }}
          />
        </section>
        <CommentsPanel recordType="schedule" item={schedule} />
      </div>

      <DialogFooter>
        <div className="flex flex-wrap gap-2 sm:mr-auto">
          <ShareButton
            item={schedule}
            recordType="schedule"
            title={schedule.title}
            label={schedule.seriesId ? "Bagikan Pertemuan" : "Bagikan"}
          />
          {schedule.seriesId && (
            // Seluruh seri (termasuk pertemuan yang ditambahkan nanti); hanya pemilik
            <ShareButton
              item={{ id: schedule.seriesId, share: schedule.share }}
              recordType="schedule_series"
              title={`${schedule.title} (seri)`}
              label="Bagikan Seri"
            />
          )}
        </div>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Tutup
        </Button>
        {canEdit && (
          <Button variant="outline" onClick={() => setRescheduling(true)}>
            <CalendarClock /> Jadwal Ulang
          </Button>
        )}
        {canEdit && (
          <Button onClick={() => onEdit(schedule.id)}>
            <PencilLine /> Ubah Agenda
          </Button>
        )}
      </DialogFooter>
      <RescheduleDialog
        schedule={rescheduling ? schedule : null}
        schedules={allSchedules}
        onOpenChange={(open) => !open && setRescheduling(false)}
        onSave={(next) => {
          onChange(next);
          setRescheduling(false);
          toast.success(`Agenda dipindah ke ${formatFullDate(parseLocalYMD(next.startDate ?? ""))}.`);
        }}
      />

      <ResourceAiDialog
        resource={aiTarget?.item ?? null}
        onOpenChange={(open) => !open && setAiTarget(null)}
        onSave={(id, summary) => {
          if (!aiTarget || !canEdit) return;
          const list = aiTarget.list;
          update({ [list]: (schedule[list] ?? []).map((r) => (r.id === id ? { ...r, aiSummary: summary } : r)) });
        }}
      />
    </>
  );
}

function InfoRow({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-module" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <div className="mt-0.5 font-medium">{children}</div>
      </div>
    </div>
  );
}
