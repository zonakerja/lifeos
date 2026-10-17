import { useEffect, useRef } from "react";
import { fetchCompleteItem } from "@/data/use-complete-item";
import type { RecordType } from "@/types/api";
import type { AiNote, FreeNote } from "@/types/entities";
import { docUploadIds, uploadIdsOf } from "./notes-logic";
import { removeUploads } from "./remove-uploads";

type Note = FreeNote | AiNote;

/** Berkas yang masih dipakai catatan (tidak boleh ikut dihapus walau tercatat yatim). */
const usedUploads = (type: RecordType, note: Note) =>
  type === "free_note" ? docUploadIds((note as FreeNote).doc) : uploadIdsOf(note as AiNote);

/**
 * Pemilik catatan membersihkan berkas yang dilepas kolaborator (kolaborator tidak berhak menghapus berkas pemilik):
 * berkas di `orphanUploadIds` yang tidak lagi dipakai catatan dihapus, lalu daftarnya dikosongkan.
 */
export function useOrphanUploadsJanitor<T extends Note>(
  type: "free_note" | "ai_note",
  notes: T[],
  setItems: (updater: (prev: T[]) => T[]) => void,
) {
  const handled = useRef(new Set<string>());
  useEffect(() => {
    for (const note of notes) {
      const key = String(note.id);
      if (note.share || !note.orphanUploadIds?.length || handled.current.has(key)) continue;
      handled.current.add(key);
      const orphans = note.orphanUploadIds;
      void fetchCompleteItem(type, note)
        .then((full) => {
          const used = new Set(usedUploads(type, full));
          removeUploads(orphans.filter((id) => !used.has(id)));
          setItems((prev) => prev.map((n) => (n.id === note.id ? { ...n, orphanUploadIds: undefined } : n)));
        })
        .catch(() => handled.current.delete(key));
    }
  }, [notes, setItems, type]);
}
