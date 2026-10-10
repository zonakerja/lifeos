import {
  Archive,
  Check,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CornerDownRight,
  FolderInput,
  Layers,
  ListPlus,
  PencilLine,
  Plus,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SearchableSelect } from "@/components/common/searchable-select";
import { Button } from "@/components/ui/button";
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
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useActivities, useAreas, useProjects, useProjectTasks } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import { useRetained } from "@/hooks/use-retained";
import { formatNumericDate } from "@/lib/dates";
import { generateId } from "@/lib/ids";
import { cn } from "@/lib/utils";
import type { Activity, Area, Project } from "@/types/entities";
import {
  activityAncestors,
  activityDepth,
  activityLevel,
  activityTreeIds,
  AREA_LEVELS,
  type AreaLevel,
  childrenOf,
  deleteDescription,
  freeProjectsOf,
  MAX_AREA_DEPTH,
  rootActivities,
} from "../lib/para";
import { taskProgress } from "../lib/progress";
import { useParaActions } from "../use-para-actions";
import { ProjectFormDialog } from "./project-dialogs";
import { TaskManager } from "./task-manager";

// ============================================================================
// Form Area
// ============================================================================

export function AreaFormDialog({
  area: areaProp,
  onOpenChange,
}: {
  area: Area | "new" | null;
  onOpenChange: (open: boolean) => void;
}) {
  const area = useRetained(areaProp);
  return (
    <Dialog open={areaProp !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{area === "new" ? "Create New Area" : "Edit Area"}</DialogTitle>
        </DialogHeader>
        {area !== null && <AreaForm area={area === "new" ? null : area} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AreaForm({ area, onDone }: { area: Area | null; onDone: () => void }) {
  const { setItems } = useAreas();
  const [title, setTitle] = useState(area?.title ?? "");
  const [description, setDescription] = useState(area?.description ?? "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (area) {
      setItems((prev) => prev.map((a) => (a.id === area.id ? { ...a, title: title.trim(), description } : a)));
    } else {
      setItems((prev) => [
        ...prev,
        {
          id: generateId("area"),
          title: title.trim(),
          description,
          color: "bg-slate-100",
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    onDone();
  };

  return (
    <form onSubmit={submit}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="area-title">Area Title</FieldLabel>
          <Input
            id="area-title"
            autoFocus
            placeholder="mis. Health & Fitness"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="area-desc">Description</FieldLabel>
          <Textarea
            id="area-desc"
            rows={3}
            placeholder="Standar yang ingin dipertahankan..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Batal
          </Button>
          <Button type="submit">Simpan Area</Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}

// ============================================================================
// Form Sub Area / Kegiatan / Sub Kegiatan (Activity)
// ============================================================================

/** `item` = item yang diedit atau "new"; `parent` terisi saat membuat turunan (Kegiatan / Sub Kegiatan). */
type ActivityFormTarget = { item: Activity | "new"; parent?: Activity } | null;

const LEVEL_PLACEHOLDER: Record<AreaLevel, string> = {
  "Sub Area": "Contoh: Kepegawaian",
  Kegiatan: "Contoh: Rekrutmen Pegawai",
  "Sub Kegiatan": "Contoh: Seleksi Administrasi",
};

function ActivityFormDialog({
  target: targetProp,
  areaId,
  onOpenChange,
  onSaved,
}: {
  target: ActivityFormTarget;
  areaId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (activity: Activity) => void;
}) {
  const { items: activities } = useActivities();
  const target = useRetained(targetProp);
  const parent = target?.parent;
  const level: AreaLevel =
    target?.item && target.item !== "new"
      ? activityLevel(activities, target.item)
      : parent
        ? AREA_LEVELS[Math.min(activityDepth(activities, parent) + 1, MAX_AREA_DEPTH)]
        : "Sub Area";
  return (
    <Dialog open={targetProp !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{target?.item === "new" ? `Tambah ${level} Baru` : `Edit ${level}`}</DialogTitle>
          {parent && (
            <DialogDescription>
              Bagian dari {activityLevel(activities, parent).toLowerCase()} “{parent.title}”.
            </DialogDescription>
          )}
        </DialogHeader>
        {target !== null && (
          <ActivityForm
            activity={target.item === "new" ? null : target.item}
            parentId={parent?.id}
            level={level}
            areaId={areaId}
            onCancel={() => onOpenChange(false)}
            onSaved={(saved) => {
              onSaved(saved);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ActivityForm({
  activity,
  parentId,
  level,
  areaId,
  onCancel,
  onSaved,
}: {
  activity: Activity | null;
  parentId?: string;
  level: AreaLevel;
  areaId: string;
  onCancel: () => void;
  onSaved: (activity: Activity) => void;
}) {
  const { setItems } = useActivities();
  const [title, setTitle] = useState(activity?.title ?? "");
  const [deadline, setDeadline] = useState(activity?.deadline ?? "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (activity) {
      const updated = { ...activity, title: title.trim(), deadline };
      setItems((prev) => prev.map((a) => (a.id === activity.id ? updated : a)));
      onSaved(updated);
    } else {
      const created: Activity = {
        id: generateId("act"),
        areaId,
        ...(parentId ? { parentId } : {}),
        title: title.trim(),
        deadline,
        status: "active",
        createdAt: new Date().toISOString(),
      };
      setItems((prev) => [...prev, created]);
      onSaved(created);
    }
  };

  return (
    <form onSubmit={submit}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="act-title">Nama {level}</FieldLabel>
          <Input
            id="act-title"
            autoFocus
            placeholder={LEVEL_PLACEHOLDER[level]}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="act-date">Tanggal (Opsional)</FieldLabel>
          <Input id="act-date" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Batal
          </Button>
          <Button type="submit">Simpan</Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}

// ============================================================================
// Ambil Free Project ke Area
// ============================================================================

function AttachProjectDialog({
  open,
  area,
  onOpenChange,
  onAttached,
}: {
  open: boolean;
  area: Area;
  onOpenChange: (open: boolean) => void;
  onAttached: (project: Project) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ambil dari Free Project</DialogTitle>
          <DialogDescription>Pilih project tanpa area untuk dimasukkan ke area “{area.title}”.</DialogDescription>
        </DialogHeader>
        {open && <AttachProjectForm area={area} onCancel={() => onOpenChange(false)} onAttached={onAttached} />}
      </DialogContent>
    </Dialog>
  );
}

function AttachProjectForm({
  area,
  onCancel,
  onAttached,
}: {
  area: Area;
  onCancel: () => void;
  onAttached: (project: Project) => void;
}) {
  const { items: projects } = useProjects();
  const { items: areas } = useAreas();
  const actions = useParaActions();
  const [projectId, setProjectId] = useState("");
  const freeProjects = freeProjectsOf(projects, areas);
  const options = freeProjects.map((p) => ({
    value: p.id,
    label: p.title,
    hint: p.deadline ? `Deadline ${formatNumericDate(p.deadline)}` : undefined,
  }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const project = freeProjects.find((p) => p.id === projectId);
    if (!project) return;
    actions.setProjectArea(project.id, area.id);
    toast.success(`Project “${project.title}” dimasukkan ke area ${area.title}`);
    onAttached(project);
  };

  return (
    <form onSubmit={submit}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="attach-project">Free Project</FieldLabel>
          {freeProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada Free Project. Semua project sudah memiliki area.</p>
          ) : (
            <SearchableSelect
              id="attach-project"
              value={projectId}
              onChange={setProjectId}
              options={options}
              placeholder="Pilih project..."
              searchPlaceholder="Cari project..."
            />
          )}
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Batal
          </Button>
          <Button type="submit" disabled={!projectId}>
            Masukkan ke Area
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}

// ============================================================================
// Detail Area
// ============================================================================

type Selection = { kind: "activity" | "project"; id: string } | null;

export function AreaDetailDialog({
  area: areaProp,
  onOpenChange,
  onArchive,
}: {
  area: Area | null;
  onOpenChange: (open: boolean) => void;
  onArchive: (area: Area) => void;
}) {
  const area = useRetained(areaProp);
  return (
    <Dialog open={!!areaProp} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl md:flex-row">
        <DialogTitle className="sr-only">{area?.title ?? "Detail Area"}</DialogTitle>
        {area && <AreaDetail key={area.id} area={area} onArchive={onArchive} />}
      </DialogContent>
    </Dialog>
  );
}

function AreaDetail({ area, onArchive }: { area: Area; onArchive: (area: Area) => void }) {
  const { items: activities } = useActivities();
  const { items: projects } = useProjects();
  const { items: tasks } = useProjectTasks();
  const actions = useParaActions();
  const { setItems: setAreas } = useAreas();
  const { canEdit } = usePermissions();
  const [selection, setSelection] = useState<Selection>(null);
  const [editingTitle, setEditingTitle] = useState<{ title: string; description: string } | null>(null);
  const [activityForm, setActivityForm] = useState<ActivityFormTarget>(null);
  const [projectForm, setProjectForm] = useState<Project | "new" | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [deleting, setDeleting] = useState<{ label: "Project" | AreaLevel; item: Activity | Project } | null>(null);

  const areaActivities = activities.filter((a) => a.areaId === area.id);
  const subAreas = rootActivities(activities, area.id);
  const areaProjects = projects.filter((p) => p.areaId === area.id);
  const currentActivity =
    selection?.kind === "activity" ? areaActivities.find((a) => a.id === selection.id) : undefined;
  const currentProject = selection?.kind === "project" ? areaProjects.find((p) => p.id === selection.id) : undefined;

  const saveAreaInfo = () => {
    if (!editingTitle?.title.trim()) return;
    setAreas((prev) =>
      prev.map((a) => (a.id === area.id ? { ...a, ...editingTitle, title: editingTitle.title.trim() } : a)),
    );
    setEditingTitle(null);
  };

  const detachProject = (project: Project) => {
    actions.setProjectArea(project.id, undefined);
    if (selection?.id === project.id) setSelection(null);
    toast.success(`Project “${project.title}” dilepas dari area dan menjadi Free Project`);
  };

  // Expand/collapse pohon di sidebar: default semua terbuka; yang disimpan hanya ID yang ditutup
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const parentIds = areaActivities.filter((a) => childrenOf(activities, a.id).length > 0).map((a) => a.id);

  /** Pilih item area dan buka semua induknya agar item terlihat di sidebar. */
  const selectActivity = (id: string, item?: Activity) => {
    setSelection({ kind: "activity", id });
    // `item` dikirim untuk item yang baru dibuat (belum ada di `activities` pada render ini)
    const target = item ?? activities.find((a) => a.id === id);
    const ancestorIds = target ? activityAncestors(activities, target).map((a) => a.id) : [];
    if (ancestorIds.some((a) => collapsed.has(a))) {
      setCollapsed((prev) => new Set([...prev].filter((c) => !ancestorIds.includes(c))));
    }
  };

  // Render function (bukan komponen bersarang) agar tidak di-remount tiap render.
  // depth: 0 = Sub Area, 1 = Kegiatan, 2 = Sub Kegiatan; -1 = Project
  const renderItem = (item: Activity | Project, depth: number) => {
    const kind = depth < 0 ? "project" : "activity";
    const selected = selection?.kind === kind && selection.id === item.id;
    const label = depth < 0 ? "Project" : AREA_LEVELS[depth];
    const childLabel = depth >= 0 && depth < MAX_AREA_DEPTH ? AREA_LEVELS[depth + 1] : null;
    return (
      <div key={item.id} className="group relative">
        <button
          type="button"
          onClick={() => setSelection({ kind, id: item.id })}
          className={cn(
            "w-full truncate rounded-xl border text-left transition-all",
            depth <= 0 ? "p-3 text-sm font-bold" : depth === 1 ? "p-2 text-xs font-semibold" : "p-1.5 text-xs",
            childLabel ? "pr-24" : "pr-16",
            selected
              ? kind === "activity"
                ? "border-primary/40 bg-card text-primary shadow-md"
                : "border-success/40 bg-card text-success shadow-md"
              : "border-transparent text-muted-foreground hover:bg-card hover:text-foreground",
          )}
        >
          {depth > 0 && <CornerDownRight className="mr-1 inline size-3" />}
          {item.title}
        </button>
        {canEdit && (
          <div
            className={cn(
              "absolute top-1/2 right-2 flex -translate-y-1/2 gap-0.5 transition-opacity",
              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            {childLabel && (
              <Button
                variant="ghost"
                size="icon-xs"
                title={`Tambah ${childLabel.toLowerCase()}`}
                onClick={() => setActivityForm({ item: "new", parent: item as Activity })}
              >
                <ListPlus />
              </Button>
            )}
            {kind === "project" && (
              <Button
                variant="ghost"
                size="icon-xs"
                title="Lepas dari area (jadikan Free Project)"
                onClick={() => detachProject(item as Project)}
              >
                <Unlink />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              title="Ubah"
              onClick={() => {
                setSelection({ kind, id: item.id });
                if (kind === "activity") setActivityForm({ item: item as Activity });
                else setProjectForm(item as Project);
              }}
            >
              <PencilLine />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Hapus"
              className="hover:text-destructive"
              onClick={() => setDeleting({ label, item })}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
    );
  };

  /** Item area beserta turunannya (rekursif, menjorok per tingkat). */
  const renderTree = (item: Activity, depth: number): ReactNode => {
    const children = depth < MAX_AREA_DEPTH ? childrenOf(activities, item.id) : [];
    const isOpen = !collapsed.has(item.id);
    const childLabel = AREA_LEVELS[depth + 1]?.toLowerCase();
    return (
      <div key={item.id} className="flex flex-col gap-0.5">
        <div className="flex items-center gap-0.5">
          {children.length > 0 ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-muted-foreground"
              aria-expanded={isOpen}
              title={isOpen ? `Tutup ${children.length} ${childLabel}` : `Buka ${children.length} ${childLabel}`}
              onClick={() => toggleCollapsed(item.id)}
            >
              <ChevronRight className={cn("transition-transform", isOpen && "rotate-90")} />
            </Button>
          ) : (
            <span className="size-6 shrink-0" aria-hidden />
          )}
          <div className="min-w-0 flex-1">{renderItem(item, depth)}</div>
          {!isOpen && (
            <span className="shrink-0 pr-1 text-[10px] font-semibold text-muted-foreground tabular-nums">
              {children.length}
            </span>
          )}
        </div>
        {isOpen && children.length > 0 && (
          <div className="ml-3 flex flex-col gap-0.5 border-l pl-2">
            {children.map((child) => renderTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Header tambahan: jalur induk (breadcrumb) + kartu turunan dengan progres task seluruh cabangnya
  const activityHeader = (activity: Activity) => {
    const ancestors = activityAncestors(activities, activity);
    const depth = Math.min(ancestors.length, MAX_AREA_DEPTH);
    const level = AREA_LEVELS[depth];
    const childLabel = depth < MAX_AREA_DEPTH ? AREA_LEVELS[depth + 1] : null;
    const children = childLabel ? childrenOf(activities, activity.id) : [];
    return (
      <div className="flex flex-col gap-3">
        {ancestors.length > 0 && (
          <nav aria-label="Jalur induk" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span>Bagian dari</span>
            {ancestors.map((a, i) => (
              <span key={a.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3" />}
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => selectActivity(a.id)}>
                  {a.title}
                </Button>
              </span>
            ))}
          </nav>
        )}
        {childLabel && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                {childLabel} ({children.length})
              </p>
              {canEdit && (
                <Button variant="outline" size="xs" onClick={() => setActivityForm({ item: "new", parent: activity })}>
                  <Plus /> {childLabel}
                </Button>
              )}
            </div>
            {children.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Belum ada {childLabel.toLowerCase()}. Task di bawah ini melekat langsung pada {level.toLowerCase()}.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {children.map((child) => {
                  const branch = new Set(activityTreeIds(activities, child.id));
                  const branchTasks = tasks.filter((t) => branch.has(t.projectId));
                  const grandChildren = childrenOf(activities, child.id).length;
                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => selectActivity(child.id)}
                      className="flex flex-col gap-1.5 rounded-xl border bg-card p-3 text-left transition-shadow hover:shadow-md"
                    >
                      <span className="truncate text-sm font-bold">{child.title}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {grandChildren > 0 && `${grandChildren} ${AREA_LEVELS[depth + 2]?.toLowerCase()} · `}
                        {branchTasks.filter((t) => t.completed).length}/{branchTasks.length} task selesai
                      </span>
                      <Progress value={taskProgress(branchTasks)} className="h-1.5" indicatorClassName="bg-primary" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Sidebar */}
      <aside className="flex w-full flex-col gap-5 border-b bg-module-soft/50 p-5 md:w-80 md:border-r md:border-b-0">
        {editingTitle ? (
          <div className="flex flex-col gap-2 pr-8">
            <Input
              autoFocus
              value={editingTitle.title}
              placeholder="Nama Area"
              onChange={(e) => setEditingTitle({ ...editingTitle, title: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && saveAreaInfo()}
            />
            <div className="flex gap-2">
              <Button size="icon-sm" title="Simpan" onClick={saveAreaInfo}>
                <Check />
              </Button>
              <Button size="icon-sm" variant="secondary" title="Batal" onClick={() => setEditingTitle(null)}>
                <X />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 pr-8 md:pr-0">
            <h3 className="truncate text-xl font-bold">{area.title}</h3>
            {canEdit && (
              <div className="flex gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Ubah area"
                  onClick={() => setEditingTitle({ title: area.title, description: area.description ?? "" })}
                >
                  <PencilLine />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Arsipkan area"
                  className="hover:text-warning"
                  onClick={() => onArchive(area)}
                >
                  <Archive />
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto">
          <section className="flex flex-col gap-1">
            <div className="mb-1 flex items-center justify-between pl-2">
              <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Daftar Sub Area</span>
              <div className="flex gap-0.5">
                {parentIds.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title={collapsed.size > 0 ? "Buka semua" : "Tutup semua"}
                    onClick={() => setCollapsed(collapsed.size > 0 ? new Set() : new Set(parentIds))}
                  >
                    {collapsed.size > 0 ? <ChevronsUpDown /> : <ChevronsDownUp />}
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Tambah sub area"
                    onClick={() => setActivityForm({ item: "new" })}
                  >
                    <Plus />
                  </Button>
                )}
              </div>
            </div>
            {subAreas.length === 0 && <p className="pl-2 text-xs text-muted-foreground italic">Belum ada sub area.</p>}
            {subAreas.map((subArea) => renderTree(subArea, 0))}
          </section>
          <section className="flex flex-col gap-1 border-t pt-4">
            <div className="mb-1 flex items-center justify-between pl-2">
              <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Daftar Project</span>
              {canEdit && (
                <div className="flex gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Ambil dari Free Project"
                    onClick={() => setAttachOpen(true)}
                  >
                    <FolderInput />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Buat project baru"
                    onClick={() => setProjectForm("new")}
                  >
                    <Plus />
                  </Button>
                </div>
              )}
            </div>
            {areaProjects.length === 0 && (
              <p className="pl-2 text-xs text-muted-foreground italic">Belum ada project.</p>
            )}
            {areaProjects.map((proj) => renderItem(proj, -1))}
          </section>
        </div>
      </aside>

      {/* Konten */}
      <div className="flex min-h-0 flex-1 flex-col">
        {currentActivity ? (
          <TaskManager
            key={`activity-${currentActivity.id}`}
            owner={currentActivity}
            ownerType={activityLevel(activities, currentActivity)}
            headerExtra={activityHeader(currentActivity)}
          />
        ) : currentProject ? (
          <TaskManager key={`project-${currentProject.id}`} owner={currentProject} ownerType="Project" />
        ) : (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-module-soft text-module">
                <Layers />
              </EmptyMedia>
              <EmptyTitle>Pilih Sub Area, Kegiatan, atau Project</EmptyTitle>
              <EmptyDescription>Pilih item di sidebar kiri untuk mengelola task/action.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <ActivityFormDialog
        target={activityForm}
        areaId={area.id}
        onOpenChange={(open) => !open && setActivityForm(null)}
        onSaved={(act) => selectActivity(act.id, act)}
      />
      <ProjectFormDialog
        project={projectForm}
        fixedAreaId={area.id}
        onOpenChange={(open) => !open && setProjectForm(null)}
        onSaved={(proj) => setSelection({ kind: "project", id: proj.id })}
      />
      <AttachProjectDialog
        open={attachOpen}
        area={area}
        onOpenChange={setAttachOpen}
        onAttached={(proj) => {
          setAttachOpen(false);
          setSelection({ kind: "project", id: proj.id });
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Hapus ${deleting?.label ?? "Item"}?`}
        description={deleteDescription(
          deleting?.label ?? "Project",
          deleting ? actions.deleteImpact(deleting.item.id) : { taskCount: 0 },
        )}
        itemName={deleting?.item.title}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (!deleting) return;
          if (deleting.label === "Project") actions.deleteProject(deleting.item as Project);
          else actions.deleteActivity(deleting.item as Activity);
          // Pilihan dikosongkan bila item terpilih ikut terhapus (termasuk turunannya)
          const removed =
            deleting.label === "Project" ? [deleting.item.id] : activityTreeIds(activities, deleting.item.id);
          if (selection && removed.includes(selection.id)) setSelection(null);
          setDeleting(null);
        }}
      />
    </>
  );
}
