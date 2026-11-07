import { describe, expect, it } from "vitest";
import type { KnowledgeNoteListItem } from "@/types/api";
import {
  applyView,
  buildCondition,
  evaluate,
  formatBaseValue,
  joinFilter,
  matchesFilter,
  parseExpression,
  splitFilter,
  type BaseContext,
  cellInputText,
  parseCellInput,
  summarize,
} from "./base-engine";

const note = (path: string, properties: Record<string, unknown> = {}, over: Partial<KnowledgeNoteListItem> = {}) =>
  ({
    id: path,
    path,
    kind: "note",
    title: path.replace(/^.*\//, "").replace(/\.md$/, ""),
    assetId: null,
    updatedAt: "2026-11-05T03:00:00.000Z",
    jenis: (properties.jenis as string) ?? null,
    status: (properties.status as KnowledgeNoteListItem["status"]) ?? null,
    publik: null,
    tags: (properties.tags as string[]) ?? [],
    properties,
    links: 0,
    backlinks: 2,
    ...over,
  }) satisfies KnowledgeNoteListItem;

const now = new Date(2026, 10, 7, 10, 0);
const ctx = (n: KnowledgeNoteListItem, formulas: Record<string, string> = {}): BaseContext => ({
  note: n,
  formulas,
  now,
});

const pmk = note("Regulasi/PMK 181.md", {
  status: "berlaku",
  jenis: "regulasi",
  tahun: 2016,
  "nomor surat": "181/PMK.06/2016",
  tags: ["bmn", "regulasi/pmk"],
  terbit: "2016-10-25",
});

describe("ekspresi", () => {
  it("properti, perbandingan, logika", () => {
    expect(evaluate('status == "berlaku"', ctx(pmk))).toBe(true);
    expect(evaluate('note.status != "dicabut" && tahun >= 2015', ctx(pmk))).toBe(true);
    expect(evaluate('note["nomor surat"].contains("PMK")', ctx(pmk))).toBe(true);
    expect(evaluate('!(jenis == "sop") || false', ctx(pmk))).toBe(true);
    expect(evaluate("tahun + 10", ctx(pmk))).toBe(2026);
    expect(evaluate("tidak_ada.isEmpty()", ctx(pmk))).toBe(true);
    expect(evaluate('tags.contains("bmn")', ctx(pmk))).toBe(true);
  });

  it("fungsi file & tanggal", () => {
    expect(evaluate('file.hasTag("regulasi")', ctx(pmk))).toBe(true);
    expect(evaluate('file.hasTag("sop", "bmn")', ctx(pmk))).toBe(true);
    expect(evaluate('file.inFolder("Regulasi")', ctx(pmk))).toBe(true);
    expect(evaluate('file.inFolder("Lain")', ctx(pmk))).toBe(false);
    expect(evaluate("file.basename", ctx(pmk))).toBe("PMK 181");
    expect(evaluate('file.mtime > now() - "7d"', ctx(pmk))).toBe(true);
    expect(evaluate('file.mtime > now() - "1d"', ctx(pmk))).toBe(false);
    expect(evaluate('terbit < date("2017-01-01")', ctx(pmk))).toBe(true);
    expect(evaluate("terbit.year", ctx(pmk))).toBe(2016);
    expect(evaluate('if(tahun > 2020, "baru", "lama")', ctx(pmk))).toBe("lama");
  });

  it("rumus & galat", () => {
    expect(evaluate("formula.umur", ctx(pmk, { umur: "2026 - tahun" }))).toBe(10);
    expect(() => evaluate("formula.a", ctx(pmk, { a: "formula.a" }))).toThrow(/dirinya/);
    expect(() => parseExpression('status == "x')).toThrow();
    expect(() => evaluate('file.hasLink("x")', ctx(pmk))).toThrow(/tidak didukung/);
  });
});

describe("filter & tampilan", () => {
  const sop = note("SOP/Peminjaman.md", { status: "draf", jenis: "sop", tahun: 2024 }, { backlinks: 0 });
  const tanpa = note("Lain/Catatan.md");
  const notes = [sop, pmk, tanpa];

  it("and / or / not + galat dicatat & lolos", () => {
    const errors = new Set<string>();
    expect(matchesFilter({ and: ['jenis == "sop"', { not: ['status == "berlaku"'] }] }, ctx(sop), errors)).toBe(true);
    expect(matchesFilter({ or: ['jenis == "x"', 'jenis == "regulasi"'] }, ctx(sop), errors)).toBe(false);
    expect(matchesFilter("salah((", ctx(sop), errors)).toBe(true);
    expect(errors.size).toBe(1);
  });

  it("kolom, urut, kelompok, batas", () => {
    const result = applyView(
      notes,
      { filters: "!jenis.isEmpty()", formulas: { umur: "2026 - tahun" } },
      { order: ["file.basename", "status", "formula.umur"], sort: [{ property: "tahun", direction: "DESC" }] },
      now,
    );
    expect(result.columns).toEqual(["file.basename", "note.status", "formula.umur"]);
    expect(result.rows.map((r) => [r.values["file.basename"], r.values["formula.umur"]])).toEqual([
      ["Peminjaman", 2],
      ["PMK 181", 10],
    ]);
    const grouped = applyView(notes, {}, { groupBy: { property: "jenis" }, limit: 2 }, now);
    expect(grouped.total).toBe(3);
    expect(grouped.groups?.map((g) => [g.key, g.rows.length])).toEqual([
      ["regulasi", 1],
      ["sop", 1],
    ]);
  });

  it("penyusun kondisi & format", () => {
    expect(buildCondition("status", "is", "berlaku")).toBe('note.status == "berlaku"');
    expect(buildCondition("nomor surat", "contains", "PMK")).toBe('note["nomor surat"].contains("PMK")');
    expect(buildCondition("tahun", "gt", "2020")).toBe("note.tahun > 2020");
    expect(buildCondition("", "hasTag", "#bmn")).toBe('file.hasTag("bmn")');
    expect(buildCondition("file.mtime", "notEmpty", "")).toBe("!file.mtime.isEmpty()");
    expect(splitFilter({ or: ["a", "b"] })).toEqual({ mode: "or", items: ["a", "b"] });
    expect(splitFilter("a")).toEqual({ mode: "and", items: ["a"] });
    expect(joinFilter("and", ["", "x"])).toEqual({ and: ["x"] });
    expect(joinFilter("or", [])).toBeUndefined();
    expect(formatBaseValue(["a", "b"])).toBe("a, b");
    expect(formatBaseValue(true)).toBe("Ya");
  });
});

describe("ringkasan & sunting sel", () => {
  it("ringkasan angka, tanggal, isian", () => {
    expect(summarize([1, 2, "3", null], "Average")).toBe("2");
    expect(summarize([5, 1, 3], "Median")).toBe("3");
    expect(summarize([1, 2.5], "Sum")).toBe("3.5");
    expect(summarize(["a"], "Average")).toBeNull();
    expect(summarize(["2026-01-01", "2026-01-11"], "Range")).toBe("10 hari");
    expect(summarize(["a", "", null, "a", "b"], "Unique")).toBe("2");
    expect(summarize(["a", "", null], "Filled")).toBe("1");
    expect(summarize([true, false, true], "Checked")).toBe("2");
  });

  it("isian sel mengikuti bentuk nilai lama", () => {
    expect(parseCellInput("a, b", ["x"])).toEqual(["a", "b"]);
    expect(parseCellInput("2024", 2016)).toBe(2024);
    expect(parseCellInput("ya", null)).toBe(true);
    expect(parseCellInput("berlaku", "draf")).toBe("berlaku");
    expect(parseCellInput("  ", "draf")).toBeUndefined();
    expect(cellInputText(["a", "b"])).toBe("a, b");
  });
});
