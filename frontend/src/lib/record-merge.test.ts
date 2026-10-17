import { describe, expect, it } from "vitest";
import { mergePayload } from "./record-merge";

const item = (id: number, text: string, checked = false) => ({ id, text, checked });

describe("mergePayload (salinan client)", () => {
  it("hasil server dipasang tanpa menimpa perubahan lokal yang lebih baru", () => {
    const sent = { id: 1, items: [item(1, "Beras")] };
    // Server menambahkan item orang lain (2); sementara itu user sudah mencentang item 1 di layar
    const saved = { id: 1, items: [item(1, "Beras"), item(2, "Teh")] };
    const local = { id: 1, items: [item(1, "Beras", true)] };
    expect(mergePayload(saved, sent, local, ["items"]).items).toEqual([item(1, "Beras", true), item(2, "Teh")]);
  });
});
