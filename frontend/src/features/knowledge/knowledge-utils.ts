import { matchesWords, queryWords } from "@/features/planner/lib/planner-search";
import { links } from "@/lib/deep-links";
import { sharedItemPath } from "@/lib/sharing";
import type { AiChatCitation, KnowledgeNoteListItem, KnowledgeNoteStatus, RecordType } from "@/types/api";

/** Logika murni basis pengetahuan & sitasi chatbot (diuji di `knowledge-utils.test.ts`). */

export const STATUS_LABEL: Record<KnowledgeNoteStatus, string> = {
  berlaku: "Berlaku",
  draf: "Draf",
  dicabut: "Dicabut",
  templat: "Templat",
};

export const STATUS_TONE: Record<KnowledgeNoteStatus, string> = {
  berlaku: "bg-success/15 text-success",
  draf: "bg-warning/15 text-warning",
  dicabut: "bg-destructive/15 text-destructive",
  templat: "bg-muted text-muted-foreground",
};

/** `[[Target|alias]]` / `![[berkas.pdf]]` → teks terbaca (alias atau target) untuk tampilan Markdown. */
export const readableWikilinks = (text: string) =>
  text.replace(
    /!?\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g,
    (_, target: string, alias?: string) => `**${(alias ?? target.replace(/[#^].*$/, "")).trim()}**`,
  );

/**
 * Isi catatan untuk tampilan: tautan dibuat terbaca dan ganti baris tunggal dipertahankan (seperti tampilan bawaan
 * Obsidian), kecuali di dalam blok kode.
 */
export const noteDisplayMarkdown = (text: string) =>
  readableWikilinks(text)
    .split(/(```[\s\S]*?```)/g)
    .map((part, i) => (i % 2 ? part : part.replace(/([^\n])\n(?=[^\n])/g, "$1  \n")))
    .join("");

/** Halaman tujuan sitasi record (data kerja); null = tidak punya halaman sendiri. */
export function recordSourcePath(type: string, id: string): string | null {
  switch (type) {
    case "todo":
      return links.todo(id);
    case "routine":
      return links.routineEdit(id);
    case "para_task":
      return links.task(id);
    case "para_activity":
      return links.areas();
    default:
      return sharedItemPath(type as RecordType, id);
  }
}

export type CitationTarget =
  | { kind: "knowledge"; noteId: string }
  | { kind: "file"; uploadId: string; name: string }
  | { kind: "page"; path: string }
  | { kind: "none" };

/** Ke mana sitasi chatbot dibuka: catatan vault (dialog), berkas (pratinjau), atau halaman item LifeOS. */
export function citationTarget(citation: AiChatCitation): CitationTarget {
  if (citation.sourceType === "obsidian") return { kind: "knowledge", noteId: citation.sourceId };
  if (citation.sourceType === "asset") {
    return { kind: "file", uploadId: citation.sourceId, name: citation.title.replace(/^[^:]+:\s*/, "") };
  }
  const path = recordSourcePath(citation.sourceType, citation.sourceId);
  return path ? { kind: "page", path } : { kind: "none" };
}

/** Saring daftar catatan: per kata (judul, path, jenis) tanpa peka huruf/aksen + status ("none" = tanpa status). */
export function filterKnowledgeNotes(
  notes: KnowledgeNoteListItem[],
  query: string,
  status: "all" | "none" | KnowledgeNoteStatus,
) {
  const words = queryWords(query);
  return notes.filter(
    (n) =>
      (status === "all" || (status === "none" ? !n.status : n.status === status)) &&
      (!words.length || matchesWords(words, n.title, n.path, n.jenis)),
  );
}

/** Judul catatan Inbox dari pertanyaan pengguna (Obsidian: nama berkas, jadi dibuat pendek). */
export function inboxTitle(question?: string) {
  const line = (question ?? "").replace(/\s+/g, " ").trim();
  if (!line) return "Jawaban LifeOS AI";
  return line.length > 70 ? `${line.slice(0, 67).trimEnd()}…` : line;
}

/** Jawaban AI untuk Inbox: nomor sitasi diganti nama sumbernya agar tetap bermakna di Obsidian. */
export function answerForInbox(content: string, citations: AiChatCitation[] | null) {
  const byN = new Map((citations ?? []).map((c) => [c.n, c]));
  const replaced = content.replace(/\[(\d+)\]/g, (match, n: string) => {
    const citation = byN.get(Number(n));
    if (!citation) return match;
    const title = citation.title.replace(/^[^:]+:\s*/, "");
    return citation.sourceType === "obsidian" ? `([[${title}]])` : `(${title})`;
  });
  return replaced.trim();
}
