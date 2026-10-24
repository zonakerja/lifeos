/**
 * ============================================================================
 * Spesifikasi tabel domain — SUMBER TUNGGAL untuk:
 *  1. runtime mapper payload <-> baris tabel (`record-mapper.ts`),
 *  2. generator model Prisma & SQL migrasi data (`prisma/generate-domain-models.ts`).
 * ----------------------------------------------------------------------------
 * Setiap record type dari frontend (`/records/:type`) disimpan di tabel bertipe
 * sendiri. Field payload yang dikenal → kolom bertipe; field lain (atau nilai yang
 * tidak lolos validasi tipe, termasuk null eksplisit) → kolom `extra` (jsonb),
 * sehingga payload selalu bisa dikembalikan utuh (lossless).
 *
 * File ini sengaja tanpa import agar bisa dijalankan langsung oleh Node
 * (type stripping) dari script generator. Setelah mengubah spesifikasi:
 *   npm run db:generate-models   → perbarui schema.prisma
 *   lalu buat migrasi (lihat docs/ARCHITECTURE.md §Database).
 * ============================================================================
 */

/** Jenis kolom. Lihat `record-mapper.ts` untuk aturan validasi tiap jenis. */
export type FieldKind =
  | "string" // text
  | "int" // integer (32-bit)
  | "float" // double precision
  | "bool" // boolean
  | "ymd" // date, format payload "YYYY-MM-DD"
  | "dateKey" // date, format payload Date.toDateString() "Thu Oct 08 2026"
  | "timestamp" // timestamptz, format payload ISO "2026-10-08T15:00:02.750Z"
  | "json"; // jsonb (objek/array bebas, termasuk array string)

export interface FieldSpec {
  /** Nama key di payload */
  key: string;
  kind: FieldKind;
  /** Nama field Prisma bila berbeda dari key (mis. hindari bentrok dengan relasi `user`) */
  field?: string;
}

export interface TableSpec {
  /** Nama model Prisma (PascalCase) */
  model: string;
  /** Nama tabel database (snake_case, jamak) */
  table: string;
  /** Key payload untuk `title` pada respons API */
  titleKey?: string;
  /** Key payload untuk `date` pada respons API & filter ?from/?to */
  dateKey?: string;
  /** Catat perubahan ke archive_audit_logs */
  audit?: boolean;
  fields: FieldSpec[];
  /** Indeks tambahan (nama field Prisma), selalu diawali user_id */
  indexes?: string[][];
}

const s = (key: string): FieldSpec => ({ key, kind: "string" });
const f = (key: string, kind: FieldKind, field?: string): FieldSpec => ({
  key,
  kind,
  field,
});

