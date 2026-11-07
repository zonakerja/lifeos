import { splitFrontmatter } from "./vault-parser";

/**
 * Tugas lintas vault (K3, docs/AI-AGENT.md §25.6) — pola plugin Tasks Obsidian: baris `- [ ] …` di catatan mana pun,
 * metadata emoji (📅 tenggat, ⏳ dijadwalkan, 🛫 mulai, ✅ selesai, ❌ batal, 🔁 berulang, prioritas 🔺⏫🔼🔽⏬) dan
 * bentuk Dataview `[due:: 2026-11-10]`. Logika murni: membaca & menulis baris tanpa menyentuh berkas.
 */

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "highest" | "high" | "medium" | "low" | "lowest";

export interface VaultTask {
  /** Urutan tugas di catatan (0 = tugas pertama) */
  index: number;
  /** Nomor baris di isi catatan tanpa properti (0 = baris pertama) */
  line: number;
  /** Baris asli apa adanya (kunci pencocokan saat menulis balik) */
  raw: string;
  /** Teks tugas tanpa metadata */
  text: string;
  status: TaskStatus;
  due: string | null;
  scheduled: string | null;
  start: string | null;
  doneDate: string | null;
  priority: TaskPriority | null;
  recurrence: string | null;
  tags: string[];
  /** Judul terdekat di atas tugas (untuk konteks & membuka catatan di judul itu) */
  heading: string | null;
}

/** Baris tugas: prefiks kutipan/callout opsional, indentasi, penanda daftar, `[c]`, teks. */
const TASK_LINE = /^((?:>\s?)*[ \t]*(?:[-*+]|\d+[.)])[ \t]+)\[(.)\](?:[ \t]+(.*))?$/;
const DATE = "(\\d{4}-\\d{2}-\\d{2})";
const EMOJI_DATES: [keyof Pick<VaultTask, "due" | "scheduled" | "start" | "doneDate">, string][] = [
  ["due", "📅"],
  ["scheduled", "⏳"],
  ["start", "🛫"],
  ["doneDate", "✅"],
];
const DATAVIEW_KEYS: Record<string, keyof Pick<VaultTask, "due" | "scheduled" | "start" | "doneDate">> = {
  due: "due",
  tenggat: "due",
  scheduled: "scheduled",
  start: "start",
  completion: "doneDate",
};
const PRIORITY: [string, TaskPriority][] = [
  ["🔺", "highest"],
  ["⏫", "high"],
  ["🔼", "medium"],
  ["🔽", "low"],
  ["⏬", "lowest"],
];
const EMOJI_META = /(?:📅|⏳|🛫|✅|❌|➕)️?\s*\d{4}-\d{2}-\d{2}|🔁️?\s*[^📅⏳🛫✅❌➕🔺⏫🔼🔽⏬^]*|[🔺⏫🔼🔽⏬]️?/gu;
const DATAVIEW_META = /\[(\w+)::\s*([^\]]*)\]/g;
const BLOCK_ID = /\s\^[\w-]+$/;

const statusOf = (char: string): TaskStatus => {
  if (char === "x" || char === "X") return "done";
  if (char === "/") return "in_progress";
  if (char === "-") return "cancelled";
  return "todo";
};

