import { describe, expect, it } from "vitest";
import {
  buildLinkResolver,
  inboxFileName,
  inboxNote,
  isSafeVaultFolder,
  knowledgeMetadata,
  noteIndexText,
  noteProblems,
  noteStatus,
  parseNote,
  readableWikilinks,
  splitFrontmatter,
  vaultEntryKind,
} from "./vault-parser";

const NOTE = `---
jenis: faq
topik: [sewa, pemanfaatan]
dasar_hukum: ["[[PMK Pemanfaatan BMN]]"]
status: berlaku
publik: true
diperbarui: 2026-10-18
tags: [bmn]
---
# Jangka waktu sewa

Sewa BMN paling lama 5 tahun ([[Sewa BMN|sewa]]), lihat ![[lampiran.pdf]] dan [[Pasal 12#Ayat 1]]. #praktik

\`\`\`
#bukan-tag
\`\`\`
`;

describe("splitFrontmatter / parseNote", () => {
  it("membaca properti YAML, judul, tautan (isi, sematan, properti) dan tag", () => {
    const parsed = parseNote("40-FAQ/Jangka Sewa.md", NOTE);
    expect(parsed.title).toBe("Jangka Sewa");
    expect(parsed.frontmatter?.jenis).toBe("faq");
    expect(parsed.links).toEqual([
      { target: "Sewa BMN", kind: "link" },
      { target: "lampiran.pdf", kind: "embed" },
      { target: "Pasal 12", kind: "link" },
      { target: "PMK Pemanfaatan BMN", kind: "property" },
    ]);
    expect(parsed.tags).toEqual(["bmn", "praktik"]);
    expect(parsed.body.startsWith("# Jangka waktu sewa")).toBe(true);
  });

  it("YAML rusak / tanpa frontmatter tidak menggagalkan pembacaan", () => {
    expect(splitFrontmatter("---\njenis: [rusak\n---\nisi").frontmatter).toBeNull();
    expect(splitFrontmatter("isi saja").body).toBe("isi saja");
    expect(parseNote("a/B.md", "---\ntitle: Judul Lain\n---\nx").title).toBe("Judul Lain");
  });
});

describe("buildLinkResolver", () => {
  it("cocok dengan nama berkas tanpa peka huruf, path lengkap, dan alias; nama ganda → path terpendek", () => {
    const resolve = buildLinkResolver([
      { id: "1", path: "10-Peraturan/PMK Pemanfaatan BMN.md", frontmatter: { aliases: ["PMK 115"] } },
      { id: "2", path: "20-Topik/Sewa BMN.md", frontmatter: null },
      { id: "3", path: "arsip/lama/Sewa BMN.md", frontmatter: null },
    ]);
    expect(resolve("pmk pemanfaatan bmn")).toBe("1");
    expect(resolve("PMK 115")).toBe("1");
    expect(resolve("Sewa BMN")).toBe("2");
    expect(resolve("arsip/lama/Sewa BMN")).toBe("3");
    expect(resolve("Tidak Ada")).toBeNull();
  });
});

describe("status & metadata", () => {
  it("status dari properti, folder Inbox = draf, folder templat = templat", () => {
    expect(noteStatus("a.md", { status: "Berlaku" })).toBe("berlaku");
    expect(noteStatus("a.md", { status: "dicabut" })).toBe("dicabut");
    expect(noteStatus("00-Inbox/a.md", {})).toBe("draf");
    expect(noteStatus("90-Templat/FAQ.md", { status: "berlaku" })).toBe("templat");
    expect(noteStatus("a.md", null)).toBeNull();
  });

  it("metadata potongan: jenis, status, publik, topik, tag, tanggal", () => {
    const { frontmatter, tags } = parseNote("40-FAQ/x.md", NOTE);
    expect(knowledgeMetadata("40-FAQ/x.md", frontmatter, tags)).toEqual({
      path: "40-FAQ/x.md",
      jenis: "faq",
      status: "berlaku",
      publik: true,
      topik: ["sewa", "pemanfaatan"],
      tags: ["bmn", "praktik"],
      diperbarui: "2026-10-18",
    });
  });

  it("masalah catatan: tanpa properti / jenis / status — Inbox & templat dikecualikan", () => {
    expect(noteProblems("20-Topik/a.md", null)).toEqual(["Tanpa properti (frontmatter)"]);
    expect(noteProblems("20-Topik/a.md", { jenis: "topik" })).toEqual(["Properti `status` kosong / tidak dikenal"]);
    expect(noteProblems("00-Inbox/a.md", null)).toEqual([]);
  });
});

describe("teks indeks", () => {
  it("properti penting di depan, tautan dibuat terbaca", () => {
    const { frontmatter, body } = parseNote("x.md", NOTE);
    const text = noteIndexText({ title: "x", content: body, frontmatter });
    expect(
      text.startsWith("Jenis: faq · Status: berlaku · Topik: sewa, pemanfaatan · Dasar hukum: PMK Pemanfaatan BMN"),
    ).toBe(true);
    expect(text).toContain("(sewa)");
    expect(readableWikilinks("[[Pasal 12#Ayat 1]] dan ![[f.pdf]]")).toBe("Pasal 12 dan f.pdf");
  });
});

describe("berkas & folder", () => {
  it("jenis entri dari ekstensi", () => {
    expect(vaultEntryKind("a/B.md")).toBe("note");
    expect(vaultEntryKind("a/PMK.PDF")).toBe("file");
    expect(vaultEntryKind("a/gambar.png")).toBeNull();
  });

  it("nama folder vault aman", () => {
    expect(isSafeVaultFolder("Pengetahuan-BMN")).toBe(true);
    expect(isSafeVaultFolder("../etc")).toBe(false);
    expect(isSafeVaultFolder("a/b")).toBe(false);
    expect(isSafeVaultFolder(".obsidian")).toBe(false);
  });

  it("catatan Inbox: nama berkas aman + frontmatter draf", () => {
    const now = new Date(2026, 9, 24, 9, 5);
    expect(inboxFileName('Sewa: "jangka" waktu?', now)).toBe("2026-10-24 0905 Sewa jangka waktu.md");
    const text = inboxNote({ title: "Sewa", content: "Isi", question: "Berapa lama?", now });
    expect(splitFrontmatter(text).frontmatter).toMatchObject({ status: "draf", publik: false, jenis: "faq" });
    expect(text).toContain("**Pertanyaan:** Berapa lama?");
  });
});
