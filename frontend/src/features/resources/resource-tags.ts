import type { Resource } from "@/types/entities";

/**
 * Tag Resource Global ada dua macam, disimpan bersama di `tags`:
 * - **Tag konteks** (otomatis, asal resource): diberikan sistem saat resource dibuat dari tab Resources atau dari lampiran
 *   Project/Action/Task/Agenda (`contextTag` di `mergeIntoGlobalResources` / `useAttachmentCleanup`). Tidak diubah user.
 * - **Tag bebas** (kategori isi, mis. "Regulasi", "SOP"): diketik user di form Resource.
 */
export const CONTEXT_TAGS = [
  "Global Resource",
  "Project Basis",
  "Project",
  "Project Action",
  "Area",
  "Area Task",
  "Agenda",
] as const;

const CONTEXT_SET = new Set<string>(CONTEXT_TAGS);
export const isContextTag = (tag: string) => CONTEXT_SET.has(tag);

/** Panjang maksimal satu tag bebas */
export const MAX_TAG_LENGTH = 40;

/** Semua tag resource (data lama bisa hanya punya `sourceTag`). */
export const resourceTags = (r: Pick<Resource, "tags" | "sourceTag">): string[] =>
  Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : r.sourceTag ? [r.sourceTag] : [];

/** Pisahkan tag konteks (otomatis) dan tag bebas. */
export function splitTags(tags: string[]) {
  return { context: tags.filter(isContextTag), free: tags.filter((t) => !isContextTag(t)) };
}

/** Rapikan masukan tag: spasi berlebih dibuang, dipotong ke `MAX_TAG_LENGTH`. Kosong → null. */
export function normalizeTag(input: string): string | null {
  const tag = input.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH).trim();
  return tag ? tag : null;
}

/**
 * Tambah tag bebas tanpa duplikat (tidak peka huruf besar/kecil). Penulisan mengikuti tag yang sudah dipakai di resource
 * lain (`known`) agar "sop" dan "SOP" tidak menjadi dua kategori. Tag konteks tidak bisa ditambahkan manual.
 */
export function addFreeTag(list: string[], input: string, known: string[] = []): string[] {
  const tag = normalizeTag(input);
  if (!tag || isContextTag(tag)) return list;
  const lower = tag.toLowerCase();
  if (list.some((t) => t.toLowerCase() === lower)) return list;
  const canonical = known.find((t) => t.toLowerCase() === lower) ?? tag;
  return [...list, canonical];
}

/** Tag bebas yang sudah dipakai di semua resource (saran input), urut abjad. */
export function collectFreeTags(resources: Pick<Resource, "tags" | "sourceTag">[]): string[] {
  const seen = new Map<string, string>();
  for (const r of resources)
    for (const tag of resourceTags(r))
      if (!isContextTag(tag) && !seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "id"));
}
