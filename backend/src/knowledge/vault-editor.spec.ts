import { describe, expect, it } from "vitest";
import {
  fillTemplate,
  linkFirstMention,
  matchesSearch,
  mentionsName,
  moveBookmarks,
  normalizeVaultPath,
  notePath,
  parsePrefs,
  parseSearchQuery,
  renameWikilinks,
  safeFileName,
  searchSnippet,
  updateFrontmatter,
  vaultHealth,
} from "./vault-editor";

describe("path vault", () => {
  it("menerima path biasa & merapikan pemisah", () => {
    expect(normalizeVaultPath("10-Peraturan\\PMK 181.md")).toBe("10-Peraturan/PMK 181.md");
    expect(normalizeVaultPath("/a/b/")).toBe("a/b");
  });
  it("menolak keluar vault, folder tersembunyi, karakter terlarang", () => {
    for (const bad of ["../x.md", "a/../b", ".trash/x.md", "a/.obsidian", "a//b", "a/b?.md", "a/[x].md", "a/ b", ""])
      expect(normalizeVaultPath(bad)).toBeNull();
  });
  it("notePath menambah .md", () => {
    expect(notePath("Inbox/Catatan baru")).toBe("Inbox/Catatan baru.md");
    expect(notePath("x.MD")).toBe("x.MD");
  });
  it("safeFileName membuang karakter terlarang", () => {
    expect(safeFileName("PMK: 181/2016 [revisi]?")).toBe("PMK 181 2016 revisi");
    expect(safeFileName("..rahasia")).toBe("rahasia");
  });
});

describe("properti", () => {
  it("mengubah & menghapus properti tanpa membuang komentar dan isi", () => {
    const raw = "---\n# komentar\njenis: peraturan\nstatus: draf\ntopik: [psp]\n---\nIsi catatan\n";
    const next = updateFrontmatter(raw, { status: "berlaku", publik: true }, ["topik"]);
    expect(next).toBe("---\n# komentar\njenis: peraturan\nstatus: berlaku\npublik: true\n---\nIsi catatan\n");
  });
  it("membuat frontmatter bila belum ada; nilai kosong = dihapus", () => {
    expect(updateFrontmatter("Isi", { status: "berlaku", tags: [] })).toBe("---\nstatus: berlaku\n---\nIsi");
    expect(updateFrontmatter("---\nstatus: draf\n---\nIsi", { status: "" })).toBe("Isi");
  });
  it("YAML rusak ditolak", () => {
    expect(() => updateFrontmatter("---\na: [\n---\nIsi", { b: 1 })).toThrow(/rusak/);
  });
});

describe("ganti nama tautan", () => {
  it("memperbarui nama, path lengkap, alias & judul bagian", () => {
    const text = "Lihat [[PMK 181]], [[pmk 181|PMK]], [[10-Peraturan/PMK 181#Pasal 5]], ![[PMK 181.md]], [[PMK 1810]].";
    const result = renameWikilinks(text, "10-Peraturan/PMK 181.md", "10-Peraturan/PMK 181 Tahun 2016.md");
    expect(result.count).toBe(4);
    expect(result.text).toBe(
      "Lihat [[PMK 181 Tahun 2016]], [[PMK 181 Tahun 2016|PMK]], [[10-Peraturan/PMK 181 Tahun 2016#Pasal 5]], ![[PMK 181 Tahun 2016]], [[PMK 1810]].",
    );
  });
});

describe("pencarian", () => {
  const note = {
    path: "10-Peraturan/PMK 181.md",
    title: "PMK 181 Tahun 2016",
    kind: "note",
    content: "Penetapan status penggunaan BMN oleh pengelola barang.",
    tags: ["bmn/psp"],
    status: "berlaku",
    jenis: "peraturan",
  };
  it("operator & frasa", () => {
    const q = parseSearchQuery('tag:bmn status:berlaku "status penggunaan" path:peraturan');
    expect(q).toMatchObject({ words: ["status penggunaan"], tag: ["bmn"], status: ["berlaku"], path: ["peraturan"] });
    expect(matchesSearch(note, q)).toBe(true);
    expect(matchesSearch(note, parseSearchQuery("status:draf"))).toBe(false);
    expect(matchesSearch(note, parseSearchQuery("tag:bm"))).toBe(false);
    expect(matchesSearch(note, parseSearchQuery("http://x"))).toBe(false);
  });
  it("cuplikan di sekitar kata", () => {
    expect(searchSnippet("a ".repeat(200) + "kata kunci di sini", ["kunci"], 40)).toMatch(/^….*kunci/);
  });
});

describe("sebutan tanpa tautan", () => {
  it("kata utuh di luar tautan & kode", () => {
    expect(mentionsName("Berdasarkan PMK 181 tentang PSP.", ["PMK 181"])).toBe(true);
    expect(mentionsName("Lihat [[PMK 181]] dan `PMK 181`.", ["PMK 181"])).toBe(false);
    expect(mentionsName("PMK 1810 lain lagi", ["PMK 181"])).toBe(false);
    expect(mentionsName("ab", ["ab"])).toBe(false);
  });
  it("tautkan sebutan pertama, alias bila penulisan berbeda", () => {
    expect(linkFirstMention("Sesuai pmk 181, lalu PMK 181.", ["PMK 181"], "PMK 181")).toBe(
      "Sesuai [[PMK 181|pmk 181]], lalu PMK 181.",
    );
    expect(linkFirstMention("Lihat [[PMK 181]] saja", ["PMK 181"], "PMK 181")).toBeNull();
    expect(linkFirstMention("Judul Panjang dibahas", ["Judul Panjang"], "berkas")).toBe(
      "[[berkas|Judul Panjang]] dibahas",
    );
  });
});

describe("templat, kesehatan, preferensi", () => {
  it("isian templat", () => {
    const now = new Date(2026, 10, 6, 9, 5);
    expect(fillTemplate("# {{judul}} — {{date}} {{ time }}", { title: "Rapat", now })).toBe(
      "# Rapat — 2026-11-06 09:05",
    );
  });
  it("yatim & judul ganda di luar Inbox/Templat", () => {
    const n = (id: string, path: string, linksIn = 0, linksOut = 0) => ({
      id,
      path,
      title: id,
      kind: "note",
      linksIn,
      linksOut,
    });
    const health = vaultHealth([n("a", "A.md"), n("b", "x/B.md", 1), n("c", "y/B.md", 0, 1), n("d", "00-Inbox/D.md")]);
    expect(health.orphans.map((o) => o.id)).toEqual(["a"]);
    expect(health.duplicates).toEqual([
      { name: "B", notes: [expect.objectContaining({ id: "b" }), expect.objectContaining({ id: "c" })] },
    ]);
  });
  it("preferensi dibersihkan & penanda ikut pindah", () => {
    expect(
      parsePrefs({
        bookmarks: ["a.md", "../x", "a.md"],
        graphGroups: [
          { query: "tag:bmn", color: "green" },
          { query: "x", color: "hitam" },
        ],
      }),
    ).toEqual({ bookmarks: ["a.md"], graphGroups: [{ query: "tag:bmn", color: "green" }] });
    expect(moveBookmarks(["f/a.md", "f", "g.md"], "f", "h")).toEqual(["h/a.md", "h", "g.md"]);
    expect(moveBookmarks(["f/a.md", "g.md"], "f/a.md", null)).toEqual(["g.md"]);
  });
});
