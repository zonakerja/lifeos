import { stringify } from "yaml";
import { safeFileName } from "./vault-editor";
import { EXPORT_DIR, splitFrontmatter } from "./vault-parser";

/**
 * Cermin hasil kerja LifeOS ke vault Obsidian (satu arah, LifeOS → vault). Logika murni: data → peta path → isi
 * Markdown. Berkas di `80-LifeOS/` ditandai `sumber: lifeos` dan ditimpa setiap sinkron; catatan user sendiri di
 * folder lain boleh menautkannya. Folder ini tidak diindeks ulang ke koleksi pengetahuan (datanya sudah diindeks
 * sebagai data kerja) agar jawaban AI tidak ganda.
 */
export { EXPORT_DIR };

export const EXPORT_KINDS = ["notes", "lists", "aiNotes", "notebooks", "productivity"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export interface ExportSettings {
  enabled: boolean;
  kinds: Record<ExportKind, boolean>;
}

export const DEFAULT_EXPORT: ExportSettings = {
  enabled: false,
  kinds: { notes: true, lists: true, aiNotes: true, notebooks: true, productivity: true },
};

export function parseExportSettings(value: unknown): ExportSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const kinds = raw.kinds && typeof raw.kinds === "object" ? (raw.kinds as Record<string, unknown>) : {};
  return {
    enabled: raw.enabled === true,
    kinds: Object.fromEntries(
      EXPORT_KINDS.map((k) => [k, typeof kinds[k] === "boolean" ? kinds[k] : DEFAULT_EXPORT.kinds[k]]),
    ) as Record<ExportKind, boolean>,
  };
}

/** Berkas dikelola LifeOS = frontmatter `sumber: lifeos` (hanya berkas seperti ini yang boleh ditimpa/dihapus). */
export function isManagedNote(raw: string) {
  return splitFrontmatter(raw).frontmatter?.sumber === "lifeos";
}

export const isExportPath = (path: string) => path.split("/")[0] === EXPORT_DIR;

type P = Record<string, unknown> & { id: string };

export interface ExportNotebook {
  id: string;
  title: string;
  description?: string | null;
  summary?: unknown;
  createdAt: Date;
  updatedAt: Date;
  sources: { title: string; kind: string; url?: string | null; recordType?: string | null; recordId?: string | null }[];
  notes: { id: string; title: string; content: string; origin: string; updatedAt: Date }[];
  messages: { role: string; content: string; citations?: unknown; createdAt: Date }[];
}

export interface ExportInput {
  /** Alamat aplikasi (untuk tautan "Buka di LifeOS"); kosong = tanpa tautan. */
  appUrl: string;
  freeNotes: P[];
  lists: P[];
  aiNotes: P[];
  areas: P[];
  projects: P[];
  activities: P[];
  tasks: P[];
  schedules: P[];
  resources: P[];
  notebooks: ExportNotebook[];
}

/** Batas isi satu berkas (pemindai vault mengabaikan catatan > 2 MB). */
const MAX_FILE_CHARS = 1_500_000;
const MAX_MESSAGES = 400;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const list = <T = Record<string, unknown>>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const linkLabel = (text: string) =>
  text
    .replace(/[[\]|#^]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Tanpa judul";
const safeUrl = (url: string) => (/^https?:\/\/[^\s()<>]+$/i.test(url) ? url : null);
const ymd = (v: unknown) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = str(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
};
const stamp = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
const tagOf = (tag: string) =>
  tag
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_/-]/gu, "");
const byId = (a: P, b: P) => String(a.id).localeCompare(String(b.id));

const PRIORITY: Record<string, string> = { high: "tinggi", medium: "sedang", low: "rendah" };
const STATUS: Record<string, string> = {
  active: "berjalan",
  "in-progress": "berjalan",
  completed: "selesai",
  "on-hold": "ditunda",
  planning: "perencanaan",
  archived: "diarsipkan",
};
const LEVELS = ["Sub Area", "Kegiatan", "Sub Kegiatan"];

/** Penyusun berkas: mengalokasikan nama unik per folder lalu menulis isi setelah semua tautan diketahui. */
class Planner {
  private readonly used = new Map<string, Set<string>>();
  readonly files = new Map<string, string>();

