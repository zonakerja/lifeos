import { FileText, Library, Link2, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AttachedResource } from "@/types/entities";
import { attachmentLabel } from "./resource-utils";

interface DeleteWithFilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Nama item yang dihapus (ditampilkan tebal) */
  itemName?: string;
  /** Lampiran berkas milik item (lihat `ownedFiles`) */
  files: AttachedResource[];
  /** `uploadId` yang masih dipakai di tempat lain (tidak bisa dihapus) */
  shared?: Set<string>;
  confirmLabel?: string;
  /** `keepIds` = ID lampiran yang dipertahankan sebagai Resource global */
  onConfirm: (keepIds: string[]) => void;
  /** Isi tambahan di atas daftar berkas (mis. pilihan cakupan seri agenda) */
  children?: ReactNode;
}

/**
 * Konfirmasi hapus item beserta berkas lampirannya (dipakai bersama Planner & Productivity). Secara default semua berkas
 * ikut dihapus; user bisa mempertahankan satu atau lebih berkas → dipindah menjadi Resource global.
 */
export function DeleteWithFilesDialog(props: DeleteWithFilesDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="size-5 text-destructive" /> {props.title}
          </DialogTitle>
          <DialogDescription>
            {props.description}
            {props.itemName && (
              <>
                {" "}
                <span className="font-semibold text-foreground">"{props.itemName}"</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {/* Di-mount ulang setiap dibuka → pilihan "pertahankan" selalu mulai kosong */}
        {props.open && <DeleteWithFilesBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function DeleteWithFilesBody({
  children,
  files,
  shared = new Set(),
  confirmLabel = "Hapus",
  onConfirm,
  onOpenChange,
}: DeleteWithFilesDialogProps) {
  const [keep, setKeep] = useState<Set<string>>(() => new Set());
  const removable = files.filter((f) => !shared.has(f.uploadId ?? ""));
  const toggle = (id: string, checked: boolean) =>
    setKeep((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  const removeCount = removable.filter((f) => !keep.has(f.id)).length;

  return (
    <>
      {children}
      {files.length > 0 && (
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Berkas terlampir ({files.length})</p>
            {removable.length > 1 && (
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setKeep(new Set())}>
                  Hapus semua
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => setKeep(new Set(removable.map((f) => f.id)))}
                >
                  Pertahankan semua
                </Button>
              </div>
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {files.map((file) => {
              const isShared = shared.has(file.uploadId ?? "");
              const kept = keep.has(file.id);
              return (
                <li
                  key={file.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3",
                    isShared || kept ? "bg-card" : "border-destructive/30 bg-destructive/5",
                  )}
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{attachmentLabel(file)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {isShared
                        ? "Dipakai di tempat lain — tetap disimpan"
                        : kept
                          ? "Dipertahankan → Resource Global"
                          : "Akan dihapus permanen"}
                    </span>
                  </span>
                  {isShared ? (
                    <Badge variant="secondary" className="shrink-0">
                      <Link2 /> Dipakai
                    </Badge>
                  ) : (
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium">
                      <Checkbox checked={kept} onCheckedChange={(c) => toggle(file.id, c === true)} />
                      <Library className="size-3.5 text-module" /> Pertahankan
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <DialogFooter className="items-center gap-2 sm:justify-between">
        <span className="text-xs text-muted-foreground">
          {files.length > 0 &&
            (removeCount > 0 ? `${removeCount} berkas akan dihapus permanen` : "Tidak ada berkas yang dihapus")}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" variant="destructive" onClick={() => onConfirm([...keep])}>
            <Trash2 /> {confirmLabel}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
