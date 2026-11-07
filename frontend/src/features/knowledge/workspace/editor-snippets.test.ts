import { describe, expect, it } from "vitest";
import { expandSnippet, isSlashTrigger, matchSnippets, SNIPPETS, templateInsertText } from "./editor-snippets";

const now = new Date(2026, 10, 7, 9, 5);
const get = (id: string) => SNIPPETS.find((s) => s.id === id)!;
const ctx = (lineBefore = "", lineAfter = "", prevLine: string | null = null) => ({
  lineBefore,
  lineAfter,
  prevLine,
  now,
});

describe("expandSnippet", () => {
  it("menaruh kursor di penanda", () => {
    expect(expandSnippet(get("link"), ctx("Lihat "))).toEqual({ text: "[[]]", cursor: 2 });
    expect(expandSnippet(get("h2"), ctx())).toEqual({ text: "## ", cursor: 3 });
  });

  it("elemen baris pindah ke baris baru bila baris sudah berisi", () => {
    expect(expandSnippet(get("task"), ctx("Belanja"))).toEqual({ text: "\n- [ ] ", cursor: 7 });
    expect(expandSnippet(get("callout-warning"), ctx(""))).toEqual({ text: "> [!warning]\n> ", cursor: 15 });
  });

  it("tabel & garis diawali baris kosong setelah paragraf", () => {
    expect(expandSnippet(get("divider"), ctx("", "", "Paragraf")).text).toBe("\n---\n");
    expect(expandSnippet(get("divider"), ctx("", "", "")).text).toBe("---\n");
    expect(expandSnippet(get("table"), ctx("teks")).text.startsWith("\n\n| Kolom 1")).toBe(true);
  });

  it("menambah pindah baris bila ada teks setelah kursor", () => {
    expect(expandSnippet(get("h1"), ctx("", "sisa")).text).toBe("# \n");
  });

  it("tanggal & jam dari waktu sekarang", () => {
    expect(expandSnippet(get("today"), ctx()).text).toBe("2026-11-07");
    expect(expandSnippet(get("time"), ctx()).text).toBe("09:05");
  });
});

describe("matchSnippets & pemicu", () => {
  it("mencocokkan label dan kata kunci", () => {
    expect(matchSnippets("tab").map((s) => s.id)).toContain("table");
    expect(matchSnippets("todo").map((s) => s.id)).toEqual(["task"]);
    expect(matchSnippets("callout awas").map((s) => s.id)).toEqual(["callout-warning"]);
    expect(matchSnippets("").length).toBe(SNIPPETS.length);
  });

  it("hanya di awal baris atau setelah spasi", () => {
    expect(isSlashTrigger(null)).toBe(true);
    expect(isSlashTrigger(" ")).toBe(true);
    expect(isSlashTrigger("a")).toBe(false);
  });
});

describe("templateInsertText", () => {
  const raw = "---\njenis: rapat\n---\n\n# {{judul}}\nTanggal: {{tanggal}} {{ time }}\n";
  it("mengisi penanda dan membuang properti di tengah catatan", () => {
    expect(templateInsertText(raw, { title: "Rapat", now, atDocStart: false, docHasFrontmatter: false })).toBe(
      "# Rapat\nTanggal: 2026-11-07 09:05\n",
    );
  });
  it("mempertahankan properti di awal catatan tanpa properti", () => {
    const text = templateInsertText(raw, { title: "R", now, atDocStart: true, docHasFrontmatter: false });
    expect(text.startsWith("---\njenis: rapat\n---")).toBe(true);
    expect(
      templateInsertText(raw, { title: "R", now, atDocStart: true, docHasFrontmatter: true }).startsWith("# R"),
    ).toBe(true);
  });
});
