import { createHash } from "node:crypto";
import type { RecordType } from "../../records/record-schema";

/** Model embedding (Gemini) dan dimensinya — harus sama dengan kolom `vector(768)` di `ai_chunks`. */
export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 768;

/** `sourceType` untuk isi berkas (asset); sumber lain memakai nama record type. */
export const ASSET_SOURCE = "asset";

/** Record type yang diindeks beserta labelnya untuk konteks AI. Tipe teknis (log, completion) tidak diindeks. */
export const INDEXED_TYPES: Partial<Record<RecordType, string>> = {
  schedule: "Agenda",
  routine: "Rutinitas",
  todo: "To-do",
  free_note: "Catatan",
  ai_note: "Notes AI",
  list: "Daftar",
  para_area: "Area",
  para_project: "Project",
  para_activity: "Kegiatan Area",
  para_task: "Task",
  para_resource: "Resource",
  para_archive: "Arsip PARA",
  archive_classification: "Klasifikasi Arsip",
  archive_jra: "Jadwal Retensi Arsip (JRA)",
  archive_physical_reference: "Lokasi Arsip Fisik",
  archive_borrowing: "Peminjaman Arsip",
  archive_disposition: "Berita Acara Penyusutan",
};

export const isIndexedType = (type: string): type is RecordType => Object.hasOwn(INDEXED_TYPES, type);

/** Key payload yang tidak bermakna sebagai teks (ID, warna, urutan, data biner). */
const SKIP_KEYS = new Set(["id", "userId", "clientId", "color", "order", "createdAt", "updatedAt", "deletedAt"]);
/** Field berakhiran Id yang justru bermakna bagi user (nomor registrasi arsip). */
const KEEP_KEYS = new Set(["archiveRegId"]);
const isSkippedKey = (key: string) => !KEEP_KEYS.has(key) && (SKIP_KEYS.has(key) || /Ids?$/.test(key));

/** Batas teks per sumber agar satu dokumen besar tidak menghabiskan kuota embedding. */
export const MAX_SOURCE_CHARS = 600_000;

function flatten(value: unknown, depth: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value.startsWith("data:") ? null : value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (depth <= 0) return null;
  if (Array.isArray(value)) {
    const items = value.map((v) => flatten(v, depth - 1)).filter((v): v is string => !!v);
    return items.length ? items.join("; ") : null;
  }
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !isSkippedKey(k))
      .map(([k, v]) => {
        const text = flatten(v, depth - 1);
        return text ? `${k}: ${text}` : null;
      })
      .filter((v): v is string => !!v);
    return parts.length ? `(${parts.join(", ")})` : null;
  }
  return null;
}

/** Judul record: `titleKey` spesifikasi, lalu title/name umum, lalu judul di dalam snapshot `data` (arsip PARA). */
function titleOf(payload: Record<string, unknown>, titleKey?: string): string | null {
  const data = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : {};
  for (const value of [titleKey ? payload[titleKey] : undefined, payload.title, payload.name, data.title, data.name]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Teks yang diindeks untuk satu record: label tipe + judul, lalu baris `key: nilai` dari payload (generik, sehingga field
 * baru otomatis ikut terindeks tanpa perubahan kode).
 */
export function renderRecord(type: RecordType, payload: Record<string, unknown>, titleKey?: string) {
  const label = INDEXED_TYPES[type] ?? type;
  const title = `${label}: ${titleOf(payload, titleKey) ?? "(tanpa judul)"}`;
  const lines = Object.entries(payload)
    .filter(([key]) => !isSkippedKey(key) && key !== titleKey)
    .map(([key, value]) => {
      const text = flatten(value, 3);
      return text ? `${key}: ${text}` : null;
    })
    .filter((v): v is string => !!v);
  return { title, text: lines.join("\n") };
}

/**
 * Potong teks menjadi bagian ± `size` karakter dengan tumpang-tindih `overlap`, memotong di batas paragraf/kalimat bila
 * memungkinkan agar konteks tidak terputus di tengah kalimat.
 */
export function chunkText(text: string, size = 1800, overlap = 200): string[] {
  const clean = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const window = clean.slice(start, end);
      const breakAt = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". "));
      if (breakAt > size * 0.5) end = start + breakAt + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}

export const hashText = (text: string) => createHash("sha256").update(text).digest("hex");

/** Format teks untuk `gemini-embedding-2` (tugas ditulis di teks, bukan parameter `task_type`). */
export const documentEmbeddingText = (title: string, content: string) => `title: ${title || "none"} | text: ${content}`;
export const queryEmbeddingText = (query: string) => `task: search result | query: ${query}`;

/** Literal pgvector, mis. `[0.1,0.2]`. */
export const toVectorLiteral = (values: number[]) => `[${values.join(",")}]`;

/**
 * Reciprocal Rank Fusion: gabungkan beberapa daftar peringkat (vektor & kata kunci) menjadi satu. Item yang muncul di
 * kedua daftar naik ke atas; skor hanya bergantung pada urutan sehingga skala skor tiap metode tidak perlu disamakan.
 */
export function reciprocalRankFusion<T extends { id: string }>(lists: T[][], k = 60): (T & { score: number })[] {
  const merged = new Map<string, T & { score: number }>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const existing = merged.get(item.id);
      const score = 1 / (k + rank + 1);
      if (existing) existing.score += score;
      else merged.set(item.id, { ...item, score });
    });
  }
  return [...merged.values()].sort((a, b) => b.score - a.score);
}
