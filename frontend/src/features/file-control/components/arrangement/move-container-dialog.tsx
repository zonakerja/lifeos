import { ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { SearchableSelect } from "@/components/common/searchable-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { usePhysRefs } from "@/data/collections";
import { useRetained } from "@/hooks/use-retained";
import type { PhysicalReference, PhysRefType } from "@/types/entities";
import { PHYS_TYPE_LABEL } from "../../lib/archive";
import { ContainerIcon } from "../archive-ui";

const PARENT_TYPE: Partial<Record<PhysRefType, PhysRefType>> = { rack: "location", box: "rack", folder: "box" };

/** Pindahkan satu wadah ke induk baru sesuai hierarki. */
export function MoveContainerDialog({
  item: itemProp,
  onClose,
  onMove,
}: {
  item: PhysicalReference | null;
  onClose: () => void;
  onMove: (item: PhysicalReference, target: PhysicalReference) => void;
}) {
  const item = useRetained(itemProp);
  return (
    <Dialog open={!!itemProp} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pindahkan Wadah</DialogTitle>
          <DialogDescription>Pilih wadah induk baru sesuai hierarki penyimpanan.</DialogDescription>
        </DialogHeader>
        {item && <MoveForm key={item.id} item={item} onClose={onClose} onMove={onMove} />}
      </DialogContent>
    </Dialog>
  );
}

function MoveForm({
  item,
  onClose,
  onMove,
}: {
  item: PhysicalReference;
  onClose: () => void;
  onMove: (item: PhysicalReference, target: PhysicalReference) => void;
}) {
  const { items: refs } = usePhysRefs();
  const [targetId, setTargetId] = useState("");
  const parentType = PARENT_TYPE[item.type];
  const options = parentType ? refs.filter((r) => r.type === parentType && r.id !== item.parentId) : [];

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-4">
        <ContainerIcon type={item.type} />
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-muted-foreground uppercase">Item yang dipindahkan</p>
          <p className="truncate text-sm font-bold">{item.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{item.code || "-"}</p>
        </div>
      </div>
      {parentType ? (
        <Field>
          <FieldLabel>Pindahkan ke {PHYS_TYPE_LABEL[parentType]} Baru</FieldLabel>
          <SearchableSelect
            value={targetId}
            onChange={setTargetId}
            placeholder="-- Pilih Tujuan --"
            options={options.map((r) => ({ value: r.id, label: `${r.code} - ${r.name}` }))}
          />
        </Field>
      ) : (
        <p className="text-sm text-muted-foreground">
          Gedung / ruang berada di tingkat teratas dan tidak dapat dipindahkan.
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Batal
        </Button>
        <Button
          disabled={!targetId}
          onClick={() => {
            const target = refs.find((r) => r.id === targetId);
            if (target) onMove(item, target);
          }}
        >
          <ArrowRightLeft /> Simpan Perpindahan
        </Button>
      </DialogFooter>
    </>
  );
}
