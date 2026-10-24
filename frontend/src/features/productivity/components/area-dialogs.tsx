import {
  Archive,
  BookOpen,
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
import { SearchableSelect } from "@/components/common/searchable-select";
import { ownedFiles } from "@/features/resources/attachment-cleanup";
import { DeleteWithFilesDialog } from "@/features/resources/delete-with-files-dialog";
import { useAttachmentCleanup } from "@/features/resources/use-attachment-cleanup";
import { AddAttachmentButton, AttachmentForm } from "@/features/resources/attachment-form";
import { AttachmentTable } from "@/features/resources/attachment-table";
import { ResourceAiDialog } from "@/features/resources/resource-ai-dialog";
import { mergeIntoGlobalResources } from "@/features/resources/resource-utils";
import { useGuardedClose } from "@/components/common/dialog-close-guard";
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
import { useActivities, useAreas, useProjects, useProjectTasks, useResources } from "@/data/collections";
import { AccessScope } from "@/components/common/access-scope";
import { CommentsPanel } from "@/features/sharing/comments-panel";
import { ShareButton } from "@/features/sharing/share-dialog";
import { SharedBadge } from "@/features/sharing/shared-badge";
import { usePermissions } from "@/hooks/use-permissions";
import { useOpenSession, useRetained } from "@/hooks/use-retained";
import { formatNumericDate } from "@/lib/dates";
import { generateId } from "@/lib/ids";
import { cn } from "@/lib/utils";
import type { Activity, Area, AttachedResource, Project } from "@/types/entities";
import {
  activityAncestors,
  activityFields,
  activityDepth,
  activityLevel,
  activityTreeIds,
  AREA_LEVELS,
  areaLevelHasSchedule,
  type AreaLevel,
  childrenOf,
  deleteDescription,
  freeProjectsOf,
  MAX_AREA_DEPTH,
  rootActivities,
} from "../lib/para";
import { taskProgress } from "../lib/progress";
import { DiscardScope, useAttachmentEdits, useDiscardScope } from "../use-attachment-edits";
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
  // Setiap buka = form baru (isi dialog yang belum di-unmount tidak boleh terbawa ke item berikutnya)
  const session = useOpenSession(areaProp !== null);
  return (
    <Dialog open={areaProp !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{area === "new" ? "Create New Area" : "Edit Area"}</DialogTitle>
        </DialogHeader>
        {area !== null && (
          <AreaForm
            key={`${area === "new" ? "new" : area.id}-${session}`}
            area={area === "new" ? null : area}
            onDone={() => onOpenChange(false)}
          />
        )}
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
  const { items: areas } = useAreas();
  const target = useRetained(targetProp);
  const session = useOpenSession(targetProp !== null);
  const { register, discardAll } = useDiscardScope();
  const parent = target?.parent;
  const level: AreaLevel =
    target?.item && target.item !== "new"
      ? activityLevel(activities, target.item)
      : parent
        ? AREA_LEVELS[Math.min(activityDepth(activities, parent) + 1, MAX_AREA_DEPTH)]
        : "Sub Area";
  // Batal / X / Esc: buang berkas yang diunggah di form tetapi tidak jadi disimpan
  const close = () => {
    discardAll();
    onOpenChange(false);
  };
  return (
    <Dialog open={targetProp !== null} onOpenChange={(open) => (open ? onOpenChange(true) : close())}>
      <DialogContent
        className={cn("flex max-h-[90svh] flex-col", areaLevelHasSchedule(level) ? "sm:max-w-2xl" : "sm:max-w-md")}
      >
        <DialogHeader>
          <DialogTitle>{target?.item === "new" ? `Tambah ${level} Baru` : `Edit ${level}`}</DialogTitle>
          {parent && (
            <DialogDescription>
              Bagian dari {activityLevel(activities, parent).toLowerCase()} “{parent.title}”.
            </DialogDescription>
          )}
        </DialogHeader>
        {target !== null && (
          <DiscardScope register={register}>
            <ActivityForm
              key={`${target.item === "new" ? `new-${parent?.id ?? "root"}` : target.item.id}-${session}`}
              activity={target.item === "new" ? null : target.item}
              parentId={parent?.id}
              level={level}
              areaId={areaId}
              // Item baru di area bersama menjadi milik pemilik area (berkas dibersihkan atas namanya)
              ownerId={target.item !== "new" ? target.item.userId : areas.find((a) => a.id === areaId)?.userId}
              onCancel={close}
              onSaved={(saved) => {
                onSaved(saved);
                onOpenChange(false);
              }}
            />
          </DiscardScope>
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
  ownerId,
  onCancel,
  onSaved,
}: {
  activity: Activity | null;
  parentId?: string;
  level: AreaLevel;
  areaId: string;
  ownerId?: string;
  onCancel: () => void;
  onSaved: (activity: Activity) => void;
}) {
  // Batal melewati penjaga tutup dialog (mis. dokumen ONLYOFFICE berisi di form lampiran)
  const guardedClose = useGuardedClose();
  const { setItems } = useActivities();
  const { setItems: setResources } = useResources();
  const [title, setTitle] = useState(activity?.title ?? "");
  const [deadline, setDeadline] = useState(activity?.deadline ?? "");
  const [description, setDescription] = useState(activity?.description ?? "");
  const [resources, setAttachments] = useState<AttachedResource[]>(activity?.resources ?? []);
  const [adding, setAdding] = useState(false);
  const [aiTarget, setAiTarget] = useState<AttachedResource | null>(null);
  // Lampiran dasar pelaksanaan: berkas dilepas → dihapus setelah disimpan (atau jadi Resource Global tag "Area")
  const edits = useAttachmentEdits({ contextTag: "Area", ownerId });
  // Sub Area = nama + deskripsi (seperti Area); Tanggal & Dasar Pelaksanaan hanya untuk Kegiatan / Sub Kegiatan
  const scheduled = areaLevelHasSchedule(level);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error(`Nama ${level.toLowerCase()} wajib diisi.`);
      return;
    }
    if (scheduled && resources.some((a) => a.addToGlobal)) {
      setResources((prev) => mergeIntoGlobalResources(prev, resources, "Area"));
    }
    const fields = activityFields(level, { title, description, deadline, resources });
    if (activity) {
      const updated = { ...activity, ...fields };
      setItems((prev) => prev.map((a) => (a.id === activity.id ? updated : a)));
      onSaved(updated);
    } else {
      const created: Activity = {
        id: generateId("act"),
        areaId,
        ...(parentId ? { parentId } : {}),
        ...fields,
        status: "active",
        createdAt: new Date().toISOString(),
      };
      setItems((prev) => [...prev, created]);
      onSaved(created);
    }
    edits.commit();
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1">
        <FieldGroup className="gap-4">
          <div className={cn("grid gap-4", scheduled && "sm:grid-cols-[1fr_11rem]")}>
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
            {scheduled && (
              <Field>
                <FieldLabel htmlFor="act-date">Tanggal (Opsional)</FieldLabel>
                <Input id="act-date" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </Field>
            )}
          </div>
          <Field>
            <FieldLabel htmlFor="act-desc">Deskripsi (Opsional)</FieldLabel>
            <Textarea
              id="act-desc"
              rows={2}
              placeholder={`Uraian singkat ${level.toLowerCase()}...`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </FieldGroup>

        {scheduled && (
          <section className="flex flex-col gap-3 rounded-2xl border bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-sm font-bold">
                <BookOpen className="size-4 text-module" /> Dasar Pelaksanaan / Resources
              </h4>
              {!adding && <AddAttachmentButton onClick={() => setAdding(true)} />}
            </div>
            {adding && (
              <AttachmentForm
                defaultDate={deadline}
                uploadContext="activity"
                offerAiSummary
                idPrefix="ar"
                onCancel={() => setAdding(false)}
                onAdd={(att) => {
                  edits.trackAdded(att);
                  setAttachments((prev) => [...prev, att]);
                  setAdding(false);
                }}
              />
            )}
            <AttachmentTable
              resources={resources}
              onUpdate={(u) => setAttachments((prev) => prev.map((r) => (r.id === u.id ? u : r)))}
              onOpenAi={setAiTarget}
              onRemove={(id) => {
                const att = resources.find((r) => r.id === id);
                if (att) edits.requestRemove(att, () => setAttachments((prev) => prev.filter((r) => r.id !== id)));
              }}
            />
          </section>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => void guardedClose(onCancel)}>
          Batal
        </Button>
        <Button type="submit">Simpan</Button>
      </DialogFooter>
      {edits.dialog}
      <ResourceAiDialog
        resource={aiTarget}
        onOpenChange={(open) => !open && setAiTarget(null)}
        onSave={(id, summary) =>
          setAttachments((prev) => prev.map((r) => (r.id === id ? { ...r, aiSummary: summary } : r)))
        }
      />
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

export type AreaSelection = { kind: "activity" | "project"; id: string } | null;
type Selection = AreaSelection;

export function AreaDetailDialog({
  area: areaProp,
  initialSelection = null,
  onOpenChange,
  onArchive,
}: {
  area: Area | null;
  /** Item yang langsung terpilih saat dialog dibuka (mis. kegiatan pemilik task dari `?task=`) */
  initialSelection?: AreaSelection;
  onOpenChange: (open: boolean) => void;
  onArchive: (area: Area) => void;
}) {
  const area = useRetained(areaProp);
  const session = useOpenSession(!!areaProp);
  const { register, discardAll } = useDiscardScope();
  return (
    <Dialog
      open={!!areaProp}
      onOpenChange={(open) => {
        if (!open) discardAll(); // form Task yang terbuka: buang berkas yang belum disimpan
        onOpenChange(open);
      }}
    >
      <DialogContent className="flex h-[90svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl md:h-[92svh] md:flex-row">
        <DialogTitle className="sr-only">{area?.title ?? "Detail Area"}</DialogTitle>
        {area && (
          <AccessScope item={area}>
            <DiscardScope register={register}>
              <AreaDetail
                key={`${area.id}-${session}`}
                area={area}
                initialSelection={initialSelection}
                onArchive={onArchive}
              />
            </DiscardScope>
          </AccessScope>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AreaDetail({
  area,
  initialSelection,
  onArchive,
}: {
  area: Area;
  initialSelection: AreaSelection;
  onArchive: (area: Area) => void;
}) {
  const { items: activities } = useActivities();
  const { items: projects } = useProjects();
  const { items: tasks } = useProjectTasks();
  const actions = useParaActions();
  const { setItems: setAreas } = useAreas();
  const { canEdit } = usePermissions();
  // Area milik user lain (berbagi): bagikan, arsipkan, ambil/lepas project hanya oleh pemilik
  const sharedArea = !!area.share;
  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [editingTitle, setEditingTitle] = useState<{ title: string; description: string } | null>(null);
  const [activityForm, setActivityForm] = useState<ActivityFormTarget>(null);
  const [projectForm, setProjectForm] = useState<Project | "new" | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [deleting, setDeleting] = useState<{ label: "Project" | AreaLevel; item: Activity | Project } | null>(null);
  const cleanup = useAttachmentCleanup();
  // Lampiran item + turunan + task yang ikut terhapus (berkasnya dibersihkan dari storage)
  const deletingAttachments = deleting
    ? actions.deleteAttachments(deleting.label === "Project" ? "project" : "activity", deleting.item)
    : null;

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
            {kind === "project" && !sharedArea && (
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
      <div className="flex flex-col gap-1.5">
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
          // Turunan dalam satu baris kartu kecil yang bisa digeser horizontal (tinggi header tetap)
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              {childLabel} ({children.length})
            </span>
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5">
              {children.length === 0 && (
                <span
                  className="truncate text-xs text-muted-foreground italic"
                  title={`Task di bawah ini melekat langsung pada ${level.toLowerCase()}.`}
                >
                  Belum ada — task melekat langsung pada {level.toLowerCase()}.
                </span>
              )}
              {children.map((child) => {
                const branch = new Set(activityTreeIds(activities, child.id));
                const branchTasks = tasks.filter((t) => branch.has(t.projectId));
                const grandChildren = childrenOf(activities, child.id).length;
                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => selectActivity(child.id)}
                    title={`${child.title}${grandChildren > 0 ? ` · ${grandChildren} ${AREA_LEVELS[depth + 2]?.toLowerCase()}` : ""}`}
                    className="flex w-44 shrink-0 flex-col gap-1 rounded-lg border bg-card px-2.5 py-1.5 text-left transition-shadow hover:shadow-md"
                  >
                    <span className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-bold">{child.title}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {branchTasks.filter((t) => t.completed).length}/{branchTasks.length}
                      </span>
                    </span>
                    <Progress value={taskProgress(branchTasks)} className="h-1" indicatorClassName="bg-primary" />
                  </button>
                );
              })}
            </div>
            {canEdit && (
              <Button
                variant="outline"
                size="xs"
                className="shrink-0"
                onClick={() => setActivityForm({ item: "new", parent: activity })}
              >
                <Plus /> {childLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Sidebar */}
      <aside className="flex max-h-[30svh] w-full shrink-0 flex-col gap-3 border-b bg-module-soft/50 p-4 md:max-h-none md:w-64 md:border-r md:border-b-0 lg:w-72">
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
          <div className="flex flex-col gap-1.5 pr-8 md:pr-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-lg font-bold" title={area.title}>
                {area.title}
              </h3>
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
                  {/* Bagikan & arsipkan hanya oleh pemilik area */}
                  {!sharedArea && (
                    <>
                      <ShareButton item={area} recordType="para_area" title={area.title} iconOnly />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Arsipkan area"
                        className="hover:text-warning"
                        onClick={() => onArchive(area)}
                      >
                        <Archive />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
            <SharedBadge item={area} recordType="para_area" />
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
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
          <section className="flex flex-col gap-1 border-t pt-3">
            <div className="mb-1 flex items-center justify-between pl-2">
              <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Daftar Project</span>
              {canEdit && (
                <div className="flex gap-0.5">
                  {/* Project milik kolaborator tidak bisa dimasukkan ke area milik orang lain */}
                  {!sharedArea && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Ambil dari Free Project"
                      onClick={() => setAttachOpen(true)}
                    >
                      <FolderInput />
                    </Button>
                  )}
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
          <div className="flex h-full flex-col overflow-y-auto p-5">
            <Empty className="flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-module-soft text-module">
                  <Layers />
                </EmptyMedia>
                <EmptyTitle>Pilih Sub Area, Kegiatan, atau Project</EmptyTitle>
                <EmptyDescription>Pilih item di sidebar kiri untuk mengelola task/action.</EmptyDescription>
              </EmptyHeader>
            </Empty>
            <CommentsPanel recordType="para_area" item={area} />
          </div>
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
      <DeleteWithFilesDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Hapus ${deleting?.label ?? "Item"}?`}
        description={deleteDescription(
          deleting?.label ?? "Project",
          deleting ? actions.deleteImpact(deleting.item.id) : { taskCount: 0 },
        )}
        itemName={deleting?.item.title}
        files={deletingAttachments ? ownedFiles(deletingAttachments) : []}
        shared={deletingAttachments ? cleanup.referenced(deletingAttachments) : undefined}
        confirmLabel="Hapus"
        onConfirm={(keepIds) => {
          if (!deleting) return;
          if (deleting.label === "Project") actions.deleteProject(deleting.item as Project, keepIds);
          else actions.deleteActivity(deleting.item as Activity, keepIds);
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
