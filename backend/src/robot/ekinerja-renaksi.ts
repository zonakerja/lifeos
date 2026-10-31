/**
 * Logika murni pengisian Rencana Aksi e-Kinerja (diuji di `ekinerja-renaksi.spec.ts`): entri renaksi LifeOS satu bulan →
 * baris per indikator untuk robot (`/jobs/ekinerja/renaksi`), lalu hasil baca robot → entri yang sudah terisi.
 * Aturan sama dengan frontend `lib/action-plan.ts` (indikator terpilih, realisasi aspek WAKTU bawaan).
 */

export const DEFAULT_TIME_REALIZATION = "Penyampaian tepat waktu";

export interface PlanIndicator {
  aspect: string;
  indicator: string;
  target?: string;
}

export interface PlanTarget {
  id: string;
  name: string;
  skpId?: string;
  indicators?: PlanIndicator[];
}

export interface PlanEntry {
  id: string;
  period: string;
  skpId?: string;
  targetId?: string;
  description: string;
  realization?: string;
  timeRealization?: string;
  indicators?: string[];
  documentUrl?: string;
  status: string;
}

export interface RenaksiRow {
  rhk: string;
  indicator: string;
  renaksi: string[];
  realisasi: string[];
  bukti: string[];
}

export interface FilledRow {
  key: string;
  renaksi: string[];
  realisasi: string[];
  bukti: string[];
}

type Kind = "renaksi" | "realisasi" | "bukti";

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();
/** Sama dengan robot `normalize`: spasi, huruf besar/kecil, tanda baca ujung. */
export const normalize = (text: string) =>
  tidy(text)
    .toLowerCase()
    .replace(/[.;,]+$/, "");
export const rowKey = (rhk: string, indicator: string) => normalize(`RHK ${rhk} Indikator ${indicator}`);

const isTime = (i: PlanIndicator) => /waktu/i.test(i.aspect);

function indicatorsOf(entry: PlanEntry, target: PlanTarget) {
  const all = target.indicators ?? [];
  const chosen = entry.indicators?.length ? all.filter((i) => entry.indicators!.includes(i.indicator)) : [];
  return chosen.length ? chosen : all;
}

/** Butir yang harus ada di e-Kinerja untuk satu entri (kosong = entri belum lengkap / tidak bisa diisikan). */
export function entryItems(entry: PlanEntry, target: PlanTarget | undefined) {
  const items: { key: string; rhk: string; indicator: string; kind: Kind; value: string }[] = [];
  if (!target?.indicators?.length) return items;
  const renaksi = tidy(entry.description ?? "");
  const bukti = tidy(entry.documentUrl ?? "");
  if (!renaksi || !bukti) return items;
  const indicators = indicatorsOf(entry, target);
  for (const i of indicators) {
    const realisasi = isTime(i)
      ? tidy(entry.timeRealization ?? "") || DEFAULT_TIME_REALIZATION
      : tidy(entry.realization ?? "");
    if (!realisasi) return [];
    const key = rowKey(target.name, i.indicator);
    const base = { key, rhk: target.name, indicator: i.indicator };
    items.push({ ...base, kind: "renaksi", value: renaksi });
    items.push({ ...base, kind: "realisasi", value: realisasi });
    items.push({ ...base, kind: "bukti", value: bukti });
  }
  return items;
}

/**
 * Entri siap (bukan terisi) satu bulan, dikelompokkan per SKP → baris robot. Butir sama dari beberapa entri digabung
 * (satu indikator bisa dapat beberapa butir renaksi). Urutan baris = urutan RHK & indikator.
 */
export function buildRenaksiPlan(entries: PlanEntry[], targets: PlanTarget[], period: string) {
  const bySkp = new Map<string, { rows: RenaksiRow[]; entryIds: string[] }>();
  const skipped: string[] = [];
  for (const entry of entries) {
    if (entry.period !== period || entry.status === "filled") continue;
    const target = targets.find((t) => t.id === entry.targetId);
    const skpId = entry.skpId ?? target?.skpId;
    const items = entryItems(entry, target);
    if (!skpId || !items.length) {
      skipped.push(entry.id);
      continue;
    }
    const plan = bySkp.get(skpId) ?? { rows: [], entryIds: [] };
    bySkp.set(skpId, plan);
    plan.entryIds.push(entry.id);
    for (const item of items) {
      let row = plan.rows.find((r) => rowKey(r.rhk, r.indicator) === item.key);
      if (!row) {
        row = { rhk: item.rhk, indicator: item.indicator, renaksi: [], realisasi: [], bukti: [] };
        plan.rows.push(row);
      }
      if (!row[item.kind].some((v) => normalize(v) === normalize(item.value))) row[item.kind].push(item.value);
    }
  }
  return { bySkp, skipped };
}

/** Entri yang semua butirnya sudah terbaca di tabel bulan e-Kinerja. */
export function filledEntries(entries: PlanEntry[], targets: PlanTarget[], rows: FilledRow[]) {
  return entries.filter((entry) => {
    const items = entryItems(
      entry,
      targets.find((t) => t.id === entry.targetId),
    );
    return (
      items.length > 0 &&
      items.every((item) => {
        const row = rows.find((r) => r.key === item.key);
        return !!row && row[item.kind].some((v) => normalize(v) === normalize(item.value));
      })
    );
  });
}

// ---------------------------------------------------------------- Pemantauan & sinkron dua arah

