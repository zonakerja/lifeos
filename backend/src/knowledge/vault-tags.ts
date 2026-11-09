import { updateFrontmatter } from "./vault-editor";
import { splitFrontmatter } from "./vault-parser";

/**
 * Ganti nama tag se-vault (K10): properti `tags`/`tag` + `#tag` di isi, termasuk tag bersarang (`#a` → `#b` juga mengubah
 * `#a/c` menjadi `#b/c`, seperti Obsidian). Tanpa peka huruf besar/kecil; tag yang sudah ada digabung. Logika murni.
 */
const TAG = /^[\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*$/u;

/** Nama tag bersih (tanpa `#`) yang sah di Obsidian: minimal satu bukan-angka, tanpa spasi, tanpa `/` di tepi. Null = tidak sah. */
export function cleanTag(input: string) {
  const tag = input.trim().replace(/^#/, "");
  return TAG.test(tag) && !tag.startsWith("/") && !tag.endsWith("/") && !tag.includes("//") ? tag : null;
}

/** Tag baru bila `tag` = `from` atau turunannya, selain itu null. */
function renamed(tag: string, from: string, to: string) {
  const low = tag.toLowerCase();
  const base = from.toLowerCase();
  if (low === base) return to;
  return low.startsWith(`${base}/`) ? `${to}${tag.slice(from.length)}` : null;
}

function renameList(value: unknown, from: string, to: string) {
  const list = (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().replace(/^#/, ""))
    .filter(Boolean);
  let count = 0;
  const seen = new Set<string>();
  const next: string[] = [];
  for (const tag of list) {
    const after = renamed(tag, from, to);
    if (after) count++;
    const value2 = after ?? tag;
    if (!seen.has(value2.toLowerCase())) {
      seen.add(value2.toLowerCase());
      next.push(value2);
    }
  }
  return { next, count };
}

/** `#tag` di luar blok kode & kode sebaris; penanda judul (`# Judul`) dan `[[a#b]]` / URL tidak tersentuh (harus diawali spasi / `(` / awal baris). */
function renameInline(body: string, from: string, to: string) {
  let count = 0;
  const text = body
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(
            /(^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gmu,
            (match, lead: string, tag: string) => {
              const after = renamed(tag, from, to);
              if (!after) return match;
              count++;
              return `${lead}#${after}`;
            },
          ),
    )
    .join("");
  return { text, count };
}

export function renameTagInNote(raw: string, from: string, to: string) {
  const { frontmatter, body } = splitFrontmatter(raw);
  const inline = renameInline(body, from, to);
  const head = raw.replace(/\r\n/g, "\n");
  let text = `${head.slice(0, head.length - body.length)}${inline.text}`;
  let count = inline.count;
  const set: Record<string, unknown> = {};
  for (const key of ["tags", "tag"]) {
    if (!frontmatter?.[key]) continue;
    const { next, count: changed } = renameList(frontmatter[key], from, to);
    if (!changed) continue;
    count += changed;
    set[key] = next;
  }
  if (Object.keys(set).length) text = updateFrontmatter(text, set);
  return { text, count };
}

/** Kueri grup warna graf `tag:lama` ikut berubah. */
export function renameTagInQuery(query: string, from: string, to: string) {
  return query.replace(/(^|\s)tag:#?([^\s]+)/g, (match, lead: string, tag: string) => {
    const after = renamed(tag, from, to);
    return after ? `${lead}tag:${after}` : match;
  });
}
