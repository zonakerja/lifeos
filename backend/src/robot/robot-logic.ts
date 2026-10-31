import { createHmac } from "node:crypto";

/**
 * Logika murni konektor robot (tahap 6 docs/AI-AGENT.md §21): katalog sistem, kunci enkripsi sesi, validasi alamat.
 * Diuji di `robot-logic.spec.ts`.
 */

export const ROBOT_SYSTEMS = ["srikandi", "ekinerja"] as const;
export type RobotSystem = (typeof ROBOT_SYSTEMS)[number];

export interface RobotSystemInfo {
  label: string;
  description: string;
  /** Alamat bawaan (kosong = diisi pengguna) */
  defaultUrl: string;
  /** Penanda alamat halaman login khusus sistem (selain penanda umum di service robot) */
  loginMarkers: string[];
  /** Alur yang direncanakan (belum dipetakan sampai halaman sistem dieksplor bersama pengguna) */
  plannedFlows: string[];
  /** Batas tindakan robot pada sistem ini */
  limits: string;
}

export const SYSTEM_INFO: Record<RobotSystem, RobotSystemInfo> = {
  srikandi: {
    label: "SRIKANDI",
    description: "Aplikasi umum bidang kearsipan dinamis (ANRI): naskah dinas keluar/masuk, disposisi, TTE.",
    defaultUrl: "https://srikandi.arsip.go.id",
    loginMarkers: ["/auth/login"],
    plannedFlows: [
      "Isi konsep naskah keluar dari Pengajuan / dokumen ONLYOFFICE (jenis, sifat, hal, tujuan, penandatangan)",
      "Unggah dokumen konsep & lampiran",
      "Ambil PDF bertanda tangan untuk ditautkan ke dokumen final LifeOS",
    ],
    limits:
      "Berhenti di simpan konsep / kirim ke pemeriksa dengan konfirmasi Anda. Robot tidak pernah menandatangani (TTE).",
  },
  ekinerja: {
    label: "e-Kinerja",
    description: "Aplikasi kinerja pegawai: SKP, rencana aksi, realisasi & bukti dukung bulanan.",
    defaultUrl: "",
    loginMarkers: [],
    plannedFlows: [
      "Isi realisasi bulanan per rencana aksi: uraian, jumlah dokumen, tautan dokumen bukti (tautan publik LifeOS)",
      "Ambil daftar SKP / rencana aksi untuk dipetakan ke pekerjaan LifeOS",
    ],
    limits: "Mengisi realisasi setelah pemetaan Anda setujui. Tidak mengajukan/menyetujui penilaian atas nama atasan.",
  },
};

export const isRobotSystem = (value: string): value is RobotSystem =>
  (ROBOT_SYSTEMS as readonly string[]).includes(value);

/** Kunci AES sesi robot diturunkan dari `AI_ENCRYPTION_KEY` (tanpa env baru; tidak sama dengan kunci API key AI). */
export const robotSessionKey = (aiEncryptionKeyHex: string) =>
  createHmac("sha256", Buffer.from(aiEncryptionKeyHex, "hex")).update("lifeos:robot-session:v1").digest("hex");

/** Alamat sistem harus https (http hanya untuk localhost saat pengujian). Mengembalikan origin + path tanpa hash. */
export function normalizeSystemUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  if (url.username || url.password) return null;
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

/** Host tambahan: hanya nama host (tanpa skema/path), huruf kecil, unik, maks. 10. */
export function normalizeHosts(values: string[]) {
  const hosts = values
    .map((v) =>
      v
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/[/?#].*$/, ""),
    )
    .filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h));
  return [...new Set(hosts)].slice(0, 10);
}

/** URL halaman yang dieksplor harus berada di host konektor (alamat utama atau host tambahan, termasuk subdomain). */
export function urlInConnector(url: string, baseUrl: string, extraHosts: string[]) {
  const target = normalizeSystemUrl(url);
  if (!target) return false;
  const host = new URL(target).hostname;
  const hosts = [new URL(baseUrl).hostname, ...extraHosts];
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

export type ConnectorStatus = "none" | "active" | "expired" | "error";

export const STATUS_LABELS: Record<ConnectorStatus, string> = {
  none: "Belum login",
  active: "Sesi aktif",
  expired: "Sesi kedaluwarsa — perlu login ulang",
  error: "Gagal",
};
