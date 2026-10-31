import { formatLocalYMD, MONTH_NAMES } from "@/lib/dates";
import type {
  ActionPlanEntry,
  ActionPlanMonth,
  ActionPlanStatus,
  AttachedResource,
  Resource,
  Skp,
  SkpIndicator,
  SkpTarget,
} from "@/types/entities";

/**
 * Logika murni rencana aksi (Renaksi) e-Kinerja: user memilih sendiri item Productivity yang masuk renaksi bulanan,
 * memetakannya ke RHK, menulis uraian, dan memberi link dokumen. Hasilnya "produk jadi" untuk robot e-Kinerja.
 */

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const isPeriod = (value: unknown): value is string => typeof value === "string" && PERIOD.test(value);

/** Tanggal (YMD lokal atau ISO waktu) → "YYYY-MM". YMD dibaca apa adanya (bukan UTC). */
export function periodOf(value: string | undefined | null): string | null {
  if (!value) return null;
  const ymd = YMD.test(value) ? value : formatLocalYMD(value);
  return ymd ? ymd.slice(0, 7) : null;
}

/** Bulan bawaan entri: tanggal selesai → tenggat/tanggal item → bulan ini. */
export function defaultPeriod(dates: (string | undefined | null)[], today: Date): string {
  for (const d of dates) {
    const p = periodOf(d);
    if (p) return p;
  }
  return formatLocalYMD(today).slice(0, 7);
}

export function periodLabel(period: string): string {
  const m = PERIOD.exec(period);
  return m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}` : period;
}

export function shiftPeriod(period: string, delta: number): string {
  const m = PERIOD.exec(period);
  if (!m) return period;
  const index = Number(m[1]) * 12 + Number(m[2]) - 1 + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export const periodYear = (period: string) => Number(period.slice(0, 4));

const byOrder = (a: SkpTarget, b: SkpTarget) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "id");

/** RHK manual (tanpa SKP) satu tahun, urut `order` lalu nama. */
export function targetsForYear(targets: SkpTarget[], year: number): SkpTarget[] {
  return targets.filter((t) => t.year === year && !t.skpId).sort(byOrder);
}

/** RHK milik satu SKP (hasil robot), urut seperti di e-Kinerja. */
export const targetsForSkp = (targets: SkpTarget[], skpId: string) =>
  targets.filter((t) => t.skpId === skpId).sort(byOrder);

const monthEnd = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return `${period}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};

/**
 * SKP yang periodenya mencakup bulan itu. Satu tahun bisa beberapa SKP (mis. Jan–Apr & Mei–Des); bila SKP dipecah di
 * tengah bulan, bulan itu punya dua SKP dan user memilih salah satunya.
 */
