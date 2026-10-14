import { FileText, Globe, type LucideIcon, NotebookPen, Type } from "lucide-react";
import type {
  NotebookCitation,
  NotebookRecordType,
  NotebookSource,
  NotebookSourceKind,
  NotebookSummary,
} from "@/types/api";

export const SOURCE_KIND_META: Record<NotebookSourceKind, { label: string; icon: LucideIcon }> = {
  upload: { label: "Berkas", icon: FileText },
  record: { label: "Item LifeOS", icon: NotebookPen },
  text: { label: "Teks", icon: Type },
  web: { label: "Halaman web", icon: Globe },
};

export const RECORD_TYPE_LABEL: Record<NotebookRecordType, string> = {
  free_note: "Catatan Bebas",
  ai_note: "Notes AI",
  list: "List",
  para_resource: "Resource",
};

/** Batas teks tempel (sama dengan backend). */
export const MAX_TEXT_SOURCE_CHARS = 500_000;

/**
 * Teks jawaban tanpa nomor rujukan [1], [1, 3], [2-4] — dipakai saat disalin agar hasil tempelan bersih
 * (tautan Markdown `[teks](url)` tidak terpengaruh).
 */
export const stripCitations = (text: string) =>
  text.replace(/[ \t]*\[\d+(?:\s*[-–,]\s*\d+)*\](?!\()/g, "").replace(/[ \t]+([.,;:!?])/g, "$1");

export const readySources = (sources: NotebookSource[]) => sources.filter((s) => s.enabled && s.status === "ready");

/** Judul pendek dari teks (baris pertama, tanpa sintaks Markdown). */
export const shortTitle = (text: string, max = 80) => {
  const line =
    text
      .split("\n")
      .map((l) =>
        l
          .replace(/^[#>\-*\d.\s]+/, "")
          .replace(/[*_`]/g, "")
          .trim(),
      )
      .find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** Daftar sumber sitasi di akhir catatan agar asal informasi tetap terlacak. */
const citationFooter = (citations: NotebookCitation[] | null | undefined) =>
  citations?.length ? `\n\n---\n**Sumber:**\n${citations.map((c) => `- [${c.n}] ${c.title}`).join("\n")}` : "";

/** Jawaban chat → catatan notebook (judul dari pertanyaan). */
export const answerToNote = (question: string | undefined, answer: string, citations?: NotebookCitation[] | null) => ({
  title: shortTitle(question || answer) || "Jawaban notebook",
  content: `${answer.trim()}${citationFooter(citations)}`,
  origin: "chat" as const,
});

/** Ringkasan Studio → catatan notebook. */
export const summaryToNote = (notebookTitle: string, summary: NotebookSummary) => ({
  title: `Ringkasan: ${notebookTitle}`,
  content: [
    "## Ikhtisar",
    summary.overview,
    summary.keyPoints.length ? `\n## Poin kunci\n${summary.keyPoints.map((p) => `- ${p}`).join("\n")}` : "",
    summary.questions.length ? `\n## Pertanyaan lanjutan\n${summary.questions.map((q) => `- ${q}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n"),
  origin: "summary" as const,
});
