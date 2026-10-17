import { useGuardedClose } from "@/components/common/dialog-close-guard";
import { BookOpen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AccessScope } from "@/components/common/access-scope";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAreas, useProjects, useResources } from "@/data/collections";
import { AddAttachmentButton, AttachmentForm } from "@/features/resources/attachment-form";
import { AttachmentTable } from "@/features/resources/attachment-table";
import { ResourceAiDialog } from "@/features/resources/resource-ai-dialog";
import { mergeIntoGlobalResources } from "@/features/resources/resource-utils";
import { generateId } from "@/lib/ids";
import type { AttachedResource, Project } from "@/types/entities";
import { useOpenSession, useRetained } from "@/hooks/use-retained";
import { DiscardScope, useAttachmentEdits, useDiscardScope } from "../use-attachment-edits";
import { TaskManager } from "./task-manager";

const NO_AREA = "__none__";

const emptyProject = (areaId = ""): Project => ({
  id: "",
  title: "",
  description: "",
  areaId,
  startDate: "",
  deadline: "",
  status: "active",
  resources: [],
});

interface ProjectFormDialogProps {
  /** null = tertutup, "new" = buat baru */
  project: Project | "new" | null;
  /** Paksa project masuk ke area ini (form dari detail Area) */
  fixedAreaId?: string;
  onOpenChange: (open: boolean) => void;
  onSaved?: (project: Project) => void;
}

