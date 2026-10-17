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
  // Dokumen final (PDF bertanda tangan) yang diunggah dari konsep ONLYOFFICE-nya (features/tools/onlyoffice/document-links.tsx)
  "Dokumen Final",
  // Penanda status penyusutan yang dipasang/dilepas File Control (features/file-control/use-file-control.ts)
  "Musnah",
  "Statis",
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

/**
 * Tag lampiran → Resource Global: ditambahkan tanpa duplikat, kecuali tag yang sengaja dihapus user di form Resource
 * (`removed`) agar penghapusan tidak dibatalkan setiap kali item yang melampirkannya disimpan ulang.
 */
export function mergeAttachmentTags(current: string[], add: string[] = [], removed: string[] = []): string[] {
  const blocked = new Set(removed.map((t) => t.toLowerCase()));
  return add.reduce(
    (acc, tag) => (blocked.has(tag.trim().toLowerCase()) ? acc : addFreeTag(acc, tag, current)),
    current,
  );
}

/** Daftar tag yang dihapus user setelah form Resource disimpan: tambah yang baru dihapus, buang yang ditambah lagi. */
export function nextRemovedTags(previous: string[] = [], before: string[], after: string[]): string[] {
  const lower = (list: string[]) => new Set(list.map((t) => t.toLowerCase()));
  const kept = lower(after);
  const removedNow = before.filter((t) => !kept.has(t.toLowerCase()));
  const result = [...previous.filter((t) => !kept.has(t.toLowerCase())), ...removedNow];
  const seen = new Set<string>();
  return result.filter((t) => !seen.has(t.toLowerCase()) && !!seen.add(t.toLowerCase()));
}

/** Jumlah resource per tag bebas (pengelolaan tag), urut abjad. */
export function freeTagCounts(resources: Pick<Resource, "tags" | "sourceTag">[]): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const r of resources)
    for (const tag of new Set(resourceTags(r).filter((t) => !isContextTag(t)))) {
      const entry = counts.get(tag.toLowerCase()) ?? { tag, count: 0 };
      entry.count++;
      counts.set(tag.toLowerCase(), entry);
    }
  return [...counts.values()].sort((a, b) => a.tag.localeCompare(b.tag, "id"));
}

/** Resource punya tag bebas ini (tanpa peka huruf besar/kecil)? */
export const hasTag = (r: Pick<Resource, "tags" | "sourceTag">, tag: string) =>
  resourceTags(r).some((t) => t.toLowerCase() === tag.toLowerCase());

/**
 * Ganti nama tag bebas di satu resource (`to` kosong = hapus tag). Bila resource sudah punya tag tujuan, keduanya digabung.
 * Tag lama dicatat di `removedTags` agar tidak ditambahkan ulang dari lampiran yang masih membawanya.
 * Mengembalikan resource yang sama bila tidak ada perubahan.
 */
export function renameResourceTag<T extends Pick<Resource, "tags" | "sourceTag" | "removedTags">>(
  r: T,
  from: string,
  to: string | null,
): T {
  if (!hasTag(r, from)) return r;
  const target = to ? normalizeTag(to) : null;
  const without = resourceTags(r).filter((t) => t.toLowerCase() !== from.toLowerCase());
  const tags = target && !isContextTag(target) ? addFreeTag(without, target) : without;
  const removedTags = nextRemovedTags(r.removedTags, [from], target ? [target] : []);
  return { ...r, tags, removedTags: removedTags.length ? removedTags : undefined };
}