export const RECORD_TABLES = {
  // -------------------------------------------------------------- Planner
  agenda_type: {
    model: "AgendaType",
    table: "agenda_types",
    titleKey: "name",
    fields: [s("name"), f("order", "int")],
  },
  schedule: {
    model: "Schedule",
    table: "schedules",
    titleKey: "title",
    dateKey: "startDate",
    fields: [
      s("title"),
      f("startDate", "ymd"),
      f("endDate", "ymd"),
      f("date", "ymd"),
      s("startTime"),
      s("endTime"),
      s("time"),
      f("isAllDay", "bool"),
      s("type"),
      s("location"),
      s("media"),
      // Project / item Area pemilik agenda (agenda ikut dibagikan, diarsipkan, dan dihapus bersama induknya)
      s("projectId"),
    ],
    indexes: [["startDate"], ["projectId"]],
  },
  routine: {
    model: "Routine",
    table: "routines",
    titleKey: "title",
    dateKey: "startDate",
    fields: [
      s("title"),
      s("frequency"),
      f("days", "json"),
      f("interval", "int"),
      s("intervalType"),
      f("monthDates", "json"),
      f("startDate", "ymd"),
      f("active", "bool"),
      f("archived", "bool"),
      f("freezePeriods", "json"),
    ],
  },
  todo: {
    model: "Todo",
    table: "todos",
    titleKey: "title",
    dateKey: "date",
    fields: [s("title"), f("completed", "bool"), f("date", "dateKey"), s("priority")],
    indexes: [["date"]],
  },
  completion: {
    model: "RoutineCompletion",
    table: "routine_completions",
    dateKey: "date",
    fields: [
      s("routineId"),
      f("date", "dateKey"),
      f("actualDate", "dateKey"),
      s("note"),
      f("completedAt", "timestamp"),
    ],
    indexes: [["routineId", "date"]],
  },

  // ---------------------------------------------------------------- Notes
  free_note: {
    model: "FreeNote",
    table: "free_notes",
    titleKey: "title",
    fields: [s("title"), s("content"), s("color")],
  },
  ai_note: {
    model: "AiNote",
    table: "ai_notes",
    titleKey: "title",
    dateKey: "date",
    fields: [
      s("title"),
      f("date", "ymd"),
      s("linkedScheduleId"),
      s("content"),
      s("aiSummary"),
      s("audioTranscript"),
      s("fileContext"),
      f("hasAudio", "bool"),
      s("audioUploadId"),
      f("fileAttachment", "json"),
    ],
    indexes: [["date"]],
  },
  list: {
    model: "NoteList",
    table: "note_lists",
    titleKey: "title",
    fields: [s("title"), f("archived", "bool"), f("items", "json")],
  },

  // ---------------------------------------------------------- Productivity
  para_area: {
    model: "Area",
    table: "areas",
    titleKey: "title",
    fields: [s("title"), s("description"), s("color")],
  },
  para_project: {
    model: "Project",
    table: "projects",
    titleKey: "title",
    dateKey: "startDate",
    fields: [
      s("title"),
      s("description"),
      s("areaId"),
      f("startDate", "ymd"),
      f("deadline", "ymd"),
      s("status"),
      f("progress", "float"),
      f("linkedNotes", "json"),
      f("resources", "json"),
    ],
    indexes: [["areaId"], ["status"]],
  },
  para_activity: {
    model: "Activity",
    table: "activities",
    titleKey: "title",
    dateKey: "deadline",
    // Item area bertingkat: tanpa `parentId` = Sub Area; anak Sub Area = Kegiatan; anak Kegiatan = Sub Kegiatan.
    // Sub Area hanya nama + deskripsi; `deadline` & `resources` dipakai Kegiatan / Sub Kegiatan.
    fields: [
      s("title"),
      s("description"),
      s("areaId"),
      s("parentId"),
      f("deadline", "ymd"),
      s("status"),
      f("resources", "json"),
    ],
    indexes: [["areaId"], ["parentId"]],
  },
  para_task: {
    model: "Task",
    table: "tasks",
    titleKey: "title",
    dateKey: "dueDate",
    fields: [
      s("projectId"),
      s("title"),
      s("description"),
      f("dueDate", "ymd"),
      s("priority"),
      f("weight", "float"),
      f("completed", "bool"),
      f("completedAt", "timestamp"),
      s("type"),
      f("resources", "json"),
    ],
    indexes: [["projectId"], ["dueDate"]],
  },
  para_resource: {
    model: "Resource",
    table: "resources",
    titleKey: "title",
    dateKey: "date",
    audit: true,
    fields: [
      s("number"),
      s("title"),
      s("description"),
      s("content"),
      s("type"),
      s("url"),
      s("uploadId"),
      s("mimeType"),
      s("noteId"),
      f("date", "ymd"),
      f("tags", "json"),
      s("sourceTag"),
      s("aiSummary"),
      // Field kearsipan (File Control)
      s("archivalStatus"),
      s("archiveRegId"),
      s("classificationId"),
      s("jraId"),
      f("retentionActiveDate", "ymd"),
      f("retentionInactiveDate", "ymd"),
      s("status"),
      f("isVital", "bool"),
      f("isAutoDispose", "bool"),
      s("physLocationId"),
      s("physRackId"),
      s("physBoxId"),
      s("physFolderId"),
      s("digitalApp"),
      s("digitalLink"),
      s("notes"),
      f("dispositionData", "json"),
    ],
    indexes: [["type"], ["archivalStatus"], ["archiveRegId"]],
  },
  para_archive: {
    model: "ParaArchive",
    table: "para_archives",
    dateKey: "archivedAt",
    audit: true,
    fields: [s("originalType"), s("originalId"), f("data", "json"), f("archivedAt", "timestamp")],
    indexes: [["originalType"]],
  },
  /** Riwayat arsip & pemulihan PARA (append-only, ditulis saat item diarsipkan / dipulihkan). */
  para_archive_log: {
    model: "ParaArchiveLog",
    table: "para_archive_logs",
    titleKey: "title",
    dateKey: "at",
    fields: [
      s("action"),
      s("originalType"),
      s("originalId"),
      s("archiveId"),
      s("title"),
      s("summary"),
      s("actorName"),
      f("at", "timestamp"),
    ],
    indexes: [["at"], ["originalId"]],
  },

  // ---------------------------------------------------- File Control (arsip)
  archive_classification: {
    model: "ArchiveClassification",
    table: "archive_classifications",
    titleKey: "namaItem",
    audit: true,
    fields: [s("jenis"), s("kodePokok"), s("namaPokok"), s("kodeSub"), s("namaSub"), s("kodeItem"), s("namaItem")],
    indexes: [["kodePokok", "kodeSub", "kodeItem"]],
  },
  archive_jra: {
    model: "ArchiveRetentionSchedule",
    table: "archive_retention_schedules",
    titleKey: "jenisArsip",
    audit: true,
    fields: [
      s("kategoriUtama"),
      s("subKategori"),
      s("jenisArsip"),
      f("retensiAktif", "int"),
      f("retensiInaktif", "int"),
      s("keterangan"),
    ],
  },
  archive_physical_reference: {
    model: "ArchiveLocation",
    table: "archive_locations",
    titleKey: "name",
    audit: true,
    fields: [s("type"), s("parentId"), s("code"), s("name"), s("description")],
    indexes: [["parentId"], ["type"], ["code"]],
  },
  archive_borrowing: {
    model: "ArchiveBorrowing",
    table: "archive_borrowings",
    titleKey: "borrowerName",
    dateKey: "date",
    audit: true,
    fields: [
      f("date", "ymd"),
      f("returnDate", "ymd"),
      s("borrowerName"),
      s("unit"),
      s("purpose"),
      f("items", "json"),
      s("status"),
      s("pic"),
      f("returnedAt", "timestamp"),
      f("cancelledAt", "timestamp"),
    ],
    indexes: [["status"]],
  },
  archive_disposition: {
    model: "ArchiveDisposition",
    table: "archive_dispositions",
    titleKey: "statusLabel",
    dateKey: "executedAt",
    audit: true,
    fields: [
      s("type"),
      s("statusLabel"),
      f("executedAt", "timestamp"),
      f("formData", "json"),
      f("items", "json"),
      f("user", "string", "executedBy"),
    ],
    indexes: [["executedAt"]],
  },
  archive_move_log: {
    model: "ArchiveMoveLog",
    table: "archive_move_logs",
    titleKey: "description",
    dateKey: "date",
    fields: [
      f("date", "timestamp"),
      f("itemsCount", "int"),
      s("targetName"),
      f("user", "string", "performedBy"),
      s("description"),
      f("movedItems", "json"),
    ],
    indexes: [["date"]],
  },
} satisfies Record<string, TableSpec>;

export type RecordType = keyof typeof RECORD_TABLES;

export const RECORD_TYPES = Object.keys(RECORD_TABLES) as RecordType[];

export const fieldName = (spec: FieldSpec) => spec.field ?? spec.key;
