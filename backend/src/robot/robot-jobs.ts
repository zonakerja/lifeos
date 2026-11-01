import type { RobotSystem } from "./robot-logic";

/**
 * Tugas robot yang hanya **membaca** sistem asal — satu-satunya yang boleh dijadwalkan (Tools → Otomasi).
 * Pengisian Renaksi & pendaftaran naskah tidak termasuk: selalu dipicu user. `*_session` = jaga sesi: membuka sistem
 * dengan sesi tersimpan agar cookie diperbarui & disimpan ulang, sekaligus mendeteksi sesi kedaluwarsa lebih awal.
 */
export const ROBOT_JOB_KINDS = [
  "ekinerja_session",
  "ekinerja_skp",
  "ekinerja_renaksi",
  "srikandi_session",
  "srikandi_letters",
  "srikandi_references",
  "srikandi_classifications",
] as const;
export type RobotJobKind = (typeof ROBOT_JOB_KINDS)[number];

/** Asal pemicu: jadwal, tombol "Jalankan sekarang" di Otomasi, atau tombol sinkron di menu asal. */
export type RobotJobTrigger = "schedule" | "manual" | "button";

export const ROBOT_JOBS: Record<RobotJobKind, { system: RobotSystem; label: string }> = {
  ekinerja_session: { system: "ekinerja", label: "Jaga sesi login" },
  ekinerja_skp: { system: "ekinerja", label: "Ambil SKP & RHK" },
  ekinerja_renaksi: { system: "ekinerja", label: "Pantau Rencana Aksi" },
  srikandi_session: { system: "srikandi", label: "Jaga sesi login" },
  srikandi_letters: { system: "srikandi", label: "Ambil Daftar Naskah Keluar" },
  srikandi_references: { system: "srikandi", label: "Ambil referensi" },
  srikandi_classifications: { system: "srikandi", label: "Ambil klasifikasi arsip" },
};

export const isRobotJobKind = (value: string): value is RobotJobKind =>
  (ROBOT_JOB_KINDS as readonly string[]).includes(value);

/** Jenis "jaga sesi" milik satu sistem. */
export const sessionJobKind = (system: RobotSystem): RobotJobKind => `${system}_session`;

/** Peristiwa selesai satu tugas sinkron (berhasil atau gagal) — dipakai riwayat Otomasi. */
export interface RobotJobEvent {
  userId: string;
  kind: RobotJobKind;
  trigger: RobotJobTrigger;
  startedAt: Date;
  finishedAt: Date;
  ok: boolean;
  message: string;
}

const num = (value: unknown) => (typeof value === "number" ? value : 0);
const len = (value: unknown) => (Array.isArray(value) ? value.length : 0);

/** Ringkasan hasil sinkron satu baris (Bahasa Indonesia) dari nilai kembalian method RobotService. */
export function summarizeRobotJob(kind: RobotJobKind, result: unknown): string {
  const r = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
  switch (kind) {
    case "ekinerja_session":
    case "srikandi_session":
      return r.status === "active"
        ? "Sesi masih aktif — cookie diperbarui & disimpan"
        : "Sesi kedaluwarsa — login ulang";
    case "ekinerja_skp":
      return `SKP ${num(r.year)}: ${num(r.skps)} SKP, ${num(r.rhk)} RHK`;
    case "ekinerja_renaksi":
      return `${len(r.months)} bulan terbaca dari ${num(r.skps)} SKP, ${num(r.imported)} entri diimpor`;
    case "srikandi_letters":
      return `${num(r.letters)} naskah terbaca, ${num(r.imported)} PDF baru diambil`;
    case "srikandi_references":
    case "srikandi_classifications": {
      const counts = (r.counts && typeof r.counts === "object" ? r.counts : {}) as Record<string, number>;
      const total = Object.values(counts).reduce((sum, n) => sum + (typeof n === "number" ? n : 0), 0);
      return `${total} referensi dari ${Object.keys(counts).length} kategori`;
    }
  }
}
