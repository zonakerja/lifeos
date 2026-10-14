import { Editor, type JSONContent } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { noteExtensions } from "./note-extensions";

/**
 * Markdown (jawaban AI, catatan notebook) → dokumen editor Catatan Bebas + teks biasanya (untuk `content`). Memakai
 * editor tanpa tampilan dengan extension yang sama, sehingga judul, daftar, tabel, dan checklist menjadi blok yang bisa
 * diedit.
 */
export function markdownToDoc(markdown: string): { doc: JSONContent; text: string } {
  const editor = new Editor({
    extensions: [...noteExtensions(), Markdown],
    content: markdown,
    contentType: "markdown",
  });
  try {
    return {
      doc: editor.getJSON(),
      text: editor
        .getText({ blockSeparator: "\n" })
        .replace(/\n{2,}/g, "\n")
        .trim(),
    };
  } finally {
    editor.destroy();
  }
}
