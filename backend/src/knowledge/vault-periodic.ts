import { fillTemplate } from "./vault-editor";
import { wikilink } from "./vault-export";
import { DAILY_MARKER, dailyPath, longDate } from "./vault-daily";

/**
 * Catatan berkala (lanjutan K1, pola plugin Periodic Notes Obsidian): mingguan `Mingguan/YYYY-Www.md` (minggu ISO, Senin–Minggu)
 * dan bulanan `Bulanan/YYYY-MM.md`, dibuat sekali dari templat `90-Templat/Mingguan.md` / `Bulanan.md` (bila ada) + ringkasan
 * agenda & task periode itu + tautan ke catatan harian / mingguan di dalamnya. Setelah dibuat milik user — tidak pernah ditimpa.
 */
export type PeriodKind = "week" | "month";
export const PERIOD_KINDS: readonly PeriodKind[] = ["week", "month"];

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const SHORT_DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const utc = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const ymdOf = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (ymd: string, days: number) => {
  const d = utc(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return ymdOf(d);
};
const pad = (n: number) => String(n).padStart(2, "0");

/** Minggu ISO-8601 (Senin awal minggu; minggu 1 = minggu yang memuat Kamis pertama tahun itu). */
export function isoWeek(ymd: string) {
  const date = utc(ymd);
  const weekday = (date.getUTCDay() + 6) % 7; // Senin = 0
  const start = addDays(ymd, -weekday);
  const thursday = utc(addDays(start, 3));
  const year = thursday.getUTCFullYear();
  const firstThursday = utc(`${year}-01-04`);
  const firstMonday = addDays(ymdOf(firstThursday), -((firstThursday.getUTCDay() + 6) % 7));
  const week = Math.round((utc(start).getTime() - utc(firstMonday).getTime()) / (7 * 86_400_000)) + 1;
  return { year, week, start, end: addDays(start, 6) };
}

/** "2 – 8 November 2026" / "29 Desember 2026 – 4 Januari 2027" */
function rangeLabel(start: string, end: string) {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  if (ys !== ye) return `${ds} ${MONTHS[ms - 1]} ${ys} – ${de} ${MONTHS[me - 1]} ${ye}`;
  if (ms !== me) return `${ds} ${MONTHS[ms - 1]} – ${de} ${MONTHS[me - 1]} ${ye}`;
  return `${ds} – ${de} ${MONTHS[me - 1]} ${ye}`;
}

export interface Period {
  kind: PeriodKind;
  path: string;
  title: string;
  /** Tanggal awal & akhir periode (YMD, inklusif) */
  start: string;
  end: string;
  template: string;
  /** Nilai properti `periode` (2026-W45 / 2026-11) */
  key: string;
}

export function periodOf(kind: PeriodKind, ymd: string): Period {
  if (kind === "week") {
    const w = isoWeek(ymd);
    const key = `${w.year}-W${pad(w.week)}`;
    return {
      kind,
      key,
      path: `Mingguan/${key}.md`,
      title: `Minggu ke-${w.week} ${w.year} · ${rangeLabel(w.start, w.end)}`,
      start: w.start,
      end: w.end,
      template: "90-Templat/Mingguan.md",
    };
  }
  const [y, m] = ymd.split("-").map(Number);
  const start = `${y}-${pad(m)}-01`;
  const end = ymdOf(new Date(Date.UTC(y, m, 0)));
  const key = `${y}-${pad(m)}`;
  return {
    kind,
    key,
    path: `Bulanan/${key}.md`,
    title: `${MONTHS[m - 1]} ${y}`,
    start,
    end,
    template: "90-Templat/Bulanan.md",
  };
}

export interface PeriodicAgenda {
  id: string;
  title: string;
  startDate?: string | null;
  date?: string | null;
}
export interface PeriodicTask {
  title: string;
  completed?: boolean | null;
  dueDate?: string | null;
}
export interface PeriodicInput {
  period: Period;
  appUrl: string;
  agenda: PeriodicAgenda[];
  tasks: PeriodicTask[];
  /** Path berkas cermin 80-LifeOS per `lifeos_id` (mis. `schedule:<id>`) */
  mirror: Map<string, string>;
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const MAX_ITEMS = 60;

/** Daftar tautan catatan harian (mingguan) atau mingguan (bulanan) di dalam periode — tautan belum ada = dibuat saat diklik di Obsidian. */
function periodLinks(period: Period) {
  if (period.kind === "week") {
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(period.start, i);
      const d = utc(day);
      return `[[${dailyPath(day).slice(0, -3)}|${SHORT_DAYS[d.getUTCDay()]} ${d.getUTCDate()}]]`;
    }).join(" · ");
  }
  const weeks: string[] = [];
  for (let day = period.start; day <= period.end; day = addDays(day, 7)) {
    const w = periodOf("week", day);
    if (!weeks.includes(w.key)) weeks.push(w.key);
  }
  const last = periodOf("week", period.end).key;
  if (!weeks.includes(last)) weeks.push(last);
  return weeks.map((key) => `[[Mingguan/${key}|${key.slice(5)}]]`).join(" · ");
}

