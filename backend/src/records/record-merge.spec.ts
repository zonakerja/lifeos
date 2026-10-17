import { describe, expect, it } from "vitest";
import { inkPreview, preserveFields, toLightPayload } from "./record-light";
import { mergeKeyedArray, mergePayload } from "./record-merge";

const item = (id: number, text: string, checked = false) => ({ id, text, checked });

describe("mergePayload (List Bebas)", () => {
  const base = { id: 1, title: "Belanja", items: [item(1, "Beras"), item(2, "Gula")] };

  it("tambahan orang lain tetap ada saat client menambah item", () => {
    const current = { ...base, items: [...base.items, item(3, "Teh")] };
    const incoming = { ...base, items: [...base.items, item(4, "Kopi")] };
    expect(mergePayload(current, base, incoming, ["items"]).items).toEqual([
      item(1, "Beras"),
      item(2, "Gula"),
      item(3, "Teh"),
      item(4, "Kopi"),
    ]);
  });

  it("centang client & ubah judul orang lain sama-sama dipertahankan", () => {
    const current = { ...base, title: "Belanja Bulanan" };
    const incoming = { ...base, items: [item(1, "Beras", true), item(2, "Gula")] };
    const merged = mergePayload(current, base, incoming, ["items"]);
    expect(merged.title).toBe("Belanja Bulanan");
    expect(merged.items).toEqual([item(1, "Beras", true), item(2, "Gula")]);
  });

  it("hapus oleh client diterapkan; item yang dihapus orang lain tidak muncul lagi", () => {
    const current = { ...base, items: [item(2, "Gula"), item(3, "Teh")] };
    const incoming = { ...base, items: [item(1, "Beras (5 kg)")] };
    expect(mergePayload(current, base, incoming, ["items"]).items).toEqual([item(3, "Teh")]);
  });

  it("urutan baru dari client dipakai, tambahan orang lain di akhir", () => {
    const current = { ...base, items: [...base.items, item(3, "Teh")] };
    const incoming = { ...base, items: [item(2, "Gula"), item(1, "Beras")] };
    expect(mergeKeyedArray(current.items, base.items, incoming.items).map((i) => i.id)).toEqual([2, 1, 3]);
  });

  it("record belum ada → payload client apa adanya", () => {
    expect(mergePayload(undefined, base, { ...base, title: "Baru" }, ["items"]).title).toBe("Baru");
  });
});

describe("daftar ringan Catatan", () => {
  const ink = {
    version: 1,
    height: 1800,
    strokes: [
      { points: [10, 100, 0.5, 20, 120, 0.5] },
      { points: [10, 1200, 0.5, 20, 1300, 0.5] },
      { points: [10, 590, 0.5, 20, 900, 0.5] },
    ],
  };

  it("coretan dipotong ke bagian atas halaman", () => {
    expect((inkPreview(ink) as { strokes: unknown[] }).strokes).toHaveLength(2);
  });

  it("free_note: doc dibuang, ink dipotong, key ditandai partial", () => {
    const { payload, partial } = toLightPayload("free_note", { id: 1, title: "A", doc: { type: "doc" }, ink });
    expect(payload.doc).toBeUndefined();
    expect((payload.ink as { strokes: unknown[] }).strokes).toHaveLength(2);
    expect(partial).toEqual(["doc", "ink"]);
  });

  it("tanpa field berat → tidak partial; tipe lain tidak disentuh", () => {
    expect(toLightPayload("free_note", { id: 1, title: "A", content: "x" }).partial).toEqual([]);
    expect(toLightPayload("list", { id: 1, items: [] }).partial).toEqual([]);
    expect(toLightPayload("ai_note", { id: 1, fileContext: "panjang" }).payload.fileContext).toBeUndefined();
  });

  it("preserve mempertahankan isi tersimpan & mengabaikan key yang tidak boleh", () => {
    const current = { id: 1, doc: { type: "doc", content: [] }, title: "Lama" };
    const incoming = { id: 1, title: "Baru", pinned: true, ink: { strokes: [] } };
    const result = preserveFields("free_note", incoming, current, ["doc", "ink", "title"]);
    expect(result).toEqual({ id: 1, title: "Baru", pinned: true, doc: current.doc });
  });
});
