/**
 * Tipe entitas domain (payload di /records). Semua entitas boleh membawa `userId`
 * (diisi server) — jangan diubah manual kecuali oleh admin.
 */

export type Priority = "low" | "medium" | "high";

interface Owned {
  userId?: string;
}

// ============================================================================
// Planner
// ============================================================================

/** Tipe agenda (Meeting, Kuliah, ...). */
export interface AgendaType extends Owned {
  id: string;
  name: string;
  order?: number;
}

export interface Schedule extends Owned {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  startDate?: string;
  /** YYYY-MM-DD; sama dengan startDate untuk agenda 1 hari */
  endDate?: string;
  /** Alternatif: tanggal tunggal (tanpa startDate/endDate) */
  date?: string;
  /** HH:mm */
  startTime?: string;
  /** Alternatif: jam tunggal */
  time?: string;
  endTime?: string;
  isAllDay?: boolean;
  type?: string;
  location?: string;
  media?: string;
}

export interface FreezePeriod {
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  reason: string;
}

export type RoutineFrequency = "daily" | "weekly" | "monthly" | "interval";
export type IntervalType = "days" | "weeks" | "months" | "years";

export interface Routine extends Owned {
  id: string;
  title: string;
  frequency: RoutineFrequency;
  /** Hari dalam minggu (0 = Minggu) untuk frequency weekly */
  days?: number[];
  interval?: number;
  intervalType?: IntervalType;
  /** Tanggal dalam bulan sebagai string ("1".."31") untuk frequency monthly */
  monthDates?: string[];
  /** YYYY-MM-DD */
  startDate?: string;
  createdAt?: string;
  active?: boolean;
  archived?: boolean;
  freezePeriods?: FreezePeriod[];
}

export interface Todo extends Owned {
  id: string;
  title: string;
  completed: boolean;
  /** Date.toDateString(), mis. "Thu Oct 08 2026" */
  date: string;
  priority: Priority;
}

/** Penyelesaian rutinitas per tanggal. Tidak punya `id`; kunci = routineId + date. */
export interface Completion extends Owned {
  id?: string;
  routineId: string;
  /** Tanggal terjadwal (Date.toDateString()) */
  date: string;
  /** Tanggal aktual dikerjakan (Date.toDateString()) */
  actualDate: string;
  note: string;
  completedAt: string;
}

export const completionId = (c: Pick<Completion, "routineId" | "date">) => `${c.routineId}:${c.date}`;

// ============================================================================
// Resources (lampiran & resource global)
// ============================================================================

export type AttachmentType = "link" | "file" | "note" | "existing";

/** Resource yang dilampirkan ke task/project/notes. */
export interface AttachedResource {
  id: string;
  type: AttachmentType;
  number?: string;
  name?: string;
  title?: string;
  description?: string;
  content?: string;
  /** YYYY-MM-DD */
  date?: string;
  url?: string;
  /** ID Asset backend untuk file yang di-upload */
  uploadId?: string;
  mimeType?: string;
  size?: number;
  /** ID resource global yang dirujuk (type "existing") */
  existingId?: string;
  /** ID catatan yang dirujuk: "free-<id>" | "ai-<id>" | "list-<id>" (type "note") */
  noteId?: string;
  addToGlobal?: boolean;
  aiSummary?: string;
}

/** Resource global (PARA Resources). */
export interface Resource extends Owned {
  id: string;
  number?: string;
  title: string;
  content?: string;
  type: "link" | "file" | "note" | string;
  url?: string;
  uploadId?: string;
  mimeType?: string;
  noteId?: string;
  date?: string;
  createdAt?: string;
  tags?: string[];
  /** Alternatif: tag tunggal */
  sourceTag?: string;
  aiSummary?: string;
}

// ============================================================================
// Productivity (PARA) — dilengkapi saat porting modul Productivity
// ============================================================================

export type ParaStatus = "active" | "completed" | "on-hold" | "archived" | string;

