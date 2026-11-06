import type { KnowledgeGraph, KnowledgeNoteListItem } from "@/types/api";

/**
 * Logika murni menu Pengetahuan: pohon vault, pencocokan tautan wiki (sama dengan backend `buildLinkResolver`), ubah
 * Markdown Obsidian (`[[…]]`, `![[…]]`, callout) ke Markdown yang dirender aplikasi, garis besar, kueri graf/tabel,
 * graf lokal, dan hitungan tag.
 */

export const INBOX_DIR = "00-Inbox";
export const TEMPLATE_DIR = "90-Templat";
/** Folder cermin hasil kerja LifeOS (backend `vault-export.ts`): ditimpa setiap sinkron → baca saja di sini. */
export const MIRROR_DIR = "80-LifeOS";

/** Berkas cermin buatan LifeOS (bukan catatan user yang kebetulan disimpan di folder itu). */
export const isMirrorNote = (note: { path: string; properties?: Record<string, unknown> | null }) =>
  note.path.split("/")[0] === MIRROR_DIR && note.properties?.sumber === "lifeos";

/** Alamat "Buka di LifeOS" (properti `lifeos` berkas cermin) → path aplikasi, bila alamatnya aplikasi ini. */
export function mirrorAppPath(properties: Record<string, unknown> | null | undefined, origin: string) {
  const value = typeof properties?.lifeos === "string" ? properties.lifeos : "";
  try {
    const url = new URL(value);
    return url.origin === origin ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

export type TreeItem =
  | { type: "folder"; name: string; path: string; children: TreeItem[]; count: number }
  | { type: "note"; name: string; path: string; note: KnowledgeNoteListItem };

type FolderItem = Extract<TreeItem, { type: "folder" }>;

const collator = new Intl.Collator("id", { numeric: true, sensitivity: "base" });

/** Nama catatan seperti di `[[…]]`: nama berkas tanpa folder & `.md`. */
export const noteName = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
export const folderOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

/** Pohon folder (folder dulu, lalu catatan; urut alami) dengan jumlah catatan di dalamnya. */
export function buildTree(folders: string[], notes: KnowledgeNoteListItem[]): TreeItem[] {
  const root: FolderItem = { type: "folder", name: "", path: "", children: [], count: 0 };
  const byPath = new Map<string, FolderItem>([["", root]]);
  const folderItem = (path: string): FolderItem => {
    const existing = byPath.get(path);
    if (existing) return existing;
    const parent = folderItem(folderOf(path));
    const folder: FolderItem = {
      type: "folder",
      name: path.slice(path.lastIndexOf("/") + 1),
      path,
      children: [],
      count: 0,
    };
    parent.children.push(folder);
    byPath.set(path, folder);
    return folder;
  };
  for (const folder of folders) folderItem(folder);
  for (const note of notes) {
    const dir = folderOf(note.path);
    folderItem(dir).children.push({
      type: "note",
      name: note.path.slice(note.path.lastIndexOf("/") + 1),
      path: note.path,
      note,
    });
    for (let d = dir; ; d = folderOf(d)) {
      byPath.get(d)!.count++;
      if (!d) break;
    }
  }
  const sort = (items: TreeItem[]) => {
    items.sort((a, b) => (a.type === b.type ? collator.compare(a.name, b.name) : a.type === "folder" ? -1 : 1));
    for (const item of items) if (item.type === "folder") sort(item.children);
  };
  sort(root.children);
  return root.children;
}

const asList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);

export const noteAliases = (note: Pick<KnowledgeNoteListItem, "properties">) =>
  asList(note.properties?.aliases ?? note.properties?.alias);

/** Bagian target tautan sebelum `#judul` / `^blok`. */
const stripAnchor = (target: string) =>
  target
    .replace(/\\/g, "/")
    .replace(/[#^].*$/, "")
    .trim();

/** Pencocok tautan wiki → catatan: path lengkap dulu, lalu nama/alias (path terpendek menang, seperti Obsidian). */
export function createResolver(notes: KnowledgeNoteListItem[]) {
  const byPath = new Map<string, KnowledgeNoteListItem>();
  const byKey = new Map<string, { note: KnowledgeNoteListItem; depth: number }>();
  const put = (key: string, note: KnowledgeNoteListItem, depth: number) => {
    const current = byKey.get(key);
    if (!current || depth < current.depth) byKey.set(key, { note, depth });
  };
  for (const note of notes) {
    const depth = note.path.split("/").length;
    byPath.set(note.path.toLowerCase(), note);
    byPath.set(note.path.replace(/\.md$/i, "").toLowerCase(), note);
    put(noteName(note.path).toLowerCase(), note, depth);
    for (const alias of noteAliases(note)) put(alias.toLowerCase(), note, depth);
  }
  return (target: string): KnowledgeNoteListItem | null => {
    const clean = stripAnchor(target).toLowerCase();
    if (!clean) return null;
    return byPath.get(clean) ?? byPath.get(clean.replace(/\.md$/i, "")) ?? byKey.get(noteName(clean))?.note ?? null;
  };
}

/** Bagian judul `#…` dari target tautan (untuk lompat ke judul di catatan tujuan). */
export const linkHeading = (target: string) => {
  const match = /#([^#^]+)/.exec(target);
  return match ? match[1].trim() : null;
};

/** Skema tautan internal di Markdown yang dirender: `kn:` = tautan catatan, `kn-embed:` = sematan. */
export const LINK_SCHEME = "kn:";
export const EMBED_SCHEME = "kn-embed:";

const WIKILINK = /(!?)\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g;

/** Teks tampilan tautan: alias, atau target dengan `#` sebagai pemisah judul. */
const linkLabel = (target: string, alias?: string) =>
  (alias?.trim() || target.replace(/\^.*$/, "").replace(/#/g, " › ")).replace(/[[\]]/g, "").trim();

/**
 * Markdown Obsidian → Markdown aplikasi: `[[a#b|c]]` → `[c](kn:a%23b)`, `![[a]]` → `![a](kn-embed:a)`, ganti baris
 * tunggal dipertahankan (bawaan Obsidian), kecuali di blok kode.
 */
export function toReaderMarkdown(content: string) {
  return content
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) => {
      if (i % 2) return part;
      return part
        .replace(WIKILINK, (_, bang: string, target: string, alias?: string) => {
          const href = encodeURIComponent(target.trim());
          const label = linkLabel(target.trim(), alias);
          return bang ? `![${label}](${EMBED_SCHEME}${href})` : `[${label}](${LINK_SCHEME}${href})`;
        })
        .replace(/([^\n])\n(?=[^\n])/g, "$1  \n");
    })
    .join("");
}

/** Callout Obsidian `> [!note] Judul` → jenis, judul, bisa dilipat. Null = blockquote biasa. */
export function parseCallout(firstLine: string) {
  const match = /^\[!([\w-]+)\]([+-]?)\s*(.*)$/.exec(firstLine.trim());
  if (!match) return null;
  return { type: match[1].toLowerCase(), folded: match[2] === "-", title: match[3].trim() };
}

/** Warna token per jenis callout. */
export function calloutTone(type: string): "info" | "success" | "warning" | "destructive" | "module" {
  if (["tip", "hint", "important", "success", "check", "done"].includes(type)) return "success";
  if (["warning", "caution", "attention", "question", "help", "faq"].includes(type)) return "warning";
  if (["danger", "error", "failure", "fail", "missing", "bug"].includes(type)) return "destructive";
  if (["note", "info", "todo", "abstract", "summary", "tldr"].includes(type)) return "info";
  return "module";
}

/** Tanda diakritik gabungan (U+0300–U+036F) yang dibuang setelah normalisasi NFKD. */
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "bagian";

export function uniqueId(text: string, used: Map<string, number>) {
  const base = slugify(text);
  const n = used.get(base) ?? 0;
  used.set(base, n + 1);
  return n ? `${base}-${n}` : base;
}

export interface OutlineItem {
  level: number;
  text: string;
  id: string;
  /** Nomor baris (mulai 1) di isi catatan — dipakai pembaca untuk memberi id yang sama */
  line: number;
}

/** Garis besar (judul Markdown di luar blok kode) dengan id unik yang sama dengan pembaca. */
export function outline(content: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const used = new Map<string, number>();
  let fence = false;
  for (const [index, line] of content.split("\n").entries()) {
    if (/^\s*```/.test(line)) fence = !fence;
    if (fence) continue;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = match[2]
      .replace(WIKILINK, (_, __: string, target: string, alias?: string) => linkLabel(target, alias))
      .trim();
    items.push({ level: match[1].length, text, id: uniqueId(text, used), line: index + 1 });
  }
  return items;
}

/** Kueri graf/tabel: kata + `path:`, `tag:`, `status:`, `jenis:`, `file:` (sama dengan pencarian backend). */
export interface NodeQuery {
  words: string[];
  path: string[];
  tag: string[];
  status: string[];
  jenis: string[];
  file: string[];
}

export function parseNodeQuery(input: string): NodeQuery {
  const query: NodeQuery = { words: [], path: [], tag: [], status: [], jenis: [], file: [] };
  for (const [, op, quoted, plain] of input.matchAll(/(?:(\w+):)?(?:"([^"]*)"|(\S+))/g)) {
    const value = (quoted ?? plain ?? "").trim().toLowerCase();
    if (!value) continue;
    const key = op?.toLowerCase();
    if (key === "path" || key === "tag" || key === "status" || key === "jenis" || key === "file")
      query[key].push(key === "tag" ? value.replace(/^#/, "") : value);
    else query.words.push(op ? `${op.toLowerCase()}:${value}` : value);
  }
  return query;
}

export const isEmptyQuery = (q: NodeQuery) => Object.values(q).every((v) => v.length === 0);

export interface QueryableNode {
  title: string;
  path: string;
  tags: string[];
  status: string | null;
  jenis: string | null;
}

export function matchesNodeQuery(node: QueryableNode, query: NodeQuery) {
  const path = node.path.toLowerCase();
  const tags = node.tags.map((t) => t.toLowerCase());
  return (
    query.path.every((p) => path.includes(p)) &&
    query.file.every((f) => noteName(path).includes(f)) &&
    query.tag.every((t) => tags.some((tag) => tag === t || tag.startsWith(`${t}/`))) &&
    query.status.every((s) => (node.status ?? "") === s) &&
    query.jenis.every((j) => (node.jenis ?? "") === j) &&
    query.words.every((w) => `${node.title}\n${node.path}`.toLowerCase().includes(w))
  );
}

/** Graf lokal: catatan pusat + tetangga sampai `depth` langkah (tautan dua arah). */
export function localGraph(graph: Pick<KnowledgeGraph, "edges">, centerId: string, depth: number): Set<string> {
  const neighbors = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    neighbors.get(a)!.add(b);
  };
  for (const edge of graph.edges) {
    add(edge.source, edge.target);
    add(edge.target, edge.source);
  }
  const seen = new Set([centerId]);
  let frontier = [centerId];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier)
      for (const n of neighbors.get(id) ?? [])
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
    frontier = next;
  }
  return seen;
}

/** Tag beserta jumlah catatan (induk tag bertingkat `a/b` → `a` ikut dihitung), urut alami. */
export function tagCounts(notes: Pick<KnowledgeNoteListItem, "tags">[]) {
  const counts = new Map<string, number>();
  for (const note of notes) {
    const tags = new Set<string>();
    for (const tag of note.tags) {
      const parts = tag.split("/");
      for (let i = 1; i <= parts.length; i++) tags.add(parts.slice(0, i).join("/"));
    }
    for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count, depth: tag.split("/").length - 1 }))
    .sort((a, b) => collator.compare(a.tag, b.tag));
}

/** Jenis isian properti untuk formulir Properti. */
export type PropertyKind = "text" | "number" | "boolean" | "list" | "date";

const LIST_KEYS = ["tags", "tag", "aliases", "alias", "topik", "grup", "dasar_hukum"];
const DATE_KEYS = ["diperbarui", "dibuat", "tanggal", "updated", "created"];

export function propertyKind(key: string, value: unknown): PropertyKind {
  if (typeof value === "boolean" || key === "publik") return "boolean";
  if (typeof value === "number") return "number";
  if (Array.isArray(value) || LIST_KEYS.includes(key)) return "list";
  if ((typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) || DATE_KEYS.includes(key)) return "date";
  return "text";
}

/** Nilai properti → teks tampilan. */
export function propertyText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(propertyText).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Catatan di folder `00-Inbox` (usulan agen/chatbot), terbaru dulu. */
export const inboxNotes = (notes: KnowledgeNoteListItem[]) =>
  notes
    .filter((n) => n.kind === "note" && n.path.split("/")[0] === INBOX_DIR)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export const templateNotes = (notes: KnowledgeNoteListItem[]) =>
  notes.filter((n) => n.kind === "note" && n.path.split("/")[0] === TEMPLATE_DIR);

/** Ekstensi gambar yang disematkan langsung di pembaca (dibaca dari vault di server). */
export const isImagePath = (path: string) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(stripAnchor(path));

/** `obsidian://open` untuk membuka catatan yang sama di aplikasi Obsidian (nama vault = folder vault). */
export const obsidianUri = (vault: string, path: string) =>
  `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path.replace(/\.md$/i, ""))}`;
