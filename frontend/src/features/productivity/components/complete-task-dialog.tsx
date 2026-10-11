import { CheckCircle2 } from "lucide-react";
import { type FormEvent, useState } from "react";
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
import { useOpenSession, useRetained } from "@/hooks/use-retained";
import type { Priority, ProjectTask } from "@/types/entities";

export interface CompletionValues {
  dueDate: string;
  priority: Priority;
  weight?: number;
}

/**
 * Dialog saat Action/Task dicentang selesai: Tanggal, Prioritas, dan Bobot (khusus action project) sudah terisi
 * otomatis (`completionDefaults`) dan bisa diubah sebelum ditandai selesai.
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
  return (
    <Dialog open={!!taskProp} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
          <CompleteTaskForm
            key={session}
            defaults={retainedDefaults}
            withWeight={withWeight}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CompleteTaskForm({
  defaults,
  withWeight,
  onCancel,
  onConfirm,
}: {
  defaults: CompletionValues;
  withWeight: boolean;
  onCancel: () => void;
  onConfirm: (values: CompletionValues) => void;
}) {
  const [values, setValues] = useState(defaults);
  const patch = (next: Partial<CompletionValues>) => setValues((prev) => ({ ...prev, ...next }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onConfirm({ ...values, ...(withWeight ? {} : { weight: undefined }) });
  };

  return (
    <form onSubmit={submit}>
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
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Batal
          </Button>
          <Button type="submit">
            <CheckCircle2 /> Tandai Selesai
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}
