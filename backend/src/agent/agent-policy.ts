/**
 * Logika murni Kebijakan Otomatis (docs/AI-AGENT.md §24, diuji di `agent-policy.spec.ts`): verifikasi aset dari agen
 * terhadap data master, dan keputusan aturan. Yang memutuskan selalu kode ini atas aturan milik user — bukan model.
 */

export const POLICY_MODES = ["off", "shadow", "auto"] as const;
export type PolicyMode = (typeof POLICY_MODES)[number];

/** Kolom aset yang dibandingkan. `nilai` dibandingkan dengan toleransi persen, kolom lain harus sama. */
export const ASSET_FIELDS = ["nup", "kodeBarang", "nama", "nilai"] as const;
export type AssetField = (typeof ASSET_FIELDS)[number];

export interface AssetClaim {
  nup?: string;
  kodeBarang?: string;
  nama?: string;
  nilai?: number | string;
}

export interface MasterAsset {
  nup: string;
  kodeBarang: string;
  nama?: string;
  nilai?: number;
}

export interface AssetDiff {
  field: AssetField;
  claimed: string | number | null;
  master: string | number | null;
}

export interface AssetCheckItem {
  claimed: AssetClaim;
  master: MasterAsset | null;
  status: "cocok" | "berbeda" | "tidak_ditemukan";
  diffs: AssetDiff[];
}

export interface AssetCheck {
  total: number;
  matched: number;
  /** Persen aset yang cocok (0–100, dibulatkan) */
  score: number;
  items: AssetCheckItem[];
}

export interface CompareOptions {
  criticalFields: AssetField[];
  /** Selisih nilai yang masih diterima (persen dari nilai master) */
  valueTolerance: number;
}

/** NUP & kode barang: hanya huruf/angka, huruf besar (spasi, titik, tanda hubung diabaikan). */
export const normalizeCode = (value: unknown) =>
  String(value ?? "")
    .replace(/[^0-9a-z]/gi, "")
    .toUpperCase();

