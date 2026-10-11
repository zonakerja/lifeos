import { getStroke } from "perfect-freehand";

/**
 * Tulisan tangan (tinta digital). Koordinat memakai satuan logis: lebar selalu INK_WIDTH, sehingga tulisan ikut
 * menyesuaikan lebar layar (HP/tablet/laptop) tanpa bergeser. Data disimpan sebagai JSON di catatan.
 */

export const INK_WIDTH = 1000;
/** Tinggi satu halaman penuh (rasio A4). */
export const PAGE_HEIGHT = 1414;
/** Tinggi awal blok coretan di dalam catatan ketik. */
export const BLOCK_HEIGHT = 360;
/** Batas tinggi kanvas (50 halaman) agar data tetap wajar. */
export const MAX_HEIGHT = PAGE_HEIGHT * 50;
/** Jarak ke tepi bawah yang memicu penambahan tinggi otomatis. */
const GROW_MARGIN = 80;

export type InkTool = "pen" | "highlighter" | "eraser";
export type PaperStyle = "plain" | "lined" | "grid" | "dots";

export const PEN_COLORS = ["ink", "blue", "red", "green", "orange", "purple"] as const;
export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink"] as const;
export type InkColorId = (typeof PEN_COLORS)[number] | (typeof HIGHLIGHT_COLORS)[number];

/** Warna disimpan sebagai ID dan dipetakan ke token desain agar benar di mode terang & gelap. */
export const INK_COLOR_VAR: Record<InkColorId, string> = {
  ink: "var(--foreground)",
  blue: "var(--mod-planner)",
  red: "var(--destructive)",
  green: "var(--mod-productivity)",
  orange: "var(--mod-notes)",
  purple: "var(--mod-overview)",
  yellow: "var(--warning)",
  pink: "var(--mod-files)",
};

export const INK_COLOR_LABEL: Record<InkColorId, string> = {
  ink: "Hitam",
  blue: "Biru",
  red: "Merah",
  green: "Hijau",
  orange: "Oranye",
  purple: "Ungu",
  yellow: "Kuning",
  pink: "Merah muda",
};

export const PEN_SIZES = [3, 5, 9] as const;
export const HIGHLIGHT_SIZES = [16, 24, 34] as const;
/** Radius penghapus (satuan logis). */
export const ERASER_RADIUS = 12;

export const PAPER_LABEL: Record<PaperStyle, string> = {
  plain: "Polos",
  lined: "Bergaris",
  grid: "Kotak",
  dots: "Titik",
};

export interface InkStroke {
  tool: "pen" | "highlighter";
  color: InkColorId;
  size: number;
  /** Datar: x, y, tekanan (0–1) berulang. */
  points: number[];
  /** true bila tekanan berasal dari stylus; false → ketebalan disimulasikan dari kecepatan. */
  pressure: boolean;
}

export interface InkData {
  version: 1;
  height: number;
  paper: PaperStyle;
  strokes: InkStroke[];
}

export const emptyInk = (height: number, paper: PaperStyle = "lined"): InkData => ({
  version: 1,
  height,
  paper,
  strokes: [],
});

/** Data tinta dari JSON tersimpan (toleran terhadap data rusak/kosong). */
export const normalizeInk = (value: unknown, fallbackHeight: number): InkData => {
  const v = (value ?? {}) as Partial<InkData>;
  return {
    version: 1,
    height: typeof v.height === "number" && v.height > 0 ? v.height : fallbackHeight,
    paper: v.paper && v.paper in PAPER_LABEL ? v.paper : "lined",
    strokes: Array.isArray(v.strokes) ? v.strokes.filter((s) => Array.isArray(s?.points)) : [],
  };
};

// ---------------------------------------------------------------------------- Titik

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Tambah titik ke goresan, abaikan titik yang terlalu dekat dengan titik sebelumnya (mengecilkan ukuran data tanpa
 * mengubah bentuk). Mengubah array di tempat — dipakai saat menggambar.
 */
export const pushPoint = (points: number[], x: number, y: number, pressure: number, minDistance = 1.2) => {
  // Elemen belum ter-layout (lebar 0) menghasilkan koordinat tak hingga — abaikan
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const n = points.length;
  if (n >= 3) {
    const dx = x - points[n - 3];
    const dy = y - points[n - 2];
    if (dx * dx + dy * dy < minDistance * minDistance) return false;
  }
  points.push(round1(x), round1(y), round2(Math.min(1, Math.max(0, pressure))));
  return true;
};

const toTriples = (points: number[]) => {
  const out: [number, number, number][] = [];
  for (let i = 0; i + 2 < points.length; i += 3) out.push([points[i], points[i + 1], points[i + 2]]);
  return out;
};

export const strokeBounds = (points: number[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 3) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return { minX, minY, maxX, maxY };
};

// ---------------------------------------------------------------------------- Bentuk goresan

