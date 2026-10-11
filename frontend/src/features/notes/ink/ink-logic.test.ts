import { describe, expect, it } from "vitest";
import {
  emptyInk,
  eraseStrokes,
  grownHeight,
  inkContentBottom,
  MAX_HEIGHT,
  type InkStroke,
  normalizeInk,
  PAGE_HEIGHT,
  pushPoint,
  strokeBounds,
  strokeHit,
  strokePath,
} from "./ink-logic";
import { inkPageSlices, MAX_RECOGNITION_PAGES } from "./ink-to-image";

const stroke = (points: number[], extra: Partial<InkStroke> = {}): InkStroke => ({
  tool: "pen",
  color: "ink",
  size: 4,
  points,
  pressure: true,
  ...extra,
});

describe("titik goresan", () => {
  it("membulatkan nilai dan mengabaikan titik yang terlalu rapat", () => {
    const points: number[] = [];
    expect(pushPoint(points, 10.123, 20.456, 0.4567, 0)).toBe(true);
    expect(pushPoint(points, 10.5, 20.5, 0.5)).toBe(false);
    expect(pushPoint(points, 15, 20, 1.4)).toBe(true);
    expect(points).toEqual([10.1, 20.5, 0.46, 15, 20, 1]);
    expect(pushPoint(points, Infinity, 5, 0.5)).toBe(false);
  });

  it("menghitung batas goresan", () => {
    expect(strokeBounds([5, 50, 0.5, 30, 10, 0.5])).toEqual({ minX: 5, minY: 10, maxX: 30, maxY: 50 });
  });
});

describe("bentuk goresan", () => {
  it("menghasilkan path tertutup untuk goresan dan lingkaran untuk ketukan", () => {
    const path = strokePath(stroke([0, 0, 0.5, 20, 5, 0.6, 40, 12, 0.7, 60, 20, 0.5]));
    expect(path.startsWith("M")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    expect(strokePath(stroke([10, 10, 0.5]))).toContain("a");
  });
});

describe("penghapus", () => {
  const a = stroke([0, 0, 0.5, 100, 0, 0.5]);
  const b = stroke([0, 300, 0.5, 100, 300, 0.5]);

  it("menghapus goresan yang tersentuh, membiarkan yang jauh", () => {
    expect(strokeHit(a, 50, 5, 50, 5)).toBe(true);
    expect(strokeHit(b, 50, 5, 50, 5)).toBe(false);
    expect(eraseStrokes([a, b], 50, 5, 50, 5)).toEqual([b]);
  });

  it("penghapus yang bergerak cepat tetap mengenai goresan di antara dua titik sampel", () => {
    const vertical = stroke([50, 100, 0.5, 50, 200, 0.5]);
    expect(strokeHit(vertical, 0, 150, 100, 150)).toBe(true);
  });

  it("mengembalikan array yang sama bila tidak ada yang terhapus", () => {
    const strokes = [a, b];
    expect(eraseStrokes(strokes, 500, 500, 510, 510)).toBe(strokes);
  });
});

describe("tinggi kanvas", () => {
  it("bertambah saat menulis dekat tepi bawah", () => {
    expect(grownHeight(360, 100, 200)).toBe(360);
    expect(grownHeight(360, 300, 200)).toBe(560);
    expect(grownHeight(360, 700, 200)).toBe(960);
    expect(grownHeight(360, Infinity, 200)).toBe(360);
    expect(grownHeight(360, 1e9, 200)).toBe(MAX_HEIGHT);
  });

  it("tepi bawah isi memperhitungkan ketebalan", () => {
    expect(inkContentBottom([stroke([0, 0, 0.5, 0, 100, 0.5], { size: 10 })])).toBe(110);
    expect(inkContentBottom([])).toBe(0);
  });
});

describe("data tersimpan", () => {
  it("toleran terhadap data kosong / rusak", () => {
    expect(normalizeInk(null, 360)).toEqual(emptyInk(360));
    expect(normalizeInk({ height: -1, paper: "xx", strokes: [{}, stroke([1, 1, 0.5])] }, 360)).toEqual({
      version: 1,
      height: 360,
      paper: "lined",
      strokes: [stroke([1, 1, 0.5])],
    });
  });
});

describe("halaman untuk pengenalan AI", () => {
  it("melewati halaman kosong dan membatasi jumlah halaman", () => {
    const ink = {
      ...emptyInk(PAGE_HEIGHT * 3),
      strokes: [stroke([10, 10, 0.5, 20, 20, 0.5]), stroke([10, PAGE_HEIGHT * 2 + 50, 0.5])],
    };
    expect(inkPageSlices(ink)).toEqual([
      { top: 0, bottom: PAGE_HEIGHT },
      { top: PAGE_HEIGHT * 2, bottom: PAGE_HEIGHT * 3 },
    ]);
    const many = {
      ...emptyInk(PAGE_HEIGHT * 15),
      strokes: Array.from({ length: 15 }, (_, i) => stroke([10, i * PAGE_HEIGHT + 10, 0.5])),
    };
    expect(inkPageSlices(many)).toHaveLength(MAX_RECOGNITION_PAGES);
  });
});
