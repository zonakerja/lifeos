import { describe, expect, it } from "vitest";
import {
  chunkText,
  documentEmbeddingText,
  hashText,
  isIndexedType,
  queryEmbeddingText,
  reciprocalRankFusion,
  renderRecord,
  toVectorLiteral,
} from "./index-text";

describe("renderRecord", () => {
  it("label tipe + judul, field bermakna, tanpa ID/warna/data URL", () => {
    const { title, text } = renderRecord(
      "para_resource",
      {
        id: "r1",
        title: "SK Pengangkatan",
        archiveRegId: "ARC-2026-ABC123",
        classificationId: "cls-9",
        color: "#fff",
        tags: ["kepegawaian", "SK"],
        logo: "data:image/png;base64,AAAA",
        dispositionData: { legalNumber: "BA/01", userNote: "aman" },
      },
      "title",
    );
    expect(title).toBe("Resource: SK Pengangkatan");
    expect(text).toContain("archiveRegId: ARC-2026-ABC123");
    expect(text).toContain("tags: kepegawaian; SK");
    expect(text).toContain("dispositionData: (legalNumber: BA/01, userNote: aman)");
    expect(text).not.toMatch(/cls-9|#fff|base64|SK Pengangkatan/);
  });

  it("judul arsip PARA diambil dari snapshot data", () => {
    const payload = { originalType: "project", data: { title: "Renovasi Gedung", status: "done" } };
    expect(renderRecord("para_archive", payload).title).toBe("Arsip PARA: Renovasi Gedung");
  });

  it("judul kosong diberi penanda", () => {
    expect(renderRecord("todo", { title: " " }, "title").title).toBe("To-do: (tanpa judul)");
  });

  it("hanya tipe yang bermakna diindeks", () => {
    expect(isIndexedType("free_note")).toBe(true);
    expect(isIndexedType("completion")).toBe(false);
    expect(isIndexedType("archive_move_log")).toBe(false);
  });
});

describe("chunkText", () => {
  it("teks pendek = satu potongan, teks kosong = tidak ada", () => {
    expect(chunkText("  halo  dunia ")).toEqual(["halo dunia"]);
    expect(chunkText("   \n ")).toEqual([]);
  });

  it("teks panjang dipotong di batas paragraf dengan tumpang-tindih", () => {
    const paragraph = (n: number) => `Paragraf ${n}. ${"isi ".repeat(100)}`.trim();
    const text = Array.from({ length: 10 }, (_, i) => paragraph(i + 1)).join("\n\n");
    const chunks = chunkText(text, 1000, 100);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.length <= 1000)).toBe(true);
    // Semua paragraf tetap tercakup
    for (let i = 1; i <= 10; i++) expect(chunks.some((c) => c.includes(`Paragraf ${i}.`))).toBe(true);
  });
});

describe("format embedding & helper", () => {
  it("format teks gemini-embedding-2", () => {
    expect(documentEmbeddingText("Judul", "isi")).toBe("title: Judul | text: isi");
    expect(documentEmbeddingText("", "isi")).toBe("title: none | text: isi");
    expect(queryEmbeddingText("rapat")).toBe("task: search result | query: rapat");
  });

  it("hash stabil & literal vektor", () => {
    expect(hashText("a")).toBe(hashText("a"));
    expect(hashText("a")).not.toBe(hashText("b"));
    expect(toVectorLiteral([0.5, -1, 2])).toBe("[0.5,-1,2]");
  });
});

describe("reciprocalRankFusion", () => {
  it("item yang muncul di kedua daftar naik ke atas", () => {
    const semantic = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const keyword = [{ id: "c" }, { id: "d" }];
    const merged = reciprocalRankFusion([semantic, keyword]);
    expect(merged[0].id).toBe("c");
    expect(merged.map((m) => m.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("daftar kosong (tanpa key Gemini) tetap berfungsi", () => {
    expect(reciprocalRankFusion([[], [{ id: "x" }]]).map((m) => m.id)).toEqual(["x"]);
  });
});
