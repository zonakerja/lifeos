import { createHash } from "node:crypto";
import { chunkText, MAX_SOURCE_CHARS, reciprocalRankFusion } from "../ai/index/index-text";

/**
 * Logika murni My Notebook (tanpa database/AI): memilih konteks dari sumber notebook, menyusun prompt, dan membaca
 * sitasi jawaban. Diuji di `notebook-context.spec.ts`.
 */

/** Total teks sumber di bawah batas ini dikirim utuh ke AI (paling lengkap); di atasnya memakai pencarian (RAG). */
export const FULL_CONTEXT_CHARS = 150_000;
/** Jumlah potongan yang dikirim pada mode RAG. */
export const RAG_CHUNK_LIMIT = 14;
/** Batas teks sumber per ringkasan Studio. */
export const SUMMARY_CONTEXT_CHARS = 120_000;
/** Batas teks satu dokumen lampiran chat. */
export const MAX_ATTACHMENT_TEXT_CHARS = 100_000;

export const clampContext = (text: string) =>
  text.length > MAX_ATTACHMENT_TEXT_CHARS
    ? `${text.slice(0, MAX_ATTACHMENT_TEXT_CHARS)}\n[... dokumen dipotong karena terlalu panjang ...]`
    : text;

/** Riwayat chat yang ikut dikirim (pesan terakhir). */
export const HISTORY_LIMIT = 8;
const HISTORY_MESSAGE_CHARS = 2_000;
const EXCERPT_CHARS = 320;

export interface SourceRef {
  sourceType: string;
  sourceId: string;
}

/** Sebagian isi satu sumber notebook (satu sumber bisa punya >1 bagian, mis. resource + isi berkasnya). */
export interface SourcePart {
  notebookSourceId: string;
  sourceTitle: string;
  ref: SourceRef;
  text: string;
}

export interface ContextChunk {
  notebookSourceId: string;
  sourceTitle: string;
  ref: SourceRef;
  chunkIndex: number;
  content: string;
}

export interface NumberedChunk extends ContextChunk {
  n: number;
}

export interface Citation {
  n: number;
  sourceId: string;
  title: string;
  excerpt: string;
}

export const chunkKey = (ref: SourceRef, chunkIndex: number) => `${ref.sourceType}|${ref.sourceId}|${chunkIndex}`;

export const totalChars = (parts: SourcePart[]) => parts.reduce((sum, p) => sum + p.text.length, 0);

/** Potongan sumber dengan aturan yang sama dengan indeks AI (`chunkText`), sehingga hasil pencarian vektor cocok. */
export function partChunks(parts: SourcePart[]): ContextChunk[] {
  return parts.flatMap((part) =>
    chunkText(part.text.slice(0, MAX_SOURCE_CHARS)).map((content, chunkIndex) => ({
      notebookSourceId: part.notebookSourceId,
      sourceTitle: part.sourceTitle,
      ref: part.ref,
      chunkIndex,
      content,
    })),
  );
}

// ---------------------------------------------------------------------------- Peringkat kata kunci

const STOPWORDS = new Set(
  (
    "yang dan di ke dari untuk pada dengan dalam ini itu atau adalah akan tidak juga ada oleh sebagai bisa dapat " +
    "apa siapa kapan dimana mana bagaimana mengapa kenapa berapa apakah tolong jelaskan sebutkan saya kami kita " +
    "the a an of to in on for and or is are was were be what who when where how why which with about"
  ).split(" "),
);

export const tokenize = (text: string) =>
  (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length >= 2 && !STOPWORDS.has(t));

/**
 * Urutan indeks potongan menurut relevansi kata (TF-IDF sederhana + bonus frasa utuh). Dipakai bersama pencarian
 * vektor, dan sebagai satu-satunya pencarian bila indeks AI dimatikan / belum siap. Skor 0 tidak diikutkan.
 */
