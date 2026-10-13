import { CheckCircle2, Paperclip } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useResources } from "@/data/collections";
import { AddAttachmentButton, AttachmentForm } from "@/features/resources/attachment-form";
import { AttachmentTable } from "@/features/resources/attachment-table";
import { mergeIntoGlobalResources } from "@/features/resources/resource-utils";
import { useOpenSession, useRetained } from "@/hooks/use-retained";
import type { AttachedResource, Priority, ProjectTask } from "@/types/entities";
import { DiscardScope, useAttachmentEdits, useDiscardScope } from "../use-attachment-edits";

export interface CompletionValues {
  dueDate: string;
  priority: Priority;
  weight?: number;
  /** Lampiran task setelah ditambah lampiran hasil (hanya diisi bila ada lampiran baru) */
  resources?: AttachedResource[];
}

/**
 * Dialog saat Action/Task dicentang selesai: Tanggal, Prioritas, dan Bobot (khusus action project) sudah terisi
 * otomatis (`completionDefaults`) dan bisa diubah; lampiran hasil (bukti/laporan) **opsional** lewat mekanisme lampiran
 * yang sama dengan form task. Dipakai Productivity & Planner Harian.
 */
export function CompleteTaskDialog({
  task: taskProp,
  label,
  withWeight,
  defaults,
  onOpenChange,
  onConfirm,
}: {
  task: ProjectTask | null;
  label: string;
  withWeight: boolean;
  defaults: CompletionValues | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (values: CompletionValues) => void;
}) {
  const task = useRetained(taskProp);
  const retainedDefaults = useRetained(defaults);
  const session = useOpenSession(!!taskProp);
  const { register, discardAll } = useDiscardScope();
  // Batal / X / Esc: buang berkas yang diunggah di dialog ini tetapi tidak jadi disimpan
  const close = () => {
    discardAll();
    onOpenChange(false);
  };
  return (
    <Dialog open={!!taskProp} onOpenChange={(open) => (open ? onOpenChange(true) : close())}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-success" /> Tandai {label} Selesai
          </DialogTitle>
          <DialogDescription>
            Lengkapi data {label.toLowerCase()} <span className="font-semibold text-foreground">"{task?.title}"</span>{" "}
            sebelum ditandai selesai.
          </DialogDescription>
        </DialogHeader>
        {task && retainedDefaults && (
          <DiscardScope register={register}>
            <CompleteTaskForm
              key={session}
              task={task}
              defaults={retainedDefaults}
              withWeight={withWeight}
              onCancel={close}
              onConfirm={onConfirm}
            />
          </DiscardScope>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CompleteTaskForm({
  task,
  defaults,
  withWeight,
  onCancel,
  onConfirm,
}: {
  task: ProjectTask;
  defaults: CompletionValues;
  withWeight: boolean;
  onCancel: () => void;
  onConfirm: (values: CompletionValues) => void;
}) {
  const [values, setValues] = useState(defaults);
  const [added, setAdded] = useState<AttachedResource[]>([]);
  const [adding, setAdding] = useState(false);
  const { setItems: setResources } = useResources();
  const contextTag = withWeight ? "Project Action" : "Area Task";
  const edits = useAttachmentEdits({ contextTag, ownerId: task.userId });
  const patch = (next: Partial<CompletionValues>) => setValues((prev) => ({ ...prev, ...next }));

  const confirm = () => {
    if (!values.dueDate) {
      toast.error("Tanggal wajib diisi.");
      return;
    }
    if (added.some((a) => a.addToGlobal)) {
      setResources((prev) => mergeIntoGlobalResources(prev, added, contextTag));
    }
    onConfirm({
      ...values,
      ...(withWeight ? {} : { weight: undefined }),
      ...(added.length ? { resources: [...(task.resources ?? []), ...added] } : {}),
    });
    edits.commit(); // lampiran baru kini tersimpan di task
  };

  return (
    <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1">
      <FieldGroup className="gap-4">
        <div className={withWeight ? "grid grid-cols-2 gap-3" : "flex flex-col gap-4"}>
          <Field>
            <FieldLabel htmlFor="complete-date">Tanggal</FieldLabel>
            <Input
              id="complete-date"
              type="date"
              required
              value={values.dueDate}
              onChange={(e) => patch({ dueDate: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>Prioritas</FieldLabel>
            <Select value={values.priority} onValueChange={(v) => patch({ priority: v as Priority })}>
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
            <Field className="col-span-2">
              <FieldLabel htmlFor="complete-weight">Bobot (%)</FieldLabel>
              <Input
                id="complete-weight"
                type="number"
                min={0}
                max={100}
                value={values.weight ?? 0}
                onChange={(e) => patch({ weight: parseFloat(e.target.value) || 0 })}
              />
            </Field>
          )}
        </div>
      </FieldGroup>

      <section className="flex flex-col gap-3 rounded-2xl border bg-muted/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold">
              <Paperclip className="size-4 text-module" /> Lampiran Hasil
              <span className="text-xs font-normal text-muted-foreground">(opsional)</span>
            </h4>
            <p className="text-xs text-muted-foreground">
              Bukti / laporan penyelesaian, ditambahkan ke lampiran {task.title}.
            </p>
          </div>
          {!adding && <AddAttachmentButton onClick={() => setAdding(true)} />}
        </div>
        {adding && (
          <AttachmentForm
            defaultDate={values.dueDate}
            uploadContext="task"
            offerAiSummary
            idPrefix="tr"
            onCancel={() => setAdding(false)}
            onAdd={(att) => {
              edits.trackAdded(att);
              setAdded((prev) => [...prev, att]);
              setAdding(false);
            }}
          />
        )}
        <AttachmentTable
          resources={added}
          emptyText="Belum ada lampiran hasil."
          onRemove={(id) => {
            const att = added.find((a) => a.id === id);
            if (att) edits.requestRemove(att, () => setAdded((prev) => prev.filter((a) => a.id !== id)));
          }}
        />
      </section>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Batal
        </Button>
        <Button type="button" onClick={confirm}>
          <CheckCircle2 /> Tandai Selesai
        </Button>
      </DialogFooter>
      {edits.dialog}
    </div>
  );
}
