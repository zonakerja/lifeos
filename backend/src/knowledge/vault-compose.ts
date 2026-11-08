import { parseDocument } from "yaml";
import { fillTemplate, noteName, updateFrontmatter } from "./vault-editor";
import { splitFrontmatter } from "./vault-parser";

/**
 * Note composer (K9 docs/AI-AGENT.md §25.7, pola core plugin Obsidian): gabung catatan & ekstrak pilihan teks. Logika murni —
 * penulisan berkas (tujuan dulu, sumber paling akhir agar gagal di tengah = teks ganda, tidak pernah hilang) di
 * `KnowledgeVaultService`.
 */
export type ComposePosition = "end" | "start";
export type AfterExtract = "link" | "embed" | "none";

/** Templat catatan baru hasil gabung/ekstrak (penanda sama dengan Note composer Obsidian). */
export const COMPOSER_TEMPLATE = "90-Templat/Note Composer.md";

export class ComposeConflict extends Error {}

const FENCE = /^\s*(```|~~~)/;
const BLOCK_ID = /(^|\s)\^([A-Za-z0-9-]+)[ \t]*$/;
const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const key = (text: string) => text.trim().toLowerCase();
const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);
const normalize = (raw: string) => raw.replace(BOM, "").replace(/\r\n?/g, "\n");

export interface Anchors {
  headings: Set<string>;
  blocks: Set<string>;
}

/** Judul & id blok `^id` yang ada di teks (di luar blok kode). */
export function scanAnchors(text: string): Anchors {
  const anchors: Anchors = { headings: new Set(), blocks: new Set() };
  let fenced = false;
  for (const line of text.split("\n")) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = HEADING.exec(line);
    if (heading) anchors.headings.add(key(heading[1]));
    const block = BLOCK_ID.exec(line);
    if (block) anchors.blocks.add(block[2]);
  }
  return anchors;
}

/** Id blok sumber yang sudah dipakai tujuan → id baru `id-2`, `id-3`, … (id blok wajib unik per catatan). */
export function blockRenames(source: Set<string>, target: Set<string>) {
  const renames = new Map<string, string>();
  const taken = new Set([...source, ...target]);
  for (const id of source) {
    if (!target.has(id)) continue;
    let n = 2;
    while (taken.has(`${id}-${n}`)) n++;
    taken.add(`${id}-${n}`);
    renames.set(id, `${id}-${n}`);
  }
  return renames;
}

/** Terapkan penggantian id blok pada penanda `^id` di akhir baris + tautan `[[#^id]]` dalam teks yang sama. */
export function applyBlockRenames(text: string, renames: Map<string, string>) {
  if (!renames.size) return text;
  let fenced = false;
  const lines = text.split("\n").map((line) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return line;
    }
    if (fenced) return line;
    return line
      .replace(BLOCK_ID, (match, lead: string, id: string) => (renames.has(id) ? `${lead}^${renames.get(id)}` : match))
      .replace(/\[\[#\^([A-Za-z0-9-]+)/g, (match, id: string) => (renames.has(id) ? `[[#^${renames.get(id)}` : match));
  });
  return lines.join("\n");
}

/** Sisipkan isi di akhir catatan, atau di awal **sesudah** properti (frontmatter tidak boleh terdorong ke bawah). */
export function placeContent(raw: string, content: string, position: ComposePosition) {
  const text = normalize(raw);
  const { body } = splitFrontmatter(text);
  let head = text.slice(0, text.length - body.length);
  if (head && !head.endsWith("\n")) head += "\n";
  const block = content.replace(/^\n+|\s+$/g, "");
  if (!body.trim()) return `${head}${block}\n`;
  return position === "start"
    ? `${head}${block}\n\n${body.replace(/^\n+/, "")}`
    : `${head}${body.trimEnd()}\n\n${block}\n`;
}

const asList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);

function union(...lists: string[][]) {
  const seen = new Map<string, string>();
  for (const value of lists.flat()) if (!seen.has(key(value))) seen.set(key(value), value);
  return [...seen.values()];
}

/**
 * Properti hasil gabung: nilai tujuan menang, properti yang hanya ada di sumber ditambahkan, `tags` & `aliases` disatukan,
 * nama sumber masuk `aliases` (nama lama tetap bisa dicari & `[[nama lama]]` yang terlewat tetap terselesaikan).
 * `title` sumber tidak ikut agar judul tujuan tidak berubah.
 */
export function mergedProperties(
  target: Record<string, unknown> | null,
  source: Record<string, unknown> | null,
  sourceName: string,
) {
  const set: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(source ?? {})) {
    if (name === "tags" || name === "aliases" || name === "title") continue;
    if (!target || !(name in target)) set[name] = value;
  }
  const clean = (tags: string[]) => tags.map((t) => t.replace(/^#/, ""));
  const tags = union(clean(asList(target?.tags)), clean(asList(source?.tags)));
  if (tags.length !== asList(target?.tags).length) set.tags = tags;
  const aliases = union(asList(target?.aliases), asList(source?.aliases), [sourceName]);
  if (aliases.length !== asList(target?.aliases).length) set.aliases = aliases;
  return set;
}

function assertYamlValid(raw: string, label: string) {
  const match = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(normalize(raw));
  if (match && parseDocument(match[1]).errors.length)
    throw new Error(`Properti (YAML) ${label} rusak — perbaiki di editor sumber dulu.`);
}

/** Judul pertama yang sama dengan nama catatan dibuang saat diberi heading baru (tidak ada dua judul yang sama berurutan). */
function dropLeadingTitle(body: string, name: string) {
  const text = body.replace(/^\n+/, "");
  const first = text.split("\n", 1)[0];
  const heading = HEADING.exec(first);
  return heading && key(heading[1]) === key(name) ? text.slice(first.length).replace(/^\n+/, "") : text;
}

export function composeMerge(input: {
  targetRaw: string;
  sourceRaw: string;
  sourceName: string;
  position: ComposePosition;
  heading: boolean;
}) {
  assertYamlValid(input.sourceRaw, "catatan sumber");
  assertYamlValid(input.targetRaw, "catatan tujuan");
  const source = splitFrontmatter(input.sourceRaw);
  const target = splitFrontmatter(input.targetRaw);
  const renames = blockRenames(scanAnchors(source.body).blocks, scanAnchors(target.body).blocks);
  const body = applyBlockRenames(source.body, renames);
  const content = input.heading ? `## ${input.sourceName}\n\n${dropLeadingTitle(body, input.sourceName)}` : body;
  const placed = content.trim() ? placeContent(input.targetRaw, content, input.position) : normalize(input.targetRaw);
  const set = mergedProperties(target.frontmatter, source.frontmatter, input.sourceName);
  return {
    text: Object.keys(set).length ? updateFrontmatter(placed, set) : placed,
    renames,
    heading: input.heading ? input.sourceName : null,
  };
}

/** Catatan baru dari templat: `{{content}}` (tanpa penanda = di bawah templat), `{{fromTitle}}`, `{{newTitle}}`, `{{date:FORMAT}}`. */
export function applyComposerTemplate(
  template: string,
  values: { content: string; fromTitle: string; newTitle: string; now: Date },
) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const { now } = values;
  const tokens: Record<string, string> = {
    YYYY: String(now.getFullYear()),
    MM: pad(now.getMonth() + 1),
    DD: pad(now.getDate()),
    HH: pad(now.getHours()),
    mm: pad(now.getMinutes()),
  };
  const filled = fillTemplate(normalize(template), { title: values.newTitle, now })
    .replace(/\{\{\s*fromTitle\s*\}\}/gi, () => values.fromTitle)
    .replace(/\{\{\s*newTitle\s*\}\}/gi, () => values.newTitle)
    .replace(/\{\{\s*date:([^}]+?)\s*\}\}/gi, (_, format: string) =>
      format.replace(/YYYY|MM|DD|HH|mm/g, (token) => tokens[token]),
    );
  const marker = /\{\{\s*content\s*\}\}/i;
  return marker.test(filled)
    ? filled.replace(marker, () => values.content)
    : `${filled.trimEnd()}\n\n${values.content}\n`;
}

interface LinkMatch {
  embed: boolean;
  anchor: string | null;
  alias: string | null;
  inTable: boolean;
}

/** Ganti target `[[catatan…]]` lewat `replace` (null = biarkan). Bentuk path tetap path, bentuk nama tetap nama. */
function rewriteLinks(
  text: string,
  sourcePath: string,
  targetPath: string,
  replace: (link: LinkMatch) => { anchor: string | null; alias: string | null } | null,
) {
  const targets = [sourcePath.replace(/\.md$/i, ""), noteName(sourcePath)].map(escapeRegex).join("|");
  const pattern = new RegExp(`(!?)\\[\\[(${targets})(?:\\.md)?(#[^\\]|\\n]*)?(\\\\?\\|[^\\]\\n]*)?\\]\\]`, "gi");
  let count = 0;
  const next = text.replace(
    pattern,
    (match, bang: string, target: string, anchor?: string, alias?: string, offset?: number) => {
      const lineStart = text.lastIndexOf("\n", (offset ?? 0) - 1) + 1;
      const result = replace({
        embed: !!bang,
        anchor: anchor ?? null,
        alias: alias ?? null,
        inTable: text.slice(lineStart).trimStart().startsWith("|"),
      });
      if (!result) return match;
      count++;
      const name = target.includes("/") ? targetPath.replace(/\.md$/i, "") : noteName(targetPath);
      return `${bang}[[${name}${result.anchor ?? ""}${result.alias ?? ""}]]`;
    },
  );
  return { text: next, count };
}

function renamedAnchor(anchor: string, renames: Map<string, string>) {
  const block = /^#\^(.+)$/.exec(anchor);
  return block && renames.has(block[1]) ? `#^${renames.get(block[1])}` : anchor;
}

/**
 * Perujuk catatan yang digabung → catatan tujuan. Dengan heading: `[[Sumber]]` → `[[Tujuan#Sumber|Sumber]]` (tulisan yang
 * terlihat tetap), sematan `![[Sumber]]` → `![[Tujuan#Sumber]]`; `#judul`/`^blok` & alias yang sudah ada dipertahankan.
 * Baris tabel tanpa alias baru (`|` memecah kolom).
 */
export function rewriteMergedLinks(
  text: string,
  sourcePath: string,
  targetPath: string,
  options: { heading: string | null; renames: Map<string, string> },
) {
  return rewriteLinks(text, sourcePath, targetPath, (link) => {
    if (link.anchor) return { anchor: renamedAnchor(link.anchor, options.renames), alias: link.alias };
    if (!options.heading) return { anchor: null, alias: link.alias };
    const alias = link.alias ?? (link.embed || link.inTable ? null : `|${noteName(sourcePath)}`);
    return { anchor: `#${options.heading}`, alias };
  });
}

function isMoved(anchor: string, moved: Anchors) {
  const block = /^#\^(.+)$/.exec(anchor);
  if (block) return moved.blocks.has(block[1]);
  return moved.headings.has(key(anchor.slice(anchor.lastIndexOf("#") + 1)));
}

/** Perujuk ke judul/blok yang ikut diekstrak diarahkan ke tujuan; tautan ke bagian lain catatan asal tidak disentuh. */
export function rewriteExtractedLinks(
  text: string,
  sourcePath: string,
  targetPath: string,
  moved: Anchors,
  renames: Map<string, string>,
) {
  return rewriteLinks(text, sourcePath, targetPath, (link) =>
    link.anchor && isMoved(link.anchor, moved)
      ? { anchor: renamedAnchor(link.anchor, renames), alias: link.alias }
      : null,
  );
}

const RELATIVE = /(!?)\[\[(#[^\]|\n]+)(\\?\|[^\]\n]*)?\]\]/g;

export function planExtract(input: {
  sourceRaw: string;
  from: number;
  to: number;
  text: string;
  sourcePath: string;
  targetPath: string;
  /** null = catatan baru */
  targetRaw: string | null;
  position: ComposePosition;
  after: AfterExtract;
  template: string | null;
  now: Date;
}) {
  const source = normalize(input.sourceRaw);
  if (input.from < 0 || input.to <= input.from || source.slice(input.from, input.to) !== input.text)
    throw new ComposeConflict("Pilihan teks sudah tidak cocok dengan isi catatan. Muat ulang lalu pilih lagi.");
  if (!input.text.trim()) throw new Error("Pilih teks yang akan diekstrak.");
  const { body } = splitFrontmatter(source);
  if (input.from < source.length - body.length) throw new Error("Properti catatan tidak bisa diekstrak.");

  const sourceName = noteName(input.sourcePath);
  const targetName = noteName(input.targetPath);
  const moved = scanAnchors(input.text);
  const renames = blockRenames(
    moved.blocks,
    input.targetRaw === null ? new Set() : scanAnchors(splitFrontmatter(input.targetRaw).body).blocks,
  );
  // Di tujuan: `[[#x]]` ke bagian yang tertinggal menjadi `[[Asal#x]]`; yang ikut pindah tetap relatif
  const rebased = applyBlockRenames(input.text, renames).replace(
    RELATIVE,
    (match, bang: string, anchor: string, alias?: string) =>
      isMoved(anchor, moved) ? match : `${bang}[[${sourceName}${anchor}${alias ?? ""}]]`,
  );
  const content = rebased.replace(/^\n+|\s+$/g, "");
  const targetText =
    input.targetRaw !== null
      ? placeContent(input.targetRaw, content, input.position)
      : input.template
        ? applyComposerTemplate(input.template, {
            content,
            fromTitle: sourceName,
            newTitle: targetName,
            now: input.now,
          })
        : `${content}\n`;

  const replacement = input.after === "none" ? "" : `${input.after === "embed" ? "!" : ""}[[${targetName}]]`;
  const trailing = /\n+$/.exec(input.text)?.[0] ?? "";
  const rest = source.slice(0, input.from) + replacement + (replacement ? trailing : "") + source.slice(input.to);
  // Di asal: `[[#x]]` & `[[Asal#x]]` ke bagian yang pindah diarahkan ke tujuan
  const relative = rest.replace(RELATIVE, (match, bang: string, anchor: string, alias?: string) =>
    isMoved(anchor, moved) ? `${bang}[[${targetName}${renamedAnchor(anchor, renames)}${alias ?? ""}]]` : match,
  );
  const sourceText = rewriteExtractedLinks(relative, input.sourcePath, input.targetPath, moved, renames).text;
  return { targetText, sourceText, moved, renames };
}
