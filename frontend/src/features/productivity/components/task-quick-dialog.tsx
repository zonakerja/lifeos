import { CheckSquare, FolderOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useResources } from "@/data/collections";
import { useOpenSession, useRetained } from "@/hooks/use-retained";
import { AddAttachmentButton, AttachmentForm } from "@/features/resources/attachment-form";
import { AttachmentTable } from "@/features/resources/attachment-table";
import { ResourceAiDialog } from "@/features/resources/resource-ai-dialog";
import { mergeIntoGlobalResources } from "@/features/resources/resource-utils";
import { completionChangePatch } from "@/lib/completion";
import type { AttachedResource, Priority, ProjectTask } from "@/types/entities";
import { useAttachmentEdits } from "../use-attachment-edits";
import { AccessScope } from "@/components/common/access-scope";
import { usePermissions } from "@/hooks/use-permissions";

export type TaskKind = "action" | "task";

interface TaskQuickDialogProps {
  task: ProjectTask | null;
  /** "action" = milik Project (punya bobot), "task" = milik Activity/Area */
  kind: TaskKind;
  onOpenChange: (open: boolean) => void;
  onSave: (task: ProjectTask) => void;
}

/**
 * Edit cepat Task/Action produktivitas + lampiran. `onSave` menerima task dengan `completedAt` yang sudah
 * disesuaikan bila status selesai berubah. Berkas yang dilepas dihapus/dipertahankan setelah disimpan.
 */
export function TaskQuickDialog(props: TaskQuickDialogProps) {
  // Konten dipertahankan saat menutup; remount per task → state form langsung dari props
  const task = useRetained(props.task);
  const session = useOpenSession(!!props.task);
  return (
    <AccessScope item={task}>
      <TaskQuickDialogInner key={`${task?.id ?? "none"}-${session}`} {...props} task={task} open={!!props.task} />
    </AccessScope>
  );
}

function TaskQuickDialogInner({ task, kind, open, onOpenChange, onSave }: TaskQuickDialogProps & { open: boolean }) {
  const [form, setForm] = useState<ProjectTask | null>(() =>
    task ? { ...task, resources: task.resources ?? [] } : null,
  );
  const [adding, setAdding] = useState(false);
  const [aiTarget, setAiTarget] = useState<AttachedResource | null>(null);
  const { setItems: setResources } = useResources();
  // Task dari project/area yang dibagikan tanpa izin edit hanya bisa dilihat
  const { canEdit } = usePermissions();

  const isAction = kind === "action" || form?.type === "project-action";
  const label = isAction ? "Action" : "Task";
  const contextTag = isAction ? "Project Action" : "Area Task";
  const edits = useAttachmentEdits({ contextTag, ownerId: task?.userId });
  const patch = (values: Partial<ProjectTask>) => setForm((prev) => (prev ? { ...prev, ...values } : prev));
  const dropAttachment = (id: string) =>
    setForm((prev) => (prev ? { ...prev, resources: (prev.resources ?? []).filter((r) => r.id !== id) } : prev));

  const submit = () => {
    if (!form) return;
    const attachments = form.resources ?? [];
    if (attachments.some((a) => a.addToGlobal)) {
      setResources((prev) => mergeIntoGlobalResources(prev, attachments, contextTag));
    }
    onSave({ ...form, ...(task ? completionChangePatch(task, !!form.completed) : {}) });
    edits.commit();
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) edits.discard(); // Batal / X / Esc: buang berkas yang diunggah di sesi ini
          onOpenChange(next);
        }}
      >
        <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="size-5 text-module" /> Update {label}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <div className="-mx-1 flex flex-1 flex-col gap-5 overflow-y-auto px-1">
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="task-title">Nama {label}</FieldLabel>
                  <Input id="task-title" value={form.title} onChange={(e) => patch({ title: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="task-desc">Deskripsi</FieldLabel>
                  <Textarea
                    id="task-desc"
                    rows={2}
                    value={form.description ?? ""}
                    onChange={(e) => patch({ description: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
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
                  {isAction && (
                    <Field>
                      <FieldLabel htmlFor="task-weight">Bobot (%)</FieldLabel>
                      <Input
                        id="task-weight"
                        type="number"
                        min={0}
                        max={100}
                        value={form.weight ?? 0}
                        onChange={(e) => patch({ weight: parseFloat(e.target.value) || 0 })}
                      />
                    </Field>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="task-done"
                    checked={!!form.completed}
                    onCheckedChange={(c) => patch({ completed: c === true })}
                  />
                  <Label htmlFor="task-done" className="font-semibold">
                    Tandai Selesai
                  </Label>
                </div>
              </FieldGroup>

              <div className="flex flex-col gap-3 rounded-2xl border bg-muted/40 p-4">
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
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                edits.discard();
                onOpenChange(false);
              }}
            >
              {canEdit ? "Batal" : "Tutup"}
            </Button>
            {canEdit ? (
              <Button onClick={submit}>Simpan Perubahan</Button>
            ) : (
              <span className="self-center text-xs text-muted-foreground">Anda hanya memiliki akses lihat.</span>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {edits.dialog}
      <ResourceAiDialog
        resource={aiTarget}
        onOpenChange={(open) => !open && setAiTarget(null)}
        onSave={(id, summary) =>
          patch({ resources: (form?.resources ?? []).map((r) => (r.id === id ? { ...r, aiSummary: summary } : r)) })
        }
      />
    </>
  );
}
