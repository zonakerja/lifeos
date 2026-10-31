import { describe, expect, it } from "vitest";
import { cleanReference, referenceClientId, staleReferences } from "./srikandi-reference";

describe("referensi SRIKANDI", () => {
  it("validasi item dari robot", () => {
    expect(cleanReference({ category: "lain", label: "A" })).toBeNull();
    expect(cleanReference({ category: "signer", label: "  " })).toBeNull();
    expect(cleanReference({ category: "signer", label: " Arif  Priyo ", fields: { Jabatan: "Kabag", x: 5 } })).toEqual({
      category: "signer",
      label: "Arif Priyo",
      fields: { Jabatan: "Kabag" },
    });
  });

  it("ID stabil; jabatan berbeda = entri berbeda", () => {
    const a = { category: "signer" as const, label: "Krisna", fields: { Jabatan: "Kepala Bagian Perencanaan" } };
    const b = { ...a, fields: { Jabatan: "Plh. Sekretaris Direktorat Jenderal" } };
    expect(referenceClientId(a)).toBe(referenceClientId({ ...a }));
    expect(referenceClientId(a)).not.toBe(referenceClientId(b));
    expect(referenceClientId(a)).toMatch(/^sr-[0-9a-f]{16}$/);
  });

  it("hapus yang hilang, kecuali kategori terbaca kosong", () => {
    expect(staleReferences(["a", "b"], ["a"])).toEqual(["b"]);
    expect(staleReferences(["a", "b"], [])).toEqual([]);
  });
});
