import { createHash } from "node:crypto";

/**
 * Logika murni sinkron SKP & RHK e-Kinerja → record `skp` / `skp_target` (diuji di `ekinerja-sync.spec.ts`).
 * ID record dibuat stabil dari data e-Kinerja agar sinkron ulang memperbarui baris yang sama dan pemetaan rencana aksi
 * (`action_plan_entry.targetId`) tidak bergeser walau urutan RHK berubah.
 */

export interface SyncedRhk {
  name: string;
  section: string;
  leader: string;
  leaderIndicator?: string;
  indicators: { aspect: string; indicator: string; target: string }[];
}

export interface SyncedSkp {
  externalId: string;
  startDate: string;
  endDate: string;
  status: string;
  approach: string;
  appraiser: string;
  /** null = Detail SKP tidak dibaca (di luar tahun yang diminta) */
  rhk: SyncedRhk[] | null;
}

export const skpClientId = (externalId: string) => `ekin-${externalId}`;

export const targetClientId = (externalId: string, section: string, name: string) =>
  `ekin-${externalId}-${createHash("sha256").update(`${section}|${name}`).digest("hex").slice(0, 12)}`;

/**
 * RHK lama milik SKP yang tidak ada lagi di e-Kinerja: dihapus bila tidak dipakai rencana aksi; bila masih dipakai
 * dipertahankan dengan tanda `stale` agar pemetaan entri tidak hilang diam-diam.
 */
export function planTargetSync(existing: string[], incoming: string[], used: Set<string>) {
  const keep = new Set(incoming);
  const gone = existing.filter((id) => !keep.has(id));
  return { remove: gone.filter((id) => !used.has(id)), stale: gone.filter((id) => used.has(id)) };
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Validasi hasil robot sebelum ditulis (robot = layanan internal, tetapi data berasal dari halaman pihak luar). */
export function validSkp(value: unknown): value is SyncedSkp {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.externalId === "string" &&
    /^\d{1,12}$/.test(v.externalId) &&
    typeof v.startDate === "string" &&
    YMD.test(v.startDate) &&
    typeof v.endDate === "string" &&
    YMD.test(v.endDate) &&
    (v.rhk === null || Array.isArray(v.rhk))
  );
}

const clip = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

export function cleanRhk(rhk: SyncedRhk[]): SyncedRhk[] {
  return rhk
    .filter((r) => typeof r?.name === "string" && r.name.trim())
    .slice(0, 100)
    .map((r) => ({
      name: clip(r.name, 1000).trim(),
      section: clip(r.section, 40) || "UTAMA",
      leader: clip(r.leader, 1000),
      leaderIndicator: clip(r.leaderIndicator, 1000),
      indicators: (Array.isArray(r.indicators) ? r.indicators : []).slice(0, 20).map((i) => ({
        aspect: clip(i?.aspect, 40),
        indicator: clip(i?.indicator, 1000),
        target: clip(i?.target, 200),
      })),
    }));
}
