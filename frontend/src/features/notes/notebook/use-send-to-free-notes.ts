import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useFreeNotes } from "@/data/collections";
import { links } from "@/lib/deep-links";
import type { FreeNote } from "@/types/entities";

// Dipanggil hanya dari event handler (waktu & ID catatan baru)
const nowIso = () => new Date().toISOString();
const newNoteId = () => Date.now();

/** Salin Markdown (jawaban/catatan notebook) menjadi Catatan Bebas berformat yang bisa diedit & dibagikan. */
export function useSendToFreeNotes() {
  const { upsert } = useFreeNotes();
  const navigate = useNavigate();

  return async (title: string, markdown: string) => {
    try {
      // Konverter memakai Tiptap → dimuat hanya saat dipakai
      const { markdownToDoc } = await import("../editor/markdown-to-doc");
      const { doc, text } = markdownToDoc(markdown);
      const note: FreeNote = {
        id: newNoteId(),
        title,
        kind: "text",
        doc,
        content: text,
        color: "bg-blue-50",
        updatedAt: nowIso(),
      };
      upsert(note);
      toast.success("Disalin ke Catatan Bebas", {
        description: title,
        action: { label: "Buka", onClick: () => void navigate(links.note("free", note.id)) },
      });
    } catch (error) {
      toast.error("Gagal menyalin ke Catatan Bebas", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
