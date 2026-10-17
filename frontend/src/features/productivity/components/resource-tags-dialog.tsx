import { Check, PencilLine, Tags, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { useResources } from "@/data/collections";
import {
  freeTagCounts,
  isContextTag,
  MAX_TAG_LENGTH,
  normalizeTag,
  renameResourceTag,
} from "@/features/resources/resource-tags";

/**
 * Kelola tag bebas Resource Global milik sendiri: ganti nama (sekaligus menggabungkan bila nama tujuan sudah dipakai)
 * dan hapus dari semua resource. Tag konteks (asal) tidak bisa diubah. Resource milik user lain (berbagi) tidak disentuh.
 */
export function ResourceTagsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { items: resources, setItems: setResources } = useResources();
  const own = resources.filter((r) => !r.share);
  const counts = freeTagCounts(own);
  const [editing, setEditing] = useState<{ tag: string; value: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const apply = (from: string, to: string | null) =>
    setResources((prev) => prev.map((r) => (r.share ? r : renameResourceTag(r, from, to))));

  const saveRename = () => {
    if (!editing) return;
    const target = normalizeTag(editing.value);
    if (!target) return toast.error("Nama tag wajib diisi.");
    if (isContextTag(target)) return toast.error(`"${target}" adalah tag asal otomatis dan tidak bisa dipakai.`);
    if (target !== editing.tag) {
      const merged = counts.some((c) => c.tag.toLowerCase() === target.toLowerCase() && c.tag !== editing.tag);
      apply(editing.tag, target);
      toast.success(merged ? `Tag "${editing.tag}" digabung ke "${target}".` : `Tag diganti menjadi "${target}".`);
    }
    setEditing(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setEditing(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="size-5 text-module" /> Kelola Tag
          </DialogTitle>
          <DialogDescription>
            Ganti nama (nama yang sudah ada = digabung) atau hapus tag bebas dari semua resource Anda. Tag asal otomatis
            tidak ditampilkan.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {counts.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyDescription>
                  Belum ada tag bebas. Tambahkan lewat form Resource atau form lampiran.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col divide-y rounded-xl border">
              {counts.map(({ tag, count }) => (
                <li key={tag} className="flex items-center gap-2 px-3 py-2">
                  {editing?.tag === tag ? (
                    <>
                      <Input
                        autoFocus
                        className="h-8"
                        maxLength={MAX_TAG_LENGTH}
                        value={editing.value}
                        onChange={(e) => setEditing({ tag, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename();
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setEditing(null);
                          }
                        }}
                      />
                      <Button size="icon-sm" title="Simpan" onClick={saveRename}>
                        <Check />
                      </Button>
                      <Button size="icon-sm" variant="ghost" title="Batal" onClick={() => setEditing(null)}>
                        <X />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge className="bg-module-soft text-module">{tag}</Badge>
                      <span className="flex-1 text-xs text-muted-foreground">{count} resource</span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title="Ganti nama / gabungkan"
                        onClick={() => setEditing({ tag, value: tag })}
                      >
                        <PencilLine />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title="Hapus tag"
                        className="hover:text-destructive"
                        onClick={() => setDeleting(tag)}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <ConfirmDialog
          open={!!deleting}
          onOpenChange={(next) => !next && setDeleting(null)}
          title="Hapus Tag?"
          description="Tag ini dilepas dari semua resource Anda (resource-nya tidak dihapus) dan tidak ditambahkan ulang dari lampiran yang masih membawanya."
          itemName={deleting ?? undefined}
          confirmLabel="Hapus Tag"
          onConfirm={() => {
            if (deleting) apply(deleting, null);
            setDeleting(null);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
