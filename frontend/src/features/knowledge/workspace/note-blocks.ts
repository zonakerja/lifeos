import { slugify } from "./knowledge-logic";

/**
 * Bagian & blok catatan (K6, docs/AI-AGENT.md §25.6) — pola Obsidian: `[[catatan#Judul]]` merujuk bagian di bawah judul,
 * `[[catatan#^id]]` merujuk satu blok (paragraf / butir daftar / tabel) yang ditandai `^id` di akhir barisnya atau pada
 * baris sendiri tepat setelah blok. Logika murni; isi = isi catatan tanpa properti.
 */

/** Penanda blok di akhir baris: ` ^id` (huruf, angka, tanda hubung). */
const BLOCK_MARK = /\s\^([A-Za-z0-9-]+)\s*$/;
/** Penanda blok pada baris sendiri (setelah tabel, kutipan, daftar). */
const BLOCK_LINE = /^\s*\^([A-Za-z0-9-]+)\s*$/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

/** Bagian blok `^id` dari target tautan. */
export const linkBlock = (target: string) => /#\^([A-Za-z0-9-]+)/.exec(target)?.[1] ?? null;

/** Id elemen pembaca untuk blok (dipakai lompat dari `[[catatan#^id]]`). */
export const blockAnchor = (id: string) => `blk-${id}`;

const isListItem = (line: string) => /^\s*(?:[-*+]|\d+[.)])\s/.test(line);
const stripMark = (line: string) => line.replace(BLOCK_MARK, "");

/** Baris-baris yang berada di luar blok kode (nomor baris → true). */
function codeLines(lines: string[]) {
  const inCode = new Set<number>();
  let fence = false;
  lines.forEach((line, i) => {
    if (FENCE.test(line)) {
      inCode.add(i);
      fence = !fence;
      return;
    }
    if (fence) inCode.add(i);
  });
  return inCode;
}

/** Rentang blok yang berakhir di baris `end` (paragraf = baris tak kosong berurutan; butir daftar = barisnya sendiri). */
function blockRange(lines: string[], end: number): [number, number] {
  if (isListItem(lines[end])) return [end, end];
  let start = end;
  while (
    start > 0 &&
    lines[start - 1].trim() !== "" &&
    !HEADING.test(lines[start - 1]) &&
    !FENCE.test(lines[start - 1])
  ) {
    if (isListItem(lines[start - 1]) && !isListItem(lines[end])) break;
    start--;
  }
  return [start, end];
}

export interface NoteBlock {
  id: string;
  /** Baris (mulai 0) tempat penanda berada */
  line: number;
  /** Isi blok tanpa penanda */
  text: string;
}

/** Semua blok bertanda `^id` di catatan. */
export function blockIds(content: string): NoteBlock[] {
  const lines = content.split("\n");
  const code = codeLines(lines);
  const blocks: NoteBlock[] = [];
  lines.forEach((line, i) => {
    if (code.has(i)) return;
    const own = BLOCK_LINE.exec(line);
    if (own) {
      let end = i - 1;
      while (end >= 0 && lines[end].trim() === "") end--;
      if (end < 0) return;
      const [start] = blockRange(lines, end);
      blocks.push({ id: own[1], line: i, text: lines.slice(start, end + 1).join("\n") });
      return;
    }
    const mark = BLOCK_MARK.exec(line);
    if (!mark || HEADING.test(line)) return;
    const [start] = blockRange(lines, i);
    blocks.push({ id: mark[1], line: i, text: [...lines.slice(start, i), stripMark(line)].join("\n") });
  });
  return blocks;
}

/** Isi satu blok `^id` (null = tidak ada). */
export function extractBlock(content: string, id: string) {
  return blockIds(content).find((b) => b.id === id)?.text ?? null;
}

/**
 * Isi bagian di bawah judul (judul ikut, sampai judul berikutnya yang setingkat atau lebih tinggi). Judul dicocokkan
 * menurut teks atau slug, tanpa huruf besar/kecil. Null = judul tidak ada.
 */
export function extractSection(content: string, heading: string) {
  const lines = content.split("\n");
  const code = codeLines(lines);
  const wanted = heading.trim().toLowerCase();
  const wantedSlug = slugify(heading);
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    if (code.has(i)) continue;
    const match = HEADING.exec(lines[i]);
    if (!match) continue;
    if (start < 0) {
      const text = match[2].trim();
      if (text.toLowerCase() === wanted || slugify(text) === wantedSlug) {
        start = i;
        level = match[1].length;
      }
    } else if (match[1].length <= level) {
      return lines.slice(start, i).join("\n").trimEnd();
    }
  }
  return start < 0 ? null : lines.slice(start).join("\n").trimEnd();
}

/** Blok yang bisa dirujuk (calon `^id`): paragraf & butir daftar di luar kode/judul, beserta baris akhirnya. */
export function blockCandidates(content: string) {
  const lines = content.split("\n");
  const code = codeLines(lines);
  const candidates: { line: number; text: string; id: string | null }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (code.has(i) || !line.trim() || HEADING.test(line) || BLOCK_LINE.test(line)) continue;
    if (/^\s*(\||---|\*\*\*|>)/.test(line)) continue;
    const next = lines[i + 1];
    const endsBlock = isListItem(line) || next === undefined || !next.trim() || HEADING.test(next) || isListItem(next);
    if (!endsBlock) continue;
    const [start] = blockRange(lines, i);
    const ownId = BLOCK_MARK.exec(line)?.[1] ?? (next !== undefined ? BLOCK_LINE.exec(next)?.[1] : undefined) ?? null;
    candidates.push({ line: i, text: [...lines.slice(start, i), stripMark(line)].join(" ").trim(), id: ownId });
  }
  return candidates;
}

/** Id blok acak 6 karakter (seperti Obsidian), tidak bentrok dengan yang sudah ada. */
export function newBlockId(existing: Iterable<string>, random: () => number = Math.random) {
  const used = new Set(existing);
  for (;;) {
    const id = Array.from({ length: 6 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)]).join(
      "",
    );
    if (!used.has(id)) return id;
  }
}

/**
 * Tambahkan ` ^id` ke baris yang teksnya persis `lineText` (baris unik di berkas mentah; properti ikut dihitung).
 * Null = baris tidak ditemukan / ganda (berkas berubah) — pemanggil menolak, tidak menebak.
 */
export function addBlockId(raw: string, lineText: string, id: string) {
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const hits = lines.flatMap((l, i) => (l === lineText ? [i] : []));
  if (hits.length !== 1) return null;
  lines[hits[0]] = `${lines[hits[0]].replace(/\s+$/, "")} ^${id}`;
  return lines.join(eol);
}