  allocate(folder: string, title: string) {
    const used = this.used.get(folder) ?? new Set<string>();
    this.used.set(folder, used);
    const base = safeFileName(title) || "Tanpa judul";
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i})`;
    used.add(name.toLowerCase());
    return `${folder}/${name}.md`;
  }
}

/** `[[path|label]]` dengan path lengkap tanpa `.md` (tidak ambigu walau nama berkas sama). */
export const wikilink = (path: string, label: string) => `[[${path.replace(/\.md$/i, "")}|${linkLabel(label)}]]`;

export function buildExport(input: ExportInput, kinds: Record<ExportKind, boolean>): Map<string, string> {
  const plan = new Planner();
  const app = input.appUrl.replace(/\/+$/, "");
  const appLink = (path: string) => (app ? `${app}${path}` : "");
  const enc = encodeURIComponent;

  // ------------------------------------------------------------ Alokasi path (semua dulu, agar tautan silang jalan)
  const noteKey = new Map<string, { path: string; title: string }>();
  const pathOf = new Map<string, { path: string; title: string }>();
  const put = (key: string, path: string, title: string) => pathOf.set(key, { path, title });

  const freeNotes = kinds.notes ? input.freeNotes.filter((n) => str(n.content) || str(n.title)).sort(byId) : [];
  for (const n of freeNotes) {
    const title = str(n.title) || "Catatan tanpa judul";
    const entry = { path: plan.allocate(`${EXPORT_DIR}/Catatan Bebas`, title), title };
    noteKey.set(`free-${n.id}`, entry);
  }
  const lists = kinds.lists ? [...input.lists].sort(byId) : [];
  for (const l of lists) {
    const title = str(l.title) || "List tanpa judul";
    noteKey.set(`list-${l.id}`, { path: plan.allocate(`${EXPORT_DIR}/List Bebas`, title), title });
  }
  const aiNotes = kinds.aiNotes ? [...input.aiNotes].sort(byId) : [];
  for (const n of aiNotes) {
    const title = str(n.title) || "Notes AI";
    const date = ymd(n.date);
    noteKey.set(`ai-${n.id}`, {
      path: plan.allocate(`${EXPORT_DIR}/Notes AI`, date ? `${date} ${title}` : title),
      title,
    });
  }

  const prod = kinds.productivity;
  const areas = prod ? [...input.areas].sort(byId) : [];
  const projects = prod ? [...input.projects].sort(byId) : [];
  const resources = prod ? [...input.resources].sort(byId) : [];
  const linkedAiNotes = new Map<string, P[]>();
  for (const n of input.aiNotes) {
    const sid = str(n.linkedScheduleId);
    if (sid) linkedAiNotes.set(sid, [...(linkedAiNotes.get(sid) ?? []), n]);
  }
  const schedules = prod
    ? input.schedules
        .filter((s) => str(s.outcome) || list(s.results).length || str(s.projectId) || linkedAiNotes.has(String(s.id)))
        .sort(byId)
    : [];
  for (const a of areas)
    put(
      `area:${a.id}`,
      plan.allocate(`${EXPORT_DIR}/Productivity/Area`, str(a.title) || "Area"),
      str(a.title) || "Area",
    );
  for (const p of projects)
    put(
      `project:${p.id}`,
      plan.allocate(`${EXPORT_DIR}/Productivity/Project`, str(p.title) || "Project"),
      str(p.title) || "Project",
    );
  for (const s of schedules) {
    const title = str(s.title) || "Agenda";
    const date = ymd(s.startDate ?? s.date);
    put(
      `schedule:${s.id}`,
      plan.allocate(`${EXPORT_DIR}/Productivity/Agenda`, date ? `${date} ${title}` : title),
      title,
    );
  }
  for (const r of resources)
    put(
      `resource:${r.id}`,
      plan.allocate(`${EXPORT_DIR}/Productivity/Resource`, str(r.title) || "Resource"),
      str(r.title) || "Resource",
    );

  const resourceByUpload = new Map<string, string>();
  for (const r of resources) if (str(r.uploadId)) resourceByUpload.set(str(r.uploadId), String(r.id));

  const notebooks = kinds.notebooks ? [...input.notebooks].sort((a, b) => a.id.localeCompare(b.id)) : [];
  const nbPaths = new Map<string, { folder: string; index: string; chat: string; notes: Map<string, string> }>();
  for (const nb of notebooks) {
    const index = plan.allocate(`${EXPORT_DIR}/My Notebook`, nb.title || "Notebook");
    const folder = index.replace(/\.md$/, "");
    const notes = new Map<string, string>();
    for (const note of [...nb.notes].sort((a, b) => a.id.localeCompare(b.id)))
      notes.set(note.id, plan.allocate(`${folder}/Catatan`, note.title || "Catatan"));
    nbPaths.set(nb.id, {
      folder,
      index,
      chat: plan.allocate(folder, `Riwayat Chat - ${nb.title || "Notebook"}`),
      notes,
    });
  }

  // ------------------------------------------------------------ Penulis
  const write = (path: string, meta: Record<string, unknown>, body: string[]) => {
    const props = Object.fromEntries(
      Object.entries({ sumber: "lifeos", ...meta }).filter(
        ([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0),
      ),
    );
    let text = `---\n${stringify(props, { lineWidth: 0 }).trimEnd()}\n---\n\n${body
      .filter((b) => b !== "")
      .join("\n\n")
      .trim()}\n`;
    if (text.length > MAX_FILE_CHARS) text = `${text.slice(0, MAX_FILE_CHARS)}\n\n_(Dipotong: isi terlalu panjang.)_\n`;
    plan.files.set(path, text);
  };
  const header = (url: string) =>
    [
      "> [!info] Dikelola LifeOS",
      "> Berkas ini dibuat otomatis dari LifeOS dan **ditimpa** setiap sinkron. Tulis catatan Anda sendiri di folder lain lalu tautkan ke sini.",
      ...(url ? [`> [Buka di LifeOS](${url})`] : []),
    ].join("\n");
  const ref = (key: string) => {
    const hit = pathOf.get(key) ?? noteKey.get(key);
    return hit ? wikilink(hit.path, hit.title) : null;
  };
  const attachment = (a: Record<string, unknown>) => {
    const name = str(a.name) || str(a.title) || "Lampiran";
    const desc = str(a.description) || str(a.aiSummary);
    let line: string;
    const type = str(a.type);
    if (type === "link") {
      const url = safeUrl(str(a.url));
      line = url ? `[${linkLabel(name)}](${url})` : name;
    } else if (type === "note") line = ref(str(a.noteId)) ?? `${name} (catatan)`;
    else if (type === "existing") line = ref(`resource:${str(a.existingId)}`) ?? `${name} (Resource Global)`;
    else {
      // Berkas yang juga tersimpan sebagai Resource Global → tautkan ke berkas Resource-nya (graf lebih kaya)
      const owner = resourceByUpload.get(str(a.uploadId));
      line = (owner && ref(`resource:${owner}`)) || `${name} (berkas di LifeOS)`;
    }
    return `- ${line}${desc ? ` — ${desc.replace(/\s+/g, " ").slice(0, 300)}` : ""}`;
  };
  const attachments = (title: string, items: unknown) => {
    const rows = list(items);
    return rows.length ? `## ${title}\n\n${rows.map(attachment).join("\n")}` : "";
  };
  const section = (title: string, text: string) => (text ? `## ${title}\n\n${text}` : "");

  // ------------------------------------------------------------ Notes Space
  for (const n of freeNotes) {
    const { path, title } = noteKey.get(`free-${n.id}`)!;
    const handwriting = str(n.kind) === "handwriting";
    write(
      path,
      {
        jenis: "lifeos-catatan",
        lifeos_id: `free_note:${n.id}`,
        judul: title,
        diperbarui: ymd(n.updatedAt),
        lifeos: appLink(`/notes/free?note=${enc(n.id)}`),
      },
      [
        header(appLink(`/notes/free?note=${enc(n.id)}`)),
        handwriting ? "_Tulisan tangan — teks di bawah adalah hasil pengenalan (Ubah ke teks)._" : "",
        str(n.content) || "_(Belum ada teks.)_",
      ],
    );
  }
  for (const l of lists) {
    const { path, title } = noteKey.get(`list-${l.id}`)!;
    const items = list<{ text?: string; checked?: boolean }>(l.items);
    const done = items.filter((i) => i.checked).length;
    write(
      path,
      {
        jenis: "lifeos-list",
        lifeos_id: `list:${l.id}`,
        judul: title,
        progres: items.length ? `${done}/${items.length}` : undefined,
        arsip: l.archived === true ? true : undefined,
        diperbarui: ymd(l.updatedAt),
        lifeos: appLink(`/notes/lists?list=${enc(l.id)}`),
      },
      [
        header(appLink(`/notes/lists?list=${enc(l.id)}`)),
        items.length
          ? items.map((i) => `- [${i.checked ? "x" : " "}] ${str(i.text).replace(/\s+/g, " ")}`).join("\n")
          : "_(List kosong.)_",
      ],
    );
  }
  for (const n of aiNotes) {
    const { path, title } = noteKey.get(`ai-${n.id}`)!;
    const agenda = str(n.linkedScheduleId) ? ref(`schedule:${str(n.linkedScheduleId)}`) : null;
    write(
      path,
      {
        jenis: "lifeos-notes-ai",
        lifeos_id: `ai_note:${n.id}`,
        judul: title,
        tanggal: ymd(n.date),
        agenda: agenda ?? undefined,
        diperbarui: ymd(n.updatedAt),
        lifeos: appLink(`/notes/ai?note=${enc(n.id)}`),
      },
      [
        header(appLink(`/notes/ai?note=${enc(n.id)}`)),
        section("Ringkasan AI", str(n.aiSummary)),
        section("Catatan", str(n.content)),
        section("Transkrip", str(n.audioTranscript)),
      ],
    );
  }

  // ------------------------------------------------------------ Productivity
  const tasksOf = new Map<string, P[]>();
  for (const t of prod ? input.tasks : []) {
    const pid = str(t.projectId);
    if (pid) tasksOf.set(pid, [...(tasksOf.get(pid) ?? []), t]);
  }
  const schedulesOf = new Map<string, P[]>();
  for (const s of schedules) {
    const pid = str(s.projectId);
    if (pid) schedulesOf.set(pid, [...(schedulesOf.get(pid) ?? []), s]);
  }
  const sortTasks = (tasks: P[]) =>
    [...tasks].sort((a, b) => (ymd(a.dueDate) || "9999").localeCompare(ymd(b.dueDate) || "9999") || byId(a, b));
  const taskLines = (tasks: P[], indent = "") =>
    sortTasks(tasks).flatMap((t) => {
      const facts = [
        ymd(t.dueDate) && `tenggat ${ymd(t.dueDate)}`,
        PRIORITY[str(t.priority)] && `prioritas ${PRIORITY[str(t.priority)]}`,
        typeof t.weight === "number" && t.weight ? `bobot ${t.weight}%` : "",
        t.completed && ymd(t.completedAt) ? `selesai ${ymd(t.completedAt)}` : "",
      ].filter(Boolean);
      const lines = [
        `${indent}- [${t.completed ? "x" : " "}] ${str(t.title).replace(/\s+/g, " ") || "Tanpa judul"}${facts.length ? ` _(${facts.join(", ")})_` : ""}`,
      ];
      const desc = str(t.description).replace(/\s+/g, " ");
      if (desc) lines.push(`${indent}    ${desc.slice(0, 500)}`);
      for (const a of list(t.resources)) lines.push(`${indent}    ${attachment(a)}`);
      return lines;
    });
  const agendaLines = (items: P[], indent = "") =>
    [...items]
      .sort((a, b) => ymd(a.startDate ?? a.date).localeCompare(ymd(b.startDate ?? b.date)))
      .map((s) => `${indent}- 📅 ${ref(`schedule:${s.id}`)}`);

  for (const p of projects) {
    const { path, title } = pathOf.get(`project:${p.id}`)!;
    const tasks = tasksOf.get(String(p.id)) ?? [];
    const weighted = tasks.filter((t) => typeof t.weight === "number" && t.weight);
    const progress = weighted.length
      ? weighted.filter((t) => t.completed).reduce((sum, t) => sum + (t.weight as number), 0)
      : tasks.length
        ? Math.round((tasks.filter((t) => t.completed).length / tasks.length) * 100)
        : undefined;
    const area = str(p.areaId) ? ref(`area:${str(p.areaId)}`) : null;
    write(
      path,
      {
        jenis: "lifeos-project",
        lifeos_id: `para_project:${p.id}`,
        judul: title,
        status: STATUS[str(p.status)] ?? (str(p.status) || "berjalan"),
        mulai: ymd(p.startDate),
        deadline: ymd(p.deadline),
        progres: progress === undefined ? undefined : `${progress}%`,
        area: area ?? undefined,
        lifeos: appLink(`/productivity/projects?project=${enc(p.id)}`),
      },
      [
        header(appLink(`/productivity/projects?project=${enc(p.id)}`)),
        str(p.description),
        attachments("Dasar Pelaksanaan", p.resources),
        tasks.length ? `## Action\n\n${taskLines(tasks).join("\n")}` : "",
        schedulesOf.has(String(p.id)) ? `## Agenda\n\n${agendaLines(schedulesOf.get(String(p.id))!).join("\n")}` : "",
      ],
    );
  }

  const activities = prod ? input.activities : [];
  const childrenOf = new Map<string, P[]>();
  for (const a of activities) {
    const key = str(a.parentId) || `area:${str(a.areaId)}`;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), a]);
  }
  for (const area of areas) {
    const { path, title } = pathOf.get(`area:${area.id}`)!;
    const tree = (parentKey: string, depth: number, seen: Set<string>): string[] =>
      [...(childrenOf.get(parentKey) ?? [])].sort(byId).flatMap((a) => {
        if (seen.has(String(a.id)) || depth > 2) return [];
        seen.add(String(a.id));
        const indent = "    ".repeat(depth);
        const facts = [ymd(a.deadline) && `tanggal ${ymd(a.deadline)}`].filter(Boolean);
        const lines = [
          `${indent}- **${LEVELS[depth]}: ${str(a.title).replace(/\s+/g, " ") || "Tanpa judul"}**${facts.length ? ` _(${facts.join(", ")})_` : ""}`,
        ];
        const desc = str(a.description).replace(/\s+/g, " ");
        if (desc) lines.push(`${indent}    ${desc.slice(0, 500)}`);
        for (const r of list(a.resources)) lines.push(`${indent}    ${attachment(r)}`);
        lines.push(...taskLines(tasksOf.get(String(a.id)) ?? [], `${indent}    `));
        lines.push(...agendaLines(schedulesOf.get(String(a.id)) ?? [], `${indent}    `));
        lines.push(...tree(String(a.id), depth + 1, seen));
        return lines;
      });
    const structure = tree(`area:${area.id}`, 0, new Set());
    const areaProjects = projects.filter((p) => str(p.areaId) === String(area.id));
    write(
      path,
      {
        jenis: "lifeos-area",
        lifeos_id: `para_area:${area.id}`,
        judul: title,
        lifeos: appLink(`/productivity/areas?area=${enc(area.id)}`),
      },
      [
        header(appLink(`/productivity/areas?area=${enc(area.id)}`)),
        str(area.description),
        structure.length ? `## Struktur\n\n${structure.join("\n")}` : "",
        areaProjects.length ? `## Project\n\n${areaProjects.map((p) => `- ${ref(`project:${p.id}`)}`).join("\n")}` : "",
      ],
    );
  }

  const activityById = new Map(activities.map((a) => [String(a.id), a]));
  for (const s of schedules) {
    const { path, title } = pathOf.get(`schedule:${s.id}`)!;
    const pid = str(s.projectId);
    let parent: string | null = null;
    if (pid) {
      parent = ref(`project:${pid}`);
      const act = activityById.get(pid);
      if (!parent && act) parent = ref(`area:${str(act.areaId)}`);
    }
    const start = str(s.startTime ?? s.time);
    const end = str(s.endTime);
    const ai = (linkedAiNotes.get(String(s.id)) ?? []).map((n) => ref(`ai-${n.id}`)).filter(Boolean);
    write(
      path,
      {
        jenis: "lifeos-agenda",
        lifeos_id: `schedule:${s.id}`,
        judul: title,
        tanggal: ymd(s.startDate ?? s.date),
        sampai: ymd(s.endDate) !== ymd(s.startDate ?? s.date) ? ymd(s.endDate) : undefined,
        jam: s.isAllDay ? "sepanjang hari" : start ? `${start}${end ? `–${end}` : ""}` : undefined,
        tipe: str(s.type),
        lokasi: str(s.location),
        bagian_dari: parent ?? undefined,
        lifeos: appLink(`/planner/schedule?agenda=${enc(s.id)}`),
      },
      [
        header(appLink(`/planner/schedule?agenda=${enc(s.id)}`)),
        str(s.description),
        attachments("Dasar Pelaksanaan", s.resources),
        str(s.outcome) || list(s.results).length
          ? `## Hasil Agenda\n\n${[str(s.outcome), list(s.results).map(attachment).join("\n")].filter(Boolean).join("\n\n")}`
          : "",
        ai.length ? `## Notes AI\n\n${ai.map((l) => `- ${l}`).join("\n")}` : "",
      ],
    );
  }

  for (const r of resources) {
    const { path, title } = pathOf.get(`resource:${r.id}`)!;
    const type = str(r.type);
    const url = safeUrl(str(r.url));
    const note = type === "note" ? ref(str(r.noteId)) : null;
    const lines = [
      type === "link" && url ? `**Tautan:** [${linkLabel(title)}](${url})` : "",
      type === "file" ? `**Berkas:** ${title} (berkas di LifeOS)` : "",
      note ? `**Catatan:** ${note}` : "",
    ];
    write(
      path,
      {
        jenis: "lifeos-resource",
        lifeos_id: `para_resource:${r.id}`,
        judul: title,
        tipe: type,
        tanggal: ymd(r.date ?? r.createdAt),
        tags: [
          ...new Set(
            list<string>(r.tags)
              .filter((t) => typeof t === "string")
              .map(tagOf)
              .filter(Boolean),
          ),
        ],
        file_control: str(r.archivalStatus) && str(r.archivalStatus) !== "none" ? str(r.archivalStatus) : undefined,
        lifeos: appLink(`/productivity/resources?resource=${enc(r.id)}`),
      },
      [
        header(appLink(`/productivity/resources?resource=${enc(r.id)}`)),
        lines.filter(Boolean).join("\n"),
        section("Ringkasan AI", str(r.aiSummary)),
        section("Keterangan", str(r.content)),
      ],
    );
  }

  // ------------------------------------------------------------ My Notebook
  for (const nb of notebooks) {
    const paths = nbPaths.get(nb.id)!;
    const summary = (nb.summary && typeof nb.summary === "object" ? nb.summary : {}) as Record<string, unknown>;
    const link = appLink(`/notes/notebook?notebook=${enc(nb.id)}`);
    const sourceLine = (s: ExportNotebook["sources"][number]) => {
      const url = safeUrl(str(s.url));
      if (s.kind === "web" && url) return `- 🌐 [${linkLabel(s.title)}](${url})`;
      if (s.kind === "record" && s.recordType && s.recordId) {
        const prefix = { free_note: "free-", ai_note: "ai-", list: "list-" }[s.recordType];
        const hit =
          (prefix && ref(`${prefix}${s.recordId}`)) || ref(`${s.recordType.replace(/^para_/, "")}:${s.recordId}`);
        if (hit) return `- 🔗 ${hit}`;
      }
      return `- ${s.kind === "upload" ? "📄" : s.kind === "text" ? "📝" : "🔗"} ${s.title}`;
    };
    write(
      paths.index,
      {
        jenis: "lifeos-notebook",
        lifeos_id: `notebook:${nb.id}`,
        judul: nb.title,
        dibuat: ymd(nb.createdAt),
        diperbarui: ymd(nb.updatedAt),
        lifeos: link,
      },
      [
        header(link),
        str(nb.description),
        section("Ringkasan", str(summary.overview)),
        list<string>(summary.keyPoints).length
          ? `### Poin kunci\n\n${list<string>(summary.keyPoints)
              .map((k) => `- ${str(k)}`)
              .join("\n")}`
          : "",
        list<string>(summary.questions).length
          ? `### Pertanyaan yang bisa diajukan\n\n${list<string>(summary.questions)
              .map((k) => `- ${str(k)}`)
              .join("\n")}`
          : "",
        nb.sources.length ? `## Sumber\n\n${nb.sources.map(sourceLine).join("\n")}` : "",
        nb.notes.length
          ? `## Catatan\n\n${[...nb.notes]
              .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
              .map((n) => `- ${wikilink(paths.notes.get(n.id)!, n.title || "Catatan")}`)
              .join("\n")}`
          : "",
        nb.messages.length ? `## Chat\n\n- ${wikilink(paths.chat, "Riwayat chat")} (${nb.messages.length} pesan)` : "",
      ],
    );
    for (const note of nb.notes) {
      write(
        paths.notes.get(note.id)!,
        {
          jenis: "lifeos-notebook-catatan",
          lifeos_id: `notebook_note:${note.id}`,
          judul: note.title,
          notebook: wikilink(paths.index, nb.title),
          asal: { chat: "jawaban chat", summary: "ringkasan", manual: "ditulis" }[note.origin] ?? note.origin,
          diperbarui: ymd(note.updatedAt),
          lifeos: link,
        },
        [header(link), note.content],
      );
    }
    if (nb.messages.length) {
      const messages = [...nb.messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const shown = messages.slice(-MAX_MESSAGES);
      write(
        paths.chat,
        {
          jenis: "lifeos-notebook-chat",
          lifeos_id: `notebook_chat:${nb.id}`,
          judul: `Riwayat Chat - ${nb.title}`,
          notebook: wikilink(paths.index, nb.title),
          pesan: messages.length,
          lifeos: link,
        },
        [
          header(link),
          messages.length > shown.length ? `_(${messages.length - shown.length} pesan lama tidak ditampilkan.)_` : "",
          ...shown.map((m) => {
            const cites = list<{ n?: number; title?: string }>(m.citations)
              .filter((c) => c && typeof c.n === "number")
              .map((c) => `[${c.n}] ${str(c.title)}`);
            return `### ${m.role === "user" ? "🧑 Anda" : "🤖 Asisten"} · ${stamp(m.createdAt)}\n\n${m.content.trim()}${cites.length ? `\n\n> Sumber: ${cites.join(" · ")}` : ""}`;
          }),
        ],
      );
    }
  }

  // ------------------------------------------------------------ Indeks folder
  const count = (prefix: string) =>
    [...plan.files.keys()].filter((p) => p.startsWith(`${EXPORT_DIR}/${prefix}/`)).length;
  const index = [
    ["Catatan Bebas", "Catatan Bebas"],
    ["List Bebas", "List Bebas"],
    ["Notes AI", "Notes AI"],
    ["My Notebook", "My Notebook"],
    ["Productivity/Project", "Project"],
    ["Productivity/Area", "Area"],
    ["Productivity/Agenda", "Agenda (dengan hasil / bagian project)"],
    ["Productivity/Resource", "Resource Global"],
  ]
    .map(([folder, label]) => [label, count(folder)] as const)
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `- ${label}: ${n} berkas`);
  write(
    `${EXPORT_DIR}/LifeOS.md`,
    { jenis: "lifeos-indeks", lifeos_id: "index", judul: "LifeOS", lifeos: appLink("/") },
    [
      header(appLink("/")),
      "Folder ini adalah **cermin hasil kerja Anda di LifeOS** (Notes Space, My Notebook, Productivity). Isinya diperbarui otomatis; lihat hubungannya di Graf.",
      index.length ? `## Isi\n\n${index.join("\n")}` : "_(Belum ada data yang dicerminkan.)_",
    ],
  );
  return plan.files;
}
