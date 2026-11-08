/**
 * Canvas (K8, format terbuka JSON Canvas 1.0 yang dipakai Obsidian): tipe data, warna preset, geometri garis, dan operasi
 * penyuntingan murni (tambah, pindah, ubah ukuran, hapus, hubungkan). Kunci yang tidak dikenal dipertahankan apa adanya.
 */

export type CanvasSide = "top" | "right" | "bottom" | "left";

export interface CanvasNode {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  subpath?: string;
  url?: string;
  label?: string;
  [key: string]: unknown;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: CanvasSide;
  toSide?: CanvasSide;
  fromEnd?: "none" | "arrow";
  toEnd?: "none" | "arrow";
  color?: string;
  label?: string;
  [key: string]: unknown;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  [key: string]: unknown;
}

/** Warna preset JSON Canvas "1"–"6" → token desain (merah, oranye, kuning, hijau, sian, ungu). */
export const CANVAS_COLORS: { id: string; label: string; token: string }[] = [
  { id: "1", label: "Merah", token: "var(--destructive)" },
  { id: "2", label: "Oranye", token: "var(--mod-notes)" },
  { id: "3", label: "Kuning", token: "var(--warning)" },
  { id: "4", label: "Hijau", token: "var(--success)" },
  { id: "5", label: "Sian", token: "var(--mod-tools)" },
  { id: "6", label: "Ungu", token: "var(--mod-agent)" },
];

/** Warna node/garis: preset → token, heksa dari berkas → apa adanya (isian user), kosong → null (warna bawaan). */
export function canvasColor(color?: string): string | null {
  if (!color) return null;
  const preset = CANVAS_COLORS.find((c) => c.id === color);
  if (preset) return preset.token;
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : null;
}

/** Id acak 16 heksa (gaya id Obsidian), tidak bentrok dengan yang ada. */
export function newCanvasId(existing: Iterable<string>, random: () => number = Math.random) {
  const used = new Set(existing);
  for (;;) {
    const id = Array.from({ length: 16 }, () => Math.floor(random() * 16).toString(16)).join("");
    if (!used.has(id)) return id;
  }
}

const center = (n: CanvasNode) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });

/** Titik tengah sisi node. */
export function sidePoint(n: CanvasNode, side: CanvasSide) {
  switch (side) {
    case "top":
      return { x: n.x + n.width / 2, y: n.y };
    case "bottom":
      return { x: n.x + n.width / 2, y: n.y + n.height };
    case "left":
      return { x: n.x, y: n.y + n.height / 2 };
    case "right":
      return { x: n.x + n.width, y: n.y + n.height / 2 };
  }
}

