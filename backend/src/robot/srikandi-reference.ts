import { createHash } from "node:crypto";

/**
 * Logika murni referensi SRIKANDI → record `srikandi_reference` (diuji di `srikandi-reference.spec.ts`): penandatangan,
 * tujuan, verifikator, tembusan, grup tujuan/tembusan/disposisi, dan klasifikasi arsip — bahan pilihan formulir Register
 * Naskah Keluar.
 */

export const REFERENCE_CATEGORIES = [
  "signer",
  "recipient",
  "recipient_group",
  "verifier",
  "cc",
  "cc_group",
  "disposition_group",
  "classification",
] as const;
export type ReferenceCategory = (typeof REFERENCE_CATEGORIES)[number];

export interface CleanReference {
  category: ReferenceCategory;
  label: string;
  fields: Record<string, string>;
}

const clip = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

export function cleanReference(value: unknown): CleanReference | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const category = REFERENCE_CATEGORIES.find((c) => c === v.category);
  const label = clip(v.label, 500);
  if (!category || !label) return null;
  const fields: Record<string, string> = {};
  if (v.fields && typeof v.fields === "object") {
    for (const [key, raw] of Object.entries(v.fields as Record<string, unknown>).slice(0, 12)) {
      const k = clip(key, 60);
      const text = clip(raw, 500);
      if (k && text) fields[k] = text;
    }
  }
  return { category, label, fields };
}

/** ID record stabil: kategori + label + jabatan/jenis (orang yang sama dengan jabatan berbeda = entri berbeda). */
export function referenceClientId(ref: CleanReference) {
  const detail = ref.fields["Jabatan"] ?? ref.fields["Jenis Tujuan"] ?? ref.fields["Jenis Tembusan"] ?? "";
  const key = `${ref.category}|${ref.label}|${detail}`.toLowerCase();
  return `sr-${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

/**
 * Entri lama yang tidak ada lagi di SRIKANDI dihapus — kecuali kategori itu terbaca kosong padahal sebelumnya berisi
 * (bisa jadi tabel gagal dimuat), agar referensi tidak hilang karena gangguan sesaat.
 */
export function staleReferences(existing: string[], incoming: string[]) {
  if (!incoming.length) return [];
  const keep = new Set(incoming);
  return existing.filter((id) => !keep.has(id));
}