/** Form buat/ubah Project + dasar pelaksanaan (resources). */
export function ProjectFormDialog({
  project: projectProp,
  fixedAreaId,
  onOpenChange,
  onSaved,
}: ProjectFormDialogProps) {
  const project = useRetained(projectProp);
  const session = useOpenSession(projectProp !== null);
  const { register, discardAll } = useDiscardScope();
  // Batal / X / Esc: buang berkas yang diunggah di form tetapi tidak jadi disimpan
  const close = () => {
    discardAll();
    onOpenChange(false);
  };
  return (
    <Dialog open={projectProp !== null} onOpenChange={(open) => (open ? onOpenChange(true) : close())}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{project === "new" ? "Buat Project Baru" : "Edit Project"}</DialogTitle>
        </DialogHeader>
        {project !== null && (
          <AccessScope item={project === "new" ? null : project}>
            <DiscardScope register={register}>
              <ProjectForm
                key={session}
                initial={
                  project === "new" ? emptyProject(fixedAreaId) : { ...project, resources: project.resources ?? [] }
                }
                fixedAreaId={fixedAreaId}
                onCancel={close}
                onSaved={(saved) => {
                  onSaved?.(saved);
                  onOpenChange(false);
                }}
              />
            </DiscardScope>
          </AccessScope>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({
  initial,
  fixedAreaId,
  onCancel,
  onSaved,
}: {
  initial: Project;
  fixedAreaId?: string;
  onCancel: () => void;
  onSaved: (project: Project) => void;
}) {
  // Batal melewati penjaga tutup dialog (mis. dokumen ONLYOFFICE berisi di form lampiran)
  const guardedClose = useGuardedClose();
  const [form, setForm] = useState<Project>(initial);
  const [adding, setAdding] = useState(false);
  const [aiTarget, setAiTarget] = useState<AttachedResource | null>(null);
  const { items: areas } = useAreas();
  const { setItems: setProjects } = useProjects();
  const { setItems: setResources } = useResources();
  // Tag asal sama dengan lampiran yang disimpan ke Resource Global (mergeIntoGlobalResources "Project Basis")
  const edits = useAttachmentEdits({ contextTag: "Project Basis", ownerId: initial.userId });
  const patch = (values: Partial<Project>) => setForm((prev) => ({ ...prev, ...values }));
  const dropAttachment = (id: string) =>
    setForm((prev) => ({ ...prev, resources: (prev.resources ?? []).filter((r) => r.id !== id) }));

  const save = () => {
    if (!form.title.trim()) {
      toast.error("Nama project wajib diisi.");
      return;
    }
    const attachments = form.resources ?? [];
    if (attachments.some((a) => a.addToGlobal)) {
      setResources((prev) => mergeIntoGlobalResources(prev, attachments, "Project Basis"));
    }
    const data: Project = { ...form, title: form.title.trim(), areaId: fixedAreaId ?? form.areaId };
    if (form.id) {
      setProjects((prev) => prev.map((p) => (p.id === form.id ? { ...p, ...data } : p)));
      onSaved(data);
    } else {
      const created: Project = { ...data, id: generateId("proj"), createdAt: new Date().toISOString() };
      setProjects((prev) => [...prev, created]);
      onSaved(created);
    }
    edits.commit(); // lampiran berkas yang dilepas: hapus / jadikan Resource Global sesuai pilihan
  };

  return (
    <>
      <div className="-mx-1 flex flex-1 flex-col gap-5 overflow-y-auto px-1">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="proj-title">Nama Project</FieldLabel>
            <Input
              id="proj-title"
              autoFocus
              placeholder="Nama Project..."
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="proj-desc">Deskripsi</FieldLabel>
            <Textarea
              id="proj-desc"
              rows={3}
              placeholder="Deskripsi detail project..."
              value={form.description ?? ""}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="proj-start">Start Date</FieldLabel>
              <Input
                id="proj-start"
                type="date"
                value={form.startDate ?? ""}
                onChange={(e) => patch({ startDate: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="proj-deadline">Deadline</FieldLabel>
              <Input
                id="proj-deadline"
                type="date"
                value={form.deadline ?? ""}
                onChange={(e) => patch({ deadline: e.target.value })}
              />
            </Field>
          </div>
          {/* Area project milik user lain (berbagi) tidak bisa dipindah ke area kolaborator */}
          {!fixedAreaId && !initial.share && (
            <Field>
              <FieldLabel>Area of Responsibility</FieldLabel>
              <Select value={form.areaId || NO_AREA} onValueChange={(v) => patch({ areaId: v === NO_AREA ? "" : v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_AREA}>-- No Area (Free Project) --</SelectItem>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </FieldGroup>

        <section className="flex flex-col gap-3 rounded-2xl border bg-muted/40 p-4">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-sm font-bold">
              <BookOpen className="size-4 text-module" /> Dasar Pelaksanaan / Resources
            </h4>
            {!adding && <AddAttachmentButton onClick={() => setAdding(true)} />}
          </div>
          {adding && (
            <AttachmentForm
              defaultDate={form.deadline}
              uploadContext="project"
              offerAiSummary
              idPrefix="pr"
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
      <DialogFooter>
        <Button variant="outline" onClick={() => void guardedClose(onCancel)}>
          Batal
        </Button>
        <Button onClick={save}>Simpan Project</Button>
      </DialogFooter>
      {edits.dialog}
      <ResourceAiDialog
        resource={aiTarget}
        onOpenChange={(open) => !open && setAiTarget(null)}
        onSave={(id, summary) =>
          patch({ resources: (form.resources ?? []).map((r) => (r.id === id ? { ...r, aiSummary: summary } : r)) })
        }
      />
    </>
  );
}

/** Detail project (TaskManager dalam dialog besar). */
export function ProjectDetailDialog({
  project: projectProp,
  onOpenChange,
}: {
  project: Project | null;
  onOpenChange: (open: boolean) => void;
}) {
  const project = useRetained(projectProp);
  const session = useOpenSession(!!projectProp);
  const { register, discardAll } = useDiscardScope();
  return (
    <Dialog
      open={!!projectProp}
      onOpenChange={(open) => {
        if (!open) discardAll(); // form Action yang terbuka: buang berkas yang belum disimpan
        onOpenChange(open);
      }}
    >
      <DialogContent className="flex h-[92svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogTitle className="sr-only">{project?.title ?? "Detail Project"}</DialogTitle>
        {project && (
          <AccessScope item={project}>
            <DiscardScope register={register}>
              <TaskManager key={`${project.id}-${session}`} owner={project} ownerType="Project" />
            </DiscardScope>
          </AccessScope>
        )}
      </DialogContent>
    </Dialog>
  );
}
