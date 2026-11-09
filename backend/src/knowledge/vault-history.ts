/**
 * Riwayat versi catatan vault (K7, docs/AI-AGENT.md §25.6) — pola File recovery Obsidian: isi berkas sebelum LifeOS menimpanya
 * selalu disimpan; versi yang terpantau saat pindai (mis. diubah di Obsidian) dirapatkan per selang waktu. Logika murni.
 */

export const VERSION_REASONS = [
  "observed",
  "before_save",
  "before_properties",
  "before_task",
  "before_link",
  "before_move",
  "before_restore",
  "before_merge",
  "before_extract",
  "before_tag",
] as const;
export type VersionReason = (typeof VERSION_REASONS)[number];

/** Versi terbaru yang disimpan per catatan. */
export const MAX_VERSIONS = 30;
/** Versi terpantau yang lebih baru dari selang ini ditimpa (bukan ditambah) agar riwayat tidak penuh oleh ketikan. */
export const OBSERVED_INTERVAL_MS = 5 * 60_000;

export interface LatestVersion {
  id: string;
  hash: string;
  reason: string;
  createdAt: Date;
}

/**
 * Keputusan mencatat versi baru: isi sama dengan versi terakhir dilewati (atau ditandai bila itu isi sebelum ditimpa
 * LifeOS); versi terpantau yang masih dalam selang
 * menggantikan versi terpantau terakhir; selain itu tambah versi baru.
 */
export function versionAction(
  latest: LatestVersion | null,
  input: { hash: string; reason: VersionReason; now: Date },
): { kind: "skip" } | { kind: "mark"; id: string } | { kind: "replace"; id: string } | { kind: "create" } {
  if (latest?.hash === input.hash) {
    // isi sebelum ditimpa LifeOS = versi terpantau terakhir → tandai agar tidak ditimpa versi terpantau berikutnya
    return input.reason !== "observed" && latest.reason === "observed"
      ? { kind: "mark", id: latest.id }
      : { kind: "skip" };
  }
  if (
    input.reason === "observed" &&
    latest?.reason === "observed" &&
    input.now.getTime() - latest.createdAt.getTime() < OBSERVED_INTERVAL_MS
  ) {
    return { kind: "replace", id: latest.id };
  }
  return { kind: "create" };
}

/** Id versi yang dibuang (lebih lama dari `keep` terbaru). `versions` urut terbaru dulu. */
export const versionsToPrune = (versions: { id: string }[], keep = MAX_VERSIONS) =>
  versions.slice(keep).map((v) => v.id);

/** Path baru riwayat saat catatan / folder dipindah (null = tidak terdampak). */
export function movedVersionPath(path: string, from: string, to: string, folder: boolean) {
  if (!folder) return path === from ? to : null;
  return path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : null;
}