const isFence = (line: string) => /^(?:>\s?)*[ \t]*(```|~~~)/.test(line);

/** Parse satu baris; null bila bukan tugas. */
export function parseTaskLine(raw: string): Omit<VaultTask, "index" | "line" | "heading"> | null {
  const match = TASK_LINE.exec(raw);
  if (!match) return null;
  const body = match[3] ?? "";
  const task: Omit<VaultTask, "index" | "line" | "heading"> = {
    raw,
    text: "",
    status: statusOf(match[2]),
    due: null,
    scheduled: null,
    start: null,
    doneDate: null,
    priority: null,
    recurrence: null,
    tags: [],
  };
  for (const [key, emoji] of EMOJI_DATES) {
    const found = new RegExp(`${emoji}\\uFE0F?\\s*${DATE}`, "u").exec(body);
    if (found) task[key] = found[1];
  }
  for (const [emoji, priority] of PRIORITY) if (body.includes(emoji)) task.priority ??= priority;
  const recur = /🔁️?\s*([^📅⏳🛫✅❌➕🔺⏫🔼🔽⏬^]+)/u.exec(body);
  if (recur) task.recurrence = recur[1].trim() || null;
  for (const m of body.matchAll(DATAVIEW_META)) {
    const key = DATAVIEW_KEYS[m[1].toLowerCase()];
    const value = /^\d{4}-\d{2}-\d{2}/.exec(m[2].trim())?.[0];
    if (key && value) task[key] ??= value;
  }
  task.tags = [...body.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu)].map((m) => m[1]);
  task.text = body
    .replace(EMOJI_META, " ")
    .replace(DATAVIEW_META, " ")
    .replace(BLOCK_ID, "")
    .replace(/\s+/g, " ")
    .trim();
  return task;
}

/**
 * Semua tugas di isi catatan (berkas mentah ATAU isi tanpa properti — properti dibuang lebih dulu sehingga urutan sama).
 * Blok kode dilewati. `skipLifeosSummary` = lewati ringkasan LifeOS di catatan harian (salinan to-do Planner, bukan tugas
 * vault; centangnya memang tidak mengubah LifeOS).
 */
export function parseTasks(text: string, options: { skipLifeosSummary?: boolean } = {}): VaultTask[] {
  const lines = splitFrontmatter(text).body.split("\n");
  const skip = options.skipLifeosSummary ? lifeosSummaryRange(lines) : null;
  const tasks: { task: VaultTask; hidden: boolean }[] = [];
  let fenced = false;
  let heading: string | null = null;
  lines.forEach((line, i) => {
    if (isFence(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const h = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      heading = h[1];
      return;
    }
    const task = parseTaskLine(line);
    if (!task) return;
    // tugas ringkasan tetap dihitung (index) agar urutan sama dengan saat menulis balik
    const hidden = skip !== null && i >= skip[0] && i <= skip[1];
    tasks.push({ task: { ...task, index: tasks.length, line: i, heading }, hidden });
  });
  return tasks.filter((t) => !t.hidden).map((t) => t.task);
}

/** Rentang baris ringkasan LifeOS di catatan harian: dari `## Agenda` terakhir sebelum callout penandanya sampai callout. */
function lifeosSummaryRange(lines: string[]): [number, number] | null {
  const end = lines.findIndex((l) => /^>\s*\[!info\]\s*Ringkasan LifeOS/i.test(l));
  if (end < 0) return null;
  let start = 0;
  for (let i = end; i >= 0; i--) {
    if (/^##\s+Agenda\s*$/.test(lines[i])) {
      start = i;
      break;
    }
  }
  return [start, end];
}

// ------------------------------------------------------------------------------------------------ menulis balik

const insertBeforeBlockId = (line: string, addition: string) => {
  const id = BLOCK_ID.exec(line);
  return id ? `${line.slice(0, id.index)} ${addition}${id[0]}` : `${line.replace(/\s+$/, "")} ${addition}`;
};

/**
 * Baris baru setelah status diubah. Selesai = `[x]` + `✅ tanggal` (aturan plugin Tasks); dibuka lagi = `[ ]` dan tanggal
 * selesai dibuang. Tugas berulang yang diselesaikan menghasilkan baris kejadian berikutnya (disisipkan di atasnya).
 */
export function setTaskStatus(raw: string, done: boolean, today: string): { line: string; next: string | null } {
  const match = TASK_LINE.exec(raw);
  if (!match) throw new Error("Bukan baris tugas");
  const prefix = match[1];
  const body = (match[3] ?? "").replace(/\s*✅️?\s*\d{4}-\d{2}-\d{2}/gu, "");
  if (!done) return { line: `${prefix}[ ] ${body}`.replace(/\s+$/, ""), next: null };
  const line = insertBeforeBlockId(`${prefix}[x] ${body}`, `✅ ${today}`);
  const parsed = parseTaskLine(raw);
  const next = parsed?.recurrence ? nextOccurrence(`${prefix}[ ] ${body}`, parsed, today) : null;
  return { line, next };
}

const UNIT_DAYS: Record<string, "day" | "week" | "month" | "year"> = {
  day: "day",
  days: "day",
  week: "week",
  weeks: "week",
  month: "month",
  months: "month",
  year: "year",
  years: "year",
  hari: "day",
  minggu: "week",
  pekan: "week",
  bulan: "month",
  tahun: "year",
};

/** `every day`, `every 2 weeks`, `setiap bulan`, … → langkah; pola lain (mis. "every monday") tidak didukung. */
export function parseRecurrence(rule: string): { count: number; unit: "day" | "week" | "month" | "year" } | null {
  const m = /^(?:every|setiap|tiap)\s+(?:(\d+)\s+)?([a-z]+)(?:\s+when done)?$/i.exec(rule.trim());
  if (!m) return null;
  const unit = UNIT_DAYS[m[2].toLowerCase()];
  if (!unit) return null;
  return { count: Math.max(1, Number(m[1] ?? 1)), unit };
}

export function addInterval(ymd: string, step: { count: number; unit: "day" | "week" | "month" | "year" }) {
  const [y, mo, d] = ymd.split("-").map(Number);
  let date: Date;
  if (step.unit === "day" || step.unit === "week") {
    date = new Date(Date.UTC(y, mo - 1, d + step.count * (step.unit === "week" ? 7 : 1)));
  } else {
    const months = step.unit === "month" ? step.count : step.count * 12;
    const target = new Date(Date.UTC(y, mo - 1 + months, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    date = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last)));
  }
  return date.toISOString().slice(0, 10);
}

