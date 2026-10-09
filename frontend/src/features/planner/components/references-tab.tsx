import { PencilLine, Plus, Tag, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { RenameDialog } from "@/components/common/rename-dialog";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/use-permissions";
import { generateId } from "@/lib/ids";
import type { AgendaType } from "@/types/entities";
import { useAgendaTypeList } from "../use-agenda-types";

export function ReferencesTab() {
  const { items: types, setItems } = useAgendaTypeList();
  const { canEdit } = usePermissions();
  const [newType, setNewType] = useState("");
  const [renaming, setRenaming] = useState<AgendaType | null>(null);
  const [deleting, setDeleting] = useState<AgendaType | null>(null);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const name = newType.trim();
    if (!name) return;
    if (types.some((t) => t.name === name)) {
      toast.error("Tipe sudah ada.");
      return;
    }
    const order = Math.max(-1, ...types.map((t) => t.order ?? 0)) + 1;
    setItems((prev) => [...prev, { id: generateId("type"), name, order }]);
    setNewType("");
  };

  return (
    <SectionCard icon={Tag} title="Referensi Planner" description="Kelola kategori dan tipe untuk jadwal Anda.">
      <div className="flex flex-col gap-6">
        {canEdit && (
          <form onSubmit={add} className="flex flex-col gap-2 rounded-2xl border bg-muted/40 p-4">
            <span className="text-sm font-semibold">Tambah Tipe Agenda</span>
            <div className="flex gap-2">
              <Input placeholder="Contoh: Webinar..." value={newType} onChange={(e) => setNewType(e.target.value)} />
              <Button type="submit">
                <Plus /> Tambah
              </Button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {types.map((type) => (
            <div
              key={type.id}
              className="group flex items-center justify-between gap-2 rounded-xl border bg-card p-3 transition-shadow hover:shadow-md"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <span className="size-2 shrink-0 rounded-full bg-module" />
                <span className="truncate">{type.name}</span>
              </span>
              {canEdit && (
                <div className="flex gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                  <Button variant="ghost" size="icon-xs" title="Ubah" onClick={() => setRenaming(type)}>
                    <PencilLine />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Hapus"
                    className="hover:text-destructive"
                    onClick={() => setDeleting(type)}
                  >
                    <X />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <RenameDialog
        open={!!renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
        title="Ubah Tipe Agenda"
        initialValue={renaming?.name ?? ""}
        onSave={(name) => {
          if (renaming) setItems((prev) => prev.map((t) => (t.id === renaming.id ? { ...t, name } : t)));
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Tipe?"
        description="Tipe agenda ini akan dihapus dari pilihan."
        itemName={deleting?.name}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting) setItems((prev) => prev.filter((t) => t.id !== deleting.id));
          setDeleting(null);
        }}
      />
    </SectionCard>
  );
}
