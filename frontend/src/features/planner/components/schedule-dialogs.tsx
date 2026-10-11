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
import { useAiNotes, useResources, useSchedules } from "@/data/collections";
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
import { isSchedulePast, scheduleEnd, scheduleStart, scheduleTimeLabel } from "../lib/planner-logic";
import { scheduleTypeStyle } from "../lib/schedule-style";
import { useAgendaTypeList } from "../use-agenda-types";
import { emptySchedule, type ReleasedFiles, ScheduleFormDialog } from "./schedule-form";
import { AccessScope } from "@/components/common/access-scope";
import { CommentsPanel } from "@/features/sharing/comments-panel";
import { ShareButton } from "@/features/sharing/share-dialog";
import { SharedBadge } from "@/features/sharing/shared-badge";
import { itemAccess } from "@/lib/sharing";

/** Tag konteks saat lampiran agenda disimpan ke Resource global. */
const GLOBAL_TAG = "Agenda";

/**
 * Dialog agenda yang dikendalikan URL — pasang sekali di halaman yang menampilkan agenda (Overview, Planner Harian,
 * Jadwal):
 * - `?agenda=<id>` → tampilan **lihat** (link meeting bisa diklik, dasar pelaksanaan, hasil agenda)
 * - `?agenda=new`  → form agenda baru pada `defaultDate`
 * - `?edit=<id>`   → form ubah (tanpa izin ubah — agenda yang dibagikan dengan izin Lihat/Komentar — diarahkan ke tampilan lihat; `?edit=new` = agenda baru)
 */
export function ScheduleDialogs({ defaultDate }: { defaultDate?: string }) {
  const { items: schedules, upsert } = useSchedules();
  const { setItems: setResources } = useResources();
  const { names: agendaTypes } = useAgendaTypeList();
  const { canEdit } = usePermissions();
  const [agendaParam] = useSearchParam("agenda");
  const [editParam] = useSearchParam("edit");
  const setParams = useSetSearchParams();
  const cleanup = useAttachmentCleanup();

  // Agenda milik user lain tanpa izin edit (berbagi) dibuka sebagai tampilan lihat
  const editTarget = editParam && editParam !== "new" ? schedules.find((s) => s.id === editParam) : undefined;
  const canEditTarget = canEdit && (!editTarget || itemAccess(editTarget).canEdit);
  const viewId = agendaParam && agendaParam !== "new" ? agendaParam : !canEditTarget ? editParam : null;
  const viewing = viewId ? (schedules.find((s) => s.id === viewId) ?? null) : null;
  const editing: Schedule | null = !canEditTarget
    ? null
    : agendaParam === "new" || editParam === "new"
      ? emptySchedule(agendaTypes[0] ?? "Meeting", defaultDate)
      : editParam
        ? (schedules.find((s) => s.id === editParam) ?? null)
        : null;

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
        onOpenChange={(open) => !open && setParams({ agenda: null })}
        onEdit={(id) => setParams({ agenda: null, edit: id })}
        onChange={save}
      />
      <AccessScope item={editing}>
        <ScheduleFormDialog
          schedule={editing}
          agendaTypes={agendaTypes}
          onOpenChange={(open) => !open && setParams({ agenda: null, edit: null })}
          onSave={(schedule, released: ReleasedFiles[]) => {
            save(schedule);
            // Berkas yang dilepas di form: hapus / jadikan Resource global sesuai pilihan user
            for (const r of released)
              cleanup.release(r.files, r.keepIds, { contextTag: GLOBAL_TAG, ownerId: schedule.userId });
            // Setelah disimpan tampilkan hasilnya
            setParams({ agenda: schedule.id, edit: null });
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
  onChange,
}: ScheduleDetailDialogProps & { schedule: Schedule }) {
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
  const mediaHref = toExternalHref(schedule.media);
  const linkedNotes = aiNotes.filter((n) => n.linkedScheduleId === schedule.id);

  const update = (values: Partial<Schedule>) => onChange({ ...schedule, ...values });
  const goto = (path: string) => {
    onOpenChange(false);
    void navigate(path);
  };

  const copyMedia = async () => {
    try {
      await navigator.clipboard.writeText(mediaHref ?? schedule.media ?? "");
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
          <InfoRow icon={MapPin} label="Lokasi">
            {schedule.location || <span className="text-muted-foreground">-</span>}
          </InfoRow>
          <InfoRow icon={Video} label="Link Meeting / Media">
            {schedule.media ? (
              <span className="flex flex-wrap items-center gap-2">
                {mediaHref ? (
                  <Button size="sm" className="h-7" asChild>
                    <a href={mediaHref} target="_blank" rel="noopener noreferrer">
                      <ExternalLink /> Buka Link
                    </a>
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" className="h-7" onClick={() => void copyMedia()}>
                  <Copy /> Salin
                </Button>
                <span className="w-full truncate text-xs text-muted-foreground" title={schedule.media}>
                  {schedule.media}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </InfoRow>
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
        <ShareButton item={schedule} recordType="schedule" title={schedule.title} className="sm:mr-auto" />
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Tutup
        </Button>
        {canEdit && (
          <Button onClick={() => onEdit(schedule.id)}>
            <PencilLine /> Ubah Agenda
          </Button>
        )}
      </DialogFooter>

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
