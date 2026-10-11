import { describe, expect, it } from "vitest";
import type { AiNote, FreeList, FreeNote } from "@/types/entities";
import {
  buildSummaryPrompt,
  clampContext,
  docHasMedia,
  docUploadIds,
  plainTextToDoc,
  textToParagraphs,
  filterAiNotes,
  filterLists,
  hasSummarySource,
  isFreeNoteEmpty,
  listProgress,
  MAX_FILE_CONTEXT_CHARS,
  matchesQuery,
  moveItem,
  removeCheckedItems,
  sortAiNotes,
  sortFreeNotes,
  unreferencedUploads,
  uploadIdsOf,
} from "./notes-logic";

const free = (id: number, extra: Partial<FreeNote> = {}): FreeNote => ({ id, title: `N${id}`, ...extra });
const aiNote = (id: number, extra: Partial<AiNote> = {}): AiNote => ({ id, title: `A${id}`, ...extra });

describe("pencarian", () => {
  it("tidak membedakan huruf besar/kecil dan kata kunci kosong cocok semua", () => {
    expect(matchesQuery("RaPaT", "Notulen rapat")).toBe(true);
    expect(matchesQuery("  ", undefined)).toBe(true);
    expect(matchesQuery("x", undefined, null, "abc")).toBe(false);
  });

  it("Notes AI dicari juga di ringkasan & transkrip; list dicari di item", () => {
    const notes = [aiNote(1, { aiSummary: "anggaran 2027" }), aiNote(2, { audioTranscript: "Pembicara 1: halo" })];
    expect(filterAiNotes(notes, "anggaran").map((n) => n.id)).toEqual([1]);
    expect(filterAiNotes(notes, "pembicara").map((n) => n.id)).toEqual([2]);
    const lists: FreeList[] = [
      { id: 1, title: "Belanja", items: [{ id: 1, text: "Telur", checked: false }] },
      { id: 2, title: "Liburan", items: [] },
    ];
    expect(filterLists(lists, "telur").map((l) => l.id)).toEqual([1]);
  });
});

describe("urutan", () => {
  it("catatan: disematkan dulu, lalu terakhir diubah", () => {
    const notes = [
      free(1, { updatedAt: "2026-10-01T00:00:00Z" }),
      free(2, { updatedAt: "2026-10-05T00:00:00Z" }),
      free(3, { updatedAt: "2026-09-01T00:00:00Z", pinned: true }),
      free(4),
    ];
    expect(sortFreeNotes(notes).map((n) => n.id)).toEqual([3, 2, 1, 4]);
  });

  it("Notes AI: disematkan dulu, lalu tanggal terbaru, lalu terakhir diubah", () => {
    const notes = [
      aiNote(1, { date: "2026-10-01" }),
      aiNote(2, { date: "2026-10-09", updatedAt: "2026-10-09T01:00:00Z" }),
      aiNote(3, { date: "2026-10-09", updatedAt: "2026-10-09T05:00:00Z" }),
      aiNote(4, { date: "2026-01-01", pinned: true }),
    ];
    expect(sortAiNotes(notes).map((n) => n.id)).toEqual([4, 3, 2, 1]);
  });

  it("tidak mengubah array asli", () => {
    const notes = [free(1, { updatedAt: "a" }), free(2, { updatedAt: "b" })];
    sortFreeNotes(notes);
    expect(notes.map((n) => n.id)).toEqual([1, 2]);
  });
});

describe("catatan kosong", () => {
  it("kosong bila judul & isi hanya spasi", () => {
    expect(isFreeNoteEmpty({ title: " ", content: "\n" })).toBe(true);
    expect(isFreeNoteEmpty({ title: "", content: "a" })).toBe(false);
  });

  it("catatan ketik berisi gambar/coretan tanpa teks tidak kosong", () => {
    const doc = { type: "doc", content: [{ type: "paragraph" }, { type: "inkBlock", attrs: { ink: null } }] };
    expect(isFreeNoteEmpty({ title: "", content: "", doc })).toBe(false);
    expect(isFreeNoteEmpty({ title: "", content: "", doc: plainTextToDoc("") })).toBe(true);
  });

  it("catatan tulis tangan kosong bila tanpa goresan & teks", () => {
    const ink = { version: 1 as const, height: 1414, paper: "lined" as const, strokes: [] };
    expect(isFreeNoteEmpty({ title: "", kind: "handwriting", ink })).toBe(true);
    const strokes = [{ tool: "pen" as const, color: "ink", size: 4, points: [1, 1, 0.5], pressure: true }];
    expect(isFreeNoteEmpty({ title: "", kind: "handwriting", ink: { ...ink, strokes } })).toBe(false);
  });
});

