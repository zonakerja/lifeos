import { CalendarDays, ClipboardCheck, Clock, FolderOpen, MapPin, Paperclip, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
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
import { useToday } from "@/hooks/use-today";
import { formatLocalYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Activity, Project, Schedule } from "@/types/entities";

/** Lampiran agenda (dasar pelaksanaan + hasil) untuk pembersihan berkas. */
const agendaAttachments = (s: Schedule) => [...(s.resources ?? []), ...(s.results ?? [])];

/**
 * Agenda milik Project / item Area (`Schedule.projectId`). Agenda tetap tampil di Planner; tampilan lihat (Hasil
 * Agenda) & form memakai `ScheduleDialogs` Planner lewat URL (`?agenda=<id>`, `?agenda=new&agendaParent=<id>`).
 */
export function AgendaList({ owner }: { owner: Project | Activity }) {
  const { items: schedules, setItems: setSchedules } = useSchedules();
  const { items: types } = useAgendaTypeList();
  const { canEdit } = usePermissions();
  const setParams = useSetSearchParams();
  const cleanup = useAttachmentCleanup();
  const today = formatLocalYMD(useToday());
  const [deleting, setDeleting] = useState<Schedule | null>(null);

  const agendas = schedules
    .filter((s) => s.projectId === owner.id)
    .sort((a, b) =>
      `${scheduleStart(a)} ${a.startTime ?? ""}`.localeCompare(`${scheduleStart(b)} ${b.startTime ?? ""}`),
    );
  const deletingFiles = deleting ? ownedFiles(agendaAttachments(deleting)) : [];

  return (
    <>
      <div className="flex-1 overflow-y-auto p-5 md:p-7">
        {agendas.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-module-soft text-module">
                <CalendarDays />
              </EmptyMedia>
              <EmptyDescription>Belum ada agenda. Agenda juga tampil di Planner.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {agendas.map((s) => {
              const { icon: TypeIcon, className: typeClass } = scheduleTypeStyle(s.type, types);
              const start = scheduleStart(s);
              const past = isSchedulePast(s, today);
              const status = past
                ? { label: "Selesai", className: "bg-muted text-muted-foreground" }
                : start <= today
                  ? {
                      label: start === scheduleEnd(s) ? "Hari ini" : "Berlangsung",
                      className: "bg-success/15 text-success",
                    }
                  : { label: "Akan datang", className: "bg-info/15 text-info" };
              const results = s.results?.length ?? 0;
              return (
                <li key={s.id} className="group flex items-start gap-3 rounded-2xl border bg-card p-4 hover:shadow-md">
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", typeClass)}>
                    <TypeIcon className="size-4" />
                  </span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setParams({ agenda: s.id }, { replace: false })}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold">{s.title}</span>
                      <Badge className={status.className}>{status.label}</Badge>
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        {/* Agenda multi-hari tampil sekali dengan rentang tanggalnya (di Planner tampil di setiap harinya) */}
                        <CalendarDays className="size-3" /> {scheduleDateRangeLabel(s)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" /> {scheduleTimeLabel(s)}
                      </span>
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
                      onClick={() => setDeleting(s)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {canEdit && (
        <div className="border-t p-4">
          <Button
            variant="secondary"
            className="h-12 w-full bg-module-soft text-module hover:bg-module/15"
            onClick={() => setParams({ agenda: "new", agendaParent: owner.id }, { replace: false })}
          >
            <Plus /> Tambah Agenda Baru
          </Button>
        </div>
      )}
      <DeleteWithFilesDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Agenda?"
        description="Agenda ini (termasuk hasilnya) akan dihapus permanen:"
        itemName={deleting?.title}
        files={deletingFiles}
        shared={deleting ? cleanup.referenced(agendaAttachments(deleting)) : undefined}
        onConfirm={(keepIds) => {
          if (deleting) {
            setSchedules((prev) => prev.filter((x) => x.id !== deleting.id));
            cleanup.release(deletingFiles, keepIds, {
              contextTag: "Agenda",
              exclude: agendaAttachments(deleting),
              ownerId: deleting.userId,
            });
          }
          setDeleting(null);
        }}
      />
    </>
  );
}
