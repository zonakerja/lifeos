/**
 * Logika murni e-Kinerja Kemenhub (diuji di `ekinerja.test.ts`): membaca daftar SKP (`/skp`) dan tabel Hasil Kerja di
 * Detail SKP (`/skp/detail/<id>`) menjadi data terstruktur. Robot hanya **membaca** halaman ini — tombol Tambah RHK,
 * Ajukan SKP, Edit/Hapus SKP tidak pernah disentuh.
 */

export interface SkpSummary {
  /** Nomor SKP di e-Kinerja (dari tautan /skp/renaksi/<id>) */
  externalId: string;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  status: string;
  approach: string;
  appraiser: string;
}

export interface RhkRow {
  /** UTAMA | TAMBAHAN */
  section: string;
  no: string;
  leader: string;
  rhk: string;
  aspect: string;
  indicator: string;
  target: string;
}

export interface RhkIndicator {
  aspect: string;
  indicator: string;
  target: string;
}

export interface Rhk {
  name: string;
  section: string;
  /** RHK pimpinan yang diintervensi */
  leader: string;
  /** Indikator RHK pimpinan ("Indikator : …" di kolom yang sama) */
  leaderIndicator: string;
  indicators: RhkIndicator[];
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  mei: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  agu: 8,
  agt: 8,
  sep: 9,
  oct: 10,
  okt: 10,
  nov: 11,
  dec: 12,
  des: 12,
};

/** "01-May-2025" → "2025-05-01" (singkatan bulan Inggris/Indonesia); tidak dikenal → null. */
export function parseDmy(value: string): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})[A-Za-z]*-(\d{4})$/.exec(value.trim());
  const month = m ? MONTHS[m[2].toLowerCase()] : undefined;
  if (!m || !month) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const field = (text: string, label: string) => {
  const m = new RegExp(`${label}\\s*:\\s*([^\\n\\t]*)`, "i").exec(text);
  return m ? m[1].trim() : "";
};

/** Satu blok SKP di halaman daftar (teks tabel Periode + Status) + tautan Rencana Aksi-nya. */
export function parseSkpBlock(text: string, renaksiHref: string): SkpSummary | null {
  const id = /\/skp\/renaksi\/(\d+)/.exec(renaksiHref)?.[1];
  const period = /(\d{1,2}-[A-Za-z]{3,9}-\d{4})\s*s\.?\s*d\.?\s*(\d{1,2}-[A-Za-z]{3,9}-\d{4})/i.exec(text);
  const startDate = period && parseDmy(period[1]);
  const endDate = period && parseDmy(period[2]);
  if (!id || !startDate || !endDate) return null;
  return {
    externalId: id,
    startDate,
    endDate,
    status: field(text, "Status"),
    approach: field(text, "Pendekatan"),
    appraiser: field(text, "Pejabat Penilai"),
  };
}

/** SKP yang periodenya beririsan dengan tahun itu (satu tahun bisa terdiri dari beberapa SKP). */
export const overlapsYear = (skp: Pick<SkpSummary, "startDate" | "endDate">, year: number) =>
  skp.startDate <= `${year}-12-31` && skp.endDate >= `${year}-01-01`;

/** Teks tombol aksi e-Kinerja yang bisa ikut terbaca di sel (SKP draft: Edit RHK / Hapus RHK) — bukan narasi. */
const ACTION_LABELS = /\b(Edit|Ubah|Hapus|Tambah)\s+(RHK|Indikator|Rencana Aksi)\b/gi;

const tidy = (text: string) => text.replace(ACTION_LABELS, " ").replace(/\s+/g, " ").trim();

/** Kolom RHK pimpinan memuat "Indikator : …" — pisahkan RHK pimpinan dan indikatornya. */
export function splitLeader(text: string) {
  const [leader, ...rest] = text.split(/Indikator\s*:/i);
  return { leader: tidy(leader ?? ""), indicator: tidy(rest.join(" ")) };
}

export const cleanLeader = (text: string) => splitLeader(text).leader;

/**
 * Baris tabel Hasil Kerja → daftar RHK unik. Satu RHK bisa muncul di beberapa baris (aspek kuantitas, kualitas, waktu);
 * baris-baris itu digabung menjadi satu RHK dengan beberapa indikator, urutan pertama muncul dipertahankan.
 */
export function groupRhk(rows: RhkRow[]): Rhk[] {
  const result: Rhk[] = [];
  for (const row of rows) {
    const name = tidy(row.rhk);
    if (!name) continue;
    const section = tidy(row.section).toUpperCase() || "UTAMA";
    let rhk = result.find((r) => r.name === name && r.section === section);
    if (!rhk) {
      const leader = splitLeader(row.leader);
      rhk = { name, section, leader: leader.leader, leaderIndicator: leader.indicator, indicators: [] };
      result.push(rhk);
    }
    rhk.indicators.push({ aspect: tidy(row.aspect), indicator: tidy(row.indicator), target: tidy(row.target) });
  }
  return result;
}
