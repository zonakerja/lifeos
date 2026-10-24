import { describe, expect, it } from "vitest";
import type { AiChatCitation, KnowledgeNoteListItem } from "@/types/api";
import {
  answerForInbox,
  citationTarget,
  filterKnowledgeNotes,
  inboxTitle,
  noteDisplayMarkdown,
  readableWikilinks,
  recordSourcePath,
} from "./knowledge-utils";

const citation = (over: Partial<AiChatCitation>): AiChatCitation => ({
  n: 1,
  sourceType: "obsidian",
  sourceId: "n1",
  collection: "knowledge",
  title: "Pengetahuan: Sewa BMN",
  excerpt: "…",
  ...over,
});

describe("citationTarget", () => {
  it("catatan vault → dialog, berkas → pratinjau, record → halaman, sisanya tidak bisa dibuka", () => {
    expect(citationTarget(citation({}))).toEqual({ kind: "knowledge", noteId: "n1" });
    expect(citationTarget(citation({ sourceType: "asset", sourceId: "a1", title: "Berkas: PMK.pdf" }))).toEqual({
      kind: "file",
      uploadId: "a1",
      name: "PMK.pdf",
    });
    expect(citationTarget(citation({ sourceType: "free_note", sourceId: "f1" }))).toMatchObject({ kind: "page" });
    expect(citationTarget(citation({ sourceType: "archive_jra", sourceId: "j1" }))).toEqual({ kind: "none" });
  });

  it("halaman record untuk tipe tanpa berbagi", () => {
    expect(recordSourcePath("todo", "t1")).toContain("todo=t1");
    expect(recordSourcePath("para_task", "x")).toContain("task=x");
    expect(recordSourcePath("para_activity", "x")).toBe("/productivity/areas");
  });
});

describe("Inbox", () => {
  it("judul dari pertanyaan, dipotong", () => {
    expect(inboxTitle("  Berapa  lama sewa? ")).toBe("Berapa lama sewa?");
    expect(inboxTitle("")).toBe("Jawaban LifeOS AI");
    expect(inboxTitle("a".repeat(100))).toHaveLength(68);
  });

  it("nomor sitasi diganti nama sumber (catatan vault → wikilink)", () => {
    const text = answerForInbox("Paling lama 5 tahun [1]. Lihat juga [2] dan [9].", [
      citation({}),
      citation({ n: 2, sourceType: "free_note", title: "Catatan: Rapat" }),
    ]);
    expect(text).toBe("Paling lama 5 tahun ([[Sewa BMN]]). Lihat juga (Rapat) dan [9].");
  });
});

describe("tampilan & saringan", () => {
  it("wikilink dibuat terbaca", () => {
    expect(readableWikilinks("[[PMK 115|PMK]] dan ![[f.pdf]] serta [[Pasal 1#Ayat]]")).toBe(
      "**PMK** dan **f.pdf** serta **Pasal 1**",
    );
  });

  it("tampilan catatan: ganti baris tunggal dipertahankan, kecuali di blok kode", () => {
    expect(noteDisplayMarkdown("BAB I\nKETENTUAN\n\nPasal 1")).toBe("BAB I  \nKETENTUAN\n\nPasal 1");
    expect(noteDisplayMarkdown("```\na\nb\n```")).toBe("```\na\nb\n```");
  });

  it("saring per kata & status", () => {
    const note = (over: Partial<KnowledgeNoteListItem>): KnowledgeNoteListItem => ({
      id: "1",
      path: "20-Topik/Sewa.md",
      kind: "note",
      title: "Sewa BMN",
      assetId: null,
      updatedAt: "",
      jenis: "topik",
      status: "berlaku",
      publik: true,
      links: 0,
      backlinks: 0,
      ...over,
    });
    const notes = [note({}), note({ id: "2", title: "Penghapusan", path: "20-Topik/Hapus.md", status: null })];
    expect(filterKnowledgeNotes(notes, "sewa topik", "all").map((n) => n.id)).toEqual(["1"]);
    expect(filterKnowledgeNotes(notes, "", "none").map((n) => n.id)).toEqual(["2"]);
    expect(filterKnowledgeNotes(notes, "", "berlaku").map((n) => n.id)).toEqual(["1"]);
  });
});
