import { describe, expect, it } from "vitest";
import { parseNote } from "./vault-parser";
import { cleanTag, renameTagInNote, renameTagInQuery } from "./vault-tags";

describe("vault-tags", () => {
  it("nama tag sah", () => {
    expect(cleanTag(" #bmn/sewa ")).toBe("bmn/sewa");
    expect(cleanTag("123")).toBeNull();
    expect(cleanTag("dua kata")).toBeNull();
    expect(cleanTag("/a")).toBeNull();
    expect(cleanTag("a//b")).toBeNull();
  });

  it("isi: tag & turunan berubah; judul, kode, tautan, URL tidak", () => {
    const raw = [
      "# bmn judul",
      "Teks #BMN dan #bmn/sewa dan #bmnlain (#bmn)",
      "`#bmn` [[a#bmn]] https://x.id/#bmn",
      "```",
      "#bmn",
      "```",
    ].join("\n");
    const { text, count } = renameTagInNote(raw, "bmn", "aset");
    expect(count).toBe(3);
    expect(text).toBe(
      [
        "# bmn judul",
        "Teks #aset dan #aset/sewa dan #bmnlain (#aset)",
        "`#bmn` [[a#bmn]] https://x.id/#bmn",
        "```",
        "#bmn",
        "```",
      ].join("\n"),
    );
  });

  it("properti: daftar & teks koma, digabung tanpa ganda, komentar & kunci lain tetap", () => {
    const raw = "---\n# komentar\nstatus: draf\ntags:\n  - bmn\n  - aset\n  - bmn/sewa\n---\nIsi\n";
    const { text, count } = renameTagInNote(raw, "bmn", "aset");
    expect(count).toBe(2);
    expect(text).toContain("# komentar");
    expect(parseNote("a.md", text).frontmatter).toEqual({ status: "draf", tags: ["aset", "aset/sewa"] });
    expect(parseNote("a.md", renameTagInNote("---\ntags: a, b\n---\nx", "a", "c").text).frontmatter?.tags).toEqual([
      "c",
      "b",
    ]);
  });

  it("tidak ada yang berubah = isi sama, CRLF tetap terbaca", () => {
    const raw = "---\ntags: [x]\n---\nIsi #y\n";
    expect(renameTagInNote(raw, "bmn", "aset")).toEqual({ text: raw, count: 0 });
    expect(renameTagInNote("---\na: 1\n---\r\nIsi #bmn\r\n", "bmn", "aset").count).toBe(1);
  });

  it("kueri graf", () => {
    expect(renameTagInQuery("tag:bmn path:x tag:bmn/a tag:lain", "bmn", "aset")).toBe(
      "tag:aset path:x tag:aset/a tag:lain",
    );
  });
});
