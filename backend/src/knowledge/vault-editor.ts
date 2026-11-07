import { isMap, parseDocument } from "yaml";
import { EXPORT_DIR, INBOX_DIR, linkKey, splitFrontmatter, TEMPLATE_DIR } from "./vault-parser";

/**
 * Logika murni menu Knowledge (antarmuka Obsidian di LifeOS): validasi path vault, ubah properti tanpa merusak format
 * YAML, ganti nama tautan saat catatan diganti nama, pencarian beroperator, sebutan tanpa tautan, templat, kesehatan
 * vault, dan preferensi tampilan. Semua penulisan berkas tetap di `KnowledgeVaultService`.
 */

/** Folder sampah vault (sama dengan Obsidian "Pindahkan ke .trash"). Folder berawalan titik tidak dipindai. */
export const TRASH_DIR = ".trash";
const MAX_PATH = 400;
const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);
// eslint-disable-next-line no-control-regex -- karakter kontrol memang dilarang di nama berkas
const FORBIDDEN_CHARS = /[\\:*?"<>|#^[\]\u0000-\u001f]/;
// eslint-disable-next-line no-control-regex -- karakter kontrol memang dilarang di nama berkas
const FILE_NAME_FORBIDDEN = /[\\/:*?"<>|#^[\]\u0000-\u001f]/g;

/**
 * Path relatif di dalam vault yang aman ditulis: pemisah "/", tanpa `..`, tanpa segmen kosong / berawalan titik
 * (folder tersembunyi & `.trash`), tanpa karakter yang dilarang Windows/Obsidian. Null = tidak valid.
 */
export function normalizeVaultPath(input: string): string | null {
  const path = input
    .replace(/\\/g, "/")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!path || path.length > MAX_PATH) return null;
  const parts = path.split("/");
  if (parts.some((part) => !part.trim() || part !== part.trim() || part.startsWith(".") || FORBIDDEN_CHARS.test(part)))
    return null;
  return parts.join("/");
}

/** Path catatan Markdown: path valid yang berakhiran `.md` (ditambahkan bila belum ada). */
export function notePath(input: string): string | null {
  const path = normalizeVaultPath(/\.md$/i.test(input.trim()) ? input : `${input.trim()}.md`);
  return path && /\.md$/i.test(path) ? path : null;
}

/** Nama berkas aman dari judul (karakter terlarang diganti spasi). */
export const safeFileName = (title: string) =>
  title.replace(FILE_NAME_FORBIDDEN, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 120);

export const joinVaultPath = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
export const parentFolder = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** Nama tanpa `.md` (yang dipakai Obsidian di `[[…]]`). */
export const noteName = (path: string) => baseName(path).replace(/\.md$/i, "");

/** Ubah frontmatter (`set` = tambah/ganti, `remove` = hapus) dengan dokumen YAML agar komentar & urutan tetap. */
export function updateFrontmatter(raw: string, set: Record<string, unknown>, remove: string[] = []): string {
  const text = raw.replace(BOM, "").replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  const body = match ? text.slice(match[0].length) : text;
  const doc = parseDocument(match ? match[1] : "");
  if (doc.errors.length) throw new Error("Properti (YAML) catatan ini rusak — perbaiki di editor sumber.");
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
  for (const key of remove) doc.delete(key);
  for (const [key, value] of Object.entries(set)) {
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0))
      doc.delete(key);
    else doc.set(key, value);
  }
  const yaml = isMap(doc.contents) && doc.contents.items.length ? doc.toString().replace(/\n+$/, "") : "";
  return yaml ? `---\n${yaml}\n---\n${body}` : body;
}

/** Properti apa adanya dari berkas (tanpa tag inline yang digabung saat pemindaian). */
export const fileFrontmatter = (raw: string) => splitFrontmatter(raw).frontmatter;

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Ganti target `[[nama lama…]]` / `![[…]]` menjadi nama baru (alias, `#judul`, `^blok` dipertahankan) — seperti Obsidian
 * "Perbarui tautan" saat berkas diganti nama. Cocok dengan nama berkas atau path lengkap, tanpa peka huruf besar/kecil.
 */
