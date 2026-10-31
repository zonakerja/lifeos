import type { VaultAccess } from "@/types/api";

/** Ukuran berkas ringkas ("1,2 MB"). */
export function formatVaultSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString("id-ID", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

export const VAULT_ACTION_LABELS: Record<VaultAccess["action"], string> = {
  open: "Membuka brankas",
  view: "Melihat berkas",
  download: "Mengunduh berkas",
};

/** Jumlah alamat IP berbeda yang pernah membuka brankas (petunjuk tautan tersebar). */
export const distinctVisitors = (rows: VaultAccess[]) => new Set(rows.map((r) => r.ip ?? "?")).size;

/** Tautan lengkap brankas dari path yang dikembalikan server (`/brankas/<token>`). */
export const vaultUrl = (path: string, origin = window.location.origin) => `${origin}${path}`;