export function skpsForPeriod(skps: Skp[], period: string): Skp[] {
  if (!isPeriod(period)) return [];
  const start = `${period}-01`;
  const end = monthEnd(period);
  return skps
    .filter((s) => s.startDate <= end && s.endDate >= start)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** SKP yang beririsan dengan satu tahun, urut periode. */
export const skpsForYear = (skps: Skp[], year: number) =>
  skps
    .filter((s) => s.startDate <= `${year}-12-31` && s.endDate >= `${year}-01-01`)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const shortDate = (ymd: string) =>
  `${Number(ymd.slice(8, 10))} ${SHORT_MONTHS[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}`;

/** "1 Mei 2025 – 31 Des 2025" */
export const skpPeriodLabel = (skp: Pick<Skp, "startDate" | "endDate">) =>
  `${shortDate(skp.startDate)} – ${shortDate(skp.endDate)}`;

/**
 * Pilihan RHK untuk entri: SKP yang dipilih (atau satu-satunya SKP bulan itu) → RHK-nya; tanpa SKP tersinkron →
 * RHK manual tahun itu.
 */
export function targetOptions(skps: Skp[], targets: SkpTarget[], period: string, skpId?: string) {
  const candidates = skpsForPeriod(skps, period);
  const skp = candidates.find((s) => s.id === skpId) ?? (candidates.length === 1 ? candidates[0] : undefined);
  if (candidates.length) return { candidates, skp, targets: skp ? targetsForSkp(targets, skp.id) : [] };
  return { candidates, skp: undefined, targets: targetsForYear(targets, periodYear(period)) };
}

/** Realisasi bawaan indikator aspek WAKTU (pola isian e-Kinerja user). */
export const DEFAULT_TIME_REALIZATION = "Penyampaian tepat waktu";

export const isTimeIndicator = (indicator: Pick<SkpIndicator, "aspect">) => /waktu/i.test(indicator.aspect);

/** Indikator RHK yang dipakai entri: pilihan user (`indicators`) atau semua indikator RHK. */
export function entryIndicators(entry: Pick<ActionPlanEntry, "indicators">, target?: SkpTarget | null) {
  const all = target?.indicators ?? [];
  const chosen = entry.indicators?.length ? all.filter((i) => entry.indicators!.includes(i.indicator)) : [];
  return chosen.length ? chosen : all;
}

/** Realisasi yang ditulis untuk satu indikator: aspek WAKTU → realisasi waktu, lainnya → realisasi. */
export const indicatorRealization = (
  entry: Pick<ActionPlanEntry, "realization" | "timeRealization">,
  indicator: Pick<SkpIndicator, "aspect">,
) =>
  isTimeIndicator(indicator)
    ? entry.timeRealization?.trim() || DEFAULT_TIME_REALIZATION
    : (entry.realization ?? "").trim();

/** Realisasi wajib bila ada indikator non-WAKTU (atau RHK manual tanpa indikator). */
const needsRealization = (entry: Pick<ActionPlanEntry, "indicators">, target?: SkpTarget | null) => {
  const indicators = entryIndicators(entry, target);
  return !indicators.length || indicators.some((i) => !isTimeIndicator(i));
};

type StatusFields = Pick<
  ActionPlanEntry,
  "targetId" | "description" | "documentUrl" | "realization" | "indicators" | "status"
>;

/** Entri lengkap (RHK + rencana aksi + realisasi + bukti) = siap diisikan robot; terisi tetap terisi. */
export function entryStatus(entry: StatusFields, target?: SkpTarget | null) {
  if (entry.status === "filled") return "filled" as ActionPlanStatus;
  return (missingFields(entry, target).length ? "draft" : "ready") as ActionPlanStatus;
}

export const STATUS_LABELS: Record<ActionPlanStatus, string> = {
  draft: "Belum lengkap",
  ready: "Siap diisikan",
  filled: "Terisi di e-Kinerja",
};

/** Kekurangan entri untuk ditampilkan ke user. */
export function missingFields(entry: Omit<StatusFields, "status">, target?: SkpTarget | null): string[] {
  const missing: string[] = [];
  if (!entry.targetId) missing.push("RHK");
  if (!entry.description.trim()) missing.push("rencana aksi");
  if (needsRealization(entry, target) && !entry.realization?.trim()) missing.push("realisasi");
  if (!entry.documentUrl?.trim()) missing.push("bukti data dukung");
  return missing;
}

export interface DocumentOption {
  id: string;
  label: string;
  /** url = tautan web siap pakai; file = berkas LifeOS (perlu tautan publik) */
  kind: "url" | "file";
  url?: string;
  uploadId?: string;
}

/**
 * Kandidat link dokumen dari lampiran item: web link langsung, berkas LifeOS (dibuatkan tautan publik saat disimpan),
 * resource global yang dirujuk (link/berkasnya). Lampiran catatan dilewati (tidak bisa dibuka pihak luar).
 */
export function documentOptions(attachments: AttachedResource[] | undefined, resources: Resource[]): DocumentOption[] {
  const options: DocumentOption[] = [];
  const seen = new Set<string>();
  const push = (o: DocumentOption) => {
    const key = o.url ?? o.uploadId ?? o.id;
    if (seen.has(key)) return;
    seen.add(key);
    options.push(o);
  };
  for (const a of attachments ?? []) {
    const label = a.name || a.title || a.url || "Lampiran";
    if (a.type === "link" && a.url) push({ id: a.id, label, kind: "url", url: a.url });
    else if (a.type === "file" && a.uploadId) push({ id: a.id, label, kind: "file", uploadId: a.uploadId });
    else if (a.type === "existing" && a.existingId) {
      const r = resources.find((x) => x.id === a.existingId);
      if (r?.uploadId) push({ id: a.id, label: r.title || label, kind: "file", uploadId: r.uploadId });
      else if (r?.url) push({ id: a.id, label: r.title || label, kind: "url", url: r.url });
    }
  }
  return options;
}

/** Uraian bawaan: judul item (+ keterangan singkat bila ada). User selalu menyuntingnya sebelum disimpan. */
export function defaultDescription(title: string, description?: string): string {
  const extra = description?.trim().split(/\n+/)[0]?.slice(0, 200);
  return extra && extra !== title.trim() ? `${title.trim()} — ${extra}` : title.trim();
}

export const entriesOfSource = (entries: ActionPlanEntry[], sourceId: string) =>
  entries.filter((e) => e.sourceId === sourceId);

/** Kelompok entri satu bulan per RHK (urut RHK; entri tanpa RHK di akhir). */
export function groupByTarget(entries: ActionPlanEntry[], targets: SkpTarget[]) {
  const ordered = [...targets].sort(byOrder);
  const groups = ordered
    .map((target) => ({ target, entries: entries.filter((e) => e.targetId === target.id) }))
    .filter((g) => g.entries.length);
  const known = new Set(targets.map((t) => t.id));
  const orphan = entries.filter((e) => !e.targetId || !known.has(e.targetId));
  return orphan.length ? [...groups, { target: null, entries: orphan }] : groups;
}

// ---------------------------------------------------------------- Pemantauan e-Kinerja & pengenal perubahan

const tidyText = (text: string) => text.replace(/\s+/g, " ").trim();
/** Sama dengan backend/robot `normalize`: spasi, huruf besar/kecil, tanda baca ujung. */
export const normalizeText = (text: string) =>
  tidyText(text)
    .toLowerCase()
    .replace(/[.;,]+$/, "");

type SignatureFields = Pick<
  ActionPlanEntry,
  "targetId" | "description" | "realization" | "timeRealization" | "documentUrl" | "indicators"
>;

/** Tanda tangan isi entri — **harus sama** dengan backend `entrySignature` (`robot/ekinerja-renaksi.ts`). */
export function entrySignature(entry: SignatureFields) {
  return JSON.stringify([
    entry.targetId ?? "",
    normalizeText(entry.description ?? ""),
    normalizeText(entry.realization ?? ""),
    normalizeText(entry.timeRealization ?? ""),
    normalizeText(entry.documentUrl ?? ""),
    [...(entry.indicators ?? [])].map(normalizeText).sort(),
  ]);
}

/** Entri terisi yang isinya diubah setelah dikirim ke e-Kinerja. */
export const isChanged = (entry: ActionPlanEntry) =>
  entry.status === "filled" && !!entry.pushedSignature && entry.pushedSignature !== entrySignature(entry);

/** Bulan yang sudah diajukan / dinilai di e-Kinerja: isian LifeOS bulan itu terkunci. */
export const isLockedMonth = (month?: Pick<ActionPlanMonth, "status"> | null) =>
  month?.status === "submitted" || month?.status === "rated";

/** Potret bulan e-Kinerja untuk periode & SKP (SKP tidak diketahui → potret pertama periode itu). */
export const monthOf = (months: ActionPlanMonth[], period: string, skpId?: string) =>
  months.find((m) => m.period === period && (!skpId || m.skpId === skpId)) ?? null;

/** Kunci baris e-Kinerja ("RHK <nama> Indikator <indikator>") — sama dengan robot `rowKey`. */
export const ekinRowKey = (rhk: string, indicator: string) => normalizeText(`RHK ${rhk} Indikator ${indicator}`);

/** Semua butir entri ada di potret bulan e-Kinerja (renaksi, realisasi per indikator, bukti). */
export function entryInMonth(entry: ActionPlanEntry, target: SkpTarget | null | undefined, month: ActionPlanMonth) {
  if (!target) return false;
  const indicators = entryIndicators(entry, target);
  if (!indicators.length) return false;
  const has = (list: string[], value: string) => list.some((v) => normalizeText(v) === normalizeText(value));
  return indicators.every((i) => {
    const row = month.rows?.find((r) => r.key === ekinRowKey(target.name, i.indicator));
    return (
      !!row &&
      has(row.renaksi, entry.description) &&
      has(row.realisasi, indicatorRealization(entry, i)) &&
      has(row.bukti, entry.documentUrl ?? "")
    );
  });
}

/** Status tampilan entri (gabungan isian LifeOS + potret e-Kinerja). */
export type DisplayStatus = ActionPlanStatus | "changed" | "deleted" | "missing" | "locked";

export function displayStatus(
  entry: ActionPlanEntry,
  target: SkpTarget | null | undefined,
  month: ActionPlanMonth | null,
): DisplayStatus {
  if (isLockedMonth(month)) return "locked";
  if (entry.deleted) return "deleted";
  if (isChanged(entry)) return "changed";
  const base = entryStatus(entry, target);
  // Terisi menurut LifeOS tetapi butirnya tidak ada lagi di potret e-Kinerja (diubah langsung di e-Kinerja)
  if (base === "filled" && month?.status === "draft" && !entryInMonth(entry, target, month)) return "missing";
  return base;
}

export const DISPLAY_LABELS: Record<DisplayStatus, string> = {
  ...STATUS_LABELS,
  changed: "Berubah — perlu dikirim",
  deleted: "Akan dihapus dari e-Kinerja",
  missing: "Tidak ada di e-Kinerja",
  locked: "Terkunci — sudah diajukan",
};

/** Status yang perlu dikirim ke e-Kinerja dengan "Kirim perubahan". */
export const isPending = (status: DisplayStatus) =>
  status === "ready" || status === "changed" || status === "deleted" || status === "missing";

export const MONTH_STATUS_LABELS: Record<ActionPlanMonth["status"], string> = {
  empty: "Belum diisi di e-Kinerja",
  unavailable: "Belum dibuka di e-Kinerja",
  draft: "Draf di e-Kinerja — belum dikirim ke atasan",
  submitted: "Sudah dikirim ke atasan — menunggu penilaian",
  rated: "Sudah dinilai atasan",
};