/** Kejadian berikutnya tugas berulang: semua tanggal (tenggat/jadwal/mulai) digeser satu langkah dari tanggal acuannya. */
function nextOccurrence(open: string, task: Omit<VaultTask, "index" | "line" | "heading">, today: string) {
  const step = task.recurrence ? parseRecurrence(task.recurrence) : null;
  if (!step) return null;
  const whenDone = /when done/i.test(task.recurrence ?? "");
  const anchor = task.due ?? task.scheduled ?? task.start;
  if (!anchor) return null;
  const shift = (date: string) => {
    if (!whenDone) return addInterval(date, step);
    // "when done": dihitung dari hari diselesaikan, jarak antar-tanggal dipertahankan
    const offset = (Date.parse(date) - Date.parse(anchor)) / 86_400_000;
    return addInterval(addInterval(today, step), { count: offset, unit: "day" });
  };
  return open.replace(/(📅|⏳|🛫)(️?\s*)(\d{4}-\d{2}-\d{2})/gu, (_m, emoji: string, gap: string, date: string) => {
    return `${emoji}${gap}${shift(date)}`;
  });
}

/**
 * Terapkan perubahan status ke berkas mentah. Tugas dicari menurut urutan + baris asli; bila berkas sudah bergeser,
 * dicari baris asli yang sama dan unik. Null = tugas tidak ditemukan lagi (berubah di tempat lain).
 */
export function applyTaskToggle(file: string, input: { index: number; raw: string; done: boolean; today: string }) {
  const text = file.replace(/^\uFEFF/, "");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = text.replace(/\r\n/g, "\n");
  const { body } = splitFrontmatter(normalized);
  const offset = normalized.slice(0, normalized.length - body.length).split("\n").length - 1;
  const tasks = parseTasks(normalized);
  let task = tasks[input.index]?.raw === input.raw ? tasks[input.index] : undefined;
  if (!task) {
    const same = tasks.filter((t) => t.raw === input.raw);
    if (same.length !== 1) return null;
    task = same[0];
  }
  const lines = normalized.split("\n");
  const at = offset + task.line;
  const { line, next } = setTaskStatus(task.raw, input.done, input.today);
  lines.splice(at, 1, ...(next ? [next, line] : [line]));
  return { text: lines.join(eol), line: next ? task.line + 1 : task.line };
}
