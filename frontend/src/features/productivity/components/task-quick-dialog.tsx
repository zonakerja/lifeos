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
import { useRetained } from "@/hooks/use-retained";
import { AddAttachmentButton, AttachmentForm } from "@/features/resources/attachment-form";
import { AttachmentTable } from "@/features/resources/attachment-table";
import { ResourceAiDialog } from "@/features/resources/resource-ai-dialog";
import { mergeIntoGlobalResources } from "@/features/resources/resource-utils";
import type { AttachedResource, Priority, ProjectTask } from "@/types/entities";

export type TaskKind = "action" | "task";

interface TaskQuickDialogProps {
  task: ProjectTask | null;
  /** "action" = milik Project (punya bobot), "task" = milik Activity/Area */
  kind: TaskKind;
  onOpenChange: (open: boolean) => void;
  onSave: (task: ProjectTask) => void;
}

/** Edit cepat Task/Action produktivitas + lampiran. */
export function TaskQuickDialog(props: TaskQuickDialogProps) {
  // Konten dipertahankan saat menutup; remount per task → state form langsung dari props
  const task = useRetained(props.task);
  return <TaskQuickDialogInner key={task?.id ?? "none"} {...props} task={task} open={!!props.task} />;
}

function TaskQuickDialogInner({ task, kind, open, onOpenChange, onSave }: TaskQuickDialogProps & { open: boolean }) {
  const [form, setForm] = useState<ProjectTask | null>(() =>
    task ? { ...task, resources: task.resources ?? [] } : null,
  );
  const [adding, setAdding] = useState(false);
  const [aiTarget, setAiTarget] = useState<AttachedResource | null>(null);
  const { setItems: setResources } = useResources();

  const isAction = kind === "action" || form?.type === "project-action";
  const label = isAction ? "Action" : "Task";
  const patch = (values: Partial<ProjectTask>) => setForm((prev) => (prev ? { ...prev, ...values } : prev));

  const submit = () => {
    if (!form) return;
    const attachments = form.resources ?? [];
    if (attachments.some((a) => a.addToGlobal)) {
      setResources((prev) => mergeIntoGlobalResources(prev, attachments, isAction ? "Project Action" : "Area Task"));
    }
    onSave(form);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
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
                    onCancel={() => setAdding(false)}
                    onAdd={(att) => {
                      patch({ resources: [...(form.resources ?? []), att] });
                      setAdding(false);
                    }}
                  />
                )}
                <AttachmentTable
                  resources={form.resources}
                  onOpenAi={setAiTarget}
                  onRemove={(id) => patch({ resources: (form.resources ?? []).filter((r) => r.id !== id) })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button onClick={submit}>Simpan Perubahan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
