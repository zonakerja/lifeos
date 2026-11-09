import { describe, expect, it } from "vitest";
import type { KnowledgeNoteListItem } from "@/types/api";
import {
  buildTree,
  calloutTone,
  createResolver,
  extractTitle,
  noteStats,
  inboxNotes,
  linkHeading,
  localGraph,
  matchesNodeQuery,
  outline,
  parseCallout,
  parseNodeQuery,
  propertyKind,
  slugify,
  tagCounts,
  toReaderMarkdown,
} from "./knowledge-logic";

const note = (path: string, over: Partial<KnowledgeNoteListItem> = {}): KnowledgeNoteListItem => ({
  id: path,
  path,
  kind: "note",
  title: path.replace(/^.*\//, "").replace(/\.md$/, ""),
  assetId: null,
  updatedAt: "2026-11-06T00:00:00.000Z",
  jenis: null,
  status: null,
  publik: null,
  tags: [],
  properties: null,
  links: 0,
  backlinks: 0,
  ...over,
});

describe("noteStats & sintaks pembaca", () => {
  it("properti & komentar tidak dihitung; angka & kata majemuk satu kata", () => {
    expect(noteStats("---\na: b c d\n---\nDua kata %%rahasia sekali%% lagi-lagi 2026")).toEqual({
      words: 4,
      chars: 24,
      minutes: 1,
    });
    expect(noteStats("").words).toBe(0);
    expect(noteStats("kata ".repeat(1000)).minutes).toBe(5);
  });

  it("sorotan & komentar; kode, kesamaan, dan base64 tidak tersentuh", () => {
    expect(toReaderMarkdown("a ==penting sekali== b")).toBe("a [penting sekali](kn-mark:) b");
    expect(toReaderMarkdown("a %%rahasia%% b")).toBe("a  b");
    expect(toReaderMarkdown("x == y == z")).toBe("x == y == z");
    expect(toReaderMarkdown("https://a.id/?k=abc==&x==")).toBe("https://a.id/?k=abc==&x==");
    expect(toReaderMarkdown("`==kode==`")).toBe("`==kode==`");
    expect(toReaderMarkdown("```mermaid\nA[[B]] --> C\n```")).toBe("```mermaid\nA[[B]] --> C\n```");
  });
});

describe("extractTitle", () => {
  it("baris pertama tanpa penanda & karakter terlarang", () => {
    expect(extractTitle("\n## Rapat: hasil/keputusan ^abc\nisi")).toBe("Rapat hasil keputusan");
    expect(extractTitle("- [ ] Kirim surat")).toBe("Kirim surat");
    expect(extractTitle("1. Pertama")).toBe("Pertama");
    expect(extractTitle("Kalimat berakhir titik.")).toBe("Kalimat berakhir titik");
    expect(extractTitle("x".repeat(80))).toHaveLength(60);
    expect(extractTitle("  ")).toBe("");
  });
});

describe("pohon vault", () => {
  it("folder dulu, urut alami, jumlah catatan termasuk subfolder, folder kosong tetap ada", () => {
    const tree = buildTree(
      ["10-Peraturan", "10-Peraturan/Pasal", "2-Kosong"],
      [
        note("10-Peraturan/PMK 10.md"),
        note("10-Peraturan/PMK 9.md"),
        note("10-Peraturan/Pasal/P1.md"),
        note("Mulai.md"),
      ],
    );
    expect(tree.map((t) => t.name)).toEqual(["2-Kosong", "10-Peraturan", "Mulai.md"]);
    const peraturan = tree[1];
    expect(peraturan.type === "folder" && peraturan.count).toBe(3);
    expect(peraturan.type === "folder" && peraturan.children.map((c) => c.name)).toEqual([
      "Pasal",
      "PMK 9.md",
      "PMK 10.md",
    ]);
  });
});

describe("tautan wiki", () => {
  const notes = [
    note("a/PMK 181.md"),
    note("b/c/PMK 181.md"),
    note("Sewa.md", { properties: { aliases: ["Sewa BMN"] } }),
  ];
  const resolve = createResolver(notes);
  it("nama (path terpendek), path lengkap, alias, judul bagian", () => {
    expect(resolve("PMK 181")?.path).toBe("a/PMK 181.md");
    expect(resolve("b/c/PMK 181")?.path).toBe("b/c/PMK 181.md");
    expect(resolve("sewa bmn#Pasal 5")?.path).toBe("Sewa.md");
    expect(resolve("Tidak Ada")).toBeNull();
    expect(linkHeading("Sewa#Pasal 5")).toBe("Pasal 5");
  });
  it("Markdown pembaca: tautan, sematan, alias; kode tidak disentuh", () => {
    expect(toReaderMarkdown("Lihat [[PMK 181#Pasal 5|pasal]] dan ![[lampiran.pdf]] `[[kode]]`")).toBe(
      "Lihat [pasal](kn:PMK%20181%23Pasal%205) dan ![lampiran.pdf](kn-embed:lampiran.pdf) `[[kode]]`",
    );
    expect(toReaderMarkdown("[[A#B]]")).toBe("[A › B](kn:A%23B)");
    expect(toReaderMarkdown("baris1\nbaris2")).toBe("baris1  \nbaris2");
    // blok: penanda jadi jangkar, tautan blok & judul catatan sendiri berlabel rapi
    expect(toReaderMarkdown("Isi ^abc1\n\n^tbl")).toBe("Isi [](kn-block:abc1)\n\n[](kn-block:tbl)");
    expect(toReaderMarkdown("[[A#^abc1]] [[#Judul]]")).toBe("[A](kn:A%23%5Eabc1) [Judul](kn:%23Judul)");
  });
  it("callout", () => {
    expect(parseCallout("[!warning]- Perhatian")).toEqual({ type: "warning", folded: true, title: "Perhatian" });
    expect(parseCallout("biasa")).toBeNull();
    expect(calloutTone("tip")).toBe("success");
  });
});

describe("garis besar & slug", () => {
  it("judul di luar kode, id unik", () => {
    expect(outline("# BAB I\n```\n# bukan\n```\n## Pasal 1\n## Pasal 1\n### [[PMK|Rujukan]]")).toEqual([
      { level: 1, text: "BAB I", id: "bab-i", line: 1 },
      { level: 2, text: "Pasal 1", id: "pasal-1", line: 5 },
      { level: 2, text: "Pasal 1", id: "pasal-1-1", line: 6 },
      { level: 3, text: "Rujukan", id: "rujukan", line: 7 },
    ]);
    expect(slugify("Pengelolaan Barang Milik Négara")).toBe("pengelolaan-barang-milik-negara");
  });
});

describe("kueri graf & tabel", () => {
  it("operator", () => {
    const n = {
      title: "PMK 181",
      path: "10-Peraturan/PMK 181.md",
      tags: ["bmn/psp"],
      status: "berlaku",
      jenis: "peraturan",
    };
    expect(matchesNodeQuery(n, parseNodeQuery("tag:bmn status:berlaku path:peraturan 181"))).toBe(true);
    expect(matchesNodeQuery(n, parseNodeQuery("jenis:faq"))).toBe(false);
  });
  it("graf lokal kedalaman 1 & 2", () => {
    const edges = [
      { source: "a", target: "b", kind: "link" },
      { source: "c", target: "b", kind: "link" },
      { source: "c", target: "d", kind: "link" },
    ];
    expect([...localGraph({ edges }, "a", 1)].sort()).toEqual(["a", "b"]);
    expect([...localGraph({ edges }, "a", 2)].sort()).toEqual(["a", "b", "c"]);
  });
  it("tag bertingkat dihitung per induk", () => {
    expect(tagCounts([note("x.md", { tags: ["bmn/psp", "bmn"] }), note("y.md", { tags: ["bmn/sewa"] })])).toEqual([
      { tag: "bmn", count: 2, depth: 0 },
      { tag: "bmn/psp", count: 1, depth: 1 },
      { tag: "bmn/sewa", count: 1, depth: 1 },
    ]);
  });
  it("jenis isian properti & Inbox", () => {
    expect(propertyKind("publik", "ya")).toBe("boolean");
    expect(propertyKind("dasar_hukum", "x")).toBe("list");
    expect(propertyKind("diperbarui", "2026-11-06")).toBe("date");
    expect(propertyKind("jenis", "faq")).toBe("text");
    expect(inboxNotes([note("00-Inbox/a.md"), note("10/b.md")]).map((n) => n.path)).toEqual(["00-Inbox/a.md"]);
  });
});
