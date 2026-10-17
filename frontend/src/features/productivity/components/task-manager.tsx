import { useGuardedClose } from "@/components/common/dialog-close-guard";
import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  Check,
  CheckSquare,
  Clock,
  ExternalLink,
  FileText,
  FolderOpen,
  List,
  Paperclip,
  PencilLine,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/common/date-range-filter";
import { SearchInput } from "@/components/common/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useProjectTasks, useResources, useSchedules } from "@/data/collections";
import { ownedFiles } from "@/features/resources/attachment-cleanup";
import { AddAttachmentButton, AttachmentForm } from "@/features/resources/attachment-form";
import { AttachmentTable } from "@/features/resources/attachment-table";
import { ResourceAiDialog } from "@/features/resources/resource-ai-dialog";
import { DeleteWithFilesDialog } from "@/features/resources/delete-with-files-dialog";
import { attachmentLabel, mergeIntoGlobalResources, openAttachment } from "@/features/resources/resource-utils";
import { useAttachmentCleanup } from "@/features/resources/use-attachment-cleanup";
import { CommentsPanel } from "@/features/sharing/comments-panel";
import { ShareButton } from "@/features/sharing/share-dialog";
import { SharedBadge } from "@/features/sharing/shared-badge";
import { usePermissions } from "@/hooks/use-permissions";
import { useToday } from "@/hooks/use-today";
import { completionPatch } from "@/lib/completion";
import { DEFAULT_DATE_FILTER, matchesDateFilter } from "@/lib/date-filter";
import { formatLocalYMD, formatNumericDate } from "@/lib/dates";
import { generateId } from "@/lib/ids";
import { cn } from "@/lib/utils";
import {
  scheduleDateRangeLabel,
  scheduleEnd,
  scheduleStart,
  scheduleTimeLabel,
} from "@/features/planner/lib/planner-logic";
import { useSetSearchParams } from "@/hooks/use-search-param";
import type { Activity, AttachedResource, Priority, Project, ProjectTask, Schedule } from "@/types/entities";
import { type AreaLevel, collapseAgendaSeries, completionDefaults } from "../lib/para";
import { projectTimeProgress, taskProgress } from "../lib/progress";
import { useAttachmentEdits } from "../use-attachment-edits";
import { AgendaDeleteDialog, AgendaItem, ITEM_TAG_STYLE } from "./agenda-item";
import { CompleteTaskDialog } from "./complete-task-dialog";

type TaskOwnerType = "Project" | AreaLevel;

interface TaskManagerProps {
  owner: Project | Activity;
  ownerType: TaskOwnerType;
  /** Konten tambahan di header (mis. jalur induk / daftar turunan item area) */
  headerExtra?: ReactNode;
}

const emptyTask = (): Omit<ProjectTask, "id" | "projectId"> => ({
  title: "",
  description: "",
  dueDate: "",
  priority: "medium",
  weight: 0,
  resources: [],
});