export function renameWikilinks(text: string, oldPath: string, newPath: string) {
  const oldName = noteName(oldPath);
  const targets = [oldPath.replace(/\.md$/i, ""), oldName].map(escapeRegex).join("|");
  const pattern = new RegExp(`(!?\\[\\[)(${targets})(\\.md)?(?=[\\]|#^])`, "gi");
  let count = 0;
  const next = text.replace(pattern, (_, open: string, target: string) => {
    count++;
    // Path lengkap tetap ditulis sebagai path; nama saja tetap nama saja
    return open + (target.includes("/") ? newPath.replace(/\.md$/i, "") : noteName(newPath));
  });
  return { text: next, count };
}

/** Kueri pencarian: kata/frasa bebas + operator `path:`, `tag:`, `status:`, `jenis:`, `file:`. */
export interface SearchQuery {
  words: string[];
  path: string[];
  tag: string[];
  status: string[];
  jenis: string[];
  file: string[];
}

export function parseSearchQuery(input: string): SearchQuery {
  const query: SearchQuery = { words: [], path: [], tag: [], status: [], jenis: [], file: [] };
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

export interface SearchableNote {
  path: string;
  title: string;
  kind: string;
  content: string | null;
  tags: string[];
  status: string | null;
  jenis: string | null;
}

/** Catatan cocok bila semua operator & semua kata terpenuhi (kata dicari di judul, path, dan isi). */
export function matchesSearch(note: SearchableNote, query: SearchQuery) {
  const path = note.path.toLowerCase();
  const tags = note.tags.map((t) => t.toLowerCase());
  if (!query.path.every((p) => path.includes(p))) return false;
  if (!query.file.every((f) => noteName(path).includes(f))) return false;
  if (!query.tag.every((t) => tags.some((tag) => tag === t || tag.startsWith(`${t}/`)))) return false;
  if (!query.status.every((s) => (note.status ?? "") === s)) return false;
  if (!query.jenis.every((j) => (note.jenis ?? "") === j)) return false;
  const haystack = `${note.title}\n${note.path}\n${note.content ?? ""}`.toLowerCase();
  return query.words.every((w) => haystack.includes(w));
}

/** Skor sederhana: kata di judul > path > isi. */
export function searchScore(note: SearchableNote, query: SearchQuery) {
  const title = note.title.toLowerCase();
  const content = (note.content ?? "").toLowerCase();
  return query.words.reduce(
    (sum, w) =>
      sum +
      (title.includes(w) ? 10 : 0) +
      (note.path.toLowerCase().includes(w) ? 3 : 0) +
      (content.includes(w) ? 1 : 0),
    0,
  );
}

/** Cuplikan isi di sekitar kata pertama yang ditemukan (± 160 karakter) + posisi sorotan relatif cuplikan. */
export function searchSnippet(content: string | null, words: string[], size = 160) {
  const text = (content ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  const index =
    words
      .map((w) => lower.indexOf(w))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, index - Math.floor(size / 3));
  const end = Math.min(text.length, start + size);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/** Hapus bagian yang bukan teks biasa (kode, tautan wiki, tautan Markdown) sebelum mencari sebutan. */
const plainText = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/!?\[\[[^\]\n]*\]\]/g, " ")
    .replace(/\[[^\]\n]*\]\([^)\n]*\)/g, " ");

/**
 * Sebutan tanpa tautan: isi menyebut judul/alias catatan (kata utuh, tanpa peka huruf besar/kecil) di luar `[[…]]`.
 * Nama pendek (< 3 huruf) diabaikan agar tidak berisik.
 */
export function mentionsName(content: string, names: string[]) {
  const text = plainText(content);
  return names
    .map((n) => n.trim())
    .filter((n) => n.length >= 3)
    .some((name) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(name)}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text));
}

/** Bagian isi yang tidak boleh diubah saat menautkan sebutan: blok/inline kode, tautan wiki, tautan Markdown. */
const PROTECTED_PARTS = /(```[\s\S]*?```|`[^`\n]*`|!?\[\[[^\]\n]*\]\]|\[[^\]\n]*\]\([^)\n]*\))/g;

/**
 * Ubah sebutan pertama (salah satu `names`) menjadi `[[linkName]]` (tombol "Tautkan"): hanya di luar kode/tautan; teks
 * asli menjadi alias bila penulisannya berbeda dengan nama catatan. Null = tidak ada sebutan.
 */
export function linkFirstMention(content: string, names: string[], linkName: string) {
  const parts = content.split(PROTECTED_PARTS);
  for (const name of names.map((n) => n.trim()).filter((n) => n.length >= 3)) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegex(name)})(?=$|[^\\p{L}\\p{N}])`, "iu");
    for (let i = 0; i < parts.length; i += 2) {
      const match = pattern.exec(parts[i]);
      if (!match) continue;
      const found = match[2];
      const link = `[[${linkName}${found === linkName ? "" : `|${found}`}]]`;
      const at = match.index + match[1].length;
      parts[i] = parts[i].slice(0, at) + link + parts[i].slice(at + found.length);
      return parts.join("");
    }
  }
  return null;
}

