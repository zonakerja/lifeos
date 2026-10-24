import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * Logika murni basis pengetahuan (vault Obsidian): membaca frontmatter YAML, tautan `[[...]]`, tag, metadata catatan,
 * dan teks yang diindeks. Tanpa database / sistem berkas → diuji di `vault-parser.spec.ts`.
 */

/** Folder vault yang tidak dibaca: pengaturan Obsidian, sampah, git, dan folder tersembunyi lain. */
export const isIgnoredDir = (name: string) => name.startsWith(".") || name === "node_modules";

/** Folder usulan dari LifeOS/agen untuk dikurasi user (catatan di sini berstatus draf). */
export const INBOX_DIR = "00-Inbox";
/** Templat catatan Obsidian — dibaca tetapi tidak dipakai untuk menjawab (isinya kerangka, bukan pengetahuan). */
export const TEMPLATE_DIR = "90-Templat";

/** Berkas lampiran vault yang disalin ke storage agar diekstrak (PDF peraturan, DOCX, XLSX, teks). */
export const VAULT_FILE_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
  ".csv": "text/csv",
};
export const MAX_NOTE_BYTES = 2 * 1024 * 1024;
export const MAX_VAULT_FILE_BYTES = 20 * 1024 * 1024;

export type VaultEntryKind = "note" | "file";

/** Jenis entri vault dari ekstensinya; null = diabaikan (gambar, kanvas, dll.). */
export function vaultEntryKind(path: string): VaultEntryKind | null {
  const ext = extname(path).toLowerCase();
  if (ext === ".md") return "note";
  return ext in VAULT_FILE_TYPES ? "file" : null;
}

/** Nama folder vault milik user (di dalam root vault): huruf, angka, spasi, titik, minus, garis bawah — tanpa `..`. */
export function isSafeVaultFolder(name: string) {
  return /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,79}$/u.test(name) && !name.includes("..");
}

export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

export interface ParsedNote {
  title: string;
  frontmatter: Record<string, unknown> | null;
  body: string;
  links: { target: string; kind: "link" | "embed" | "property" }[];
  tags: string[];
}

/** Pisahkan frontmatter `---\n...\n---` di awal catatan. YAML rusak → frontmatter null (isi tetap dipakai). */
export function splitFrontmatter(raw: string): { frontmatter: Record<string, unknown> | null; body: string } {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!match) return { frontmatter: null, body: text };
  let frontmatter: Record<string, unknown> | null = null;
  try {
    const data: unknown = parseYaml(match[1]);
    if (data && typeof data === "object" && !Array.isArray(data)) frontmatter = data as Record<string, unknown>;
  } catch {
    frontmatter = null;
  }
  return { frontmatter, body: text.slice(match[0].length) };
}

