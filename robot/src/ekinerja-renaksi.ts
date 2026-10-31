/**
 * Logika murni pengisian Rencana Aksi e-Kinerja (`/skp/renaksi/<id SKP>`, diuji di `ekinerja-renaksi.test.ts`).
 *
 * Alur halaman: satu blok per bulan → "Isi Rencana Aksi Kerja Bulan <bulan>" (bulan kosong) / "Edit Rencana Aksi Kerja"
 * (bulan berisi) membuka modal "Pilih Indikator Kinerja" → centang indikator → Simpan → tiap baris indikator punya tombol
 * Isi Rencana Aksi / Isi Realisasi / Isi Bukti Data Dukung (modal satu textarea; setiap Simpan **menambah** butir, tidak
 * ada ubah/hapus per butir). Karena itu robot hanya menambah butir yang belum ada (idempoten), tidak pernah melepas
 * centang (= menghapus baris beserta isinya), dan tidak pernah menekan "Kirim Penilaian Ke Atasan".
 */

export const MONTH_NAMES = [
  "januari",
  "februari",
  "maret",
  "april",
  "mei",
  "juni",
  "juli",
  "agustus",
  "september",
  "oktober",
  "november",
  "desember",
];

export type RenaksiKind = "renaksi" | "realisasi" | "bukti";

/** Isian satu baris indikator (dari LifeOS). Tiap nilai = satu butir bernomor di e-Kinerja. */
export interface RenaksiRow {
  rhk: string;
  indicator: string;
  renaksi: string[];
  realisasi: string[];
  bukti: string[];
}

/** Baris indikator yang terbaca di tabel bulan. */
export interface MonthRow {
  key: string;
  renaksi: string[];
  realisasi: string[];
  bukti: string[];
}

/** Tombol yang tidak pernah diklik robot. */
export const FORBIDDEN_BUTTON = /kirim|ajukan|submit|hapus|delete/i;

export const BUTTON_LABELS: Record<RenaksiKind, string> = {
  renaksi: "Isi Rencana Aksi",
  realisasi: "Isi Realisasi",
  bukti: "Isi Bukti Data Dukung",
};

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();
/** Pembanding longgar: spasi, huruf besar/kecil, tanda baca ujung. */
export const normalize = (text: string) =>
  tidy(text)
    .toLowerCase()
    .replace(/[.;,]+$/, "");

/** Kunci baris = teks sel Indikator e-Kinerja ("RHK <nama> Indikator <indikator>"). */
export const rowKey = (rhk: string, indicator: string) => normalize(`RHK ${rhk} Indikator ${indicator}`);

export const monthName = (period: string) => {
  const m = /^\d{4}-(0[1-9]|1[0-2])$/.exec(period);
  return m ? MONTH_NAMES[Number(m[1]) - 1] : null;
};

/** Teks elemen yang menandai awal blok bulan ("oktober", "oktober  Belum ada pengisian …"). */
export function monthOfHeading(text: string): string | null {
  const first = normalize(text).split(" ")[0] ?? "";
  return MONTH_NAMES.includes(first) ? first : null;
}

/** Indikator yang perlu dicentang = yang diminta dan belum tercentang (centang yang ada tidak pernah dilepas). */
export function indicatorsToCheck(modalKeys: { key: string; checked: boolean }[], wanted: RenaksiRow[]) {
  const want = new Set(wanted.map((r) => rowKey(r.rhk, r.indicator)));
  const missing = [...want].filter((k) => !modalKeys.some((m) => m.key === k));
  return {
    check: modalKeys.filter((m) => want.has(m.key) && !m.checked).map((m) => m.key),
    missing,
  };
}

export interface FillStep {
  key: string;
  kind: RenaksiKind;
  value: string;
}