/** Pengelola Action (Project) / Task (Sub Area, Kegiatan, Sub Kegiatan) + Agenda milik item. */
export function TaskManager({ owner, ownerType, headerExtra }: TaskManagerProps) {
  const { items: tasks, setItems: setTasks } = useProjectTasks();
  const { canEdit } = usePermissions();
  const today = useToday();
  const [view, setView] = useState<"list" | "timeline">("list");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(DEFAULT_DATE_FILTER);
  const [editing, setEditing] = useState<ProjectTask | "new" | null>(null);
  const [deleting, setDeleting] = useState<ProjectTask | null>(null);
  const [completing, setCompleting] = useState<ProjectTask | null>(null);
  // Daftar gabungan action/task + agenda; tag pembeda bisa dipakai sebagai filter
  const [kindFilter, setKindFilter] = useState<"all" | "task" | "agenda">("all");
  const [deletingAgenda, setDeletingAgenda] = useState<Schedule | null>(null);
  const setParams = useSetSearchParams();
  const { items: schedules } = useSchedules();
  const cleanup = useAttachmentCleanup();

  const isProject = ownerType === "Project";
  const label = isProject ? "Action" : "Task";
  const contextTag = isProject ? "Project Action" : "Area Task";
  const deletingFiles = ownedFiles(deleting?.resources);
  const ownerTasks = tasks.filter((t) => t.projectId === owner.id);
  const ownerSchedules = schedules.filter((sc) => sc.projectId === owner.id);
  // Agenda berulang: satu baris per seri (pertemuan berikutnya) agar daftar & timeline tidak penuh; bisa dimatikan
  const [groupSeries, setGroupSeries] = useState(true);
  const hasSeries = ownerSchedules.some((sc) => sc.seriesId);
  const todayYmd = formatLocalYMD(today);
  const shownSchedules = (list: Schedule[]) => (groupSeries ? collapseAgendaSeries(list, todayYmd) : list);

  if (editing) {
    return (
      <TaskForm
        task={editing === "new" ? null : editing}
        label={label}
        withWeight={isProject}
        onCancel={() => setEditing(null)}
        onSave={(values) => {
          if (editing === "new") {
            setTasks((prev) => [
              ...prev,
              {
                id: generateId("pt"),
                projectId: owner.id,
                // Action/task di item milik user lain (berbagi, izin edit) dimiliki pemilik item itu
                ...(owner.share ? { userId: owner.userId } : {}),
                ...values,
                completed: false,
                createdAt: new Date().toISOString(),
              },
            ]);
          } else {
            setTasks((prev) => prev.map((t) => (t.id === editing.id ? { ...t, ...values } : t)));
          }
          setEditing(null);
        }}
      />
    );
  }

  const query = search.toLowerCase();
  // Action/task & agenda berjalan beriringan, urut tanggal (YMD + jam); tanpa tanggal di akhir
  const entries = [
    ...(kindFilter === "agenda" ? [] : ownerTasks)
      .filter((t) => !query || t.title.toLowerCase().includes(query))
      .filter((t) => matchesDateFilter(t.dueDate, dateFilter, today))
      .map((task) => ({ kind: "task" as const, key: `t-${task.id}`, sortKey: task.dueDate || "9999", task })),
    ...shownSchedules(
      (kindFilter === "task" ? [] : ownerSchedules)
        .filter((sc) => !query || sc.title.toLowerCase().includes(query))
        // Agenda multi-hari ikut bila tanggal mulai atau selesainya masuk rentang filter
        .filter(
          (sc) =>
            matchesDateFilter(scheduleStart(sc), dateFilter, today) ||
            matchesDateFilter(scheduleEnd(sc), dateFilter, today),
        ),
    ).map((schedule) => ({
      kind: "agenda" as const,
      key: `s-${schedule.id}`,
      sortKey: `${scheduleStart(schedule) || "9999"} ${schedule.startTime ?? ""}`,
      schedule,
    })),
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const updateTask = (id: string, values: Partial<ProjectTask>) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...values } : t)));

  const taskPct = taskProgress(ownerTasks);
  const totalWeight = ownerTasks.reduce((sum, t) => sum + (Number(t.weight) || 0), 0);
  const timePct = isProject ? projectTimeProgress(owner as Project, today) : 0;
  const ownerResources = (owner as Project).resources ?? [];

  // Render function (bukan komponen bersarang) agar tidak di-remount tiap render
  const renderTask = (task: ProjectTask, key: string) => (
    <li
      key={key}
      className={cn(
        "group flex flex-col rounded-2xl border p-4 transition-shadow hover:shadow-md",
        task.completed ? "bg-muted/50 opacity-70" : "bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          disabled={!canEdit}
          aria-label={task.completed ? "Tandai belum selesai" : "Tandai selesai"}
          // Centang → dialog isian (tanggal, prioritas, bobot); batal centang langsung
          onClick={() => (task.completed ? updateTask(task.id, completionPatch(false)) : setCompleting(task))}
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors",
            task.completed ? "border-success bg-success text-white" : "border-muted-foreground/40 hover:border-success",
          )}
        >
          {task.completed && <Check className="size-3.5" strokeWidth={4} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={ITEM_TAG_STYLE.task}>{label}</Badge>
            <h4 className={cn("text-sm font-bold", task.completed && "text-muted-foreground line-through")}>
              {task.title}
            </h4>
          </div>
          {task.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>}
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {task.dueDate && (
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3" /> {formatNumericDate(task.dueDate)}
              </span>
            )}
            <span className={cn("capitalize", task.priority === "high" && "font-bold text-destructive")}>
              {task.priority ?? "medium"} Priority
            </span>
            {!!task.resources?.length && (
              <span className="flex items-center gap-1 text-module">
                <Paperclip className="size-3" /> {task.resources.length} Lampiran
              </span>
            )}
          </div>
        </div>
        {isProject && (
          <label className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Bobot</span>
            <Input
              type="number"
              disabled={!canEdit}
              className="h-7 w-14 px-1 text-center text-xs font-bold"
              value={task.weight ?? 0}
              onChange={(e) => updateTask(task.id, { weight: parseFloat(e.target.value) || 0 })}
            />
          </label>
        )}
        {canEdit && (
          <div className="flex gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
            <Button variant="ghost" size="icon-sm" title="Ubah" onClick={() => setEditing(task)}>
              <PencilLine />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Hapus"
              className="hover:text-destructive"
              onClick={() => setDeleting(task)}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
      {!!task.resources?.length && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-2 text-[10px] font-bold text-muted-foreground uppercase">Lampiran:</p>
          <div className="flex flex-wrap gap-2">
            {task.resources.map((res, i) => (
              <AttachmentChip key={`${res.id}-${i}`} res={res} prefix={res.number || `#${i + 1}`} />
            ))}
          </div>
        </div>
      )}
    </li>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden max-md:overflow-y-auto">
      {/* Header */}
      {/* Header ringkas (tetap di atas) — sengaja padat agar ruang daftar/timeline lebih leluasa */}
      <div className="flex shrink-0 flex-col gap-2.5 border-b px-4 py-3 md:px-6">
        <div className="flex items-start justify-between gap-3 pr-8">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge variant="secondary" className="uppercase">
                {ownerType}
              </Badge>
              <SharedBadge item={owner} recordType={isProject ? "para_project" : undefined} />
              {owner.deadline && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="size-3" /> {formatNumericDate(owner.deadline)}
                </span>
              )}
            </div>
            <h2
              className="mt-1 line-clamp-2 text-lg font-extrabold tracking-tight md:line-clamp-1 md:text-xl"
              title={owner.title}
            >
              {owner.title}
            </h2>
            {owner.description && (
              <p className="line-clamp-1 text-xs text-muted-foreground" title={owner.description}>
                {owner.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {canEdit && (
              <>
                <Button
                  size="sm"
                  className="bg-module text-module-foreground hover:bg-module/90"
                  title={`Tambah ${label}`}
                  onClick={() => setEditing("new")}
                >
                  <Plus /> <span className="max-sm:sr-only">{label}</span>
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-info/10 text-info hover:bg-info/15"
                  title="Tambah Agenda"
                  onClick={() => setParams({ agenda: "new", agendaParent: owner.id }, { replace: false })}
                >
                  <Plus /> <span className="max-sm:sr-only">Agenda</span>
                </Button>
              </>
            )}
            {isProject && <ShareButton item={owner} recordType="para_project" title={owner.title} iconOnly />}
          </div>
        </div>

        {headerExtra}

        {isProject && (
          <div className="grid gap-x-6 gap-y-1.5 md:grid-cols-2">
            <ProgressLine label="Task (berbobot)" value={taskPct} className="bg-success" />
            <ProgressLine label="Waktu berjalan" value={timePct} className="bg-info" />
            {totalWeight > 0 && totalWeight !== 100 && (
              <p className="text-[11px] font-medium text-warning md:col-span-2">
                Total bobot action {totalWeight}% — sebaiknya 100% agar progres berbobot akurat.
              </p>
            )}
          </div>
        )}

        {ownerResources.length > 0 && (
          // Satu baris yang bisa digeser horizontal (tidak menambah tinggi header)
          <div className="flex items-center gap-2">
            <span
              className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase"
              title="Dasar Pelaksanaan / Resources"
            >
              <BookOpen className="size-3" /> Dasar
            </span>
            <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5">
              {ownerResources.map((res, i) => (
                <AttachmentChip key={`${res.id}-${i}`} res={res} />
              ))}
            </div>
          </div>
        )}

        {/* Toolbar: tampilan, filter tag, cari, dan rentang tanggal dalam satu baris (tombol tambah di baris judul) */}
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={view}
            onValueChange={(v) => v && setView(v as "list" | "timeline")}
          >
            <ToggleGroupItem value="list" title="Daftar">
              <List /> <span className="hidden sm:inline">List</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="timeline" title="Timeline">
              <Clock /> <span className="hidden sm:inline">Timeline</span>
            </ToggleGroupItem>
          </ToggleGroup>
          {view === "list" && (
            <>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={kindFilter}
                onValueChange={(v) => v && setKindFilter(v as "all" | "task" | "agenda")}
              >
                <ToggleGroupItem value="all">Semua ({ownerTasks.length + ownerSchedules.length})</ToggleGroupItem>
                <ToggleGroupItem value="task" title={label}>
                  <CheckSquare /> {ownerTasks.length}
                </ToggleGroupItem>
                <ToggleGroupItem value="agenda" title="Agenda">
                  <CalendarRange /> {ownerSchedules.length}
                </ToggleGroupItem>
              </ToggleGroup>
              <SearchInput
                value={search}
                onChange={setSearch}
                className="h-8 w-auto min-w-36 flex-1 md:w-40 md:flex-none"
              />
              <DateRangeFilter value={dateFilter} onChange={setDateFilter} />
            </>
          )}
          {hasSeries && (
            <Toggle
              size="sm"
              variant="outline"
              pressed={groupSeries}
              onPressedChange={setGroupSeries}
              title={groupSeries ? "Tampilkan semua pertemuan agenda berulang" : "Satu baris per agenda berulang"}
            >
              <Repeat /> Gabung seri
            </Toggle>
          )}
        </div>
      </div>

      {/* Konten */}
      <div className="px-4 py-4 md:flex-1 md:overflow-y-auto md:px-6">
        {view === "timeline" ? (
          <TimelineView owner={owner} tasks={ownerTasks} schedules={shownSchedules(ownerSchedules)} taskLabel={label} />
        ) : entries.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-module-soft text-module">
                <CheckSquare />
              </EmptyMedia>
              <EmptyDescription>Belum ada {label.toLowerCase()} atau agenda yang sesuai filter.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {entries.map((entry) =>
              entry.kind === "task" ? (
                renderTask(entry.task, entry.key)
              ) : (
                <AgendaItem
                  key={entry.key}
                  schedule={entry.schedule}
                  today={formatLocalYMD(today)}
                  onDelete={setDeletingAgenda}
                />
              ),
            )}
          </ul>
        )}
        <CommentsPanel recordType={isProject ? "para_project" : "para_activity"} item={owner} className="mt-5" />
      </div>

      <AgendaDeleteDialog schedule={deletingAgenda} onOpenChange={(open) => !open && setDeletingAgenda(null)} />
      <CompleteTaskDialog
        task={completing}
        label={label}
        withWeight={isProject}
        defaults={completing ? completionDefaults(completing, tasks, formatLocalYMD(today)) : null}
        onOpenChange={(open) => !open && setCompleting(null)}
        onConfirm={(values) => {
          if (completing) updateTask(completing.id, { ...values, ...completionPatch(true) });
          setCompleting(null);
        }}
      />

      <DeleteWithFilesDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Hapus ${label}?`}
        description={`${label} ini akan dihapus permanen:`}
        itemName={deleting?.title}
        files={deletingFiles}
        shared={deleting ? cleanup.referenced(deleting.resources ?? []) : undefined}
        onConfirm={(keepIds) => {
          if (deleting) {
            setTasks((prev) => prev.filter((t) => t.id !== deleting.id));
            // Berkas lampiran ikut dihapus kecuali dipertahankan (→ Resource Global)
            cleanup.release(deletingFiles, keepIds, {
              contextTag,
              exclude: deleting.resources ?? [],
              ownerId: deleting.userId,
            });
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}

/** Progres satu baris: label · bar · persen (ringkas untuk header yang tetap di atas). */
function ProgressLine({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
      <span className="w-24 shrink-0">{label}</span>
      <Progress value={value} className="h-1.5 flex-1" indicatorClassName={className} />
      <span className="w-9 shrink-0 text-right text-foreground">{value.toFixed(0)}%</span>
    </div>
  );
}

function AttachmentChip({ res, prefix }: { res: AttachedResource; prefix?: string }) {
  return (
    <button
      type="button"
      onClick={() => void openAttachment(res)}
      title={attachmentLabel(res)}
      className="flex max-w-60 shrink-0 items-center gap-1.5 rounded-lg border bg-card whitespace-nowrap px-2.5 py-1 text-xs font-medium text-module transition-colors hover:bg-module-soft"
    >
      {prefix && <span className="font-mono text-[10px] text-muted-foreground">{prefix}</span>}
      {res.type === "file" ? <FileText className="size-3 shrink-0" /> : <ExternalLink className="size-3 shrink-0" />}
      <span className="truncate">{attachmentLabel(res)}</span>
    </button>
  );
}

/**
 * Timeline gabungan dasar pelaksanaan (resources), action/task, dan agenda — urut tanggal. Agenda multi-hari tampil
 * sekali dengan rentang tanggalnya (di Planner tampil di setiap harinya); klik → tampilan lihat agenda (Hasil Agenda).
 */
function TimelineView({
  owner,
  tasks,
  schedules,
  taskLabel,
}: {
  owner: Project | Activity;
  tasks: ProjectTask[];
  schedules: Schedule[];
  taskLabel: string;
}) {
  const setParams = useSetSearchParams();
  const fallbackDate = (owner as Project).startDate || owner.createdAt?.slice(0, 10) || "";
  const events = [
    ...((owner as Project).resources ?? []).map((r) => ({
      key: `r-${r.id}`,
      kind: "resource" as const,
      date: r.date || fallbackDate,
      dateLabel: r.date || fallbackDate ? formatNumericDate(r.date || fallbackDate) : "-",
      title: attachmentLabel(r),
      description: r.description || "Dasar Pelaksanaan",
      resource: r as AttachedResource | null,
      attachments: [] as AttachedResource[],
      scheduleId: null as string | null,
    })),
    ...tasks.map((t) => ({
      key: `t-${t.id}`,
      kind: "task" as const,
      date: t.dueDate || "",
      dateLabel: t.dueDate ? formatNumericDate(t.dueDate) : "-",
      title: t.title,
      description: t.description,
      resource: null,
      attachments: t.resources ?? [],
      scheduleId: null,
    })),
    ...schedules.map((sc) => ({
      key: `s-${sc.id}`,
      kind: "agenda" as const,
      date: scheduleStart(sc),
      dateLabel: `${scheduleDateRangeLabel(sc)} · ${scheduleTimeLabel(sc)}`,
      title: sc.title,
      description: [sc.location, sc.outcome && `Hasil: ${sc.outcome}`].filter(Boolean).join(" — "),
      resource: null,
      attachments: [...(sc.resources ?? []), ...(sc.results ?? [])],
      scheduleId: sc.id,
    })),
    // Tanggal YMD dibandingkan sebagai string (aman zona waktu); tanpa tanggal di akhir
  ].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));

  if (events.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-muted text-muted-foreground">
            <Clock />
          </EmptyMedia>
          <EmptyDescription>Belum ada data untuk timeline.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const style = {
    resource: { dot: "border-module text-module", badge: "bg-module-soft text-module", label: "Dasar" },
    task: { dot: "border-success text-success", badge: "bg-success/15 text-success", label: taskLabel },
    agenda: { dot: "border-info text-info", badge: "bg-info/15 text-info", label: "Agenda" },
  } as const;

  return (
    <ol className="relative flex flex-col gap-6 border-l-2 border-border pl-6">
      {events.map((event) => (
        <li key={event.key} className="relative">
          <span
            className={cn(
              "absolute top-1 -left-[35px] flex size-6 items-center justify-center rounded-full border-[3px] bg-card",
              style[event.kind].dot,
            )}
          >
            {event.kind === "resource" ? (
              <BookOpen className="size-3" />
            ) : event.kind === "agenda" ? (
              <CalendarRange className="size-3" />
            ) : (
              <Check className="size-3" strokeWidth={3} />
            )}
          </span>
          <div className="rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge className={style[event.kind].badge}>{style[event.kind].label}</Badge>
              <span className="font-mono text-xs text-muted-foreground">{event.dateLabel}</span>
            </div>
            {event.scheduleId ? (
              <button
                type="button"
                className="text-left text-base font-bold hover:underline"
                onClick={() => setParams({ agenda: event.scheduleId }, { replace: false })}
              >
                {event.title}
              </button>
            ) : (
              <h4 className="text-base font-bold">{event.title}</h4>
            )}
            {event.description && <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>}
            {(event.resource || event.attachments.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-dashed pt-3">
                {event.resource && (
                  <button
                    type="button"
                    onClick={() => void openAttachment(event.resource!)}
                    className="flex items-center gap-1 rounded-lg border bg-muted/50 px-2 py-1 text-xs hover:bg-muted"
                  >
                    <FolderOpen className="size-3" /> Buka Dokumen
                  </button>
                )}
                {event.attachments.map((res, i) => (
                  <AttachmentChip key={`${res.id}-${i}`} res={res} />
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

type TaskValues = Omit<ProjectTask, "id" | "projectId">;

/** Form tambah/ubah Action/Task, termasuk lampiran dengan ringkasan AI otomatis. */
function TaskForm({
  task,
  label,
  withWeight,
  onCancel,
  onSave,
}: {
  task: ProjectTask | null;
  label: string;
  withWeight: boolean;
  onCancel: () => void;
  onSave: (values: TaskValues) => void;
}) {
  // Batal melewati penjaga tutup dialog (mis. dokumen ONLYOFFICE berisi di form lampiran)
  const guardedClose = useGuardedClose();
  const [form, setForm] = useState<TaskValues>(() =>
    task ? { ...task, resources: task.resources ?? [] } : emptyTask(),
  );
  const [adding, setAdding] = useState(false);
  const [aiTarget, setAiTarget] = useState<AttachedResource | null>(null);
  const { setItems: setResources } = useResources();
  const contextTag = withWeight ? "Project Action" : "Area Task";
  const edits = useAttachmentEdits({ contextTag, ownerId: task?.userId });
  const patch = (values: Partial<TaskValues>) => setForm((prev) => ({ ...prev, ...values }));
  const dropAttachment = (id: string) =>
    setForm((prev) => ({ ...prev, resources: (prev.resources ?? []).filter((r) => r.id !== id) }));

  const save = () => {
    if (!form.title.trim()) {
      toast.error(`Nama ${label} wajib diisi.`);
      return;
    }
    const attachments = form.resources ?? [];
    if (attachments.some((a) => a.addToGlobal)) {
      setResources((prev) => mergeIntoGlobalResources(prev, attachments, contextTag));
    }
    onSave({ ...form, title: form.title.trim() });
    edits.commit();
  };
  const cancel = () => {
    edits.discard(); // buang berkas yang diunggah di sesi ini
    onCancel();
  };

  return (
    <div className="flex h-full min-h-0 flex-col animate-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between gap-3 border-b p-5 pr-16">
        <h3 className="text-xl font-bold">{task ? `Edit ${label}` : `Buat ${label} Baru`}</h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void guardedClose(cancel)}>
            Batal
          </Button>
          <Button onClick={save}>Simpan {label}</Button>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="task-form-title">Nama {label}</FieldLabel>
            <Input
              id="task-form-title"
              autoFocus
              placeholder="Apa yang harus diselesaikan?"
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="task-form-desc">Deskripsi</FieldLabel>
            <Textarea
              id="task-form-desc"
              rows={3}
              placeholder={`Detail ${label.toLowerCase()}...`}
              value={form.description ?? ""}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
          <div className={cn("grid gap-4", withWeight ? "md:grid-cols-3" : "md:grid-cols-2")}>
            <Field>
              <FieldLabel htmlFor="task-form-date">Tanggal</FieldLabel>
              <Input
                id="task-form-date"
                type="date"
                value={form.dueDate ?? ""}
                onChange={(e) => patch({ dueDate: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>Prioritas</FieldLabel>
              <Select value={form.priority ?? "medium"} onValueChange={(v) => patch({ priority: v as Priority })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {withWeight && (
              <Field>
                <FieldLabel htmlFor="task-form-weight">Bobot (%)</FieldLabel>
                <Input
                  id="task-form-weight"
                  type="number"
                  min={0}
                  max={100}
                  value={form.weight ?? 0}
                  onChange={(e) => patch({ weight: parseFloat(e.target.value) || 0 })}
                />
              </Field>
            )}
          </div>
        </FieldGroup>

        <section className="flex flex-col gap-3 rounded-2xl border bg-muted/40 p-4">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-sm font-bold">
              <FolderOpen className="size-4 text-module" /> Resources / Lampiran
            </h4>
            {!adding && <AddAttachmentButton onClick={() => setAdding(true)} />}
          </div>
          {adding && (
            <AttachmentForm
              defaultDate={form.dueDate}
              uploadContext="task"
              offerAiSummary
              idPrefix="tr"
              onCancel={() => setAdding(false)}
              onAdd={(att) => {
                edits.trackAdded(att);
                patch({ resources: [...(form.resources ?? []), att] });
                setAdding(false);
              }}
            />
          )}
          <AttachmentTable
            resources={form.resources}
            onUpdate={(u) => patch({ resources: (form.resources ?? []).map((r) => (r.id === u.id ? u : r)) })}
            onOpenAi={setAiTarget}
            onRemove={(id) => {
              const att = form.resources?.find((r) => r.id === id);
              if (att) edits.requestRemove(att, () => dropAttachment(id));
            }}
          />
        </section>
      </div>
      {edits.dialog}
      <ResourceAiDialog
        resource={aiTarget}
        onOpenChange={(open) => !open && setAiTarget(null)}
        onSave={(id, summary) =>
          patch({ resources: (form.resources ?? []).map((r) => (r.id === id ? { ...r, aiSummary: summary } : r)) })
        }
      />
    </div>
  );
}
