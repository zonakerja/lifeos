import { describe, expect, it } from "vitest";
import { DEFAULT_BASE, isBasePath, parseBase, updateBaseYaml, validateBase } from "./vault-bases";

describe("vault-bases", () => {
  it("membaca base & galat sintaks", () => {
    expect(parseBase(DEFAULT_BASE).data).toEqual({ views: [{ type: "table", name: "Tabel" }] });
    expect(parseBase("").data).toEqual({});
    expect(parseBase("views: [").error).toBeTruthy();
    expect(parseBase("- a\n- b").error).toMatch(/objek/);
    expect(isBasePath("Folder/Daftar.base")).toBe(true);
    expect(isBasePath("a.md")).toBe(false);
  });

  it("validasi bentuk", () => {
    expect(validateBase({ views: [{ type: "table" }] })).toBeNull();
    expect(validateBase({ views: "x" })).toMatch(/daftar/);
    expect(validateBase({ views: [1] })).toMatch(/objek/);
    expect(validateBase({ formulas: [] })).toMatch(/formulas/);
  });

  it("menulis ulang kunci utama, mempertahankan kunci & komentar lain", () => {
    const raw =
      '# base saya\nfilters:\n  and:\n    - file.hasTag("bmn")\nlainnya: 1\nviews:\n  - type: table\n    name: Lama\n';
    const out = updateBaseYaml(raw, {
      filters: { and: ['file.hasTag("bmn")', 'status == "berlaku"'] },
      views: [{ type: "cards", name: "Kartu" }],
    });
    expect(out).toContain("# base saya");
    expect(out).toContain("lainnya: 1");
    expect(parseBase(out).data).toEqual({
      filters: { and: ['file.hasTag("bmn")', 'status == "berlaku"'] },
      lainnya: 1,
      views: [{ type: "cards", name: "Kartu" }],
    });
    // formulas dihapus bila tidak dikirim; YAML rusak ditulis ulang bersih
    expect(parseBase(updateBaseYaml("formulas:\n  a: 1\n", {})).data).toEqual({});
    expect(parseBase(updateBaseYaml("views: [", { views: [] })).data).toEqual({ views: [] });
  });
});
