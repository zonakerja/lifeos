import type { AutomationAlert, AutomationKind, AutomationRun, AutomationSchedule, RecordType } from "@/types/api";

/** Urutan hari mengikuti cron (0 = Minggu); tampilan dimulai Senin. */
export const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export const TIMEZONES = [
  { value: "Asia/Jakarta", label: "WIB" },
  { value: "Asia/Makassar", label: "WITA" },
  { value: "Asia/Jayapura", label: "WIT" },
] as const;

const tzLabel = (tz: string) => TIMEZONES.find((t) => t.value === tz)?.label ?? tz;
const pad = (n: number) => String(n).padStart(2, "0");

/** "setiap hari" / "Senin–Jumat" / "Senin, Rabu" / "setiap Senin". */
export function describeDays(days: number[]) {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (set.length === 7) return "setiap hari";
  if (set.join(",") === "1,2,3,4,5") return "Senin–Jumat (hari kerja)";
  if (set.length === 1) return `setiap ${DAY_NAMES[set[0]]}`;
  return DAY_ORDER.filter((d) => set.includes(d))
    .map((d) => DAY_NAMES[d])
    .join(", ");
}

/** Ringkasan jadwal satu baris (Bahasa Indonesia). */
export function describeSchedule(schedule: AutomationSchedule) {
  const tz = tzLabel(schedule.timezone);
  switch (schedule.mode) {
    case "daily":
      return `${describeDays(schedule.days)} pukul ${schedule.time.replace(":", ".")} ${tz}`;
    case "hourly": {
      const range =
        schedule.from === schedule.to
          ? `pukul ${pad(schedule.from)}.${pad(schedule.minute)}`
          : `tiap jam ${pad(schedule.from)}.${pad(schedule.minute)}–${pad(schedule.to)}.${pad(schedule.minute)}`;
      return `${describeDays(schedule.days)}, ${range} ${tz}`;
    }
    case "cron":
      return `Pola cron "${schedule.pattern}" (${tz})`;
  }
}

/** Keterangan tugas + tempat tombol manualnya. */
export const KIND_INFO: Record<AutomationKind, { description: string; where: string; path: string }> = {
  ekinerja_session: {
    description:
      "Membuka e-Kinerja dengan sesi tersimpan agar cookie diperbarui & disimpan ulang. Bila sesi habis, Anda langsung diberi notifikasi.",
    where: "Laporan Kinerja → Connector → Cek sesi",
    path: "/kinerja/connector",
  },
  srikandi_session: {
    description:
      "Membuka SRIKANDI dengan sesi tersimpan agar cookie diperbarui & disimpan ulang. Bila sesi habis, Anda langsung diberi notifikasi.",
    where: "SRIKANDI → Connector → Cek sesi",
    path: "/srikandi/connector",
  },
  ekinerja_skp: {
    description: "Membaca daftar SKP & RHK tahun berjalan dari e-Kinerja.",
    where: "Laporan Kinerja → Ambil dari e-Kinerja",
    path: "/kinerja",
  },
  ekinerja_renaksi: {
    description: "Membaca status, isi, dan feedback Rencana Aksi tiap bulan (Pantau e-Kinerja). Tidak mengisi apa pun.",
    where: "Laporan Kinerja → Pantau e-Kinerja",
    path: "/kinerja",
  },
  srikandi_letters: {
    description: "Membaca Daftar Naskah Keluar dan mengambil PDF naskah ber-TTD beserta lampirannya.",
    where: "SRIKANDI → Daftar Naskah Keluar → Ambil dari SRIKANDI",
    path: "/srikandi/outgoing",
  },
  srikandi_references: {
    description: "Membaca referensi menu Pengguna (penandatangan, tujuan, verifikator, tembusan, grup).",
    where: "SRIKANDI → Referensi → Ambil referensi",
    path: "/srikandi/references",
  },
  srikandi_classifications: {
    description: "Membaca Klasifikasi Arsip (± 1.000 baris, beberapa menit).",
    where: "SRIKANDI → Referensi → Ambil klasifikasi",
    path: "/srikandi/references",
  },
};

/** Record yang berubah setelah tugas selesai → dimuat ulang di browser. */
export const KIND_RECORDS: Record<AutomationKind, RecordType[]> = {
  ekinerja_session: [],
  srikandi_session: [],
  ekinerja_skp: ["skp", "skp_target"],
  ekinerja_renaksi: ["action_plan_month", "action_plan_entry"],
  srikandi_letters: ["srikandi_letter", "para_resource"],
  srikandi_references: ["srikandi_reference"],
  srikandi_classifications: ["srikandi_reference"],
};

export const TRIGGER_LABELS: Record<AutomationRun["trigger"], string> = {
  schedule: "Terjadwal",
  manual: "Jalankan sekarang",
  button: "Tombol di menu",
};

export const RUN_STATUS: Record<AutomationRun["status"], { label: string; tone: string }> = {
  queued: { label: "Antre", tone: "bg-info/15 text-info" },
  running: { label: "Berjalan", tone: "bg-info/15 text-info" },
  ok: { label: "Berhasil", tone: "bg-success/15 text-success" },
  failed: { label: "Gagal", tone: "bg-destructive/15 text-destructive" },
  skipped: { label: "Dilewati", tone: "bg-warning/15 text-warning" },
};

/** Pesan gagal karena sesi → arahkan user login ulang di Connector. */
export const needsLogin = (message: string | null) => !!message && /sesi|login/i.test(message);

/** Durasi run "1 mnt 20 dtk". */
export function runDuration(run: Pick<AutomationRun, "startedAt" | "finishedAt">) {
  if (!run.startedAt || !run.finishedAt) return null;
  const seconds = Math.max(0, Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000));
  return seconds < 60 ? `${seconds} dtk` : `${Math.floor(seconds / 60)} mnt ${seconds % 60} dtk`;
}

/** Jadwal awal saat user mengganti jenis di form (nilai sebelumnya dipakai bila ada). */
export function scheduleForMode(mode: AutomationSchedule["mode"], current: AutomationSchedule): AutomationSchedule {
  const days = current.mode === "cron" ? [1, 2, 3, 4, 5] : current.days;
  const timezone = current.timezone;
  switch (mode) {
    case "daily":
      return current.mode === "daily" ? current : { mode, time: "07:00", days, timezone };
    case "hourly":
      return current.mode === "hourly" ? current : { mode, minute: 0, from: 7, to: 17, days, timezone };
    case "cron":
      return current.mode === "cron" ? current : { mode, pattern: "0 7 * * 1-5", timezone };
  }
}

/** Label tombol tindak lanjut notifikasi robot. */
export const alertAction = (alert: Pick<AutomationAlert, "kind">) =>
  alert.kind === "job_failed" ? "Lihat otomasi" : "Login ulang";

/**
 * Notifikasi yang belum pernah ditampilkan (`fresh`) + daftar ID yang diingat berikutnya (`keep` = notifikasi yang masih
 * ada saja, sehingga kejadian yang hilang lalu muncul lagi ditampilkan ulang).
 */
export function newAlerts(alerts: AutomationAlert[], seen: string[]) {
  const seenSet = new Set(seen);
  return { fresh: alerts.filter((a) => !seenSet.has(a.id)), keep: alerts.map((a) => a.id) };
}
