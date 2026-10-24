import { describe, expect, it } from "vitest";
import { ASSET_SOURCE, chunkSource, chunkStructured, chunkText, OBSIDIAN_SOURCE } from "./index-text";

const pasal = (n: number, words = 30) => `Pasal ${n}\n(1) ${"ketentuan ".repeat(words).trim()}.`;

describe("chunkStructured", () => {
  it("teks tanpa judul = sama persis dengan chunkText", () => {
    const text = "Paragraf satu.\n\nParagraf dua. ".repeat(300);
    expect(chunkStructured(text)).toEqual(chunkText(text));
  });

  it("peraturan dipotong per Pasal dengan jalur BAB sebagai konteks", () => {
    const text = ["BAB I", "KETENTUAN UMUM", pasal(1), pasal(2), "BAB II", "PENGGUNAAN", pasal(3)].join("\n");
    const chunks = chunkStructured(text);
    const third = chunks.find((c) => c.includes("Pasal 3"))!;
    expect(third).toContain("Konteks: BAB II");
    expect(third).not.toContain("Pasal 2");
    // Pasal tidak terbelah: setiap pasal ada utuh di satu potongan
    expect(chunks.filter((c) => c.includes("Pasal 2")).length).toBe(1);
  });

  it("judul Markdown bertingkat membentuk jalur konteks", () => {
    const text = ["# Sewa BMN", "Pengantar ".repeat(30), "## Jangka waktu", "Paling lama lima tahun. ".repeat(12)].join(
      "\n",
    );
    const chunk = chunkStructured(text).find((c) => c.includes("## Jangka waktu"))!;
    expect(chunk.startsWith("Konteks: Sewa BMN\n")).toBe(true);
  });

  it("bagian yang sangat pendek digabung dengan bagian berikutnya", () => {
    const chunks = chunkStructured(["# Judul", "## A", "Isi pendek.", "## B", "Isi pendek juga."].join("\n"));
    expect(chunks).toHaveLength(1);
  });

  it("bagian panjang dipotong lagi dan potongan lanjutan diberi label", () => {
    const chunks = chunkStructured(["BAB I", "Pasal 1", "Kalimat panjang sekali. ".repeat(200)].join("\n"));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1]).toContain("(Pasal 1, lanjutan)");
    expect(chunks.every((c) => c.length <= 1800 + 40)).toBe(true);
  });
});

describe("chunkSource", () => {
  it("dokumen & catatan memakai pemotongan berstruktur, record memakai pemotongan biasa", () => {
    const text = ["# A", "isi ".repeat(100), "# B", "isi ".repeat(100)].join("\n");
    expect(chunkSource(OBSIDIAN_SOURCE, text)).toEqual(chunkStructured(text));
    expect(chunkSource(ASSET_SOURCE, text)).toEqual(chunkStructured(text));
    expect(chunkSource("free_note", text)).toEqual(chunkText(text));
  });
});
