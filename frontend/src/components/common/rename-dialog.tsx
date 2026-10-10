import { PencilLine } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  label?: string;
  initialValue: string;
  onSave: (value: string) => void;
}

/** Dialog ubah nama satu field. */
export function RenameDialog({ open, onOpenChange, title = "Ubah Referensi", ...rest }: RenameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PencilLine className="size-5 text-module" /> {title}
          </DialogTitle>
        </DialogHeader>
        {/* Konten di-mount ulang setiap dialog dibuka → state awal langsung dari props */}
        <RenameForm {...rest} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({
  label = "Nama Baru",
  initialValue,
  onSave,
  onDone,
}: Pick<RenameDialogProps, "label" | "initialValue" | "onSave"> & { onDone: () => void }) {
  const [value, setValue] = useState(initialValue);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSave(value.trim());
        onDone();
      }}
      className="flex flex-col gap-4"
    >
      <Field>
        <FieldLabel htmlFor="rename-input">{label}</FieldLabel>
        <Input id="rename-input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="submit" className="w-full">
          Simpan Perubahan
        </Button>
      </DialogFooter>
    </form>
  );
}