/** Butir yang masih perlu ditambahkan (yang sudah ada di e-Kinerja dilewati — aman dijalankan ulang). */
export function plannedSteps(rows: MonthRow[], wanted: RenaksiRow[]): { steps: FillStep[]; missing: string[] } {
  const steps: FillStep[] = [];
  const missing: string[] = [];
  for (const want of wanted) {
    const key = rowKey(want.rhk, want.indicator);
    const row = rows.find((r) => r.key === key);
    if (!row) {
      missing.push(key);
      continue;
    }
    for (const kind of ["renaksi", "realisasi", "bukti"] as RenaksiKind[]) {
      const have = new Set(row[kind].map(normalize));
      for (const value of want[kind]) {
        const v = tidy(value);
        if (!v || have.has(normalize(v))) continue;
        have.add(normalize(v));
        steps.push({ key, kind, value: v });
      }
    }
  }
  return { steps, missing };
}

/** Keadaan satu bulan di halaman Rencana Aksi. */
export type MonthStatus = "empty" | "unavailable" | "draft" | "submitted" | "rated";

export interface MonthSummary {
  status: MonthStatus;
  /** Tanggal pengajuan ke atasan (YYYY-MM-DD) */
  submittedAt?: string;
  /** "Hari Kerja Ke-n" saat diajukan */
  workday?: number;
  ratings?: { hasilKerja?: string; perilaku?: string; predikat?: string; tunkin?: string };
}

/**
 * Ringkasan blok bulan dari teks lepasnya ("juli Rating Hasil Kerja : SESUAI … Tanggal Pengajuan Penilaiaan : 08-07-2026
 * ( Hari Kerja Ke-6 )") + tombol yang ada. Dinilai = ada rating; diajukan = tanggal pengajuan / tidak ada tombol tetapi
 * berisi; draf = tombol Edit; kosong = tombol Isi; tanpa tombol & tanpa isi = bulan belum dibuka.
 */
export function monthSummary(text: string, canFill: boolean, canEdit: boolean, rowCount: number): MonthSummary {
  const t = tidy(text);
  const field = (label: string) => {
    const m = new RegExp(`${label}\\s*:\\s*(.+?)(?=\\s+(?:Rating|Predikat|Persentase|Cetak|Tanggal)\\b|$)`, "i").exec(
      t,
    );
    return m ? m[1].trim() : undefined;
  };
  const date = /Tanggal Pengajuan Penilaia+n\s*:\s*(\d{2})-(\d{2})-(\d{4})/i.exec(t);
  const workday = /Hari Kerja Ke-(\d+)/i.exec(t);
  const hasilKerja = field("Rating Hasil Kerja");
  const base = {
    ...(date ? { submittedAt: `${date[3]}-${date[2]}-${date[1]}` } : {}),
    ...(workday ? { workday: Number(workday[1]) } : {}),
  };
  if (hasilKerja) {
    return {
      status: "rated",
      ...base,
      ratings: {
        hasilKerja,
        perilaku: field("Rating Perilaku Kerja"),
        predikat: field("Predikat"),
        tunkin: field("Persentase Tunkin \\(%\\)"),
      },
    };
  }
  if (canEdit) return { status: "draft", ...base };
  if (date || (!canFill && rowCount > 0)) return { status: "submitted", ...base };
  if (canFill) return { status: "empty" };
  return { status: "unavailable" };
}

/**
 * Rencana sinkron satu bulan draf (LifeOS = sumber kebenaran isi): indikator baru dicentang, indikator yang tidak diminta
 * lagi dilepas, dan baris yang memuat butir di luar isian LifeOS **ditulis ulang** (lepas centang = semua butirnya
 * terhapus, centang lagi, isi ulang) karena e-Kinerja tidak punya ubah/hapus per butir. Baris yang hanya kekurangan butir
 * cukup ditambah. Bulan tidak bisa dikosongkan (minimal satu indikator).
 */