/** Isi templat: `{{title}}`/`{{judul}}`, `{{date}}`/`{{tanggal}}` (YYYY-MM-DD), `{{time}}`/`{{jam}}` (HH:mm). */
export function fillTemplate(text: string, values: { title: string; now: Date }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const { now } = values;
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return text.replace(/\{\{\s*(title|judul|date|tanggal|time|jam)\s*\}\}/gi, (_, key: string) => {
    const k = key.toLowerCase();
    return k === "title" || k === "judul" ? values.title : k === "date" || k === "tanggal" ? date : time;
  });
}

export interface HealthNote {
  id: string;
  path: string;
  title: string;
  kind: string;
  linksOut: number;
  linksIn: number;
}

/**
 * Kesehatan vault: catatan yatim (tanpa tautan masuk & keluar, di luar Inbox/Templat) dan judul ganda (nama berkas sama
 * di folder berbeda — tautan `[[nama]]` jadi ambigu).
 */
export function vaultHealth(notes: HealthNote[]) {
  const special = (path: string) => [INBOX_DIR, TEMPLATE_DIR, EXPORT_DIR].includes(path.split("/")[0]);
  const orphans = notes
    .filter((n) => n.kind === "note" && !special(n.path) && n.linksIn === 0 && n.linksOut === 0)
    .map(({ id, path, title }) => ({ id, path, title }));
  const byName = new Map<string, HealthNote[]>();
  for (const note of notes.filter((n) => n.kind === "note" && !special(n.path))) {
    const key = linkKey(note.path);
    byName.set(key, [...(byName.get(key) ?? []), note]);
  }
  const duplicates = [...byName.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      name: noteName(group[0].path),
      notes: group.map(({ id, path, title }) => ({ id, path, title })),
    }));
  return { orphans, duplicates };
}

/** Preferensi menu Knowledge per user (`users.knowledge_prefs`): penanda & grup warna graf. */
export interface KnowledgePrefs {
  bookmarks: string[];
  graphGroups: { query: string; color: string }[];
}

export const GRAPH_COLORS = ["blue", "green", "orange", "red", "violet", "teal", "pink", "yellow"] as const;

export function parsePrefs(value: unknown): KnowledgePrefs {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const bookmarks = Array.isArray(raw.bookmarks)
    ? [...new Set(raw.bookmarks.filter((b): b is string => typeof b === "string" && !!normalizeVaultPath(b)))].slice(
        0,
        200,
      )
    : [];
  const graphGroups = Array.isArray(raw.graphGroups)
    ? raw.graphGroups
        .filter(
          (g): g is { query: string; color: string } =>
            !!g &&
            typeof (g as { query?: unknown }).query === "string" &&
            (g as { query: string }).query.trim().length > 0 &&
            (GRAPH_COLORS as readonly string[]).includes((g as { color?: string }).color ?? ""),
        )
        .map((g) => ({ query: g.query.trim().slice(0, 120), color: g.color }))
        .slice(0, 12)
    : [];
  return { bookmarks, graphGroups };
}

/** Penanda ikut pindah saat catatan/folder dipindah; dihapus saat catatan dihapus (`to` null). */
export function moveBookmarks(bookmarks: string[], from: string, to: string | null) {
  return bookmarks.flatMap((b) => {
    if (b === from) return to ? [to] : [];
    if (b.startsWith(`${from}/`)) return to ? [`${to}${b.slice(from.length)}`] : [];
    return [b];
  });
}

/** Tag catatan tersimpan (properti `tags` + tag inline yang digabung saat pemindaian). */
export const tagsOf = (frontmatter: Record<string, unknown> | null) =>
  Array.isArray(frontmatter?.tags) ? frontmatter.tags.filter((t): t is string => typeof t === "string") : [];
