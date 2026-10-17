import { Link2 } from "lucide-react";
import { useNavigate } from "react-router";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useActivities, useProjects, useProjectTasks, useResources, useSchedules } from "@/data/collections";
import { useNotebookUsage } from "@/data/use-notebooks";
import { useLatchedWhileOpen } from "@/hooks/use-retained";
import { type NoteReference, noteReferences } from "./note-references";

/** Rujukan lampiran ke satu catatan dari semua koleksi (Planner, Productivity, Resource Global). */
export function useNoteReferences() {
  const { items: schedules } = useSchedules();
  const { items: projects } = useProjects();
  const { items: activities } = useActivities();
  const { items: tasks } = useProjectTasks();
  const { items: resources } = useResources();
  const { data: notebooks } = useNotebookUsage();
  return (key: string) => noteReferences(key, { schedules, projects, activities, tasks, resources, notebooks });
}

interface NoteDeleteDialogProps {
  /** Key catatan yang akan dihapus ("free-<id>" | "ai-<id>" | "list-<id>"), null = tertutup */
  noteKey: string | null;
  itemName?: string;
  title: string;
  description: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/**
 * Konfirmasi hapus catatan. Catatan yang masih menjadi lampiran (hasil/dasar agenda, Project, Area, Action/Task),
 * Resource Global, atau sumber My Notebook tidak bisa dihapus: dialog menampilkan tempat-tempatnya agar tautan dilepas
 * dulu.
 */
export function NoteDeleteDialog({
  noteKey,
  itemName,
  title,
  description,
  onOpenChange,
  onConfirm,
}: NoteDeleteDialogProps) {
  const findReferences = useNoteReferences();
  const open = !!noteKey;
  // Key & nama dipertahankan selama animasi menutup (nilai primitif → aman untuk latch)
  const key = useLatchedWhileOpen(open, noteKey);
  const found = key ? findReferences(key) : [];
  const refs = found.length ? found : null;
  const name = useLatchedWhileOpen(open, itemName);
  const navigate = useNavigate();

  if (!refs) {
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description={description}
        itemName={itemName}
        confirmLabel="Hapus"
        onConfirm={onConfirm}
      />
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-warning/15 text-warning-foreground dark:text-warning">
            <Link2 />
          </AlertDialogMedia>
          <AlertDialogTitle>Catatan Masih Ditautkan</AlertDialogTitle>
          <AlertDialogDescription>
            {name && <span className="mb-2 block font-semibold text-foreground">{name}</span>}
            Catatan ini dipakai di {refs.length} tempat (lampiran, Resource Global, atau sumber notebook). Lepas
            tautannya dulu sebelum menghapus agar tidak ada yang menunjuk catatan yang sudah tidak ada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="flex max-h-60 flex-col divide-y overflow-y-auto rounded-xl border text-sm">
          {refs.map((ref: NoteReference, i: number) => (
            <li key={`${ref.path}-${ref.place}-${i}`}>
              <button
                type="button"
                className="flex w-full min-w-0 flex-col items-start px-3 py-2 text-left hover:bg-muted"
                title="Buka untuk melepas tautan"
                onClick={() => {
                  onOpenChange(false);
                  void navigate(ref.path);
                }}
              >
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">{ref.place}</span>
                <span className="w-full truncate font-medium text-module">{ref.title || "Tanpa judul"}</span>
              </button>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Tutup</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
