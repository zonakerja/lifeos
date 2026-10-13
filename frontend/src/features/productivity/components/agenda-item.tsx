import { CalendarDays, ClipboardCheck, Clock, FolderOpen, MapPin, Paperclip, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSchedules } from "@/data/collections";
import {
  isSchedulePast,
  scheduleDateRangeLabel,
  scheduleEnd,
  scheduleStart,
  scheduleTimeLabel,
} from "@/features/planner/lib/planner-logic";
import { scheduleTypeStyle } from "@/features/planner/lib/schedule-style";
import { useAgendaTypeList } from "@/features/planner/use-agenda-types";
import { ownedFiles } from "@/features/resources/attachment-cleanup";
import { DeleteWithFilesDialog } from "@/features/resources/delete-with-files-dialog";
import { useAttachmentCleanup } from "@/features/resources/use-attachment-cleanup";
import { usePermissions } from "@/hooks/use-permissions";
import { useSetSearchParams } from "@/hooks/use-search-param";
import { useRetained } from "@/hooks/use-retained";
import { cn } from "@/lib/utils";
import type { Schedule } from "@/types/entities";

/** Tag pembeda jenis item di daftar & timeline Project/Area (sejalan dengan action/task). */
export const ITEM_TAG_STYLE = {
  task: "bg-success/15 text-success",
  agenda: "bg-info/15 text-info",
} as const;

/** Lampiran agenda (dasar pelaksanaan + hasil) untuk pembersihan berkas. */
const agendaAttachments = (s: Schedule) => [...(s.resources ?? []), ...(s.results ?? [])];

/**
 * Agenda milik Project / item Area (`Schedule.projectId`) sebagai satu baris di daftar gabungan action/task + agenda.
 * Agenda tetap tampil di Planner; tampilan lihat (Hasil Agenda) & form memakai `ScheduleDialogs` Planner lewat URL
 * (`?agenda=<id>`, `?agenda=new&agendaParent=<id>`). Agenda multi-hari tampil sekali dengan rentang tanggalnya.
 */
export function AgendaItem({
  schedule: s,
  today,
  onDelete,
}: {
  schedule: Schedule;
  /** YMD hari ini (status agenda) */
  today: string;
  onDelete: (schedule: Schedule) => void;
}) {
  const { items: types } = useAgendaTypeList();
  const { canEdit } = usePermissions();
  const setParams = useSetSearchParams();
  const { icon: TypeIcon, className: typeClass } = scheduleTypeStyle(s.type, types);
  const start = scheduleStart(s);
  const status = isSchedulePast(s, today)
    ? { label: "Selesai", className: "bg-muted text-muted-foreground" }
    : start <= today
      ? { label: start === scheduleEnd(s) ? "Hari ini" : "Berlangsung", className: "bg-success/15 text-success" }
      : { label: "Akan datang", className: "bg-info/15 text-info" };
  const results = s.results?.length ?? 0;

  return (
    <li className="group flex items-start gap-3 rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md">
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-lg", typeClass)}>
        <TypeIcon className="size-3.5" />
      </span>
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => setParams({ agenda: s.id }, { replace: false })}
      >
        <span className="flex flex-wrap items-center gap-2">
          <Badge className={ITEM_TAG_STYLE.agenda}>Agenda</Badge>
          <span className="truncate text-sm font-bold">{s.title}</span>
          <Badge className={status.className}>{status.label}</Badge>
        </span>
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3" /> {scheduleDateRangeLabel(s)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" /> {scheduleTimeLabel(s)}
          </span>
          {s.type && <span>{s.type}</span>}
          {s.location && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" /> {s.location}
            </span>
          )}
          {!!s.resources?.length && (
            <span className="flex items-center gap-1">
              <FolderOpen className="size-3" /> {s.resources.length} dasar pelaksanaan
            </span>
          )}
          {(results > 0 || s.outcome) && (
            <span className="flex items-center gap-1 font-medium text-success">
              <ClipboardCheck className="size-3" /> Hasil
              {results > 0 && (
                <>
                  : <Paperclip className="size-3" /> {results}
                </>
              )}
              {s.outcome && " · ringkasan"}
            </span>
          )}
        </span>
      </button>
      {canEdit && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Hapus agenda"
          className="hover:text-destructive pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100"
          onClick={() => onDelete(s)}
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

/** Konfirmasi hapus agenda beserta berkas lampirannya (dasar pelaksanaan & hasil). */
export function AgendaDeleteDialog({
  schedule: scheduleProp,
  onOpenChange,
}: {
  schedule: Schedule | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { setItems: setSchedules } = useSchedules();
  const cleanup = useAttachmentCleanup();
  const deleting = useRetained(scheduleProp);
  const files = deleting ? ownedFiles(agendaAttachments(deleting)) : [];
  return (
    <DeleteWithFilesDialog
      open={!!scheduleProp}
      onOpenChange={onOpenChange}
      title="Hapus Agenda?"
      description="Agenda ini (termasuk hasilnya) akan dihapus permanen:"
      itemName={deleting?.title}
      files={files}
      shared={deleting ? cleanup.referenced(agendaAttachments(deleting)) : undefined}
      onConfirm={(keepIds) => {
        if (deleting) {
          setSchedules((prev) => prev.filter((x) => x.id !== deleting.id));
          cleanup.release(files, keepIds, {
            contextTag: "Agenda",
            exclude: agendaAttachments(deleting),
            ownerId: deleting.userId,
          });
        }
        onOpenChange(false);
      }}
    />
  );
}