/** `[[Target]]`, `[[Target|alias]]`, `[[Target#Judul]]`, `![[berkas.pdf]]` → target tanpa alias/judul/blok. */
const WIKILINK = /(!?)\[\[([^\]|#^\n]+)(?:[#^][^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g;

export function extractLinks(text: string, kind?: "property") {
  const links: ParsedNote["links"] = [];
  for (const [, bang, target] of text.matchAll(WIKILINK)) {
    const clean = target.trim();
    if (clean) links.push({ target: clean, kind: kind ?? (bang ? "embed" : "link") });
  }
  return links;
}

/** Semua string di dalam nilai YAML (untuk mencari tautan di properti seperti `dasar_hukum`). */
function strings(value: unknown, depth = 3): string[] {
  if (typeof value === "string") return [value];
  if (depth <= 0 || value === null || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap((v) => strings(v, depth - 1));
}

const asList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().replace(/^#/, ""))
    .filter(Boolean);

/** Isi tanpa blok/inline kode — tautan & tag di dalam kode bukan tautan (sama seperti Obsidian). */
const withoutCode = (text: string) => text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");

/** Tag inline `#tag` (bukan judul Markdown `# Judul`, bukan di dalam blok kode). */
function inlineTags(body: string) {
  return [...withoutCode(body).matchAll(/(?:^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu)].map((m) => m[1]);
}

/** Judul catatan = properti `title`/`judul`, lalu nama berkas tanpa `.md` (aturan Obsidian). */
export const noteTitle = (path: string, frontmatter: Record<string, unknown> | null) => {
  const fromProps = frontmatter?.title ?? frontmatter?.judul;
  return typeof fromProps === "string" && fromProps.trim() ? fromProps.trim() : basename(path, extname(path));
};

export function parseNote(path: string, raw: string): ParsedNote {
  const { frontmatter, body } = splitFrontmatter(raw);
  const tags = [...new Set([...asList(frontmatter?.tags ?? frontmatter?.tag), ...inlineTags(body)])];
  // Templat berisi tautan contoh ("[[Nama Peraturan]]") → tidak dicatat sebagai tautan
  const isTemplate = path.split("/")[0] === TEMPLATE_DIR;
  const propertyLinks = frontmatter ? strings(frontmatter).flatMap((s) => extractLinks(s, "property")) : [];
  return {
    title: noteTitle(path, frontmatter),
    frontmatter,
    body,
    links: isTemplate ? [] : [...extractLinks(withoutCode(body)), ...propertyLinks],
    tags,
  };
}

/** Kunci pencocokan tautan: nama catatan tanpa folder & `.md`, huruf kecil (Obsidian mencocokkan nama berkas). */
export const linkKey = (target: string) =>
  basename(target.replace(/\\/g, "/")).replace(/\.md$/i, "").trim().toLowerCase();

/** Alias catatan dari properti `aliases` / `alias` (Obsidian), untuk pencocokan tautan. */
export const noteAliases = (frontmatter: Record<string, unknown> | null) =>
  asList(frontmatter?.aliases ?? frontmatter?.alias);

/**
 * Peta kunci tautan → id catatan. Bila dua catatan bernama sama di folder berbeda, yang path-nya paling pendek menang
 * (mirip perilaku Obsidian "shortest path"); target berupa path lengkap dicocokkan persis lebih dulu.
 */
export function buildLinkResolver(notes: { id: string; path: string; frontmatter: Record<string, unknown> | null }[]) {
  const byPath = new Map<string, string>();
  const byKey = new Map<string, { id: string; depth: number }>();
  const put = (key: string, id: string, depth: number) => {
    const current = byKey.get(key);
    if (!current || depth < current.depth) byKey.set(key, { id, depth });
  };
  for (const note of notes) {
    const depth = note.path.split("/").length;
    byPath.set(note.path.replace(/\.md$/i, "").toLowerCase(), note.id);
    put(linkKey(note.path), note.id, depth);
    for (const alias of noteAliases(note.frontmatter)) put(alias.toLowerCase(), note.id, depth);
  }
  return (target: string): string | null =>
    byPath.get(target.replace(/\\/g, "/").replace(/\.md$/i, "").toLowerCase()) ??
    byKey.get(linkKey(target))?.id ??
    null;
}

export type KnowledgeStatus = "berlaku" | "draf" | "dicabut" | "templat";

/** Status catatan untuk menjawab: properti `status`, catatan di Inbox = draf, di folder templat = templat. */
export function noteStatus(path: string, frontmatter: Record<string, unknown> | null): KnowledgeStatus | null {
  const top = path.split("/")[0];
  if (top === TEMPLATE_DIR) return "templat";
  const value = typeof frontmatter?.status === "string" ? frontmatter.status.trim().toLowerCase() : "";
  if (["dicabut", "tidak berlaku", "kadaluarsa", "kedaluwarsa"].includes(value)) return "dicabut";
  if (["draf", "draft", "konsep"].includes(value) || top === INBOX_DIR) return "draf";
  if (["berlaku", "aktif", "final"].includes(value)) return "berlaku";
  return null;
}

export interface KnowledgeMetadata {
  path: string;
  jenis?: string;
  status?: KnowledgeStatus;
  publik?: boolean;
  topik?: string[];
  tags?: string[];
  diperbarui?: string;
}

/** Metadata potongan indeks dari properti catatan (dipakai filter status/publik & label sitasi). */
export function knowledgeMetadata(path: string, frontmatter: Record<string, unknown> | null, tags: string[] = []) {
  const meta: KnowledgeMetadata = { path };
  if (typeof frontmatter?.jenis === "string" && frontmatter.jenis.trim())
    meta.jenis = frontmatter.jenis.trim().toLowerCase();
  const status = noteStatus(path, frontmatter);
  if (status) meta.status = status;
  if (typeof frontmatter?.publik === "boolean") meta.publik = frontmatter.publik;
  const topik = asList(frontmatter?.topik);
  if (topik.length) meta.topik = topik;
  if (tags.length) meta.tags = tags;
  const updated = frontmatter?.diperbarui ?? frontmatter?.updated;
  if (updated instanceof Date) meta.diperbarui = updated.toISOString().slice(0, 10);
  else if (typeof updated === "string" && updated.trim()) meta.diperbarui = updated.trim();
  return meta;
}

/** Ganti `[[Target|alias]]` dengan teks yang dibaca manusia (alias, atau target) untuk teks indeks & prompt. */
export const readableWikilinks = (text: string) =>
  text.replace(/!?\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g, (_, target: string, alias?: string) =>
    (alias ?? target.replace(/[#^].*$/, "")).trim(),
  );

/** Teks catatan yang diindeks: baris properti penting lalu isi (tautan dibuat terbaca). */
export function noteIndexText(note: { title: string; content: string; frontmatter: Record<string, unknown> | null }) {
  const fm = note.frontmatter ?? {};
  const props = [
    ["Jenis", fm.jenis],
    ["Status", fm.status],
    ["Topik", Array.isArray(fm.topik) ? fm.topik.join(", ") : fm.topik],
    ["Dasar hukum", Array.isArray(fm.dasar_hukum) ? fm.dasar_hukum.join("; ") : fm.dasar_hukum],
    ["Diperbarui", fm.diperbarui instanceof Date ? fm.diperbarui.toISOString().slice(0, 10) : fm.diperbarui],
  ]
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => `${k}: ${readableWikilinks(String(v))}`);
  const body = readableWikilinks(note.content).trim();
  return [props.join(" · "), body].filter(Boolean).join("\n\n");
}

/** Masalah catatan yang ditampilkan di halaman Pengetahuan agar user merapikannya. */
export function noteProblems(path: string, frontmatter: Record<string, unknown> | null) {
  const top = path.split("/")[0];
  if (top === INBOX_DIR || top === TEMPLATE_DIR) return [];
  const problems: string[] = [];
  if (!frontmatter) problems.push("Tanpa properti (frontmatter)");
  else {
    if (typeof frontmatter.jenis !== "string" || !frontmatter.jenis.trim()) problems.push("Properti `jenis` kosong");
    if (!noteStatus(path, frontmatter)) problems.push("Properti `status` kosong / tidak dikenal");
  }
  return problems;
}

/** Nama berkas aman untuk catatan Inbox baru: tanggal-jam + judul tanpa karakter terlarang. */
export function inboxFileName(title: string, now: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}`;
  const safe =
    title
      .replace(/[\\/:*?"<>|#^[\]\n\r\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "Catatan";
  return `${stamp} ${safe}.md`;
}

/** Isi catatan Inbox: frontmatter draf + isi. */
export function inboxNote(input: { title: string; content: string; question?: string; now: Date }) {
  const date = input.now.toISOString().slice(0, 10);
  const lines = [
    "---",
    `title: ${JSON.stringify(input.title)}`,
    "jenis: faq",
    "status: draf",
    "publik: false",
    "sumber: LifeOS",
    `dibuat: ${date}`,
    "---",
    "",
  ];
  if (input.question?.trim()) lines.push(`**Pertanyaan:** ${input.question.trim()}`, "");
  lines.push(input.content.trim(), "");
  return lines.join("\n");
}
