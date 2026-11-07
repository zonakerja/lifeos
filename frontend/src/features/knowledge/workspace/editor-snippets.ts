/**
 * Potongan Markdown untuk perintah `/` di editor dan grup "Sisipkan" di palet perintah (K5, docs/AI-AGENT.md §25.6).
 * Logika murni (tanpa CodeMirror) agar bisa diuji; penanda `{|}` = posisi kursor setelah disisipkan.
 */

export const CURSOR = "{|}";

export type SnippetGroup = "Teks" | "Daftar" | "Callout" | "Blok" | "Tautan" | "Waktu";

export interface Snippet {
  id: string;
  label: string;
  group: SnippetGroup;
  /** Kata lain yang ikut dicocokkan saat mengetik `/…` (mis. bahasa Inggris seperti di Obsidian). */
  keywords: string;
  /** Teks dengan penanda kursor `{|}`; fungsi = dihitung saat disisipkan (tanggal/jam). */
  text: string | ((now: Date) => string);
  /** Harus diawali baris kosong (tabel, garis) agar tidak menempel ke paragraf sebelumnya. */
  blankBefore?: boolean;
  /** Elemen tingkat baris: disisipkan di baris baru bila baris saat ini sudah berisi teks. */
  block?: boolean;
  /** Setelah disisipkan langsung buka pelengkap `[[` (tautan catatan). */
  completeAfter?: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const longDate = (d: Date) =>
  d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const callout = (id: string, label: string, type: string, keywords: string): Snippet => ({
  id: `callout-${id}`,
  label: `Callout ${label}`,
  group: "Callout",
  keywords: `callout ${type} ${keywords}`,
  text: `> [!${type}]\n> ${CURSOR}`,
  block: true,
});

export const SNIPPETS: Snippet[] = [
  { id: "h1", label: "Judul 1", group: "Teks", keywords: "heading h1 judul", text: `# ${CURSOR}`, block: true },
  { id: "h2", label: "Judul 2", group: "Teks", keywords: "heading h2 subjudul", text: `## ${CURSOR}`, block: true },
  { id: "h3", label: "Judul 3", group: "Teks", keywords: "heading h3", text: `### ${CURSOR}`, block: true },
  { id: "bold", label: "Tebal", group: "Teks", keywords: "bold strong", text: `**${CURSOR}**` },
  { id: "italic", label: "Miring", group: "Teks", keywords: "italic emphasis", text: `*${CURSOR}*` },
  { id: "highlight", label: "Stabilo", group: "Teks", keywords: "highlight sorot", text: `==${CURSOR}==` },
  { id: "quote", label: "Kutipan", group: "Teks", keywords: "quote blockquote", text: `> ${CURSOR}`, block: true },
  {
    id: "bullet",
    label: "Daftar berpoin",
    group: "Daftar",
    keywords: "bullet list ul",
    text: `- ${CURSOR}`,
    block: true,
  },
  {
    id: "numbered",
    label: "Daftar bernomor",
    group: "Daftar",
    keywords: "numbered ordered list ol",
    text: `1. ${CURSOR}`,
    block: true,
  },
  {
    id: "task",
    label: "Daftar tugas",
    group: "Daftar",
    keywords: "task todo checkbox centang",
    text: `- [ ] ${CURSOR}`,
    block: true,
  },
  callout("note", "catatan", "note", "catatan"),
  callout("info", "info", "info", "informasi"),
  callout("tip", "tips", "tip", "saran hint"),
  callout("warning", "peringatan", "warning", "awas perhatian"),
  callout("danger", "bahaya", "danger", "error larangan"),
  callout("example", "contoh", "example", "contoh"),
  callout("question", "pertanyaan", "question", "faq tanya"),
  {
    id: "table",
    label: "Tabel",
    group: "Blok",
    keywords: "table tabel kolom",
    text: `| ${CURSOR}Kolom 1 | Kolom 2 |\n| --- | --- |\n|  |  |`,
    block: true,
    blankBefore: true,
  },
  {
    id: "code",
    label: "Blok kode",
    group: "Blok",
    keywords: "code kode pre",
    text: "```\n" + CURSOR + "\n```",
    block: true,
  },
  {
    id: "divider",
    label: "Garis pemisah",
    group: "Blok",
    keywords: "divider hr garis",
    text: `---\n${CURSOR}`,
    block: true,
    blankBefore: true,
  },
  {
    id: "link",
    label: "Tautan catatan",
    group: "Tautan",
    keywords: "link wikilink tautan",
    text: `[[${CURSOR}]]`,
    completeAfter: true,
  },
  {
    id: "embed",
    label: "Sematkan catatan/gambar",
    group: "Tautan",
    keywords: "embed sematan gambar image",
    text: `![[${CURSOR}]]`,
    completeAfter: true,
  },
  { id: "weblink", label: "Tautan web", group: "Tautan", keywords: "url web link", text: `[${CURSOR}](https://)` },
  { id: "tag", label: "Tag", group: "Tautan", keywords: "tag label", text: `#${CURSOR}` },
  { id: "footnote", label: "Catatan kaki", group: "Tautan", keywords: "footnote kaki", text: `[^1]${CURSOR}` },
  {
    id: "today",
    label: "Tanggal hari ini",
    group: "Waktu",
    keywords: "date today tanggal",
    text: (now) => `${ymd(now)}${CURSOR}`,
  },
  {
    id: "today-long",
    label: "Tanggal lengkap",
    group: "Waktu",
    keywords: "date long tanggal hari",
    text: (now) => `${longDate(now)}${CURSOR}`,
  },
  {
    id: "time",
    label: "Jam sekarang",
    group: "Waktu",
    keywords: "time jam waktu",
    text: (now) => `${hhmm(now)}${CURSOR}`,
  },
];

export interface InsertContext {
  /** Teks baris saat ini sebelum posisi sisip (tanpa `/perintah` yang sedang diketik). */
  lineBefore: string;
  /** Teks baris saat ini setelah posisi sisip. */
  lineAfter: string;
  /** Isi baris sebelumnya (null = baris pertama dokumen). */
  prevLine: string | null;
  now: Date;
}

/** Teks akhir yang disisipkan + posisi kursor (offset dari awal teks). */
export function expandSnippet(snippet: Snippet, ctx: InsertContext): { text: string; cursor: number } {
  let text = typeof snippet.text === "function" ? snippet.text(ctx.now) : snippet.text;
  if (snippet.block) {
    const midLine = ctx.lineBefore.trim() !== "";
    if (midLine) text = (snippet.blankBefore ? "\n\n" : "\n") + text;
    else if (snippet.blankBefore && ctx.prevLine !== null && ctx.prevLine.trim() !== "") text = "\n" + text;
    if (ctx.lineAfter.trim() !== "") text += "\n";
  }
  return fromMarker(text);
}

const fromMarker = (raw: string) => {
  const at = raw.indexOf(CURSOR);
  return at < 0 ? { text: raw, cursor: raw.length } : { text: raw.replace(CURSOR, ""), cursor: at };
};

/** Cocokkan ketikan `/…` dengan label & kata kunci (setiap kata harus ada; tanpa huruf besar/kecil). */
export function matchSnippets(query: string, list: Snippet[] = SNIPPETS) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((s) => {
    const hay = `${s.label} ${s.keywords}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** `/` memicu perintah hanya di awal baris atau setelah spasi (bukan di tengah path/URL seperti `a/b`). */
export const isSlashTrigger = (charBefore: string | null) => charBefore === null || /\s/.test(charBefore);

/**
 * Isi templat yang disisipkan ke catatan yang sedang disunting (seperti plugin Templates Obsidian): penanda `{{judul}}`,
 * `{{tanggal}}`, `{{jam}}` (juga nama Inggrisnya) diisi; properti (frontmatter) templat hanya ikut bila disisipkan di awal
 * catatan yang belum punya properti — selain itu dibuang agar catatan tidak punya dua blok properti.
 */
export function templateInsertText(
  raw: string,
  opts: { title: string; now: Date; atDocStart: boolean; docHasFrontmatter: boolean },
) {
  let text = raw.replace(/\r\n/g, "\n");
  const fm = /^---\n[\s\S]*?\n---\n?/.exec(text);
  if (fm && (!opts.atDocStart || opts.docHasFrontmatter)) text = text.slice(fm[0].length).replace(/^\n+/, "");
  return text
    .replace(/\{\{\s*(judul|title)\s*\}\}/gi, () => opts.title)
    .replace(/\{\{\s*(tanggal|date)\s*\}\}/gi, () => ymd(opts.now))
    .replace(/\{\{\s*(jam|time)\s*\}\}/gi, () => hhmm(opts.now));
}
