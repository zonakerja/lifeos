import { ROBOT_JOB_KINDS, ROBOT_JOBS, type RobotJobKind } from "../robot/robot-jobs";
import type { RobotSystem } from "../robot/robot-logic";

/**
 * Jadwal otomasi (Tools → Otomasi). Disimpan terstruktur agar mudah diatur dari UI, lalu diterjemahkan ke pola cron
 * BullMQ. Semua bentuk dibatasi **paling sering sekali per jam** — robot membuka sistem pemerintah, jangan dibanjiri.
 */
export const AUTOMATION_TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"] as const;
export type AutomationTimezone = (typeof AUTOMATION_TIMEZONES)[number];

export type AutomationSchedule =
  /** Setiap hari terpilih pada jam `time` (HH:mm). Mingguan = satu hari terpilih. */
  | { mode: "daily"; time: string; days: number[]; timezone: AutomationTimezone }
  /** Setiap jam pada menit `minute`, dari jam `from` s.d. `to` (termasuk), di hari terpilih. */
  | { mode: "hourly"; minute: number; from: number; to: number; days: number[]; timezone: AutomationTimezone }
  /** Pola cron 5 kolom; kolom menit harus satu angka (maks. sekali per jam). */
  | { mode: "cron"; pattern: string; timezone: AutomationTimezone };

export const AUTOMATION_KINDS = ROBOT_JOB_KINDS;
export type AutomationKind = RobotJobKind;

const WEEKDAYS = [1, 2, 3, 4, 5];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const TZ: AutomationTimezone = "Asia/Jakarta";

/** Jadwal bawaan (sesuai kebutuhan pemilik: e-Kinerja tiap pagi, naskah tiap jam kerja, klasifikasi mingguan). */
export const DEFAULT_SCHEDULES: Record<AutomationKind, AutomationSchedule> = {
  // Jaga sesi tiap jam kerja (menit ke-30 agar tidak bertumpuk dengan sinkron menit ke-0)
  ekinerja_session: { mode: "hourly", minute: 30, from: 7, to: 17, days: WEEKDAYS, timezone: TZ },
  srikandi_session: { mode: "hourly", minute: 30, from: 7, to: 17, days: WEEKDAYS, timezone: TZ },
  ekinerja_skp: { mode: "daily", time: "07:00", days: EVERY_DAY, timezone: TZ },
  ekinerja_renaksi: { mode: "daily", time: "07:05", days: EVERY_DAY, timezone: TZ },
  srikandi_letters: { mode: "hourly", minute: 0, from: 7, to: 17, days: WEEKDAYS, timezone: TZ },
  srikandi_references: { mode: "daily", time: "07:00", days: EVERY_DAY, timezone: TZ },
  srikandi_classifications: { mode: "daily", time: "07:00", days: [1], timezone: TZ },
};

export const isAutomationKind = (value: string): value is AutomationKind =>
  (AUTOMATION_KINDS as readonly string[]).includes(value);

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

function cleanDays(value: unknown): number[] | string {
  if (!Array.isArray(value) || !value.length) return "Pilih minimal satu hari.";
  if (!value.every((d) => isInt(d, 0, 6))) return "Hari tidak valid.";
  return [...new Set(value as number[])].sort((a, b) => a - b);
}

const CRON_LIMITS: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

/** Satu bagian kolom cron: `*`, `n`, atau `a-b`, opsional `/langkah` — tanpa nama hari/bulan. */
function cronPartValid(part: string, [min, max]: [number, number]) {
  const match = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
  if (!match) return false;
  const [, , a, b, step] = match;
  if (step !== undefined && Number(step) === 0) return false;
  if (a === undefined) return true;
  const start = Number(a);
  const end = b === undefined ? start : Number(b);
  return start >= min && end <= max && start <= end;
}

function cronError(pattern: string): string | null {
  const fields = pattern.split(" ");
  if (fields.length !== 5) return "Pola cron harus 5 kolom: menit jam tanggal bulan hari.";
  if (!/^\d+$/.test(fields[0])) return "Kolom menit harus satu angka (paling sering sekali per jam).";
  for (const [index, field] of fields.entries()) {
    if (!field.split(",").every((part) => cronPartValid(part, CRON_LIMITS[index]))) {
      return `Kolom ke-${index + 1} pola cron tidak valid.`;
    }
  }
  return null;
}

/** Validasi + rapikan jadwal dari klien. Mengembalikan pesan kesalahan (string) bila tidak valid. */
export function parseSchedule(input: unknown): AutomationSchedule | string {
  if (!input || typeof input !== "object") return "Jadwal tidak valid.";
  const raw = input as Record<string, unknown>;
  const timezone = raw.timezone ?? TZ;
  if (!(AUTOMATION_TIMEZONES as readonly unknown[]).includes(timezone)) return "Zona waktu tidak dikenal.";
  const tz = timezone as AutomationTimezone;
  switch (raw.mode) {
    case "daily": {
      const time = typeof raw.time === "string" ? raw.time : "";
      const match = /^(\d{2}):(\d{2})$/.exec(time);
      if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return "Jam tidak valid (HH:mm).";
      const days = cleanDays(raw.days);
      if (typeof days === "string") return days;
      return { mode: "daily", time, days, timezone: tz };
    }
    case "hourly": {
      if (!isInt(raw.minute, 0, 59)) return "Menit harus 0–59.";
      if (!isInt(raw.from, 0, 23) || !isInt(raw.to, 0, 23)) return "Rentang jam harus 0–23.";
      if (raw.to < raw.from) return "Jam selesai tidak boleh sebelum jam mulai.";
      const days = cleanDays(raw.days);
      if (typeof days === "string") return days;
      return { mode: "hourly", minute: raw.minute, from: raw.from, to: raw.to, days, timezone: tz };
    }
    case "cron": {
      const pattern = typeof raw.pattern === "string" ? raw.pattern.trim().replace(/\s+/g, " ") : "";
      const error = cronError(pattern);
      return error ?? { mode: "cron", pattern, timezone: tz };
    }
    default:
      return "Jenis jadwal tidak dikenal.";
  }
}