/** Ringkasan LifeOS periode itu (Markdown). */
export function buildPeriodicSection(input: PeriodicInput) {
  const { period } = input;
  const app = input.appUrl.replace(/\/+$/, "");
  const lines: string[] = [period.kind === "week" ? "## Hari dalam minggu ini" : "## Minggu dalam bulan ini"];
  lines.push(periodLinks(period));

  lines.push("", "## Agenda");
  const agenda = input.agenda
    .map((a) => ({ ...a, day: a.startDate ?? a.date ?? "" }))
    .sort((a, b) => a.day.localeCompare(b.day));
  if (!agenda.length) lines.push("- _Tidak ada agenda._");
  for (const a of agenda.slice(0, MAX_ITEMS)) {
    const file = input.mirror.get(`schedule:${a.id}`);
    const title = file ? wikilink(file, a.title || "Agenda") : `**${clean(a.title || "Agenda")}**`;
    const day = a.day ? `${longDate(a.day).replace(/ \d{4}$/, "")} — ` : "";
    lines.push(`- ${day}${title}`);
  }
  if (agenda.length > MAX_ITEMS) lines.push(`- _…dan ${agenda.length - MAX_ITEMS} agenda lain._`);

  const tasks = [...input.tasks].sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const done = tasks.filter((t) => t.completed).length;
  lines.push("", `## Task jatuh tempo (${done}/${tasks.length} selesai)`);
  if (!tasks.length) lines.push("- _Tidak ada task yang jatuh tempo._");
  for (const t of tasks.slice(0, MAX_ITEMS)) {
    lines.push(
      `- [${t.completed ? "x" : " "}] ${clean(t.title || "Tanpa judul")}${t.dueDate ? ` · ${t.dueDate}` : ""}`,
    );
  }
  if (tasks.length > MAX_ITEMS) lines.push(`- _…dan ${tasks.length - MAX_ITEMS} task lain._`);
  lines.push(
    "",
    `> [!info] Ringkasan LifeOS saat catatan dibuat${app ? ` · [buka Planner](${app}/planner/schedule)` : ""}`,
    "> Centang di catatan ini tidak mengubah LifeOS — selesaikan item di Planner / Productivity.",
  );
  return lines.join("\n");
}

/** Isi berkas catatan berkala: templat (`{{judul}}`, `{{tanggal}}`, `{{jam}}`, `{{lifeos}}`) atau isi bawaan. */
export function buildPeriodicNote(input: { period: Period; section: string; template?: string | null; now: Date }) {
  const { period } = input;
  const [y, m, d] = period.start.split("-").map(Number);
  const at = new Date(y, m - 1, d, input.now.getHours(), input.now.getMinutes());
  if (input.template?.trim()) {
    const filled = fillTemplate(input.template, { title: period.title, now: at });
    return DAILY_MARKER.test(filled)
      ? filled.replace(DAILY_MARKER, () => input.section)
      : `${filled.replace(/\s+$/, "")}\n\n${input.section}\n`;
  }
  const kind = period.kind === "week" ? "mingguan" : "bulanan";
  const prompts =
    period.kind === "week"
      ? ["## Fokus minggu ini", "", "- ", "", "## Refleksi", "", ""]
      : ["## Target bulan ini", "", "- ", "", "## Refleksi", "", ""];
  return [
    "---",
    `jenis: ${kind}`,
    "status: berlaku",
    `periode: ${period.key}`,
    `tanggal: ${period.start}`,
    "tags:",
    `  - ${kind}`,
    "---",
    "",
    `# ${period.title}`,
    "",
    ...prompts,
    input.section,
    "",
  ].join("\n");
}
