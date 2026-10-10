import { MapPin } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { usePhysRefs } from "@/data/collections";
import { useRetained } from "@/hooks/use-retained";
import type { PhysicalReference, PhysRefType } from "@/types/entities";
import { generateNextCode, PHYS_TYPE_LABEL } from "../lib/archive";

const NONE = "__none";

/** Target form: wadah yang diedit, atau wadah baru dengan tipe (+ induk tetap bila dari Penataan). */
export type PhysRefFormTarget =
  | { mode: "edit"; item: PhysicalReference; lockParent?: boolean }
  | { mode: "new"; type: PhysRefType; parentId?: string; lockParent?: boolean };

type PhysRefDraft = Omit<PhysicalReference, "id"> & { id?: string };

/** Form tambah/ubah wadah fisik dengan pemilih induk bertingkat. */
export function PhysRefFormDialog({
  target: targetProp,
  onClose,
  onSave,
}: {
  target: PhysRefFormTarget | null;
  onClose: () => void;
  onSave: (data: PhysRefDraft) => void;
}) {
  const target = useRetained(targetProp);
  const type = target?.mode === "edit" ? target.item.type : target?.type;
  return (
    <Dialog open={!!targetProp} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{target?.mode === "edit" ? "Edit Data" : "Tambah Baru"}</DialogTitle>
          <DialogDescription>Referensi {type ? PHYS_TYPE_LABEL[type] : "Wadah"}</DialogDescription>
        </DialogHeader>
        {target && (
          <PhysRefForm
            key={target.mode === "edit" ? target.item.id : `new-${target.type}-${target.parentId ?? ""}`}
            target={target}
            onCancel={onClose}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PhysRefForm({
  target,
  onCancel,
  onSave,
}: {
  target: PhysRefFormTarget;
  onCancel: () => void;
  onSave: (data: PhysRefDraft) => void;
}) {
  const { items: refs } = usePhysRefs();
  const type = target.mode === "edit" ? target.item.type : target.type;
  const locked = !!target.lockParent;
  const find = (id?: string) => refs.find((r) => r.id === id);

  const [form, setForm] = useState<PhysRefDraft>(() =>
    target.mode === "edit"
      ? { ...target.item, parentId: target.item.parentId || "" }
      : { type, code: generateNextCode(refs, type), name: "", description: "", parentId: target.parentId || "" },
  );

  // Turunkan pilihan gedung/rak/box dari parentId saat ini
  const [selection, setSelection] = useState(() => {
    const parent = form.parentId || "";
    if (type === "rack") return { loc: parent, rack: "", box: "" };
    if (type === "box") return { loc: find(parent)?.parentId || "", rack: parent, box: "" };
    if (type === "folder") {
      const rack = find(parent)?.parentId || "";
      return { loc: find(rack)?.parentId || "", rack, box: parent };
    }
    return { loc: "", rack: "", box: "" };
  });

  const byCode = (a: PhysicalReference, b: PhysicalReference) => (a.code || "").localeCompare(b.code || "");
  const locations = refs.filter((r) => r.type === "location").sort(byCode);
  const racks = refs.filter((r) => r.type === "rack" && r.parentId === selection.loc).sort(byCode);
  const boxes = refs.filter((r) => r.type === "box" && r.parentId === selection.rack).sort(byCode);

  const level = (
    label: string,
    value: string,
    options: PhysicalReference[],
    disabled: boolean,
    onChange: (value: string) => void,
  ) => (
    <Select value={value || NONE} disabled={disabled} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger className="w-full bg-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>-- Pilih {label} --</SelectItem>
        {options.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.code} - {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const valid = form.code.trim() && form.name.trim() && (type === "location" || form.parentId);

  return (
    <>
      <div className="-mx-1 flex-1 overflow-y-auto px-1">
        <FieldGroup className="gap-4">
          {type !== "location" && (
            <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase">
                  <MapPin className="size-3.5" /> Penempatan (Hierarki Induk)
                </h4>
                {locked && <Badge variant="secondary">Otomatis Sesuai Konteks</Badge>}
              </div>
              {level("Gedung / Ruang", selection.loc, locations, locked, (v) => {
                setSelection({ loc: v, rack: "", box: "" });
                setForm((prev) => ({ ...prev, parentId: type === "rack" ? v : "" }));
              })}
              {(type === "box" || type === "folder") &&
                level("Lemari / Rak", selection.rack, racks, locked || !selection.loc, (v) => {
                  setSelection((prev) => ({ ...prev, rack: v, box: "" }));
                  setForm((prev) => ({ ...prev, parentId: type === "box" ? v : "" }));
                })}
              {type === "folder" &&
                level("Boks Arsip", selection.box, boxes, locked || !selection.rack, (v) => {
                  setSelection((prev) => ({ ...prev, box: v }));
                  setForm((prev) => ({ ...prev, parentId: v }));
                })}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Field>
              <FieldLabel htmlFor="phys-code">Kode</FieldLabel>
              <Input
                id="phys-code"
                className="font-mono font-bold uppercase"
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
              />
            </Field>
            <Field className="col-span-2">
              <FieldLabel htmlFor="phys-name">Nama / Label</FieldLabel>
              <Input
                id="phys-name"
                autoFocus
                placeholder={`Nama ${PHYS_TYPE_LABEL[type]}...`}
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="phys-desc">Deskripsi</FieldLabel>
            <Textarea
              id="phys-desc"
              rows={3}
              value={form.description ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </Field>
        </FieldGroup>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Batal
        </Button>
        <Button disabled={!valid} onClick={() => onSave({ ...form, type })}>
          Simpan Data
        </Button>
      </DialogFooter>
    </>
  );
}
