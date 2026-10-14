/**
 * ============================================================================
 * Graf akses berbagi — logika murni (tanpa database), diuji `share-graph.spec.ts`.
 * ----------------------------------------------------------------------------
 * Pemilik membagikan item induk (root). Penerima mendapat akses ke:
 *  1. root + TURUNAN-nya dengan izin yang sama (project → action & agenda; area → sub area/kegiatan/sub kegiatan,
 *     project, dan semua task & agenda-nya; agenda → Notes AI yang terhubung; seri agenda berulang
 *     `schedule_series` (id = `seriesId`) → semua pertemuannya, masing-masing diperlakukan sebagai root);
 *  2. RUJUKAN dari item yang dapat diakses (catatan/resource yang dilampirkan, klasifikasi/JRA/wadah arsip,
 *     agenda dari Notes AI) — hanya `view` dan tidak menurunkan turunan;
 *  3. BERKAS (uploadId di payload item yang dapat diakses) dengan izin tertinggi item yang merujuknya.
 * Relasi antar-record hanya ada di payload (ID buatan client), jadi graf dihitung saat request.
 * ============================================================================
 */

export type SharePermission = "view" | "comment" | "edit";
type Payload = Record<string, unknown>;

export const PERMISSION_RANK: Record<SharePermission, number> = { view: 1, comment: 2, edit: 3 };
export const atLeast = (have: SharePermission | undefined, need: SharePermission) =>
  !!have && PERMISSION_RANK[have] >= PERMISSION_RANK[need];
const maxPermission = (a: SharePermission | undefined, b: SharePermission): SharePermission =>
  a && PERMISSION_RANK[a] >= PERMISSION_RANK[b] ? a : b;

/** Record type yang bisa dibagikan sebagai item induk. */
export const SHAREABLE_TYPES = [
  "para_project",
  "para_area",
  "para_resource",
  "free_note",
  "ai_note",
  "list",
  "schedule",
  "schedule_series",
] as const;

/** Item virtual: seluruh pertemuan satu seri agenda berulang (`id` = `seriesId` di payload agenda). */
export const SERIES_TYPE = "schedule_series";
export type ShareableType = (typeof SHAREABLE_TYPES)[number];
export const isShareableType = (type: string): type is ShareableType =>
  (SHAREABLE_TYPES as readonly string[]).includes(type);

/** Kolom relasi ringan untuk menghitung turunan (dimuat tanpa payload penuh). */
export interface ShareStructure {
  projects: { id: string; areaId?: string | null }[];
  activities: { id: string; areaId?: string | null; parentId?: string | null }[];
  tasks: { id: string; projectId?: string | null }[];
  /** Agenda milik project / item area (`Schedule.projectId`) */
  schedules?: { id: string; projectId?: string | null }[];
  /** Anggota seri agenda berulang yang dibagikan (`seriesId` dari payload) */
  seriesSchedules?: { id: string; seriesId: string }[];
  aiNotes: { id: string; linkedScheduleId?: string | null }[];
}

export interface ShareRoot {
  type: string;
  id: string;
  permission: SharePermission;
}

export interface AccessEntry {
  type: string;
  id: string;
  permission: SharePermission;
  /** Item induk yang dibagikan langsung (bukan turunan/rujukan) */
  root: boolean;
}

export const accessKey = (type: string, id: string) => `${type}:${id}`;

/** Root + seluruh turunannya (izin = izin root; izin tertinggi bila tercakup beberapa root). */
export function expandDescendants(roots: ShareRoot[], structure: ShareStructure): Map<string, AccessEntry> {
  const byParent = <T>(items: T[], key: (item: T) => string | null | undefined) => {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const parent = key(item);
      if (!parent) continue;
      map.set(parent, [...(map.get(parent) ?? []), item]);
    }
    return map;
  };
  const tasksByParent = byParent(structure.tasks, (t) => t.projectId);
  const schedulesByParent = byParent(structure.schedules ?? [], (s) => s.projectId);
  const activitiesByParent = byParent(structure.activities, (a) => a.parentId);
  const activitiesByArea = byParent(structure.activities, (a) => a.areaId);
  const projectsByArea = byParent(structure.projects, (p) => p.areaId);
  const notesBySchedule = byParent(structure.aiNotes, (n) => n.linkedScheduleId);
  const schedulesBySeries = byParent(structure.seriesSchedules ?? [], (s) => s.seriesId);

  const children = (type: string, id: string): [string, string][] => {
    switch (type) {
      case "para_project":
        return [
          ...(tasksByParent.get(id) ?? []).map((t): [string, string] => ["para_task", t.id]),
          ...(schedulesByParent.get(id) ?? []).map((s): [string, string] => ["schedule", s.id]),
        ];
      case "para_activity":
        return [
          ...(activitiesByParent.get(id) ?? []).map((a): [string, string] => ["para_activity", a.id]),
          ...(tasksByParent.get(id) ?? []).map((t): [string, string] => ["para_task", t.id]),
          ...(schedulesByParent.get(id) ?? []).map((s): [string, string] => ["schedule", s.id]),
        ];
      case "para_area":
        return [
          ...(activitiesByArea.get(id) ?? []).map((a): [string, string] => ["para_activity", a.id]),
          ...(projectsByArea.get(id) ?? []).map((p): [string, string] => ["para_project", p.id]),
        ];
      case "schedule":
        return (notesBySchedule.get(id) ?? []).map((n) => ["ai_note", n.id]);
      case SERIES_TYPE:
        return (schedulesBySeries.get(id) ?? []).map((s) => ["schedule", s.id]);
      default:
        return [];
    }
  };

  const access = new Map<string, AccessEntry>();
  for (const root of roots) {
    const queue: [string, string, boolean][] = [[root.type, root.id, true]];
    while (queue.length) {
      const [type, id, isRoot] = queue.shift()!;
      const key = accessKey(type, id);
      const existing = access.get(key);
      const permission = maxPermission(existing?.permission, root.permission);
      // Sudah dikunjungi dengan izin yang sama/lebih tinggi → turunannya juga sudah
      const visited = existing && existing.permission === permission;
      access.set(key, { type, id, permission, root: (existing?.root ?? false) || isRoot });
      if (visited) continue;
      // Pertemuan seri = item induk masing-masing (hanya pemilik yang menghapus), bukan turunan biasa
      for (const [childType, childId] of children(type, id)) queue.push([childType, childId, type === SERIES_TYPE]);
    }
  }
  return access;
}

