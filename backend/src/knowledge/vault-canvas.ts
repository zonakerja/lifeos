/**
 * Berkas Canvas Obsidian (`.canvas`, format terbuka JSON Canvas 1.0 — K8 docs/AI-AGENT.md §25.6): `nodes` (text, file, link,
 * group) + `edges`. Server hanya membaca, memeriksa bentuk, dan menulis JSON; tampilan & penyuntingan di browser. Logika murni.
 */

export const CANVAS_EXT = ".canvas";
export const MAX_CANVAS_BYTES = 2 * 1024 * 1024;
const NODE_TYPES = new Set(["text", "file", "link", "group"]);

export const isCanvasPath = (path: string) => path.toLowerCase().endsWith(CANVAS_EXT);

/** Canvas baru: satu kartu teks penyambut (Obsidian membuat canvas kosong; kartu membantu user baru). */
export const DEFAULT_CANVAS = `${JSON.stringify(
  {
    nodes: [
      {
        id: "lifeos-welcome",
        type: "text",
        text: "# Canvas baru\nTambahkan kartu teks, catatan, atau tautan, lalu hubungkan dengan garis.",
        x: 0,
        y: 0,
        width: 360,
        height: 140,
      },
    ],
    edges: [],
  },
  null,
  "\t",
)}\n`;

export interface CanvasData {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  [key: string]: unknown;
}

/** Parse berkas canvas → data; galat dikembalikan sebagai pesan (berkas tidak pernah ditimpa saat rusak). */
export function parseCanvas(raw: string): { data: CanvasData; error: string | null } {
  const empty: CanvasData = { nodes: [], edges: [] };
  if (!raw.trim()) return { data: empty, error: null };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return { data: empty, error: `JSON tidak valid: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { data: empty, error: "Canvas harus objek JSON." };
  const obj = value as Record<string, unknown>;
  return {
    data: {
      ...obj,
      nodes: Array.isArray(obj.nodes) ? (obj.nodes as Record<string, unknown>[]) : [],
      edges: Array.isArray(obj.edges) ? (obj.edges as Record<string, unknown>[]) : [],
    },
    error: null,
  };
}

const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Periksa bentuk JSON Canvas sebelum ditulis. Null = valid. */
export function validateCanvas(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "Canvas harus objek.";
  const { nodes, edges } = data as Record<string, unknown>;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return "Canvas wajib punya daftar nodes dan edges.";
  if (nodes.length > 5000 || edges.length > 10000) return "Canvas terlalu besar.";
  const ids = new Set<string>();
  for (const node of nodes) {
    if (!node || typeof node !== "object") return "Node harus objek.";
    const n = node as Record<string, unknown>;
    if (typeof n.id !== "string" || !n.id) return "Setiap node wajib punya id.";
    if (ids.has(n.id)) return `Id node ganda: ${n.id}`;
    ids.add(n.id);
    if (typeof n.type !== "string" || !NODE_TYPES.has(n.type)) return `Jenis node tidak dikenal: ${String(n.type)}`;
    if (!isNum(n.x) || !isNum(n.y) || !isNum(n.width) || !isNum(n.height))
      return `Posisi/ukuran node ${n.id} tidak valid.`;
    if (n.type === "text" && typeof n.text !== "string") return `Node teks ${n.id} wajib punya text.`;
    if (n.type === "file" && typeof n.file !== "string") return `Node berkas ${n.id} wajib punya file.`;
    if (n.type === "link" && typeof n.url !== "string") return `Node tautan ${n.id} wajib punya url.`;
  }
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (!edge || typeof edge !== "object") return "Garis harus objek.";
    const e = edge as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id) return "Setiap garis wajib punya id.";
    if (edgeIds.has(e.id)) return `Id garis ganda: ${e.id}`;
    edgeIds.add(e.id);
    if (typeof e.fromNode !== "string" || !ids.has(e.fromNode))
      return `Garis ${e.id} merujuk node asal yang tidak ada.`;
    if (typeof e.toNode !== "string" || !ids.has(e.toNode)) return `Garis ${e.id} merujuk node tujuan yang tidak ada.`;
  }
  return null;
}

/** Tulis canvas dengan indentasi tab (sama dengan Obsidian) agar diff berkas tetap kecil. */
export const serializeCanvas = (data: CanvasData) => `${JSON.stringify(data, null, "\t")}\n`;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const baseName = (path: string) => (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");

/** Label singkat node (baris pertama teks / nama berkas / alamat / label grup) — dipakai untuk menuliskan garis. */
export function canvasNodeLabel(node: Record<string, unknown>): string {
  if (node.type === "text")
    return (
      str(node.text)
        .split("\n")
        .find((l) => l.trim()) ?? ""
    )
      .replace(/^#+\s*/, "")
      .slice(0, 80);
  if (node.type === "file") return baseName(str(node.file));
  if (node.type === "link") return str(node.url);
  if (node.type === "group") return str(node.label) || "Grup";
  return "";
}

/**
 * Teks canvas untuk indeks RAG: judul berkas, isi kartu teks, rujukan catatan/berkas, tautan web, grup, lalu hubungan
 * antarkartu ("A → B (label)"). Urutan mengikuti posisi (atas → bawah, kiri → kanan) agar dibaca seperti papan.
 */
export function canvasIndexText(path: string, data: CanvasData): string {
  const nodes = data.nodes
    .filter((n) => n && typeof n === "object")
    .slice()
    .sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0) || (Number(a.x) || 0) - (Number(b.x) || 0));
  const parts = [`# ${baseName(path)}`];
  for (const node of nodes) {
    if (node.type === "text" && str(node.text)) parts.push(str(node.text));
    else if (node.type === "file" && str(node.file)) parts.push(`Catatan/berkas: [[${baseName(str(node.file))}]]`);
    else if (node.type === "link" && str(node.url)) parts.push(`Tautan: ${str(node.url)}`);
    else if (node.type === "group" && str(node.label)) parts.push(`## ${str(node.label)}`);
  }
  const byId = new Map(nodes.map((n) => [String(n.id), n]));
  const relations = data.edges.flatMap((edge) => {
    const from = byId.get(String(edge?.fromNode));
    const to = byId.get(String(edge?.toNode));
    if (!from || !to) return [];
    const a = canvasNodeLabel(from);
    const b = canvasNodeLabel(to);
    if (!a || !b) return [];
    return [`- ${a} → ${b}${str(edge.label) ? ` (${str(edge.label)})` : ""}`];
  });
  if (relations.length) parts.push(`## Hubungan\n${relations.join("\n")}`);
  return parts.join("\n\n");
}

/**
 * Perbarui rujukan node `file` (catatan diganti nama / dipindah / digabung / bagiannya diekstrak). `map` mengembalikan rujukan
 * baru, null = biarkan. Canvas tidak ada di `knowledge_notes`, jadi tidak ikut pembaruan tautan catatan.
 */
export function retargetCanvasNodes(
  data: CanvasData,
  map: (file: string, subpath?: string) => { file: string; subpath?: string } | null,
) {
  let changed = 0;
  const nodes = data.nodes.map((node) => {
    if (node?.type !== "file" || typeof node.file !== "string") return node;
    const next = map(node.file, typeof node.subpath === "string" ? node.subpath : undefined);
    if (!next || (next.file === node.file && next.subpath === node.subpath)) return node;
    changed++;
    const { subpath: _old, ...rest } = node;
    void _old;
    return { ...rest, file: next.file, ...(next.subpath ? { subpath: next.subpath } : {}) };
  });
  return { data: { ...data, nodes } as CanvasData, changed };
}
