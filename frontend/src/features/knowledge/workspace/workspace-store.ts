import { createContext, useCallback, useContext } from "react";
import { useNavigate } from "react-router";
import { create } from "zustand";
import { links } from "@/lib/deep-links";
import { openNoteSearch, type NotePane } from "./knowledge-logic";
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
  | { kind: "quick-switcher"; side?: boolean }
  | { kind: "command-palette" }
  | { kind: "versions"; id: string; title: string }
  | ComposeDialog;

/** Note composer: gabung seluruh catatan, atau ekstrak pilihan teks editor (posisi karakter + teks). */
export type ComposeDialog =
  | { kind: "compose"; mode: "merge"; source: { id: string; path: string } }
  | { kind: "compose"; mode: "split"; source: { id: string; path: string } }
  | {
      kind: "compose";
      mode: "extract";
      source: { id: string; path: string };
      from: number;
      to: number;
      text: string;
      /** Dari perintah pecah di kursor (teks kursor → akhir catatan), bukan pilihan teks */
      cursor?: boolean;
    };

/** Kendali editor sumber yang terbuka: kirim perubahan tertunda, muat ulang isi berkas. */
export interface EditorControl {
  flush: () => Promise<boolean>;
  reload: () => Promise<void>;
}

/** Editor yang terbuka per catatan (bisa dua, satu per panel): operasi yang menulis beberapa catatan harus menyentuh semuanya. */
const openEditors = new Map<string, { readonly current: EditorControl | null }>();

export function registerNoteEditor(id: string, control: { readonly current: EditorControl | null }) {
  openEditors.set(id, control);
  return () => {
    if (openEditors.get(id) === control) openEditors.delete(id);
  };
}

/** Kirim perubahan tertunda semua editor; false bila ada yang gagal tersimpan. */
export async function flushOpenEditors() {
  for (const control of openEditors.values()) if (control.current && !(await control.current.flush())) return false;
  return true;
}

/** Muat ulang isi editor yang terbuka setelah berkasnya ditulis server (`except` = catatan yang sudah tidak ada). */
export async function reloadOpenEditors(except?: string) {
  for (const [id, control] of openEditors) if (id !== except) await control.current?.reload();
}

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
  control: { readonly current: EditorControl | null };
  bookmarked: boolean;
  toggleBookmark: () => void;
}

/** Sisip ke editor CodeMirror yang terbuka (palet perintah). */
export interface EditorBridge {
  insertSnippet: (id: string) => void;
  insertTemplate: (templateId: string) => Promise<void>;
  /** Pilihan teks di editor (posisi karakter dokumen), null bila tidak ada. */
  selection: () => { from: number; to: number; text: string } | null;
  /** Teks dari kursor sampai akhir dokumen, null bila kursor di akhir. */
  tail: () => { from: number; to: number; text: string } | null;
}

interface WorkspaceStore {
  dialog: DialogState | null;
  /** Catatan yang sedang dibuka di tab Catatan (diisi NoteView) — sumber grup "Catatan ini" di palet perintah. */
  active: ActiveNote | null;
  /** Editor sumber yang sedang terbuka (diisi NoteEditor) — sumber grup "Sisipkan". */
  editor: EditorBridge | null;
  /** Panel aktif saat dua catatan berdampingan (K11): sumber panel info, palet perintah, dan tujuan membuka catatan. */
  focusedPane: NotePane;
  open: (dialog: DialogState) => void;
  close: () => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  dialog: null,
  active: null,
  editor: null,
  focusedPane: "primary",
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}));

export const openWorkspaceDialog = (dialog: DialogState) => useWorkspaceStore.getState().open(dialog);

const NOTES_PATH = "/knowledge/notes";
/** Sama dengan batas tata letak tiga kolom tab Catatan: di bawah ini dua catatan tidak muat berdampingan. */
export const SPLIT_MEDIA_QUERY = "(min-width: 1280px)";

/**
 * Buka catatan di tab Catatan (riwayat browser = tombol maju/mundur). Di tab Catatan yang sedang dua panel, catatan masuk ke panel
 * aktif; `side` = buka berdampingan.
 */
export function useOpenNote() {
  const navigate = useNavigate();
  return useCallback(
    (id: string, heading?: string, options?: { replace?: boolean; side?: boolean }) => {
      if (window.location.pathname !== NOTES_PATH) {
        void navigate(links.knowledgeNote(id, heading), { replace: options?.replace });
        return;
      }
      const side = !!options?.side && window.matchMedia(SPLIT_MEDIA_QUERY).matches;
      const { focusedPane } = useWorkspaceStore.getState();
      const next = openNoteSearch(window.location.search, id, heading, focusedPane, side);
      if (next.pane !== focusedPane) useWorkspaceStore.setState({ focusedPane: next.pane });
      void navigate(`${NOTES_PATH}?${next.search}`, { replace: options?.replace });
    },
    [navigate],
  );
}

/** Panel tempat sebuah catatan dirender: hanya panel aktif yang mendaftarkan diri ke store; lompat judul memakai param sendiri. */
export const NotePaneContext = createContext<{ focused: boolean; headingParam: "h" | "h2" }>({
  focused: true,
  headingParam: "h",
});
export const useNotePane = () => useContext(NotePaneContext);