/** Sisi terbaik bila berkas tidak menyebutkannya: menghadap node lawan (horizontal atau vertikal, mana yang lebih jauh). */
export function autoSides(from: CanvasNode, to: CanvasNode): [CanvasSide, CanvasSide] {
  const a = center(from);
  const b = center(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ["right", "left"] : ["left", "right"];
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
}

const OUTWARD: Record<CanvasSide, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Lintasan SVG garis (kurva Bezier keluar tegak lurus dari sisi node) + titik tengah untuk label. */
export function edgeGeometry(edge: CanvasEdge, from: CanvasNode, to: CanvasNode) {
  const [autoFrom, autoTo] = autoSides(from, to);
  const fromSide = edge.fromSide ?? autoFrom;
  const toSide = edge.toSide ?? autoTo;
  const p1 = sidePoint(from, fromSide);
  const p2 = sidePoint(to, toSide);
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const k = Math.min(Math.max(dist * 0.4, 40), 220);
  const c1 = { x: p1.x + OUTWARD[fromSide].x * k, y: p1.y + OUTWARD[fromSide].y * k };
  const c2 = { x: p2.x + OUTWARD[toSide].x * k, y: p2.y + OUTWARD[toSide].y * k };
  // titik tengah kurva kubik pada t = 0,5
  const mid = {
    x: 0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x,
    y: 0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y,
  };
  return { path: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`, mid };
}

/** Kotak pembatas semua node (null bila kosong). */
export function canvasBounds(nodes: CanvasNode[]) {
  if (!nodes.length) return null;
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.width));
  const maxY = Math.max(...nodes.map((n) => n.y + n.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Skala & geser agar semua node muat di area pandang (dengan tepi), skala dibatasi 0,1–1,5. */
export function fitView(nodes: CanvasNode[], viewport: { width: number; height: number }, padding = 40) {
  const b = canvasBounds(nodes);
  if (!b || viewport.width <= 0 || viewport.height <= 0)
    return { x: viewport.width / 2, y: viewport.height / 2, zoom: 1 };
  const zoom = Math.min(
    1.5,
    Math.max(0.1, Math.min((viewport.width - padding * 2) / b.width, (viewport.height - padding * 2) / b.height)),
  );
  return {
    zoom,
    x: viewport.width / 2 - (b.x + b.width / 2) * zoom,
    y: viewport.height / 2 - (b.y + b.height / 2) * zoom,
  };
}

/** Grup digambar paling belakang (lalu urutan berkas) — sama dengan Obsidian. */
export const drawOrder = (nodes: CanvasNode[]) => [
  ...nodes.filter((n) => n.type === "group"),
  ...nodes.filter((n) => n.type !== "group"),
];

// ---------------------------------------------------------------- operasi penyuntingan (murni, mengembalikan data baru)

const snap = (v: number) => Math.round(v / 10) * 10;

export const MIN_NODE = { width: 120, height: 60 };

/** Isian node baru (id dibuat otomatis). */
export interface NewCanvasNode {
  type: CanvasNode["type"];
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
  color?: string;
}

export function addNode(data: CanvasData, node: NewCanvasNode): { data: CanvasData; id: string } {
  const id = newCanvasId(data.nodes.map((n) => n.id));
  return {
    data: { ...data, nodes: [...data.nodes, { ...node, id, x: snap(node.x), y: snap(node.y) } as CanvasNode] },
    id,
  };
}

export function updateNode(data: CanvasData, id: string, patch: Partial<CanvasNode>): CanvasData {
  return { ...data, nodes: data.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

/** Pindahkan node (dibulatkan ke kisi 10). Memindah grup ikut memindah node yang ada di dalamnya. */
export function moveNode(data: CanvasData, id: string, x: number, y: number): CanvasData {
  const node = data.nodes.find((n) => n.id === id);
  if (!node) return data;
  const dx = snap(x) - node.x;
  const dy = snap(y) - node.y;
  if (!dx && !dy) return data;
  const inside = node.type === "group" ? new Set(childrenOfGroup(data, node).map((n) => n.id)) : new Set<string>();
  return {
    ...data,
    nodes: data.nodes.map((n) => (n.id === id || inside.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
  };
}

export function resizeNode(data: CanvasData, id: string, width: number, height: number): CanvasData {
  return updateNode(data, id, {
    width: Math.max(MIN_NODE.width, snap(width)),
    height: Math.max(MIN_NODE.height, snap(height)),
  });
}

/** Node yang seluruhnya berada di dalam grup. */
export function childrenOfGroup(data: CanvasData, group: CanvasNode) {
  return data.nodes.filter(
    (n) =>
      n.id !== group.id &&
      n.x >= group.x &&
      n.y >= group.y &&
      n.x + n.width <= group.x + group.width &&
      n.y + n.height <= group.y + group.height,
  );
}

/** Hapus node beserta garis yang terhubung. */
export function removeNode(data: CanvasData, id: string): CanvasData {
  return {
    ...data,
    nodes: data.nodes.filter((n) => n.id !== id),
    edges: data.edges.filter((e) => e.fromNode !== id && e.toNode !== id),
  };
}

export const removeEdge = (data: CanvasData, id: string): CanvasData => ({
  ...data,
  edges: data.edges.filter((e) => e.id !== id),
});

/** Garis baru antar dua node (tidak ke diri sendiri, tidak ganda arah yang sama). Null = tidak ditambahkan. */
export function connect(data: CanvasData, from: string, to: string): CanvasData | null {
  if (from === to) return null;
  if (!data.nodes.some((n) => n.id === from) || !data.nodes.some((n) => n.id === to)) return null;
  if (data.edges.some((e) => e.fromNode === from && e.toNode === to)) return null;
  const id = newCanvasId(data.edges.map((e) => e.id));
  return { ...data, edges: [...data.edges, { id, fromNode: from, toNode: to }] };
}

/** Bentuk data dari server (objek longgar) → CanvasData bertipe; node/garis tak lengkap dibuang dari tampilan saja. */
export function toCanvasData(raw: Record<string, unknown>): CanvasData {
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).filter(
    (n): n is CanvasNode =>
      !!n &&
      typeof n === "object" &&
      typeof (n as CanvasNode).id === "string" &&
      ["x", "y", "width", "height"].every((k) => Number.isFinite((n as Record<string, unknown>)[k])),
  );
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(raw.edges) ? raw.edges : []).filter(
    (e): e is CanvasEdge =>
      !!e && typeof e === "object" && ids.has((e as CanvasEdge).fromNode) && ids.has((e as CanvasEdge).toNode),
  );
  return { ...raw, nodes, edges };
}