export interface Area extends Owned {
  id: string;
  title: string;
  description?: string;
  color?: string;
  createdAt?: string;
}

export interface Project extends Owned {
  id: string;
  title: string;
  description?: string;
  areaId?: string;
  startDate?: string;
  deadline?: string;
  status?: ParaStatus;
  progress?: number;
  linkedNotes?: string[];
  resources?: AttachedResource[];
  createdAt?: string;
}

/**
 * Item bertingkat di dalam Area (punya tasks seperti project). Hierarki:
 * Area → **Sub Area** (tanpa `parentId`) → **Kegiatan** → **Sub Kegiatan** → Task; task boleh melekat di tingkat
 * mana pun. Tingkat ditentukan rantai `parentId` (lihat `features/productivity/lib/para.ts`).
 */
export interface Activity extends Owned {
  id: string;
  title: string;
  /** Selalu diisi di semua tingkat (memudahkan filter & arsip per area) */
  areaId?: string;
  /** ID induk: kosong = Sub Area; induk Sub Area = Kegiatan; induk Kegiatan = Sub Kegiatan */
  parentId?: string;
  deadline?: string;
  status?: ParaStatus;
  description?: string;
  resources?: AttachedResource[];
  createdAt?: string;
}

/** Task (milik Activity) atau Action (milik Project). `projectId` merujuk ke keduanya. */
export interface ProjectTask extends Owned {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  /** YYYY-MM-DD */
  dueDate?: string;
  priority?: Priority;
  weight?: number;
  completed?: boolean;
  completedAt?: string;
  resources?: AttachedResource[];
  type?: string;
  createdAt?: string;
}

export type ArchiveOriginalType = "project" | "area" | "resource" | "activity";

/** Turunan yang ikut diarsipkan bersama item induk (dipulihkan bersamaan). */
export interface ParaArchiveRelated {
  projects?: Project[];
  activities?: Activity[];
  /** Action milik project & task milik kegiatan */
  tasks?: ProjectTask[];
}

export interface ParaArchive extends Owned {
  id: string;
  originalType: ArchiveOriginalType;
  originalId?: string;
  data: Record<string, unknown>;
  related?: ParaArchiveRelated;
  archivedAt: string;
}

/** Riwayat arsip & pemulihan PARA (append-only). */
export interface ParaArchiveLog extends Owned {
  id: string;
  action: "archived" | "restored";
  originalType: ArchiveOriginalType;
  originalId?: string;
  /** ID entri `para_archive` terkait */
  archiveId: string;
  title: string;
  /** Ringkasan turunan, mis. "1 project · 2 task" */
  summary?: string;
  /** Nama pengguna yang melakukan aksi */
  actorName?: string;
  /** Waktu aksi (ISO) */
  at: string;
}

// ============================================================================
// Notes — dilengkapi saat porting modul Notes
// ============================================================================

export interface FreeNote extends Owned {
  id: string | number;
  title: string;
  content?: string;
  color?: string;
  updatedAt?: string;
}

/** Lampiran file AI Note (berkas tersimpan di object storage). */
export interface NoteFileAttachment {
  name: string;
  uploadId?: string;
  mimeType?: string;
}