export function syncPlan(rows: MonthRow[], wanted: RenaksiRow[]) {
  const wantedKeys = wanted.map((r) => rowKey(r.rhk, r.indicator));
  const haveKeys = rows.map((r) => r.key);
  const check = wantedKeys.filter((k) => !haveKeys.includes(k));
  // Baris kosong (belum ada butir) tidak dilepas: tidak berisi data dan bisa jadi sengaja disiapkan pemilik di e-Kinerja
  const hasItems = (r: MonthRow) => r.renaksi.length + r.realisasi.length + r.bukti.length > 0;
  const uncheck = wanted.length ? rows.filter((r) => hasItems(r) && !wantedKeys.includes(r.key)).map((r) => r.key) : [];
  const rewrite = wanted
    .map((w) => ({ w, row: rows.find((r) => r.key === rowKey(w.rhk, w.indicator)) }))
    .filter(({ w, row }) => {
      if (!row) return false;
      return (["renaksi", "realisasi", "bukti"] as RenaksiKind[]).some((kind) => {
        const want = new Set(w[kind].map(normalize));
        return row[kind].some((v) => !want.has(normalize(v)));
      });
    })
    .map(({ w }) => rowKey(w.rhk, w.indicator));
  return { check, uncheck, rewrite };
}

/**
 * Langkah modal "Pilih Indikator Kinerja": lintasan 1 melepas (tidak diminta + ditulis ulang) dan mencentang yang baru;
 * lintasan 2 mencentang kembali baris yang ditulis ulang. Bila lintasan 1 akan mengosongkan bulan, satu indikator
 * sementara dicentang lalu dilepas lagi di lintasan 2. null = tidak bisa (semua indikator SKP harus ditulis ulang).
 */
export function modalPasses(
  modalKeys: string[],
  checked: string[],
  plan: { check: string[]; uncheck: string[]; rewrite: string[] },
) {
  const drop = new Set([...plan.uncheck, ...plan.rewrite]);
  const after = new Set([...checked.filter((k) => !drop.has(k)), ...plan.check]);
  let temp: string | null = null;
  if (!after.size && plan.rewrite.length) {
    temp = modalKeys.find((k) => !drop.has(k)) ?? null;
    if (!temp) return null;
  }
  const first = {
    check: [...plan.check, ...(temp ? [temp] : [])].filter((k) => !checked.includes(k)),
    uncheck: checked.filter((k) => drop.has(k)),
  };
  const second = plan.rewrite.length ? { check: plan.rewrite, uncheck: temp ? [temp] : [] } : null;
  return { first, second };
}

/** Sel "Rencana Aksi dan Realisasi": judul bagian diikuti daftar butir; "Belum diisi" = kosong. */
export function parseItems(sections: { label: string; items: string[] }[]) {
  const pick = (label: RegExp) =>
    sections
      .filter((s) => label.test(s.label))
      .flatMap((s) => s.items)
      .map(tidy)
      .filter((t) => t && !/^belum diisi$/i.test(t));
  return {
    renaksi: pick(/^renaksi/i),
    realisasi: pick(/^realisasi/i),
    bukti: pick(/^bukti/i),
  };
}

const MAX_TEXT = 2000;

/** Validasi masukan job (dari backend). */
export function validRows(value: unknown): RenaksiRow[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 60) return null;
  const texts = (v: unknown) =>
    Array.isArray(v) && v.length <= 30 && v.every((x) => typeof x === "string" && x.length <= MAX_TEXT)
      ? (v as string[])
      : null;
  const rows: RenaksiRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const r = item as Record<string, unknown>;
    const renaksi = texts(r.renaksi);
    const realisasi = texts(r.realisasi);
    const bukti = texts(r.bukti);
    if (typeof r.rhk !== "string" || typeof r.indicator !== "string" || !r.rhk.trim() || !r.indicator.trim()) {
      return null;
    }
    if (!renaksi || !realisasi || !bukti) return null;
    rows.push({ rhk: r.rhk, indicator: r.indicator, renaksi, realisasi, bukti });
  }
  return rows;
}
