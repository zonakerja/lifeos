import { describe, expect, it } from "vitest";
import {
  addBlockId,
  blockCandidates,
  blockIds,
  extractBlock,
  extractSection,
  linkBlock,
  newBlockId,
} from "./note-blocks";

const note = [
  "# Pengelolaan BMN",
  "Paragraf pembuka baris satu",
  "baris dua ^pembuka",
  "",
  "## Dasar hukum",
  "- PP 27/2014 ^pp27",
  "- PMK 181/2016",
  "",
  "| Kolom | Isi |",
  "| --- | --- |",
  "| a | b |",
  "^tabel1",
  "",
  "### Rincian",
  "Isi rincian.",
  "",
  "## Penutup",
  "```",
  "kode ^bukan",
  "```",
  "Akhir.",
].join("\n");

describe("blok", () => {
  it("menemukan blok bertanda (paragraf, butir, tabel) & melewati kode", () => {
    expect(blockIds(note).map((b) => [b.id, b.text])).toEqual([
      ["pembuka", "Paragraf pembuka baris satu\nbaris dua"],
      ["pp27", "- PP 27/2014"],
      ["tabel1", "| Kolom | Isi |\n| --- | --- |\n| a | b |"],
    ]);
    expect(extractBlock(note, "pp27")).toBe("- PP 27/2014");
    expect(extractBlock(note, "bukan")).toBeNull();
    expect(linkBlock("Catatan#^pp27")).toBe("pp27");
    expect(linkBlock("Catatan#Judul")).toBeNull();
  });

  it("calon blok untuk pelengkap ^", () => {
    const list = blockCandidates(note);
    expect(list.find((c) => c.text.startsWith("Paragraf"))).toMatchObject({ id: "pembuka", line: 2 });
    expect(list.find((c) => c.text === "- PMK 181/2016")).toMatchObject({ id: null, line: 6 });
    expect(list.some((c) => c.text.includes("kode"))).toBe(false);
  });
});

describe("bagian", () => {
  it("sampai judul setingkat / lebih tinggi, cocok teks atau slug", () => {
    expect(extractSection(note, "Dasar hukum")?.split("\n").at(-1)).toBe("Isi rincian.");
    expect(extractSection(note, "rincian")).toBe("### Rincian\nIsi rincian.");
    expect(extractSection(note, "dasar-hukum")?.startsWith("## Dasar hukum")).toBe(true);
    expect(extractSection(note, "Penutup")?.endsWith("Akhir.")).toBe(true);
    expect(extractSection(note, "Tidak ada")).toBeNull();
  });
});

describe("menulis id blok", () => {
  it("menambah ^id ke baris unik, menolak bila ganda/hilang", () => {
    expect(addBlockId("---\na: 1\n---\r\n- x\r\n- y", "- y", "abc123")).toBe(
      "---\r\na: 1\r\n---\r\n- x\r\n- y ^abc123",
    );
    expect(addBlockId("- x\n- x", "- x", "a")).toBeNull();
    expect(addBlockId("- x", "- z", "a")).toBeNull();
    let n = 0;
    const seq = [0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0];
    expect(newBlockId(["aaaaaa"], () => seq[n++])).toBe("saaaaa");
  });
});
