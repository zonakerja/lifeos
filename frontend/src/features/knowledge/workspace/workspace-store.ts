import { useCallback } from "react";
import { useNavigate } from "react-router";
import { create } from "zustand";
import { links } from "@/lib/deep-links";
import type { KnowledgeNoteListItem } from "@/types/api";

/** Dialog bersama menu Knowledge (dibuka dari penjelajah, pembaca, graf, Inbox, pembuka cepat). */
type DialogState =
  | { kind: "new-note"; folder?: string; title?: string }
  | { kind: "new-folder"; parent?: string }
  | { kind: "move-note"; note: KnowledgeNoteListItem; mode: "rename" | "move" }
  | { kind: "move-folder"; path: string }
  | { kind: "delete-note"; note: KnowledgeNoteListItem }
  | { kind: "delete-folder"; path: string; count: number }
  | { kind: "curate"; note: KnowledgeNoteListItem }
  | { kind: "quick-switcher" }
  | { kind: "command-palette" }
  | { kind: "versions"; id: string; title: string };

/** Aksi catatan terbuka yang dipakai palet perintah (fungsi dari NoteView). */
export interface ActiveNote {
  id: string;
  path: string;
  title: string;
  item: KnowledgeNoteListItem | null;
  editable: boolean;
  mirror: boolean;
  mode: "read" | "edit";
  setMode: (mode: "read" | "edit") => void;
  bookmarked: boolean;
  toggleBookmark: () => void;
}

/** Sisip ke editor CodeMirror yang terbuka (palet perintah). */
export interface EditorBridge {
  insertSnippet: (id: string) => void;
  insertTemplate: (templateId: string) => Promise<void>;
}

interface WorkspaceStore {
  dialog: DialogState | null;
  /** Catatan yang sedang dibuka di tab Catatan (diisi NoteView) — sumber grup "Catatan ini" di palet perintah. */
  active: ActiveNote | null;
  /** Editor sumber yang sedang terbuka (diisi NoteEditor) — sumber grup "Sisipkan". */
  editor: EditorBridge | null;
  open: (dialog: DialogState) => void;
  close: () => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  dialog: null,
  active: null,
  editor: null,
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
