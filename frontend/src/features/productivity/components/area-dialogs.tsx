import { Archive, Check, Layers, PencilLine, Plus, Trash2, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActivities, useAreas, useProjects } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import { generateId } from "@/lib/ids";
import { cn } from "@/lib/utils";
import type { Activity, Area, Project } from "@/types/entities";
import { ProjectFormDialog } from "./project-dialogs";
import { TaskManager } from "./task-manager";
import { useRetained } from "@/hooks/use-retained";

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
// Form Kegiatan (Activity)
// ============================================================================

function ActivityFormDialog({
  activity: activityProp,
  areaId,
  onOpenChange,
  onSaved,
}: {
  activity: Activity | "new" | null;
  areaId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (activity: Activity) => void;
}) {
  const activity = useRetained(activityProp);
  return (
    <Dialog open={activityProp !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{activity === "new" ? "Tambah Kegiatan Baru" : "Edit Kegiatan"}</DialogTitle>
        </DialogHeader>
        {activity !== null && (
          <ActivityForm
            activity={activity === "new" ? null : activity}
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
  areaId,
  onCancel,
  onSaved,
}: {
  activity: Activity | null;
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
          <FieldLabel htmlFor="act-title">Nama Kegiatan</FieldLabel>
          <Input
            id="act-title"
            autoFocus
            placeholder="Contoh: Rutinitas Harian"
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
  const { items: activities, setItems: setActivities } = useActivities();
  const { items: projects, setItems: setProjects } = useProjects();
  const { setItems: setAreas } = useAreas();
  const { canEdit } = usePermissions();
  const [selection, setSelection] = useState<Selection>(null);
  const [editingTitle, setEditingTitle] = useState<{ title: string; description: string } | null>(null);
  const [activityForm, setActivityForm] = useState<Activity | "new" | null>(null);
  const [projectForm, setProjectForm] = useState<Project | "new" | null>(null);
  const [deleting, setDeleting] = useState<{ kind: "activity" | "project"; item: Activity | Project } | null>(null);

  const areaActivities = activities.filter((a) => a.areaId === area.id);
  const areaProjects = projects.filter((p) => p.areaId === area.id);
  const current =
    selection?.kind === "activity"
      ? areaActivities.find((a) => a.id === selection.id)
      : selection?.kind === "project"
        ? areaProjects.find((p) => p.id === selection.id)
        : undefined;

  const saveAreaInfo = () => {
    if (!editingTitle?.title.trim()) return;
    setAreas((prev) =>
      prev.map((a) => (a.id === area.id ? { ...a, ...editingTitle, title: editingTitle.title.trim() } : a)),
    );
    setEditingTitle(null);
  };

  // Render function (bukan komponen bersarang) agar tidak di-remount tiap render
  const renderItem = (kind: "activity" | "project", item: Activity | Project) => {
    const selected = selection?.kind === kind && selection.id === item.id;
    return (
      <div key={item.id} className="group relative">
        <button
          type="button"
          onClick={() => setSelection({ kind, id: item.id })}
          className={cn(
            "w-full truncate rounded-xl border p-3 pr-16 text-left text-sm font-bold transition-all",
            selected
              ? kind === "activity"
                ? "border-primary/40 bg-card text-primary shadow-md"
                : "border-success/40 bg-card text-success shadow-md"
              : "border-transparent text-muted-foreground hover:bg-card hover:text-foreground",
          )}
        >
          {item.title}
        </button>
        {canEdit && (
          <div
            className={cn(
              "absolute top-1/2 right-2 flex -translate-y-1/2 gap-0.5 transition-opacity",
              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <Button
              variant="ghost"
              size="icon-xs"
              title="Ubah"
              onClick={() => {
                setSelection({ kind, id: item.id });
                if (kind === "activity") setActivityForm(item as Activity);
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
              onClick={() => setDeleting({ kind, item })}
            >
              <Trash2 />
            </Button>
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
              <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Daftar Kegiatan</span>
              {canEdit && (
                <Button variant="ghost" size="icon-xs" title="Tambah kegiatan" onClick={() => setActivityForm("new")}>
                  <Plus />
                </Button>
              )}
            </div>
            {areaActivities.length === 0 && (
              <p className="pl-2 text-xs text-muted-foreground italic">Belum ada kegiatan.</p>
            )}
            {areaActivities.map((act) => renderItem("activity", act))}
          </section>
          <section className="flex flex-col gap-1 border-t pt-4">
            <div className="mb-1 flex items-center justify-between pl-2">
              <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Daftar Project</span>
              {canEdit && (
                <Button variant="ghost" size="icon-xs" title="Tambah project" onClick={() => setProjectForm("new")}>
                  <Plus />
                </Button>
              )}
            </div>
            {areaProjects.length === 0 && (
              <p className="pl-2 text-xs text-muted-foreground italic">Belum ada project.</p>
            )}
            {areaProjects.map((proj) => renderItem("project", proj))}
          </section>
        </div>
      </aside>

      {/* Konten */}
      <div className="flex min-h-0 flex-1 flex-col">
        {current ? (
          <TaskManager
            key={`${selection?.kind}-${current.id}`}
            owner={current}
            ownerType={selection?.kind === "activity" ? "Kegiatan" : "Project"}
          />
        ) : (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-module-soft text-module">
                <Layers />
              </EmptyMedia>
              <EmptyTitle>Pilih Kegiatan atau Project</EmptyTitle>
              <EmptyDescription>Pilih item di sidebar kiri untuk mengelola task/action.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <ActivityFormDialog
        activity={activityForm}
        areaId={area.id}
        onOpenChange={(open) => !open && setActivityForm(null)}
        onSaved={(act) => setSelection({ kind: "activity", id: act.id })}
      />
      <ProjectFormDialog
        project={projectForm}
        fixedAreaId={area.id}
        onOpenChange={(open) => !open && setProjectForm(null)}
        onSaved={(proj) => setSelection({ kind: "project", id: proj.id })}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Hapus ${deleting?.kind === "activity" ? "Kegiatan" : "Project"}?`}
        description="Anda yakin ingin menghapus item ini beserta seluruh tugas di dalamnya secara permanen?"
        itemName={deleting?.item.title}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting?.kind === "activity") setActivities((prev) => prev.filter((a) => a.id !== deleting.item.id));
          else if (deleting) setProjects((prev) => prev.filter((p) => p.id !== deleting.item.id));
          if (deleting && selection?.id === deleting.item.id) setSelection(null);
          setDeleting(null);
        }}
      />
    </>
  );
}