export interface AiNote extends Owned {
  id: string | number;
  title: string;
  /** YYYY-MM-DD */
  date?: string;
  linkedScheduleId?: string;
  /** Catatan kasar user */
  content?: string;
  aiSummary?: string;
  audioTranscript?: string;
  /** Teks hasil ekstraksi dokumen oleh AI */
  fileContext?: string;
  hasAudio?: boolean;
  /** ID Asset rekaman/upload audio */
  audioUploadId?: string;
  /** Bisa berupa objek kosong bila lampiran tidak tersedia */
  fileAttachment?: NoteFileAttachment | Record<string, never> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListItem {
  id: string | number;
  text: string;
  checked: boolean;
}

export interface FreeList extends Owned {
  id: string | number;
  title: string;
  archived?: boolean;
  items: ListItem[];
}

// ============================================================================
// File Control (kearsipan)
// ============================================================================

export type ArchivalStatus = "pending" | "physical" | "digital" | "none";
/** Status siklus hidup yang disimpan. `expired` hanya hasil hitung (lihat computeDynamicStatus). */
export type ArchiveLifecycle = "active" | "inactive" | "static" | "destroyed";
export type DynamicStatus = ArchiveLifecycle | "expired";
/** Jenis penyusutan: pemusnahan ("destroy") atau penyerahan statis ("transfer"). */
export type DispositionType = "destroy" | "transfer";

export interface DispositionData {
  legalNumber?: string;
  /** YYYY-MM-DD */
  date?: string;
  description?: string;
  userNote?: string;
  executedAt?: string;
  type?: DispositionType;
  fileUrl?: string;
  uploadId?: string;
  fileName?: string;
}

/** Field kearsipan yang ditempelkan pada Resource bertipe file. */
export interface ArchiveFields {
  archivalStatus?: ArchivalStatus;
  classificationId?: string;
  jraId?: string;
  /** YYYY-MM-DD */
  retentionActiveDate?: string;
  /** YYYY-MM-DD */
  retentionInactiveDate?: string;
  status?: ArchiveLifecycle | string;
  physLocationId?: string;
  physRackId?: string;
  physBoxId?: string;
  physFolderId?: string;
  digitalApp?: string;
  digitalLink?: string;
  notes?: string;
  /** ARC-YYYY-xxxxxx */
  archiveRegId?: string;
  isVital?: boolean;
  isAutoDispose?: boolean;
  dispositionData?: DispositionData | null;
  description?: string;
  name?: string;
  classificationCode?: string;
}

export type ArchiveResource = Resource & ArchiveFields;

export interface ArchiveClassification extends Owned {
  id: string;
  jenis?: "Fasilitatif" | "Substantif" | string;
  kodePokok: string;
  namaPokok?: string;
  kodeSub: string;
  namaSub?: string;
  kodeItem: string;
  namaItem: string;
}

export type JraKeterangan = "Musnah" | "Permanen" | "Dinilai Kembali" | string;

export interface ArchiveJra extends Owned {
  id: string;
  kategoriUtama?: string;
  subKategori?: string;
  jenisArsip: string;
  retensiAktif: number | string;
  retensiInaktif: number | string;
  keterangan: JraKeterangan;
}

export type PhysRefType = "location" | "rack" | "box" | "folder";

export interface PhysicalReference extends Owned {
  id: string;
  type: PhysRefType;
  /** "" = root */
  parentId?: string;
  code: string;
  name: string;
  description?: string;
}

/** Ringkasan arsip yang disimpan di transaksi (peminjaman / berita acara). */
export interface ArchiveItemRef {
  id: string;
  title?: string;
  number?: string;
  archiveRegId?: string;
}

export type BorrowingStatus = "active" | "returned" | "cancelled";

export interface ArchiveBorrowing extends Owned {
  /** BAP-PINJAM-<ts> */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM-DD */
  returnDate: string;
  borrowerName: string;
  unit?: string;
  purpose?: string;
  items: ArchiveItemRef[];
  status: BorrowingStatus;
  pic?: string;
  returnedAt?: string;
  cancelledAt?: string;
}

export interface ArchiveDispositionLog extends Owned {
  id: string;
  type: DispositionType;
  statusLabel: string;
  executedAt: string;
  formData?: DispositionData & { dasarHukum?: string };
  items: ArchiveItemRef[];
  user?: string;
}

export interface MovedItem {
  id: string;
  name: string;
  code: string;
  type: string;
}

export interface ArchiveMoveLog extends Owned {
  /** MV-LOG | MV-CTR | MV-BLK -<ts>-<rnd> */
  id: string;
  date: string;
  itemsCount: number;
  targetName: string;
  user?: string;
  /** Diawali "ARSIP | ", "WADAH | ", atau "MASSAL | " */
  description: string;
  movedItems?: MovedItem[];
}
