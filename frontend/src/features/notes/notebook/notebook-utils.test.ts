import { describe, expect, it } from "vitest";
import type { NotebookSource } from "@/types/api";
import {
  answerToNote,
  stripCitations,
  readySources,
  shortTitle,
  summaryToNote,
} from "./notebook-utils";

describe("notebook utils", () => {
  it("hanya sumber aktif & siap yang dipakai", () => {
    const s = (id: string, enabled: boolean, status: NotebookSource["status"]) =>
      ({ id, enabled, status }) as NotebookSource;
    expect(
      readySources([s("a", true, "ready"), s("b", false, "ready"), s("c", true, "processing")]).map((x) => x.id),
    ).toEqual(["a"]);
  });

  it("menyalin jawaban tanpa nomor rujukan", () => {
    expect(stripCitations("Batas 1 November 2026 [1], atau paling lambat [2][3].")).toBe(
      "Batas 1 November 2026, atau paling lambat.",
    );
    expect(stripCitations("Retensi 2 tahun [1, 3] dan 5 tahun [2-4]!")).toBe("Retensi 2 tahun dan 5 tahun!");
    expect(stripCitations("Lihat [panduan](https://contoh.go.id) dan tahun [2027 akhir]")).toBe(
      "Lihat [panduan](https://contoh.go.id) dan tahun [2027 akhir]",
    );
  });

  it("judul pendek tanpa sintaks Markdown", () => {
    expect(shortTitle("## **Keputusan** rapat\nisi")).toBe("Keputusan rapat");
    expect(shortTitle("x".repeat(100), 10)).toBe(`${"x".repeat(9)}…`);
    expect(shortTitle("")).toBe("");
  });

  it("jawaban chat menjadi catatan dengan daftar sumber", () => {
    const note = answerToNote("Apa keputusan rapat?", "Anggaran naik [1].", [
      { n: 1, sourceId: "s1", title: "Notulen", excerpt: "…" },
    ]);
    expect(note).toEqual({
      title: "Apa keputusan rapat?",
      content: "Anggaran naik [1].\n\n---\n**Sumber:**\n- [1] Notulen",
      origin: "chat",
    });
    expect(answerToNote(undefined, "Jawaban saja", null).content).toBe("Jawaban saja");
  });

  it("ringkasan menjadi catatan bertajuk", () => {
    const note = summaryToNote("Riset", { overview: "Ikhtisar.", keyPoints: ["A"], questions: [] });
    expect(note.title).toBe("Ringkasan: Riset");
    expect(note.content).toBe("## Ikhtisar\nIkhtisar.\n\n## Poin kunci\n- A");
  });
});