const normalizeName = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Nilai rupiah dari angka atau teks ("Rp 12.500.000,00", "12500000") → angka; tidak terbaca → null. */
export function parseRupiah(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = String(value ?? "")
    .replace(/rp\.?/i, "")
    .replace(/\s/g, "");
  if (!text) return null;
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function diffAsset(claim: AssetClaim, master: MasterAsset, valueTolerance: number): AssetDiff[] {
  const diffs: AssetDiff[] = [];
  for (const field of ["nup", "kodeBarang"] as const) {
    if (normalizeCode(claim[field]) !== normalizeCode(master[field])) {
      diffs.push({ field, claimed: claim[field] ?? null, master: master[field] });
    }
  }
  if (claim.nama && master.nama && normalizeName(claim.nama) !== normalizeName(master.nama)) {
    diffs.push({ field: "nama", claimed: claim.nama, master: master.nama });
  }
  const claimed = parseRupiah(claim.nilai);
  if (claimed !== null && typeof master.nilai === "number") {
    const base = Math.abs(master.nilai) || 1;
    if ((Math.abs(claimed - master.nilai) / base) * 100 > valueTolerance) {
      diffs.push({ field: "nilai", claimed, master: master.nilai });
    }
  }
  return diffs;
}

/**
 * Bandingkan aset yang dibaca agen dengan data master. Aset dicari lewat NUP + kode barang, lalu NUP saja (kode barang
 * yang salah tetap terlihat sebagai perbedaan). Aset cocok bila tidak ada perbedaan pada kolom kritis dan nilai masih
 * dalam toleransi; perbedaan nama di luar kolom kritis hanya dicatat.
 */
export function compareAssets(claims: AssetClaim[], masters: MasterAsset[], options: CompareOptions): AssetCheck {
  const byKey = new Map(masters.map((m) => [`${normalizeCode(m.nup)}|${normalizeCode(m.kodeBarang)}`, m]));
  const byNup = new Map(masters.map((m) => [normalizeCode(m.nup), m]));
  const items = claims.map((claimed): AssetCheckItem => {
    const nup = normalizeCode(claimed.nup);
    const master =
      byKey.get(`${nup}|${normalizeCode(claimed.kodeBarang)}`) ?? (nup ? byNup.get(nup) : undefined) ?? null;
    if (!master) return { claimed, master: null, status: "tidak_ditemukan", diffs: [] };
    const diffs = diffAsset(claimed, master, options.valueTolerance);
    const failing = diffs.some((d) => d.field === "nilai" || options.criticalFields.includes(d.field));
    return { claimed, master, status: failing ? "berbeda" : "cocok", diffs };
  });
  const matched = items.filter((i) => i.status === "cocok").length;
  return { total: items.length, matched, score: items.length ? Math.round((matched / items.length) * 100) : 0, items };
}

export interface PolicyLite {
  id: string;
  mode: string;
  requestKind: string;
  groupCodes: unknown;
}

const codesOf = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").map((v) => v.toUpperCase()) : [];

/** Aturan yang berlaku untuk pengajuan: jenis sama, grup diizinkan; aturan yang menyebut grupnya didahulukan. */
export function matchPolicy<T extends PolicyLite>(
  policies: T[],
  request: { kind: string; groupCode?: string | null },
): T | null {
  const group = request.groupCode?.toUpperCase() ?? "";
  const active = policies.filter((p) => p.mode !== "off" && p.requestKind === request.kind);
  return (
    active.find((p) => group && codesOf(p.groupCodes).includes(group)) ??
    active.find((p) => codesOf(p.groupCodes).length === 0) ??
    null
  );
}

export interface DecisionInput {
  mode: string;
  threshold: number;
  check: AssetCheck | null;
  /** Sumber data master tersedia saat verifikasi */
  masterAvailable: boolean;
  documents: number;
  requestStatus: string;
  paused: boolean;
  usedToday: number;
  dailyLimit: number;
}

export interface Decision {
  /** approve = memenuhi aturan; review = diserahkan ke pemilik */
  outcome: "approve" | "review";
  /** Keputusan benar-benar dijalankan (mode auto & tidak tertahan pengaman) */
  apply: boolean;
  reasons: string[];
}

const OPEN_STATUSES = ["baru", "diproses", "menunggu_verifikasi"];

/** Keputusan aturan atas hasil kerja agen. Alasan selalu diisi agar terlihat di riwayat pengajuan. */
export function decidePolicy(input: DecisionInput): Decision {
  const reasons: string[] = [];
  if (!OPEN_STATUSES.includes(input.requestStatus)) reasons.push("Pengajuan sudah diputuskan.");
  if (!input.masterAvailable) reasons.push("Data master aset tidak tersedia.");
  if (!input.check) reasons.push("Agen tidak menyerahkan daftar aset untuk diverifikasi.");
  else if (input.check.total === 0) reasons.push("Tidak ada aset yang terbaca dari berkas.");
  else if (input.check.score < input.threshold) {
    reasons.push(
      `Aset cocok ${input.check.score}% (${input.check.matched}/${input.check.total}), di bawah ambang ${input.threshold}%.`,
    );
  }
  if (input.documents === 0) reasons.push("Agen belum membuat dokumen.");
  if (reasons.length) return { outcome: "review", apply: false, reasons };

  const check = input.check as AssetCheck;
  const ok = [`Aset cocok ${check.score}% (${check.matched}/${check.total}), ambang ${input.threshold}%.`];
  if (input.mode !== "auto")
    return { outcome: "approve", apply: false, reasons: [...ok, "Mode shadow: hanya dicatat."] };
  if (input.paused) return { outcome: "approve", apply: false, reasons: [...ok, "Sakelar darurat aktif."] };
  if (input.usedToday >= input.dailyLimit) {
    return {
      outcome: "approve",
      apply: false,
      reasons: [...ok, `Batas ${input.dailyLimit} keputusan otomatis per 24 jam tercapai.`],
    };
  }
  return { outcome: "approve", apply: true, reasons: ok };
}
