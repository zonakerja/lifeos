import { CheckSquare, ClipboardList } from "lucide-react";
import { useState } from "react";
import { PRIORITY_LABELS } from "@/components/common/priority-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { formatLocalYMD, todayYMD } from "@/lib/dates";
import { useLatchedWhileOpen, useRetained } from "@/hooks/use-retained";
import { cn } from "@/lib/utils";
import type { Priority, Todo } from "@/types/entities";

const PRIORITY_ACTIVE: Record<Priority, string> = {
  high: "data-[state=on]:border-destructive data-[state=on]:bg-destructive/10 data-[state=on]:text-destructive",
  medium:
    "data-[state=on]:border-warning data-[state=on]:bg-warning/15 data-[state=on]:text-warning-foreground dark:data-[state=on]:text-warning",
  low: "data-[state=on]:border-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground",
};

/** Tambah/ubah todo harian. */
export function TodoDialog({
  open,
  editing,
  defaultDate,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  editing: Todo | null;
  /** Tanggal awal (YYYY-MM-DD) untuk todo baru */
  defaultDate: string;
  onOpenChange: (open: boolean) => void;
  /** `date` = YYYY-MM-DD */
  onSave: (title: string, priority: Priority, date: string) => void;
}) {
  const shownEditing = useLatchedWhileOpen(open, editing);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="size-5 text-success" /> {shownEditing ? "Ubah Tugas" : "Tambah Tugas"}
          </DialogTitle>
        </DialogHeader>
        <TodoForm editing={shownEditing} defaultDate={defaultDate} onSave={onSave} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function TodoForm({
  editing,
  defaultDate,
  onSave,
  onDone,
}: {
  editing: Todo | null;
  defaultDate: string;
  onSave: (title: string, priority: Priority, date: string) => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(() => (editing ? formatLocalYMD(editing.date) : "") || defaultDate);
  const [priority, setPriority] = useState<Priority>(editing?.priority ?? "medium");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || !date) return;
        onSave(title.trim(), priority, date);
        onDone();
      }}
    >
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="todo-title">Nama Tugas</FieldLabel>
          <Input
            id="todo-title"
            autoFocus
            placeholder="Contoh: Buat Laporan..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="todo-date">Tanggal</FieldLabel>
          <Input id="todo-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>Prioritas</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={2}
            value={priority}
            onValueChange={(v) => v && setPriority(v as Priority)}
            className="grid w-full grid-cols-3"
          >
            {(["low", "medium", "high"] as Priority[]).map((p) => (
              <ToggleGroupItem key={p} value={p} className={cn("w-full border-2", PRIORITY_ACTIVE[p])}>
                {PRIORITY_LABELS[p]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <DialogFooter>
          <Button type="submit" className="w-full">
            {editing ? "Simpan Perubahan" : "Simpan Tugas"}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}

/** Catat tanggal aktual + catatan penyelesaian rutinitas. */
export function ActivityLogDialog({
  routineTitle: routineTitleProp,
  scheduledDate,
  onOpenChange,
  onSave,
}: {
  /** null = tertutup */
  routineTitle: string | null;
  scheduledDate: Date;
  onOpenChange: (open: boolean) => void;
  onSave: (actualDate: string, note: string) => void;
}) {
  const routineTitle = useRetained(routineTitleProp);
  return (
    <Dialog open={routineTitleProp !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="size-5 text-module" /> Log Aktual
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{routineTitle}</p>
        </DialogHeader>
        <ActivityLogForm scheduledDate={scheduledDate} onSave={onSave} />
      </DialogContent>
    </Dialog>
  );
}

function ActivityLogForm({
  scheduledDate,
  onSave,
}: {
  scheduledDate: Date;
  onSave: (actualDate: string, note: string) => void;
}) {
  const [actualDate, setActualDate] = useState(() => formatLocalYMD(scheduledDate));
  const [note, setNote] = useState("");

  return (
    <FieldGroup className="gap-4">
      <Field>
        <FieldLabel htmlFor="log-date">Dilakukan Pada</FieldLabel>
        <Input
          id="log-date"
          type="date"
          max={todayYMD()}
          value={actualDate}
          onChange={(e) => setActualDate(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="log-note">Catatan</FieldLabel>
        <Textarea
          id="log-note"
          rows={3}
          placeholder="Ada kendala?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Button
        className="w-full"
        onClick={() => {
          if (!actualDate || actualDate > todayYMD()) {
            toast.error("Tanggal dilakukan tidak boleh di masa depan.");
            return;
          }
          onSave(actualDate, note);
        }}
      >
        Simpan Log
      </Button>
    </FieldGroup>
  );
}