const NOTE_PREFIX: Record<string, string> = { free: "free_note", ai: "ai_note", list: "list" };

/** Lampiran catatan `free-<id>` | `ai-<id>` | `list-<id>` → [type, id]. */
export function parseNoteRef(noteId: unknown): [string, string] | null {
  if (typeof noteId !== "string") return null;
  const dash = noteId.indexOf("-");
  if (dash <= 0) return null;
  const type = NOTE_PREFIX[noteId.slice(0, dash)];
  const id = noteId.slice(dash + 1);
  return type && id ? [type, id] : null;
}

const ARCHIVE_REFS: [string, string][] = [
  ["classificationId", "archive_classification"],
  ["jraId", "archive_jra"],
  ["physLocationId", "archive_physical_reference"],
  ["physRackId", "archive_physical_reference"],
  ["physBoxId", "archive_physical_reference"],
  ["physFolderId", "archive_physical_reference"],
];

/** Item lain yang dirujuk payload (dibuka baca-saja oleh penerima agar item tampil lengkap). */
export function referencesOf(type: string, payload: Payload): [string, string][] {
  const refs: [string, string][] = [];
  const str = (value: unknown) => (typeof value === "string" && value ? value : null);
  for (const listKey of ["resources", "results"]) {
    const list = payload[listKey];
    if (!Array.isArray(list)) continue;
    for (const att of list as Payload[]) {
      if (!att || typeof att !== "object") continue;
      const note = parseNoteRef(att.noteId);
      if (note) refs.push(note);
      const existing = str(att.existingId);
      if (existing) refs.push(["para_resource", existing]);
    }
  }
  if (type === "para_resource") {
    const note = parseNoteRef(payload.noteId);
    if (note) refs.push(note);
    for (const [key, refType] of ARCHIVE_REFS) {
      const id = str(payload[key]);
      if (id) refs.push([refType, id]);
    }
  }
  if (type === "archive_physical_reference") {
    const parent = str(payload.parentId);
    if (parent) refs.push(["archive_physical_reference", parent]);
  }
  if (type === "ai_note") {
    const schedule = str(payload.linkedScheduleId);
    if (schedule) refs.push(["schedule", schedule]);
  }
  return refs;
}

/** Semua ID berkas di payload: key berakhiran `uploadId` (lampiran, audio Notes AI, gambar editor, berita acara). */
export function collectUploadIds(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectUploadIds(item, out);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Payload)) {
      if (typeof child === "string" && child && /uploadid$/i.test(key)) out.add(child);
      else if (child && typeof child === "object") collectUploadIds(child, out);
    }
  }
  return out;
}

/** Tambahkan rujukan (izin `view`) ke peta akses; `load` mengambil payload item yang belum dimuat. */
export function addReference(access: Map<string, AccessEntry>, type: string, id: string) {
  const key = accessKey(type, id);
  if (access.has(key)) return false;
  access.set(key, { type, id, permission: "view", root: false });
  return true;
}

/** Izin berkas: tertinggi dari item yang merujuknya. */
export function mergeUploadPermissions(
  uploads: Map<string, SharePermission>,
  payload: Payload,
  permission: SharePermission,
) {
  for (const id of collectUploadIds(payload)) uploads.set(id, maxPermission(uploads.get(id), permission));
}

/**
 * Pemilik record baru yang dibuat kolaborator: diturunkan dari induknya (task & agenda di project/kegiatan, kegiatan di
 * sub area/area, project di area). Mengembalikan pasangan [type, id] induk yang dirujuk payload.
 */
export function parentRefsOf(type: string, payload: Payload): [string, string][] {
  const str = (value: unknown) => (typeof value === "string" && value ? value : null);
  const refs: [string, string][] = [];
  if (type === "para_task" || type === "schedule") {
    // Task/action dan agenda milik project atau item area
    const id = str(payload.projectId);
    if (id) refs.push(["para_project", id], ["para_activity", id]);
    // Pertemuan baru dalam seri agenda berulang yang dibagikan
    const series = type === "schedule" ? str(payload.seriesId) : null;
    if (series) refs.push([SERIES_TYPE, series]);
  } else if (type === "para_activity") {
    const parent = str(payload.parentId);
    if (parent) refs.push(["para_activity", parent]);
    const area = str(payload.areaId);
    if (area) refs.push(["para_area", area]);
  } else if (type === "para_project") {
    const area = str(payload.areaId);
    if (area) refs.push(["para_area", area]);
  }
  return refs;
}
