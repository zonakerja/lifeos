import { fillTemplate } from "./vault-editor";
import { wikilink } from "./vault-export";

/**
 * Catatan harian (setara core plugin Daily notes Obsidian, K1 docs/AI-AGENT.md §25.6): satu berkas per tanggal di folder
 * `Harian/`, dibuat sekali dari templat `90-Templat/Harian.md` (bila ada) + ringkasan agenda, to-do, dan task hari itu.
 * Setelah dibuat berkas milik user sepenuhnya — LifeOS tidak pernah menimpanya.
 */
export const DAILY_DIR = "Harian";
export const DAILY_TEMPLATE = "90-Templat/Harian.md";
/** Penanda di templat tempat ringkasan LifeOS disisipkan; tanpa penanda ringkasan ditaruh di akhir. */
export const DAILY_MARKER = /\{\{\s*lifeos\s*\}\}/i;

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
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

export const isYmd = (value: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};

/** "Jumat, 6 November 2026" */
export function longDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[day]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

export const dailyPath = (ymd: string) => `${DAILY_DIR}/${ymd}.md`;

export interface DailyAgenda {
  id: string;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  isAllDay?: boolean | null;
  location?: string | null;
}
export interface DailyTodo {
  title: string;
  completed?: boolean | null;
}
export interface DailyTask {
  title: string;
  completed?: boolean | null;
  dueDate?: string | null;
  /** Id project / item Area pemilik task */
  projectId?: string | null;
}
export interface DailyInput {
  date: string;
  appUrl: string;
  agenda: DailyAgenda[];
  todos: DailyTodo[];
  tasks: DailyTask[];
  overdue: DailyTask[];
  /** Nama project / item Area per id */
  parents: Map<string, { title: string; kind: "project" | "activity"; areaId?: string | null }>;
  /** Path berkas cermin 80-LifeOS per `lifeos_id` (mis. `schedule:<id>`, `para_project:<id>`) — tautan wiki bila ada */
  mirror: Map<string, string>;
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

function agendaTime(a: DailyAgenda, date: string) {
  const multi = a.startDate && a.endDate && a.startDate !== a.endDate;
  if (a.isAllDay || (!a.startTime && !a.endTime))
    return multi ? `Sepanjang hari (${a.startDate} – ${a.endDate})` : "Sepanjang hari";
  const start = a.startDate === date || !multi ? (a.startTime ?? "") : "";
  const end = a.endDate === date || !multi ? (a.endTime ?? "") : "";
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  return end ? `s.d. ${end}` : "Berlanjut";
}

/** Ringkasan LifeOS untuk satu tanggal (Markdown). */
export function buildDailySection(input: DailyInput) {
  const app = input.appUrl.replace(/\/+$/, "");
  const open = (path: string) => (app ? ` · [buka](${app}${path})` : "");
  const lines: string[] = [];

  lines.push("## Agenda");
  const agenda = [...input.agenda].sort((a, b) => agendaTime(a, input.date).localeCompare(agendaTime(b, input.date)));
  if (!agenda.length) lines.push("- _Tidak ada agenda._");
  for (const a of agenda) {
    const file = input.mirror.get(`schedule:${a.id}`);
    const title = file ? wikilink(file, a.title || "Agenda") : `**${clean(a.title || "Agenda")}**`;
    const place = a.location ? ` · ${clean(a.location)}` : "";
    lines.push(
      `- ${agendaTime(a, input.date)} ${title}${place}${open(`/planner/daily?date=${input.date}&agenda=${a.id}`)}`,
    );
  }

  const parentLink = (t: DailyTask) => {
    if (!t.projectId) return "";
    const parent = input.parents.get(t.projectId);
    if (!parent) return "";
    const key = parent.kind === "project" ? `para_project:${t.projectId}` : `para_area:${parent.areaId ?? ""}`;
    const file = input.mirror.get(key);
    return ` — ${file ? wikilink(file, parent.title) : clean(parent.title)}`;
  };
  const taskLine = (t: DailyTask, due = false) =>
    `- [${t.completed ? "x" : " "}] ${clean(t.title || "Tanpa judul")}${parentLink(t)}${due && t.dueDate ? ` · tenggat ${t.dueDate}` : ""}`;

  lines.push("", "## To-do");
  if (!input.todos.length && !input.tasks.length) lines.push("- _Tidak ada to-do._");
  for (const t of input.todos) lines.push(`- [${t.completed ? "x" : " "}] ${clean(t.title || "Tanpa judul")}`);
  for (const t of input.tasks) lines.push(taskLine(t));

  if (input.overdue.length) {
    lines.push("", "## Terlambat");
    const overdue = [...input.overdue].sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
    for (const t of overdue) lines.push(taskLine(t, true));
  }
  lines.push(
    "",
    `> [!info] Ringkasan LifeOS saat catatan dibuat${open(`/planner/daily?date=${input.date}`)}`,
    "> Centang di catatan ini tidak mengubah LifeOS — selesaikan item di Planner / Productivity.",
  );
  return lines.join("\n");
}

/**
 * Isi berkas catatan harian: templat (bila ada; `{{tanggal}}`, `{{judul}}`, `{{jam}}`, `{{lifeos}}`) atau isi bawaan.
 * `now` hanya dipakai untuk jam; tanggal selalu dari `date`.
 */
export function buildDailyNote(input: { date: string; section: string; template?: string | null; now: Date }) {
  const [y, m, d] = input.date.split("-").map(Number);
  const at = new Date(y, m - 1, d, input.now.getHours(), input.now.getMinutes());
  const title = longDate(input.date);
  if (input.template?.trim()) {
    const filled = fillTemplate(input.template, { title, now: at });
    return DAILY_MARKER.test(filled)
      ? filled.replace(DAILY_MARKER, () => input.section)
      : `${filled.replace(/\s+$/, "")}\n\n${input.section}\n`;
  }
  return [
    "---",
    "jenis: harian",
    "status: berlaku",
    `tanggal: ${input.date}`,
    "tags:",
    "  - harian",
    "---",
    "",
    `# ${title}`,
    "",
    input.section,
    "",
    "## Catatan",
    "",
    "",
  ].join("\n");
}