describe("dokumen editor", () => {
  it("teks biasa menjadi satu paragraf per baris (baris kosong tetap ada)", () => {
    expect(plainTextToDoc("a\r\n\nb")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "b" }] },
      ],
    });
    expect(plainTextToDoc(undefined).content).toEqual([{ type: "paragraph" }]);
    expect(textToParagraphs("  x \n")).toEqual([{ type: "paragraph", content: [{ type: "text", text: "x" }] }]);
  });

  it("menemukan gambar & coretan di dalam struktur bersarang", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [{ type: "image", attrs: { uploadId: "u1" } }] }],
        },
        { type: "image", attrs: { uploadId: "u2" } },
        { type: "image", attrs: { uploadId: null } },
      ],
    };
    expect(docUploadIds(doc)).toEqual(["u1", "u2"]);
    expect(docHasMedia(doc)).toBe(true);
    expect(docHasMedia(null)).toBe(false);
  });
});

describe("berkas Notes AI", () => {
  const saved = aiNote(1, { audioUploadId: "audio-1", fileAttachment: { name: "a.pdf", uploadId: "file-1" } });

  it("membaca ID audio & dokumen; lampiran kosong diabaikan", () => {
    expect(uploadIdsOf(saved)).toEqual(["audio-1", "file-1"]);
    expect(uploadIdsOf(aiNote(2, { fileAttachment: {} }))).toEqual([]);
    expect(uploadIdsOf(null)).toEqual([]);
  });

  it("simpan: berkas lama yang diganti dan unggahan sementara dihapus", () => {
    const draft = { ...saved, audioUploadId: "audio-3" };
    const candidates = [...uploadIdsOf(saved), "audio-2", "audio-3"];
    expect(unreferencedUploads(candidates, draft)).toEqual(["audio-1", "audio-2"]);
  });

  it("buang perubahan: hanya unggahan sesi ini yang dihapus, berkas tersimpan tetap", () => {
    expect(unreferencedUploads(new Set(["audio-2", "file-9"]), saved)).toEqual(["audio-2", "file-9"]);
    expect(unreferencedUploads(["audio-1"], saved)).toEqual([]);
  });

  it("teks dokumen dibatasi", () => {
    expect(clampContext("abc")).toBe("abc");
    const long = clampContext("x".repeat(MAX_FILE_CONTEXT_CHARS + 10));
    expect(long.startsWith("x".repeat(MAX_FILE_CONTEXT_CHARS))).toBe(true);
    expect(long).toContain("dipotong");
  });
});

describe("prompt ringkasan", () => {
  it("memuat gaya, info catatan, dan hanya sumber yang ada", () => {
    const prompt = buildSummaryPrompt({
      style: "meeting",
      title: "Rapat Anggaran",
      dateLabel: "Kamis, 8 Oktober 2026",
      agendaLabel: "Rapat · 8 Okt 2026",
      content: "poin A",
      audioTranscript: "",
    });
    expect(prompt).toContain("Tindak Lanjut");
    expect(prompt).toContain("Judul/topik: Rapat Anggaran");
    expect(prompt).toContain("Agenda terkait: Rapat · 8 Okt 2026");
    expect(prompt).toContain("<catatan_kasar>\npoin A\n</catatan_kasar>");
    expect(prompt).not.toContain("<transkrip_audio>");
    expect(prompt).not.toContain("<dokumen_referensi>");
  });

  it("gaya kustom memakai instruksi user, kosong → gaya standar", () => {
    expect(buildSummaryPrompt({ style: "custom", customInstruction: "Buat 5 soal kuis", content: "x" })).toContain(
      "Gaya ringkasan: Buat 5 soal kuis",
    );
    expect(buildSummaryPrompt({ style: "custom", customInstruction: " ", content: "x" })).toContain(
      "Buat ringkasan yang seimbang",
    );
  });

  it("butuh minimal satu sumber", () => {
    expect(hasSummarySource({ content: " ", audioTranscript: "", fileContext: undefined })).toBe(false);
    expect(hasSummarySource({ fileContext: "isi" })).toBe(true);
  });
});

describe("list", () => {
  const items = [
    { id: 1, text: "a", checked: true },
    { id: 2, text: "b", checked: false },
    { id: 3, text: "c", checked: true },
  ];

  it("menghitung progres", () => {
    expect(listProgress({ items })).toEqual({ done: 2, total: 3, percent: 67 });
    expect(listProgress({ items: [] })).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("memindahkan item dan tidak berubah di ujung daftar", () => {
    expect(moveItem(items, 1, -1).map((i) => i.id)).toEqual([2, 1, 3]);
    expect(moveItem(items, 1, 1).map((i) => i.id)).toEqual([1, 3, 2]);
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(moveItem(items, 2, 1)).toBe(items);
  });

  it("menghapus item yang sudah dicentang", () => {
    expect(removeCheckedItems(items).map((i) => i.id)).toEqual([2]);
  });
});
