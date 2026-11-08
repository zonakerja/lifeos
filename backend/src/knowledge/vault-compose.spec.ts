import { describe, expect, it } from "vitest";
import { retargetCanvasNodes } from "./vault-canvas";
import {
  applyComposerTemplate,
  blockRenames,
  ComposeConflict,
  composeMerge,
  mergedProperties,
  placeContent,
  planExtract,
  rewriteExtractedLinks,
  rewriteMergedLinks,
  scanAnchors,
} from "./vault-compose";
import { splitFrontmatter } from "./vault-parser";

const NOW = new Date(2026, 10, 9, 8, 5);

describe("vault-compose", () => {
  it("placeContent: awal sesudah properti, akhir, catatan kosong", () => {
    const raw = "---\nstatus: draf\n---\nIsi lama\n";
    expect(placeContent(raw, "Baru", "start")).toBe("---\nstatus: draf\n---\nBaru\n\nIsi lama\n");
    expect(placeContent(raw, "Baru", "end")).toBe("---\nstatus: draf\n---\nIsi lama\n\nBaru\n");
    expect(placeContent("---\na: 1\n---", "Baru", "end")).toBe("---\na: 1\n---\nBaru\n");
    expect(placeContent("", "Baru", "start")).toBe("Baru\n");
  });

  it("anchor: judul & blok, blok kode dilewati", () => {
    const a = scanAnchors("# Judul Satu\nParagraf ^abc\n```\n# bukan\nkode ^xyz\n```\n^def");
    expect([...a.headings]).toEqual(["judul satu"]);
    expect([...a.blocks]).toEqual(["abc", "def"]);
  });

  it("properti: tujuan menang, tags & aliases disatukan, nama sumber jadi alias, title tidak ikut", () => {
    expect(
      mergedProperties(
        { status: "berlaku", tags: ["bmn"], aliases: "PMK" },
        { status: "draf", jenis: "topik", title: "Lain", tags: ["#BMN", "sewa"], aliases: ["Sewa"] },
        "Apel",
      ),
    ).toEqual({ jenis: "topik", tags: ["bmn", "sewa"], aliases: ["PMK", "Sewa", "Apel"] });
  });

  it("gabung: heading, judul kembar dibuang, id blok bentrok diganti, YAML tujuan tetap", () => {
    const { text, renames, heading } = composeMerge({
      targetRaw: "---\n# komentar\nstatus: berlaku\n---\nTujuan ^a\n",
      sourceRaw: "---\nstatus: draf\njenis: topik\n---\n# Apel\n\nIsi ^a\nLihat [[#^a]]\n",
      sourceName: "Apel",
      position: "end",
      heading: true,
    });
    expect(heading).toBe("Apel");
    expect(renames.get("a")).toBe("a-2");
    expect(text).toContain("# komentar");
    expect(splitFrontmatter(text).frontmatter).toEqual({ status: "berlaku", jenis: "topik", aliases: ["Apel"] });
    expect(splitFrontmatter(text).body).toBe("Tujuan ^a\n\n## Apel\n\nIsi ^a-2\nLihat [[#^a-2]]\n");
  });

  it("gabung tanpa heading & YAML rusak ditolak", () => {
    const plain = composeMerge({
      targetRaw: "T\n",
      sourceRaw: "# Apel\nIsi\n",
      sourceName: "Apel",
      position: "start",
      heading: false,
    });
    expect(splitFrontmatter(plain.text).body).toBe("# Apel\nIsi\n\nT\n");
    expect(() =>
      composeMerge({
        targetRaw: "T",
        sourceRaw: "---\na: [\n---\nx",
        sourceName: "A",
        position: "end",
        heading: false,
      }),
    ).toThrow(/rusak/);
  });

  it("id blok: nomor berikutnya yang kosong", () => {
    expect([...blockRenames(new Set(["a", "a-2", "b"]), new Set(["a"]))]).toEqual([["a", "a-3"]]);
  });

  it("perujuk gabung: heading + alias, sematan, tabel, jangkar lama, id baru, path", () => {
    const options = { heading: "Apel", renames: new Map([["x", "x-2"]]) };
    const run = (text: string) => rewriteMergedLinks(text, "F/Apel.md", "G/Buah.md", options).text;
    expect(run("[[Apel]]")).toBe("[[Buah#Apel|Apel]]");
    expect(run("![[Apel]]")).toBe("![[Buah#Apel]]");
    expect(run("| [[Apel]] |")).toBe("| [[Buah#Apel]] |");
    expect(run("[[Apel|nama]]")).toBe("[[Buah#Apel|nama]]");
    expect(run("[[Apel#Judul]]")).toBe("[[Buah#Judul]]");
    expect(run("[[Apel#^x|y]]")).toBe("[[Buah#^x-2|y]]");
    expect(run("[[F/Apel.md]]")).toBe("[[G/Buah#Apel|Apel]]");
    expect(run("[[Apel lain]]")).toBe("[[Apel lain]]");
    const plain = rewriteMergedLinks("a [[Apel]] b [[apel]]", "Apel.md", "Buah.md", {
      heading: null,
      renames: new Map(),
    });
    expect(plain).toEqual({ text: "a [[Buah]] b [[Buah]]", count: 2 });
  });

  it("perujuk ekstrak: hanya judul/blok yang pindah", () => {
    const moved = scanAnchors("## Bagian\nIsi ^b1");
    const result = rewriteExtractedLinks(
      "[[Asal#Bagian]] [[Asal#^b1]] [[Asal#Lain]] [[Asal]]",
      "Asal.md",
      "Baru.md",
      moved,
      new Map(),
    );
    expect(result).toEqual({ text: "[[Baru#Bagian]] [[Baru#^b1]] [[Asal#Lain]] [[Asal]]", count: 2 });
  });

  const base = {
    sourcePath: "F/Asal.md",
    targetPath: "F/Baru.md",
    targetRaw: null,
    position: "end" as const,
    after: "link" as const,
    template: null,
    now: NOW,
  };
  const sourceRaw = "---\na: 1\n---\nAwal [[#Bagian]] [[#Sisa]]\n## Bagian\nIsi [[#Sisa]]\n## Sisa\nAkhir\n";
  const at = (text: string) => sourceRaw.indexOf(text);

  it("ekstrak: diganti tautan, tautan relatif ditulis ulang di dua sisi", () => {
    const text = "## Bagian\nIsi [[#Sisa]]\n";
    const plan = planExtract({ ...base, sourceRaw, from: at(text), to: at(text) + text.length, text });
    expect(plan.targetText).toBe("## Bagian\nIsi [[Asal#Sisa]]\n");
    expect(plan.sourceText).toBe("---\na: 1\n---\nAwal [[Baru#Bagian]] [[#Sisa]]\n[[Baru]]\n## Sisa\nAkhir\n");
  });

  it("ekstrak: sematan, tanpa sisa, ke catatan yang ada dengan id bentrok", () => {
    const raw = "x\nIsi ^b\ny\n";
    const text = "Isi ^b";
    const args = { ...base, sourceRaw: raw, from: 2, to: 8, text };
    expect(planExtract({ ...args, after: "embed" }).sourceText).toBe("x\n![[Baru]]\ny\n");
    expect(planExtract({ ...args, after: "none" }).sourceText).toBe("x\n\ny\n");
    const plan = planExtract({ ...args, targetRaw: "---\na: 1\n---\nAda ^b\n", position: "start" });
    expect(plan.targetText).toBe("---\na: 1\n---\nIsi ^b-2\n\nAda ^b\n");
  });

  it("ekstrak: pilihan basi / properti / CRLF", () => {
    expect(() => planExtract({ ...base, sourceRaw: "abc", from: 0, to: 1, text: "z" })).toThrow(ComposeConflict);
    expect(() => planExtract({ ...base, sourceRaw, from: 0, to: 3, text: "---" })).toThrow(/Properti/);
    const plan = planExtract({ ...base, sourceRaw: "a\r\nb\r\nc", from: 2, to: 3, text: "b" });
    expect(plan.sourceText).toBe("a\n[[Baru]]\nc");
  });

  it("templat: penanda Obsidian; tanpa {{content}} di bawah; isi tidak diproses", () => {
    expect(
      applyComposerTemplate("# {{newTitle}}\ndari {{fromTitle}} {{date:YYYY-MM-DD HH:mm}}\n{{content}}\n", {
        content: "isi {{fromTitle}}",
        fromTitle: "Asal",
        newTitle: "Baru",
        now: NOW,
      }),
    ).toBe("# Baru\ndari Asal 2026-11-09 08:05\nisi {{fromTitle}}\n");
    expect(applyComposerTemplate("Kop {{judul}}", { content: "isi", fromTitle: "A", newTitle: "B", now: NOW })).toBe(
      "Kop B\n\nisi\n",
    );
  });

  it("canvas: node file dipetakan, yang lain tetap", () => {
    const data = {
      nodes: [
        { id: "a", type: "file", file: "A.md", x: 0, y: 0, width: 1, height: 1 },
        { id: "b", type: "file", file: "B.md", subpath: "#X", x: 0, y: 0, width: 1, height: 1 },
        { id: "c", type: "text", text: "A.md", x: 0, y: 0, width: 1, height: 1 },
      ],
      edges: [],
      kunciLain: 1,
    };
    const result = retargetCanvasNodes(data, (file, subpath) =>
      file === "A.md" ? { file: "C.md", subpath: subpath ?? "#Judul" } : null,
    );
    expect(result.changed).toBe(1);
    expect(result.data.nodes[0]).toMatchObject({ file: "C.md", subpath: "#Judul" });
    expect(result.data.nodes[1]).toMatchObject({ file: "B.md", subpath: "#X" });
    expect(result.data.kunciLain).toBe(1);
  });
});