export function keywordRank(chunks: ContextChunk[], query: string): number[] {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];
  const docs = chunks.map((c) => tokenize(`${c.sourceTitle} ${c.content}`));
  const df = new Map<string, number>();
  for (const term of terms) df.set(term, docs.filter((d) => d.includes(term)).length);
  const phrase = query.trim().toLowerCase();

  return docs
    .map((tokens, i) => {
      let score = 0;
      for (const term of terms) {
        const tf = tokens.filter((t) => t === term).length;
        if (tf) score += (1 + Math.log(tf)) * Math.log(1 + chunks.length / (df.get(term) ?? 1));
      }
      if (score && phrase.length > 3 && chunks[i].content.toLowerCase().includes(phrase)) score *= 1.5;
      return { i, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.i);
}

/**
 * Pilih potongan untuk mode RAG: gabungan peringkat vektor (dari indeks AI) dan kata kunci (RRF). Bila keduanya
 * kosong (pertanyaan umum seperti "ringkas"), ambil potongan awal tiap sumber secara bergiliran.
 */
export function selectChunks(chunks: ContextChunk[], query: string, vectorKeys: string[], limit = RAG_CHUNK_LIMIT) {
  const byKey = new Map(chunks.map((c) => [chunkKey(c.ref, c.chunkIndex), c]));
  const vector = vectorKeys.filter((k) => byKey.has(k)).map((id) => ({ id }));
  const keyword = keywordRank(chunks, query).map((i) => ({ id: chunkKey(chunks[i].ref, chunks[i].chunkIndex) }));
  let picked = reciprocalRankFusion([vector, keyword])
    .slice(0, limit)
    .map((hit) => byKey.get(hit.id)!);

  if (picked.length < limit) {
    // Lengkapi dengan potongan awal tiap sumber (round-robin) agar setiap sumber terwakili
    const chosen = new Set(picked);
    const bySource = new Map<string, ContextChunk[]>();
    for (const c of chunks) bySource.set(c.notebookSourceId, [...(bySource.get(c.notebookSourceId) ?? []), c]);
    const queues = [...bySource.values()];
    for (let round = 0; picked.length < limit && queues.some((q) => q.length > round); round++) {
      for (const queue of queues) {
        const c = queue[round];
        if (c && !chosen.has(c) && picked.length < limit) {
          chosen.add(c);
          picked = [...picked, c];
        }
      }
    }
  }
  return picked;
}

/** Beri nomor sitasi [1..n] dalam urutan baca (urutan sumber, lalu urutan potongan). */
export function numberChunks(chunks: ContextChunk[], sourceOrder: string[]): NumberedChunk[] {
  const order = new Map(sourceOrder.map((id, i) => [id, i]));
  return [...chunks]
    .sort(
      (a, b) =>
        (order.get(a.notebookSourceId) ?? 0) - (order.get(b.notebookSourceId) ?? 0) ||
        a.ref.sourceType.localeCompare(b.ref.sourceType) ||
        a.chunkIndex - b.chunkIndex,
    )
    .map((c, i) => ({ ...c, n: i + 1 }));
}

// ---------------------------------------------------------------------------- Prompt

export interface HistoryMessage {
  role: string;
  content: string;
}

const formatChunks = (chunks: NumberedChunk[]) =>
  chunks.map((c) => `[${c.n}] (Sumber: ${c.sourceTitle})\n${c.content}`).join("\n\n");

export function buildChatPrompt(input: {
  notebookTitle: string;
  chunks: NumberedChunk[];
  history: HistoryMessage[];
  question: string;
  mode: "full" | "rag";
  /** Jumlah berkas (gambar / PDF) yang dikirim langsung ke AI bersama pertanyaan ini */
  fileCount?: number;
  /** Teks dokumen yang dilampirkan pengguna (hasil ekstraksi server) */
  attachedTexts?: { name: string; text: string }[];
}) {
  const files = input.fileCount ?? 0;
  const texts = input.attachedTexts ?? [];
  const hasAttachments = files > 0 || texts.length > 0;
  const history = input.history
    .slice(-HISTORY_LIMIT)
    .map((m) => `${m.role === "user" ? "Pengguna" : "Asisten"}: ${m.content.slice(0, HISTORY_MESSAGE_CHARS)}`)
    .join("\n\n");

  return [
    `Anda adalah asisten riset untuk notebook "${input.notebookTitle}". Jawab pertanyaan pengguna HANYA berdasarkan`,
    "kutipan sumber bernomor di bawah ini.",
    "",
    "Aturan:",
    "1. Setiap pernyataan faktual diberi sitasi nomor kutipan dalam kurung siku tepat setelahnya, mis. [2] atau [1][3].",
    "2. Jangan memakai pengetahuan di luar sumber. Bila jawabannya tidak ada di sumber, katakan dengan jelas bahwa",
    "   sumber tidak memuat informasi itu, lalu sebutkan apa yang paling mendekati (bila ada).",
    "3. Jawab dalam Bahasa Indonesia (kecuali pengguna memakai bahasa lain), ringkas tetapi lengkap, format Markdown",
    "   (judul singkat, daftar, tabel bila membantu; rumus memakai $...$ atau $$...$$).",
    "4. Jangan menulis daftar pustaka di akhir — cukup sitasi di dalam teks.",
    input.mode === "rag"
      ? "5. Kutipan berikut adalah bagian sumber yang paling relevan, bukan seluruh isi sumber."
      : "5. Kutipan berikut mencakup seluruh isi sumber notebook.",
    hasAttachments
      ? `6. Pengguna melampirkan ${[
          files ? `${files} berkas/gambar` : "",
          texts.length ? `${texts.length} dokumen` : "",
        ]
          .filter(Boolean)
          .join(
            " dan ",
          )} bersama pertanyaan ini. Baca isinya dengan teliti dan pakai bersama sumber; informasi dari lampiran
   tidak diberi nomor sitasi — sebut nama lampirannya (mis. "lampiran laporan.pdf"). Bila lampiran tidak berkaitan dengan
   sumber, tetap jelaskan isinya lalu kaitkan dengan sumber bila relevan.`
      : "",
    "",
    "<sumber>",
    input.chunks.length ? formatChunks(input.chunks) : "(belum ada sumber aktif — jawab dari lampiran pengguna)",
    "</sumber>",
    ...texts.map((t) => `\n<lampiran_pengguna nama="${t.name.replace(/"/g, "'")}">\n${t.text}\n</lampiran_pengguna>`),
    history ? `\n<riwayat_percakapan>\n${history}\n</riwayat_percakapan>` : "",
    "",
    `Pertanyaan: ${input.question}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

/** Nomor sitasi yang muncul di jawaban: [1], [1, 3], [2-4], [1][2]. */
export function citedNumbers(answer: string, max: number): number[] {
  const found = new Set<number>();
  for (const [, body] of answer.matchAll(/\[(\d+(?:\s*[-–,]\s*\d+)*)\]/g)) {
    for (const part of body.split(",")) {
      const [a, b] = part.split(/[-–]/).map((x) => Number(x.trim()));
      const end = Number.isFinite(b) ? Math.min(b, a + 20) : a;
      for (let n = a; n <= end; n++) if (n >= 1 && n <= max) found.add(n);
    }
  }
  return [...found].sort((x, y) => x - y);
}

export function citationsFor(answer: string, chunks: NumberedChunk[]): Citation[] {
  const byN = new Map(chunks.map((c) => [c.n, c]));
  return citedNumbers(answer, chunks.length).map((n) => {
    const c = byN.get(n)!;
    const excerpt = c.content.replace(/\s+/g, " ").trim();
    return {
      n,
      sourceId: c.notebookSourceId,
      title: c.sourceTitle,
      excerpt: excerpt.length > EXCERPT_CHARS ? `${excerpt.slice(0, EXCERPT_CHARS)}…` : excerpt,
    };
  });
}

// ---------------------------------------------------------------------------- Ringkasan Studio

export interface NotebookSummary {
  overview: string;
  keyPoints: string[];
  questions: string[];
}

/** Bagi jatah karakter ringkasan rata ke tiap sumber (sumber pendek menyisakan jatah untuk yang panjang). */
export function sampleParts(parts: SourcePart[], budget = SUMMARY_CONTEXT_CHARS) {
  const result = new Map<SourcePart, string>();
  let remaining = budget;
  const sorted = [...parts].sort((a, b) => a.text.length - b.text.length);
  sorted.forEach((part, i) => {
    const share = Math.floor(remaining / (sorted.length - i));
    const text = part.text.length > share ? `${part.text.slice(0, share)}\n[... dipotong ...]` : part.text;
    result.set(part, text);
    remaining -= Math.min(part.text.length, share);
  });
  return parts.map((p) => ({ title: p.sourceTitle, text: result.get(p) ?? "" }));
}

export function buildSummaryPrompt(notebookTitle: string, parts: SourcePart[]) {
  const sources = sampleParts(parts)
    .map((p, i) => `<sumber nomor="${i + 1}" judul="${p.title.replace(/"/g, "'")}">\n${p.text}\n</sumber>`)
    .join("\n\n");
  return [
    `Buat ringkasan Studio untuk notebook "${notebookTitle}" dari sumber-sumber di bawah ini.`,
    "Keluarkan HANYA JSON valid (tanpa blok kode, tanpa teks lain) dengan bentuk:",
    '{"overview": "...", "keyPoints": ["...", "..."], "questions": ["...", "..."]}',
    "- overview: 1–2 paragraf Markdown yang merangkum isi seluruh sumber dan kaitannya.",
    "- keyPoints: 5–8 poin kunci terpenting (kalimat lengkap, boleh **tebal** untuk istilah utama).",
    "- questions: 4 pertanyaan lanjutan yang menarik dan bisa dijawab dari sumber.",
    "Gunakan HANYA informasi dari sumber dan tulis dalam Bahasa Indonesia (kecuali sumber seluruhnya berbahasa lain).",
    "",
    sources,
  ].join("\n");
}

const asStrings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && !!v.trim()).map((v) => v.trim())
    : [];

/** Baca JSON ringkasan dari jawaban AI (toleran terhadap blok kode / teks di sekitarnya). */
export function parseSummary(text: string): NotebookSummary {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Jawaban AI bukan JSON.");
  const data = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const overview = typeof data.overview === "string" ? data.overview.trim() : "";
  if (!overview) throw new Error("Ringkasan kosong.");
  return {
    overview,
    keyPoints: asStrings(data.keyPoints).slice(0, 10),
    questions: asStrings(data.questions).slice(0, 6),
  };
}

/** Sidik jari sumber yang dipakai: berubah bila sumber ditambah/dihapus/diaktifkan/isinya berubah. */
export const sourcesFingerprint = (items: { id: string; version: string }[]) =>
  createHash("sha256")
    .update(
      [...items]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((i) => `${i.id}:${i.version}`)
        .join("\n"),
    )
    .digest("hex");
