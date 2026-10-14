import type { ArchivalStatus } from "@/types/entities";

/**
 * Pintu masuk File Control. Resource berkas **tidak** otomatis menjadi arsip: user menentukannya sejak awal lewat centang
 * "Masukkan ke File Control" (form Resource & form lampiran), yang mengisi `archivalStatus: "pending"` (tab Gantung).
 * `undefined` / `"none"` = bukan arsip. Berkas yang sudah diberkaskan (fisik/digital) tidak bisa dikeluarkan lewat centang.
 */

/** Resource yang dikelola File Control: bertipe berkas dan sudah dimasukkan (Gantung / Fisik / Digital). */
export const isInFileControl = (r: { type?: string; archivalStatus?: string }) =>
  String(r.type).toLowerCase() === "file" && !!r.archivalStatus && r.archivalStatus !== "none";

/** Sudah diberkaskan (fisik/digital) → status ditentukan File Control, bukan centang. */
export const isFiledArchive = (status?: string) => status === "physical" || status === "digital";

/**
 * `archivalStatus` baru setelah centang diubah. Dicentang → masuk Gantung (status yang lebih lanjut dipertahankan);
 * centang dilepas → `"none"` bila sebelumnya sudah masuk (perubahan tercatat di audit kearsipan), tetap kosong bila belum.
 */
export function fileControlStatus(current: ArchivalStatus | undefined, include: boolean): ArchivalStatus | undefined {
  if (isFiledArchive(current)) return current;
  if (include) return "pending";
  return current ? "none" : undefined;
}

const KEY = "lifeos.attachments.fileControl";

/** Preferensi centang "Masukkan ke File Control" (per browser, default mati) — sama seperti "Ringkas dengan AI". */
export const readFileControlPreference = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export const writeFileControlPreference = (enabled: boolean) => {
  try {
    localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch {
    // Storage diblokir: preferensi hanya berlaku untuk form ini
  }
};
