import { describe, expect, it } from "vitest";
import {
  canvasIndexText,
  DEFAULT_CANVAS,
  isCanvasPath,
  parseCanvas,
  serializeCanvas,
  validateCanvas,
} from "./vault-canvas";

const node = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  type: "text",
  text: "Halo",
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  ...over,
});

describe("vault-canvas", () => {
  it("membaca canvas & kunci lain dipertahankan", () => {
    expect(parseCanvas(DEFAULT_CANVAS).data.nodes).toHaveLength(1);
    expect(parseCanvas("").data).toEqual({ nodes: [], edges: [] });
    expect(parseCanvas("{rusak").error).toMatch(/JSON/);
    expect(parseCanvas("[]").error).toMatch(/objek/);
    expect(parseCanvas('{"nodes":[],"versi":2}').data).toEqual({ nodes: [], edges: [], versi: 2 });
    expect(isCanvasPath("Peta/Proyek.canvas")).toBe(true);
    expect(isCanvasPath("a.md")).toBe(false);
  });

  it("validasi node & garis", () => {
    const ok = {
      nodes: [node("a"), node("b", { type: "file", file: "A.md" })],
      edges: [{ id: "e", fromNode: "a", toNode: "b" }],
    };
    expect(validateCanvas(ok)).toBeNull();
    expect(validateCanvas({ nodes: [node("a"), node("a")], edges: [] })).toMatch(/ganda/);
    expect(validateCanvas({ nodes: [node("a", { type: "x" })], edges: [] })).toMatch(/Jenis/);
    expect(validateCanvas({ nodes: [node("a", { x: "1" })], edges: [] })).toMatch(/Posisi/);
    expect(validateCanvas({ nodes: [node("a", { type: "link" })], edges: [] })).toMatch(/url/);
    expect(validateCanvas({ nodes: [node("a")], edges: [{ id: "e", fromNode: "a", toNode: "z" }] })).toMatch(/tujuan/);
    expect(validateCanvas({ nodes: [] })).toMatch(/edges/);
  });

  it("menulis dengan tab", () => {
    expect(serializeCanvas({ nodes: [], edges: [] })).toBe('{\n\t"nodes": [],\n\t"edges": []\n}\n');
  });

  it("teks indeks: kartu urut posisi, rujukan, tautan, grup, hubungan", () => {
    const text = canvasIndexText("Peta/Alur PSP.canvas", {
      nodes: [
        node("b", { text: "## Verifikasi\nCek data SIMAN", y: 300 }),
        node("a", { text: "Pengajuan masuk", y: 0 }),
        node("f", { type: "file", file: "10-Peraturan/PMK 181.md", text: undefined, y: 600 }),
        node("l", { type: "link", url: "https://jdih.kemenkeu.go.id", text: undefined, y: 700 }),
        node("g", { type: "group", label: "Tahap 1", text: undefined, y: -50 }),
      ],
      edges: [
        { id: "e1", fromNode: "a", toNode: "b", label: "lengkap" },
        { id: "e2", fromNode: "b", toNode: "f" },
        { id: "e3", fromNode: "a", toNode: "hilang" },
      ],
    });
    expect(text.startsWith("# Alur PSP")).toBe(true);
    expect(text.indexOf("## Tahap 1")).toBeLessThan(text.indexOf("Pengajuan masuk"));
    expect(text.indexOf("Pengajuan masuk")).toBeLessThan(text.indexOf("Cek data SIMAN"));
    expect(text).toContain("Catatan/berkas: [[PMK 181]]");
    expect(text).toContain("Tautan: https://jdih.kemenkeu.go.id");
    expect(text).toContain("- Pengajuan masuk → Verifikasi (lengkap)");
    expect(text).toContain("- Verifikasi → PMK 181");
    expect(text).not.toContain("hilang");
  });
});
