import {
  BookOpen,
  CalendarDays,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useProjectTasks, useResources } from "@/data/collections";
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
import { formatNumericDate } from "@/lib/dates";
import { generateId } from "@/lib/ids";
import { cn } from "@/lib/utils";
import type { Activity, AttachedResource, Priority, Project, ProjectTask } from "@/types/entities";
import type { AreaLevel } from "../lib/para";
import { projectTimeProgress, taskProgress } from "../lib/progress";
import { useAttachmentEdits } from "../use-attachment-edits";

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

/** Pengelola Action (Project) / Task (Sub Area, Kegiatan, Sub Kegiatan). */
export function TaskManager({ owner, ownerType, headerExtra }: TaskManagerProps) {
  const { items: tasks, setItems: setTasks } = useProjectTasks();
  const { canEdit } = usePermissions();
  const today = useToday();
  const [view, setView] = useState<"list" | "timeline">("list");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(DEFAULT_DATE_FILTER);
  const [editing, setEditing] = useState<ProjectTask | "new" | null>(null);
  const [deleting, setDeleting] = useState<ProjectTask | null>(null);
  const cleanup = useAttachmentCleanup();

  const isProject = ownerType === "Project";
  const label = isProject ? "Action" : "Task";
  const contextTag = isProject ? "Project Action" : "Area Task";
  const deletingFiles = ownedFiles(deleting?.resources);
  const ownerTasks = tasks.filter((t) => t.projectId === owner.id);

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

  const filtered = ownerTasks
    .filter((t) => !search || t.title.toLowerCase().includes(search.toLowerCase()))
    .filter((t) => matchesDateFilter(t.dueDate, dateFilter, today))
    .sort((a, b) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime());

  const updateTask = (id: string, values: Partial<ProjectTask>) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...values } : t)));

  const taskPct = taskProgress(ownerTasks);
  const timePct = isProject ? projectTimeProgress(owner as Project, today) : 0;
  const ownerResources = (owner as Project).resources ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b p-5 md:p-7">
        <div className="flex flex-wrap items-center gap-2 pr-10">
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
        <div>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">{owner.title}</h2>
            {isProject && <ShareButton item={owner} recordType="para_project" title={owner.title} />}
          </div>
          {owner.description && <p className="mt-1 text-sm text-muted-foreground">{owner.description}</p>}
        </div>

        {headerExtra}

        {isProject && (
          <div className="grid gap-3 md:grid-cols-2">
            <ProgressBox label="Task Completion (Weighted)" value={taskPct} className="bg-success" />
            <ProgressBox label="Time Elapsed" value={timePct} className="bg-info" />
          </div>
        )}

        {ownerResources.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase">
              <BookOpen className="size-3" /> Dasar Pelaksanaan / Resources
            </p>
            <div className="flex flex-wrap gap-2">
              {ownerResources.map((res, i) => (
                <AttachmentChip key={`${res.id}-${i}`} res={res} />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <ToggleGroup
            type="single"
            variant="outline"
            value={view}
            onValueChange={(v) => v && setView(v as "list" | "timeline")}
          >
            <ToggleGroupItem value="list">
              <List /> List
            </ToggleGroupItem>
            <ToggleGroupItem value="timeline">
              <Clock /> Timeline
            </ToggleGroupItem>
          </ToggleGroup>
          {view === "list" && (
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <SearchInput value={search} onChange={setSearch} className="md:w-48" />
              <DateRangeFilter value={dateFilter} onChange={setDateFilter} />
            </div>
          )}
        </div>
      </div>

      {/* Konten */}
      <div className="flex-1 overflow-y-auto p-5 md:p-7">
        {view === "timeline" ? (
          <TimelineView owner={owner} tasks={ownerTasks} />
        ) : filtered.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-module-soft text-module">
                <CheckSquare />
              </EmptyMedia>
              <EmptyDescription>Belum ada {label.toLowerCase()} yang sesuai filter.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {filtered.map((task) => (
              <li
                key={task.id}
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
                    onClick={() => updateTask(task.id, completionPatch(!task.completed))}
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors",
                      task.completed
                        ? "border-success bg-success text-white"
                        : "border-muted-foreground/40 hover:border-success",
                    )}
                  >
                    {task.completed && <Check className="size-3.5" strokeWidth={4} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <h4 className={cn("text-sm font-bold", task.completed && "text-muted-foreground line-through")}>
                      {task.title}
                    </h4>
                    {task.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
                    )}
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
            ))}
          </ul>
        )}
        <CommentsPanel recordType={isProject ? "para_project" : "para_activity"} item={owner} className="mt-5" />
      </div>

      {view === "list" && canEdit && (
        <div className="border-t p-4">
          <Button
            variant="secondary"
            className="h-12 w-full bg-module-soft text-module hover:bg-module/15"
            onClick={() => setEditing("new")}
          >
            <Plus /> Tambah {label} Baru
          </Button>
        </div>
      )}

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

function ProgressBox({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-xl border bg-muted/40 p-3">
      <div className="mb-2 flex justify-between text-xs font-bold text-muted-foreground">
        <span>{label}</span>
        <span>{value.toFixed(0)}%</span>
      </div>
      <Progress value={value} className="h-2" indicatorClassName={className} />
    </div>
  );
}

function AttachmentChip({ res, prefix }: { res: AttachedResource; prefix?: string }) {
  return (
    <button
      type="button"
      onClick={() => void openAttachment(res)}
      className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium text-module transition-colors hover:bg-module-soft"
    >
      {prefix && <span className="font-mono text-[10px] text-muted-foreground">{prefix}</span>}
      {res.type === "file" ? <FileText className="size-3" /> : <ExternalLink className="size-3" />}
      {attachmentLabel(res)}
    </button>
  );
}

/** Timeline gabungan dasar pelaksanaan (resources) + action, urut tanggal. */
function TimelineView({ owner, tasks }: { owner: Project | Activity; tasks: ProjectTask[] }) {
  const fallbackDate = (owner as Project).startDate || owner.createdAt || "";
  const events = [
    ...((owner as Project).resources ?? []).map((r) => ({
      key: `r-${r.id}`,
      kind: "resource" as const,
      date: r.date || fallbackDate,
      title: attachmentLabel(r),
      description: r.description || "Dasar Pelaksanaan",
      resource: r,
      attachments: [] as AttachedResource[],
    })),
    ...tasks.map((t) => ({
      key: `t-${t.id}`,
      kind: "task" as const,
      date: t.dueDate || "",
      title: t.title,
      description: t.description,
      resource: null,
      attachments: t.resources ?? [],
    })),
  ].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

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

  return (
    <ol className="relative flex flex-col gap-6 border-l-2 border-border pl-6">
      {events.map((event) => (
        <li key={event.key} className="relative">
          <span
            className={cn(
              "absolute top-1 -left-[35px] flex size-6 items-center justify-center rounded-full border-[3px] bg-card",
              event.kind === "resource" ? "border-module text-module" : "border-success text-success",
            )}
          >
            {event.kind === "resource" ? <BookOpen className="size-3" /> : <Check className="size-3" strokeWidth={3} />}
          </span>
          <div className="rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge
                className={event.kind === "resource" ? "bg-module-soft text-module" : "bg-success/15 text-success"}
              >
                {event.kind === "resource" ? "Dasar" : "Action"}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                {event.date ? formatNumericDate(event.date) : "-"}
              </span>
            </div>
            <h4 className="text-base font-bold">{event.title}</h4>
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
          <Button variant="outline" onClick={cancel}>
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
              autoSummarize
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