const outlineOptions = (stroke: Pick<InkStroke, "tool" | "size" | "pressure">, complete: boolean) =>
  stroke.tool === "highlighter"
    ? { size: stroke.size, thinning: 0, smoothing: 0.5, streamline: 0.5, simulatePressure: false, last: complete }
    : {
        size: stroke.size,
        thinning: 0.6,
        smoothing: 0.5,
        streamline: 0.45,
        simulatePressure: !stroke.pressure,
        last: complete,
        start: { taper: 0, cap: true },
        end: { taper: 0, cap: true },
      };

const average = (a: number, b: number) => (a + b) / 2;

/** Outline polygon perfect-freehand → path SVG (kurva kuadratik halus). */
export const outlineToPath = (outline: number[][]) => {
  const len = outline.length;
  if (len < 4) return "";
  let a = outline[0];
  let b = outline[1];
  const c = outline[2];
  let d = `M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${b[0].toFixed(1)},${b[1].toFixed(1)} ${average(b[0], c[0]).toFixed(1)},${average(b[1], c[1]).toFixed(1)} T`;
  for (let i = 2; i < len - 1; i++) {
    a = outline[i];
    b = outline[i + 1];
    d += `${average(a[0], b[0]).toFixed(1)},${average(a[1], b[1]).toFixed(1)} `;
  }
  return `${d}Z`;
};

/** Titik tunggal (ketukan) → lingkaran kecil agar tetap terlihat. */
const dotPath = (x: number, y: number, r: number) =>
  `M${x - r},${y} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0`;

export const strokePath = (stroke: Pick<InkStroke, "tool" | "size" | "pressure" | "points">, complete = true) => {
  if (stroke.points.length === 3) {
    const r = (stroke.tool === "highlighter" ? stroke.size : stroke.size * Math.max(0.4, stroke.points[2])) / 2;
    return dotPath(stroke.points[0], stroke.points[1], r);
  }
  return outlineToPath(getStroke(toTriples(stroke.points), outlineOptions(stroke, complete)));
};

const pathCache = new WeakMap<InkStroke, string>();
/** Path goresan yang sudah selesai (di-cache per objek goresan). */
export const cachedStrokePath = (stroke: InkStroke) => {
  let d = pathCache.get(stroke);
  if (d === undefined) {
    d = strokePath(stroke);
    pathCache.set(stroke, d);
  }
  return d;
};

// ---------------------------------------------------------------------------- Penghapus

const distanceToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
};

/** Apakah goresan tersentuh penghapus yang bergerak dari (ax,ay) ke (bx,by). */
export const strokeHit = (
  stroke: InkStroke,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius = ERASER_RADIUS,
) => {
  const reach = radius + stroke.size / 2;
  const { minX, minY, maxX, maxY } = strokeBounds(stroke.points);
  if (Math.max(ax, bx) < minX - reach || Math.min(ax, bx) > maxX + reach) return false;
  if (Math.max(ay, by) < minY - reach || Math.min(ay, by) > maxY + reach) return false;
  const p = stroke.points;
  if (p.length < 6) return distanceToSegment(p[0], p[1], ax, ay, bx, by) <= reach;
  // Bandingkan setiap ruas goresan dengan lintasan penghapus (titik goresan cepat bisa berjauhan)
  for (let i = 0; i + 4 < p.length; i += 3) {
    if (segmentDistance(p[i], p[i + 1], p[i + 3], p[i + 4], ax, ay, bx, by) <= reach) return true;
  }
  return false;
};

const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/** Jarak terdekat antara ruas AB dan CD (0 bila berpotongan). */
const segmentDistance = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
) => {
  const d1 = cross(cx, cy, dx, dy, ax, ay);
  const d2 = cross(cx, cy, dx, dy, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy);
  const d4 = cross(ax, ay, bx, by, dx, dy);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(
    distanceToSegment(ax, ay, cx, cy, dx, dy),
    distanceToSegment(bx, by, cx, cy, dx, dy),
    distanceToSegment(cx, cy, ax, ay, bx, by),
    distanceToSegment(dx, dy, ax, ay, bx, by),
  );
};

/** Goresan yang tersisa setelah penghapus lewat. Mengembalikan array yang sama bila tidak ada yang terhapus. */
export const eraseStrokes = (strokes: InkStroke[], ax: number, ay: number, bx: number, by: number) => {
  const kept = strokes.filter((s) => !strokeHit(s, ax, ay, bx, by));
  return kept.length === strokes.length ? strokes : kept;
};

// ---------------------------------------------------------------------------- Tinggi

/** Tinggi kanvas setelah menulis sampai `maxY`: bertambah otomatis saat mendekati tepi bawah. */
export const grownHeight = (height: number, maxY: number, step: number) => {
  if (!Number.isFinite(maxY) || step <= 0) return height;
  const needed = maxY + GROW_MARGIN - height;
  return needed > 0 ? Math.min(MAX_HEIGHT, height + Math.ceil(needed / step) * step) : height;
};

export const inkContentBottom = (strokes: InkStroke[]) =>
  strokes.reduce((max, s) => Math.max(max, strokeBounds(s.points).maxY + s.size), 0);

/** Batas wajar ukuran data tinta (body request backend maks. 5 MB). */
export const INK_SIZE_WARNING_BYTES = 3_500_000;
export const inkByteSize = (ink: InkData) => JSON.stringify(ink).length;