const dayField = (days: number[]) => (days.length === 7 ? "*" : days.join(","));

/** Jadwal → pola cron 5 kolom (dievaluasi BullMQ di zona waktu jadwal). */
export function toCron(schedule: AutomationSchedule): string {
  switch (schedule.mode) {
    case "daily": {
      const [hour, minute] = schedule.time.split(":").map(Number);
      return `${minute} ${hour} * * ${dayField(schedule.days)}`;
    }
    case "hourly": {
      const hours = schedule.from === schedule.to ? `${schedule.from}` : `${schedule.from}-${schedule.to}`;
      return `${schedule.minute} ${hours} * * ${dayField(schedule.days)}`;
    }
    case "cron":
      return schedule.pattern;
  }
}

/** Tahun berjalan di zona waktu jadwal (dipakai tugas e-Kinerja per tahun). */
export function currentYear(timezone: string, now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric" }).format(now));
}

/** ID job scheduler BullMQ untuk satu jadwal user. */
export const schedulerId = (userId: string, kind: AutomationKind) => `auto:${userId}:${kind}`;

/** Kebalikan `schedulerId` — null bila bukan milik otomasi. */
export function parseSchedulerId(id: string): { userId: string; kind: AutomationKind } | null {
  const match = /^auto:([^:]+):([a-z_]+)$/.exec(id);
  return match && isAutomationKind(match[2]) ? { userId: match[1], kind: match[2] } : null;
}

// ---------------------------------------------------------------- Notifikasi (lonceng & toast di frontend)

const SYSTEM_LABELS: Record<RobotSystem, string> = { ekinerja: "e-Kinerja", srikandi: "SRIKANDI" };
const CONNECTOR_PATHS: Record<RobotSystem, string> = {
  ekinerja: "/kinerja/connector",
  srikandi: "/srikandi/connector",
};

export interface AutomationAlert {
  /** Berubah bila kejadiannya baru (dipakai frontend agar toast tidak diulang). */
  id: string;
  kind: "session_expired" | "session_missing" | "job_failed";
  system: RobotSystem;
  title: string;
  message: string;
  at: Date | null;
  path: string;
}

interface AlertConnector {
  system: string;
  status: string;
  hasSession: boolean;
  lastCheckAt: Date | null;
}

interface AlertJob {
  kind: string;
  enabled: boolean;
  lastStatus: string | null;
  lastMessage: string | null;
  lastRunAt: Date | null;
}

/**
 * Hal robot yang perlu ditindaklanjuti user: sesi kedaluwarsa (jadwal sistem itu dijeda), jadwal aktif tanpa sesi login,
 * dan tugas terjadwal yang gagal karena sebab lain.
 */
export function automationAlerts(connectors: AlertConnector[], jobs: AlertJob[]): AutomationAlert[] {
  const alerts: AutomationAlert[] = [];
  for (const system of ["ekinerja", "srikandi"] as const) {
    const connector = connectors.find((c) => c.system === system);
    const label = SYSTEM_LABELS[system];
    const enabled = jobs.filter((j) => j.enabled && isAutomationKind(j.kind) && ROBOT_JOBS[j.kind].system === system);
    const paused = enabled.length ? ` ${enabled.length} jadwal otomatis ${label} dijeda sampai Anda login ulang.` : "";
    if (connector?.hasSession && connector.status === "expired") {
      alerts.push({
        id: `session_expired:${system}:${connector.lastCheckAt?.toISOString() ?? ""}`,
        kind: "session_expired",
        system,
        title: `Sesi ${label} kedaluwarsa`,
        message: `Login ulang di tab Connector (CAPTCHA/OTP Anda ketik).${paused}`,
        at: connector.lastCheckAt,
        path: CONNECTOR_PATHS[system],
      });
      continue;
    }
    if (!connector?.hasSession) {
      if (enabled.length) {
        alerts.push({
          id: `session_missing:${system}`,
          kind: "session_missing",
          system,
          title: `Belum login ${label}`,
          message: `${enabled.length} jadwal otomatis ${label} aktif tetapi belum ada sesi login. Login di tab Connector.`,
          at: null,
          path: CONNECTOR_PATHS[system],
        });
      }
      continue;
    }
    for (const job of enabled) {
      if (job.lastStatus !== "failed") continue;
      alerts.push({
        id: `job_failed:${job.kind}:${job.lastRunAt?.toISOString() ?? ""}`,
        kind: "job_failed",
        system,
        title: `Otomasi gagal: ${ROBOT_JOBS[job.kind as AutomationKind].label}`,
        message: job.lastMessage ?? "Lihat riwayat di Tools → Otomasi.",
        at: job.lastRunAt,
        path: "/tools/automation",
      });
    }
  }
  return alerts;
}
