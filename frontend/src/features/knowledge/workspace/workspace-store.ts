import { useCallback } from "react";
import { useNavigate } from "react-router";
import { create } from "zustand";
import { links } from "@/lib/deep-links";
import type { KnowledgeNoteListItem } from "@/types/api";

/** Dialog bersama menu Pengetahuan (dibuka dari penjelajah, pembaca, graf, Inbox, pembuka cepat). */
type DialogState =
  | { kind: "new-note"; folder?: string; title?: string }
  | { kind: "new-folder"; parent?: string }
  | { kind: "move-note"; note: KnowledgeNoteListItem; mode: "rename" | "move" }
  | { kind: "move-folder"; path: string }
  | { kind: "delete-note"; note: KnowledgeNoteListItem }
  | { kind: "delete-folder"; path: string; count: number }
  | { kind: "curate"; note: KnowledgeNoteListItem }
  | { kind: "quick-switcher" };

interface WorkspaceStore {
  dialog: DialogState | null;
  open: (dialog: DialogState) => void;
  close: () => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  dialog: null,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}));

export const openWorkspaceDialog = (dialog: DialogState) => useWorkspaceStore.getState().open(dialog);

/** Buka catatan di tab Catatan (riwayat browser = tombol maju/mundur). */
export function useOpenNote() {
  const navigate = useNavigate();
  return useCallback(
    (id: string, heading?: string, options?: { replace?: boolean }) =>
      void navigate(links.knowledgeNote(id, heading), { replace: options?.replace }),
    [navigate],
  );
}