/** Bagian entri yang ikut menentukan isi e-Kinerja; berubah → entri perlu dikirim ulang. */
export interface SignedEntry extends PlanEntry {
  pushedSignature?: string;
  deleted?: boolean;
  sourceType?: string;
  filledAt?: string;
}

/** Tanda tangan isi entri (pengenal perubahan): dibandingkan dengan `pushedSignature` saat terakhir terisi di e-Kinerja. */
export function entrySignature(entry: PlanEntry) {
  return JSON.stringify([
    entry.targetId ?? "",
    normalize(entry.description ?? ""),
    normalize(entry.realization ?? ""),
    normalize(entry.timeRealization ?? ""),
    normalize(entry.documentUrl ?? ""),
    [...(entry.indicators ?? [])].map(normalize).sort(),
  ]);
}

/** Entri sudah terisi tetapi isinya diubah setelah dikirim. */
export const isChanged = (entry: SignedEntry) =>
  entry.status === "filled" && !!entry.pushedSignature && entry.pushedSignature !== entrySignature(entry);

/** Satu bulan perlu dikirim: ada entri siap, berubah, atau ditandai hapus. */
export const hasPendingChanges = (entries: SignedEntry[]) =>
  entries.some((e) => e.deleted || e.status !== "filled" || isChanged(e));

/**
 * Isian lengkap satu bulan untuk mode sinkron: semua entri yang tidak ditandai hapus dan lengkap (termasuk yang sudah
 * terisi) → baris per indikator per SKP. Robot menyamakan bulan dengan isian ini.
 */
export function buildSyncPlan(entries: SignedEntry[], targets: PlanTarget[], period: string) {
  const active = entries.filter((e) => !e.deleted).map((e) => ({ ...e, status: "ready" }));
  return buildRenaksiPlan(active, targets, period);
}

/** Butir e-Kinerja yang tidak dikenal LifeOS → calon entri baru (impor), dikelompokkan per RHK & renaksi. */
export interface ImportCandidate {
  targetId: string;
  description: string;
  realization?: string;
  timeRealization?: string;
  documentUrl: string;
  indicators: string[];
}

/**
 * Butir di baris e-Kinerja yang tidak berasal dari entri LifeOS mana pun (isi sekarang, isi saat terakhir dikirim, atau
 * entri yang ditandai hapus) → entri baru agar LifeOS sama dengan e-Kinerja. Butir dipasangkan per urutan (renaksi ke-i,
 * realisasi ke-i, bukti ke-i); indikator satu RHK dengan renaksi & bukti sama digabung menjadi satu entri.
 */
export function importCandidates(
  rows: FilledRow[],
  entries: (SignedEntry & { pushed?: PlanEntry })[],
  targets: PlanTarget[],
): ImportCandidate[] {
  const known = new Set<string>();
  for (const entry of entries) {
    for (const source of [entry, entry.pushed].filter((x): x is PlanEntry => !!x)) {
      const target = targets.find((t) => t.id === source.targetId);
      for (const item of entryItems(source, target)) known.add(`${item.key}|renaksi|${normalize(item.value)}`);
    }
  }
  const candidates: ImportCandidate[] = [];
  for (const row of rows) {
    const match = targets
      .flatMap((t) => (t.indicators ?? []).map((i) => ({ t, i })))
      .find(({ t, i }) => rowKey(t.name, i.indicator) === row.key);
    if (!match) continue;
    const time = isTime(match.i);
    const count = Math.max(row.renaksi.length, row.realisasi.length, row.bukti.length);
    for (let n = 0; n < count; n++) {
      const description = row.renaksi[n] ?? row.renaksi.at(-1) ?? "";
      if (!description || known.has(`${row.key}|renaksi|${normalize(description)}`)) continue;
      const documentUrl = row.bukti[n] ?? row.bukti.at(-1) ?? "";
      const realisasi = row.realisasi[n] ?? "";
      let entry = candidates.find(
        (c) =>
          c.targetId === match.t.id &&
          normalize(c.description) === normalize(description) &&
          normalize(c.documentUrl) === normalize(documentUrl),
      );
      if (!entry) {
        entry = { targetId: match.t.id, description, documentUrl, indicators: [] };
        candidates.push(entry);
      }
      if (!entry.indicators.includes(match.i.indicator)) entry.indicators.push(match.i.indicator);
      if (time) entry.timeRealization = realisasi || entry.timeRealization;
      else entry.realization = realisasi || entry.realization;
    }
  }
  return candidates;
}

/** Entri yang semua butirnya terbaca di bulan e-Kinerja (sama dengan `filledEntries`, per entri). */
export const entryPresent = (entry: PlanEntry, target: PlanTarget | undefined, rows: FilledRow[]) =>
  filledEntries([entry], target ? [target] : [], rows).length > 0;

/**
 * Baris e-Kinerja yang berisi butir → baris kosong (rhk + indikator tanpa butir) untuk mode sinkron: dipakai saat semua
 * isian bulan dihapus di LifeOS, karena e-Kinerja tidak mengizinkan bulan tanpa indikator.
 */
export function emptyRows(rows: FilledRow[], targets: PlanTarget[]): RenaksiRow[] {
  return rows
    .filter((r) => r.renaksi.length + r.realisasi.length + r.bukti.length > 0)
    .flatMap((r) => {
      const match = targets
        .flatMap((t) => (t.indicators ?? []).map((i) => ({ t, i })))
        .find(({ t, i }) => rowKey(t.name, i.indicator) === r.key);
      return match ? [{ rhk: match.t.name, indicator: match.i.indicator, renaksi: [], realisasi: [], bukti: [] }] : [];
    });
}
