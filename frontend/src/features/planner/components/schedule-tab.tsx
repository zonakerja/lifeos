import { CalendarDays, CalendarRange, Clock, Eye, MapPin, PencilLine, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { PaginationControl } from "@/components/common/pagination-control";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSchedules } from "@/data/collections";
import { ownedFiles } from "@/features/resources/attachment-cleanup";
import { DeleteWithFilesDialog } from "@/features/resources/delete-with-files-dialog";
import { useAttachmentCleanup } from "@/features/resources/use-attachment-cleanup";
import { usePagination } from "@/hooks/use-pagination";
import { usePermissions } from "@/hooks/use-permissions";
import { useSearchParam, useSetSearchParams } from "@/hooks/use-search-param";
import { useToday } from "@/hooks/use-today";
import { formatDayMonth, formatLocalYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Schedule } from "@/types/entities";
import {
  filterSchedules,
  isSchedulePast,
  SCHEDULE_FILTER_LABELS,
  type ScheduleFilter,
  scheduleEnd,
  scheduleStart,
  scheduleTimeLabel,
} from "../lib/planner-logic";
import { scheduleTypeStyle } from "../lib/schedule-style";
import { useAgendaTypeList } from "../use-agenda-types";
import { ShareButton } from "@/features/sharing/share-dialog";
import { SharedBadge } from "@/features/sharing/shared-badge";
import { itemAccess } from "@/lib/sharing";
import { ScheduleDialogs } from "./schedule-dialogs";
import { MediaLink } from "./schedule-form";

const isScheduleFilter = (value: string | null): value is ScheduleFilter =>
  value === "upcoming" || value === "past" || value === "all";

export function ScheduleTab() {
  const { items: schedules, setItems } = useSchedules();
  const { items: types } = useAgendaTypeList();
  const { canEdit } = usePermissions();
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  // Dialog edit dikendalikan URL: ?edit=<id> | ?edit=new (mendukung deep link)
  // Dialog lihat/ubah agenda dikendalikan URL (?agenda=<id>|new, ?edit=<id>) — lihat ScheduleDialogs
  const setParams = useSetSearchParams();
  const cleanup = useAttachmentCleanup();
  // Semua lampiran agenda yang akan dihapus (dasar pelaksanaan + hasil); berkasnya ditawarkan untuk dipertahankan
  const deletingAttachments = deleting ? [...(deleting.resources ?? []), ...(deleting.results ?? [])] : [];
  const deletingFiles = ownedFiles(deletingAttachments);
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
          <Button onClick={() => setParams({ agenda: "new" })}>
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
                      <h4 className={cn("min-w-0 text-base font-bold", past && "text-muted-foreground")}>
                        <button
                          type="button"
                          className="max-w-full truncate text-left hover:text-module hover:underline"
                          onClick={() => setParams({ agenda: sch.id })}
                        >
                          {sch.title}
                        </button>
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
                      <SharedBadge item={sch} recordType="schedule" />
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
                <div className="flex justify-end gap-1 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Lihat detail"
                    onClick={() => setParams({ agenda: sch.id })}
                  >
                    <Eye />
                  </Button>
                  {canEdit && itemAccess(sch).canEdit && (
                    <Button variant="ghost" size="icon" title="Ubah" onClick={() => setParams({ edit: sch.id })}>
                      <PencilLine />
                    </Button>
                  )}
                  {/* Bagikan & hapus hanya oleh pemilik agenda */}
                  {canEdit && !sch.share && (
                    <>
                      <ShareButton item={sch} recordType="schedule" title={sch.title} iconOnly />
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Hapus"
                        className="hover:text-destructive"
                        onClick={() => setDeleting(sch)}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4">
        <PaginationControl {...controlProps} />
      </div>

      <ScheduleDialogs />
      <DeleteWithFilesDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Agenda?"
        description="Agenda beserta dasar pelaksanaan & hasilnya akan dihapus:"
        itemName={deleting?.title}
        files={deletingFiles}
        shared={deleting ? cleanup.referenced(deletingAttachments) : undefined}
        onConfirm={(keepIds) => {
          if (deleting) {
            setItems((prev) => prev.filter((s) => s.id !== deleting.id));
            cleanup.release(deletingFiles, keepIds, {
              contextTag: "Agenda",
              exclude: deletingAttachments,
              ownerId: deleting.userId,
            });
          }
          setDeleting(null);
        }}
      />
    </SectionCard>
  );
}
