import { isMap, parseDocument } from "yaml";

/**
 * Berkas Bases Obsidian (`.base`, K2 docs/AI-AGENT.md §25.6): YAML berisi `filters`, `formulas`, `properties`, `views`.
 * Server hanya membaca & menulis YAML (filter dievaluasi di browser atas daftar catatan). Logika murni.
 */

export const BASE_EXT = ".base";
export const MAX_BASE_BYTES = 256 * 1024;
const TOP_KEYS = ["filters", "formulas", "properties", "views"] as const;

export const isBasePath = (path: string) => path.toLowerCase().endsWith(BASE_EXT);

/** Isi base baru: satu tampilan tabel tanpa filter (sama dengan base kosong buatan Obsidian). */
export const DEFAULT_BASE = `views:\n  - type: table\n    name: Tabel\n`;

/** Parse YAML base → objek; galat sintaks dikembalikan sebagai pesan (berkas tetap bisa dibuka & diperbaiki). */
export function parseBase(raw: string): { data: Record<string, unknown>; error: string | null } {
  if (!raw.trim()) return { data: {}, error: null };
  const doc = parseDocument(raw);
  if (doc.errors.length) return { data: {}, error: doc.errors[0].message.split("\n")[0] };
  const data: unknown = doc.toJS();
  if (data === null || data === undefined) return { data: {}, error: null };
  if (typeof data !== "object" || Array.isArray(data)) return { data: {}, error: "Isi base harus berupa objek YAML." };
  return { data: data as Record<string, unknown>, error: null };
}

/** Periksa bentuk dasar sebelum ditulis (views = daftar objek bernama). Null = valid. */
export function validateBase(data: Record<string, unknown>): string | null {
  if (data.views !== undefined) {
    if (!Array.isArray(data.views)) return "views harus berupa daftar.";
    for (const view of data.views) {
      if (!view || typeof view !== "object" || Array.isArray(view)) return "Setiap tampilan harus berupa objek.";
    }
  }
  if (data.formulas !== undefined && (typeof data.formulas !== "object" || Array.isArray(data.formulas)))
    return "formulas harus berupa objek nama → rumus.";
  return null;
}

/**
 * Tulis ulang YAML dengan kunci utama dari `data`, kunci lain (dan komentar dokumen) dipertahankan seperti di Obsidian.
 * Kunci utama yang tidak ada di `data` dihapus.
 */
export function updateBaseYaml(raw: string, data: Record<string, unknown>) {
  const doc = parseDocument(raw.trim() ? raw : "{}");
  if (doc.errors.length || !isMap(doc.contents)) {
    const fresh = parseDocument("{}");
    for (const key of TOP_KEYS) if (data[key] !== undefined) fresh.set(key, data[key]);
    return fresh.toString();
  }
  for (const key of TOP_KEYS) {
    if (data[key] === undefined || data[key] === null) doc.delete(key);
    else doc.set(key, doc.createNode(data[key]));
  }
  return doc.toString();
}
