/**
 * Tipe entitas domain (payload di /records). Semua entitas boleh membawa `userId` (pemilik, diisi server) dan
 * `share` (item milik user lain yang dibagikan) — keduanya jangan diubah manual.
 */

import type { ShareMeta } from "./api";

export type Priority = "low" | "medium" | "high";

interface Owned {
  userId?: string;
  /** Diisi saat dimuat bila item milik user lain yang dibagikan (tidak disimpan) */
  share?: ShareMeta;
}

// ============================================================================
// Planner
// ============================================================================

export type AgendaColor = "planner" | "notes" | "overview" | "productivity" | "files" | "settings";
/** Key ikon dari paket ikon aplikasi (`lib/icons/icon-registry.ts`), mis. "briefcase". */
export type AgendaIcon = string;

/** Tipe agenda (Meeting, Kuliah, ...). */
export interface AgendaType extends Owned {
  id: string;
  name: string;
  order?: number;
  /** Warna penanda agenda; kosong = warna default dari nama */
  color?: AgendaColor;
  /** Ikon penanda agenda; kosong = ikon default dari nama */
  icon?: AgendaIcon;
}

/** Satu kali jadwal ulang agenda (dari → ke). */
export interface ScheduleReschedule {
  /** YYYY-MM-DD jadwal sebelum dipindah */
  fromDate: string;
  fromStartTime?: string;
  fromEndTime?: string;
  /** YYYY-MM-DD jadwal baru */
  toDate: string;
  toStartTime?: string;
  reason?: string;
  /** Waktu perubahan (ISO) */
  at: string;
}

/** Pola agenda berulang (mis. kuliah setiap Selasa & Kamis s.d. akhir semester). */
export interface ScheduleRecurrence {
  frequency: "daily" | "weekly" | "monthly";
  /** Setiap N hari/minggu/bulan (min. 1) */
  interval: number;
  /** Hari dalam minggu (0 = Minggu) untuk `weekly` */
  days?: number[];
  /** Batas tanggal terakhir (YYYY-MM-DD, inklusif) — salah satu dari `until` / `count` */
  until?: string;
  /** Jumlah pertemuan */
  count?: number;
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
  /** Link meeting / media online — boleh lebih dari satu, dipisah baris baru (baca lewat `scheduleLinks()`) */
  media?: string;
  /** Seri agenda berulang: semua pertemuan memakai `seriesId` & `recurrence` yang sama */
  seriesId?: string;
  recurrence?: ScheduleRecurrence;
  /** Riwayat jadwal ulang (dimajukan/dimundurkan); entri pertama = jadwal semula */
  reschedules?: ScheduleReschedule[];
  /** Keterangan / susunan acara */
  description?: string;
  /** Dasar pelaksanaan (undangan, surat tugas, ...) — opsional, format sama dengan lampiran Action/Task PARA */
  resources?: AttachedResource[];
  /** Hasil agenda: catatan Notes Space, upload, atau web link (format lampiran PARA) */
  results?: AttachedResource[];
  /** Ringkasan hasil agenda (teks bebas) */
  outcome?: string;
  /**
   * Project atau item Area (Sub Area/Kegiatan/Sub Kegiatan) pemilik agenda — sama seperti `ProjectTask.projectId`.
   * Agenda ikut diarsipkan/dihapus bersama induknya.
   */
  projectId?: string;
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
  /** Waktu diselesaikan (ISO); dipakai untuk menandai todo yang diselesaikan terlambat */
  completedAt?: string;
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
  /** Berkas dimasukkan ke File Control (Gantung) — otomatis menjadi Resource Global (`addToGlobal`) */
  toFileControl?: boolean;
  /** Tag bebas untuk Resource Global (kategori isi, mis. Regulasi) — dipakai bila lampiran disimpan ke Resource Global */
  tags?: string[];
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
  /** Tag bebas yang sengaja dihapus user di form Resource — tidak ditambahkan ulang dari lampiran (`mergeAttachmentTags`) */
  removedTags?: string[];
  /** Status kearsipan; terisi bila berkas dimasukkan ke File Control (lihat `file-control-intake.ts`) */
  archivalStatus?: ArchivalStatus;
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
  /** Tanggal — hanya Kegiatan / Sub Kegiatan (Sub Area = nama + deskripsi, lihat `areaLevelHasSchedule`) */
  deadline?: string;
  status?: ParaStatus;
  description?: string;
  /** Dasar Pelaksanaan — hanya Kegiatan / Sub Kegiatan */
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
  /** Agenda milik project / item area */
  schedules?: Schedule[];
}

export interface ParaArchive extends Owned {
  id: string;
  originalType: ArchiveOriginalType;
  originalId?: string;
  data: Record<string, unknown>;
  related?: ParaArchiveRelated;
  archivedAt: string;
}

/** SKP e-Kinerja (diambil robot). Satu tahun bisa terdiri dari beberapa SKP berperiode. */
export interface Skp extends Owned {
  id: string;
  /** Nomor SKP di e-Kinerja */
  externalId: string;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  status?: string;
  approach?: string;
  appraiser?: string;
  syncedAt?: string;
}

export interface SkpIndicator {
  aspect: string;
  indicator: string;
  target: string;
}

/**
 * Rencana Hasil Kerja (RHK) — tujuan pemetaan rencana aksi e-Kinerja. Dari robot: milik satu SKP (`skpId`) + bagian,
 * RHK pimpinan, indikator. Manual: tanpa `skpId`, per tahun.
 */
export interface SkpTarget extends Owned {
  id: string;
  year: number;
  skpId?: string;
  name: string;
  /** UTAMA | TAMBAHAN */
  section?: string;
  /** RHK pimpinan yang diintervensi */
  leader?: string;
  /** Indikator RHK pimpinan */
  leaderIndicator?: string;
  indicators?: SkpIndicator[];
  order?: number;
  /** RHK sudah tidak ada di SKP e-Kinerja tetapi masih dipakai rencana aksi */
  stale?: boolean;
}

export type ActionPlanSourceType = "task" | "activity" | "schedule" | "ekinerja";
/** draft = belum lengkap; ready = siap diisikan robot; filled = sudah terisi (draf) di e-Kinerja */
export type ActionPlanStatus = "draft" | "ready" | "filled";

/**
 * Rencana aksi bulanan yang dipilih user dari Productivity — "produk jadi" untuk robot e-Kinerja: bulan, RHK +
 * indikator, rencana aksi, realisasi, bukti data dukung. Satu entri = satu butir di setiap indikator terpilih.
 */
export interface ActionPlanEntry extends Owned {
  id: string;
  /** YYYY-MM */
  period: string;
  /** ID `Skp` yang periodenya mencakup bulan ini (beberapa SKP dalam setahun) */
  skpId?: string;
  /** ID `SkpTarget` */
  targetId?: string;
  /** Rencana aksi (butir "Renaksi" di e-Kinerja) */
  description: string;
  /** Realisasi untuk indikator kuantitas/kualitas */
  realization?: string;
  /** Realisasi indikator aspek WAKTU (bawaan "Penyampaian tepat waktu") */
  timeRealization?: string;
  /** Teks indikator RHK yang dicentang; kosong = semua indikator RHK */
  indicators?: string[];
  /** Bukti Data Dukung */
  documentUrl?: string;
  /** Brankas digital (beberapa berkas, satu tautan) yang menjadi bukti data dukung entri ini */
  vaultId?: string;
  /** Asal item di Productivity (hanya rujukan; entri tetap ada walau item dihapus) */
  sourceType?: ActionPlanSourceType;
  sourceId?: string;
  sourceTitle?: string;
  status: ActionPlanStatus;
  /** Waktu robot mengisikan ke e-Kinerja (ISO) */
  filledAt?: string;
  /** Pengenal perubahan: tanda tangan isi saat terakhir terisi di e-Kinerja (beda dengan isi sekarang = "Berubah") */
  pushedSignature?: string;
  /** Isi saat terakhir terisi di e-Kinerja (pembanding butir lama) */
  pushed?: Pick<
    ActionPlanEntry,
    "targetId" | "description" | "realization" | "timeRealization" | "documentUrl" | "indicators"
  >;
  /** Ditandai hapus: butirnya akan dihapus dari e-Kinerja saat Kirim perubahan, lalu entri dihapus */
  deleted?: boolean;
  createdAt?: string;
}

/** Keadaan bulan Rencana Aksi di e-Kinerja. */
export type ActionPlanMonthStatus = "empty" | "unavailable" | "draft" | "submitted" | "rated";

/** Potret satu bulan Rencana Aksi di e-Kinerja (dibaca robot "Ambil dari e-Kinerja"). */
export interface ActionPlanMonth extends Owned {
  id: string;
  /** YYYY-MM */
  period: string;
  skpId: string;
  status: ActionPlanMonthStatus;
  /** Tanggal diajukan ke atasan (YYYY-MM-DD) */
  submittedAt?: string;
  workday?: number;
  ratings?: { hasilKerja?: string; perilaku?: string; predikat?: string; tunkin?: string };
  rows?: {
    key: string;
    text: string;
    feedback?: string;
    renaksi: string[];
    realisasi: string[];
    bukti: string[];
  }[];
  syncedAt?: string;
}

/** Naskah keluar SRIKANDI (diambil robot; PDF ber-TTD = berkas LifeOS `uploadId`). */
export interface SrikandiLetter extends Owned {
  id: string;
  /** Kunci = nomor naskah */
  key: string;
  number: string;
  /** YYYY-MM-DD */
  date?: string;
  dateText?: string;
  subject: string;
  origin?: string;
  verifyStatus?: string;
  signStatus?: string;
  sendStatus?: string;
  fileStatus?: string;
  uploadId?: string;
  importedAt?: string;
  syncedAt?: string;
  /** Lampiran naskah (berkas LifeOS; tanpa `uploadId` = belum terambil) */
  attachments?: { name: string; uploadId?: string }[];
  /** PDF utama + semua lampiran sudah di LifeOS */
  attachmentsComplete?: boolean;
  /** uploadId → ID Resource Global yang dibuat (tag "Dokumen Final", masuk File Control) */
  resources?: Record<string, string>;
}

export type SrikandiReferenceCategory =
  "signer" | "recipient" | "recipient_group" | "verifier" | "cc" | "cc_group" | "disposition_group" | "classification";

/** Referensi SRIKANDI (menu Pengguna) — pilihan formulir Register Naskah Keluar. */
export interface SrikandiReference extends Owned {
  id: string;
  category: SrikandiReferenceCategory;
  /** Nama / Kepada / Nama Grup */
  label: string;
  /** Kolom lain (Jabatan, Unit Kerja / Instansi, Jenis Tujuan, Deskripsi, Jumlah Tujuan, …) */
  fields?: Record<string, string>;
  order?: number;
  syncedAt?: string;
}

/** Tipe form Registrasi Naskah Keluar SRIKANDI: verifikasi & TTE di SRIKANDI, atau naskah sudah final di luar SRIKANDI. */
export type SrikandiFormType = "keluar" | "final";

/** Berkas di entri register (berkas LifeOS). `owned` = diunggah lewat register → ikut dihapus bersama entri. */
export interface SrikandiOutgoingFile {
  uploadId: string;
  name: string;
  mimeType?: string;
  size?: number;
  owned?: boolean;
}

/** Pilihan referensi SRIKANDI yang disalin ke entri (label tetap ada walau referensi diambil ulang / hilang). */
export interface SrikandiPick {
  id: string;
  label: string;
}

/** Status yang disimpan; "belum lengkap / siap" dihitung dari isian (`registerStatus`). */
export type SrikandiOutgoingStage = "draft" | "submitted" | "done";

/**
 * Register Naskah Keluar: gerbang LifeOS sebelum naskah didaftarkan ke SRIKANDI. Isian mengikuti formulir Registrasi
 * Naskah Keluar SRIKANDI; berkas mentah berasal dari Approval atau Productivity; naskah final ditautkan lewat `letterId`.
 */
export interface SrikandiOutgoing extends Owned {
  id: string;
  formType: SrikandiFormType;
  /** Dikirimkan melalui (unit kerja) */
  unit?: string;
  /** Jenis Naskah (mis. Nota Dinas) */
  docType?: string;
  /** Sifat Naskah (mis. Biasa) */
  nature?: string;
  /** Kode/nama klasifikasi arsip SRIKANDI (mis. KA.01 - Administrasi Persuratan) */
  classification?: string;
  /** Nomor naskah sementara; kosong + `autoNumber` = tombol Ambil Nomor di SRIKANDI */
  number?: string;
  autoNumber?: boolean;
  /** Nomor naskah lain yang dirujuk (opsional) */
  reference?: string;
  /** Hal */
  subject: string;
  /** Isi Ringkas */
  summary?: string;
  /** File naskah (DOCX/PDF) — sama dengan `file.uploadId` agar bisa diindeks */
  uploadId?: string;
  file?: SrikandiOutgoingFile;
  attachments?: SrikandiOutgoingFile[];
  recipientGroups?: SrikandiPick[];
  /** Utama (Internal / Eksternal SRIKANDI) */
  recipients?: SrikandiPick[];
  /** Utama Eksternal Non SRIKANDI */
  recipientsExternal?: SrikandiPick[];
  ccGroups?: SrikandiPick[];
  cc?: SrikandiPick[];
  ccExternal?: SrikandiPick[];
  /** Hanya tipe "keluar" */
  verifiers?: SrikandiPick[];
  signer?: SrikandiPick;
  signatureType?: "elektronik" | "konvensional";
  visualTte?: "qr" | "spesimen";
  status: SrikandiOutgoingStage;
  /** Asal berkas mentah */
  sourceType?: "request" | "file" | "upload";
  /** ID pengajuan Approval (sourceType "request") */
  sourceId?: string;
  sourceTitle?: string;
  /** Waktu entri didaftarkan ke SRIKANDI (ISO) — oleh user, nanti oleh robot */
  submittedAt?: string;
  /** Naskah final (`srikandi_letter.id`) dari Daftar Naskah Keluar */
  letterId?: string;
  /** PDF final juga ditautkan sebagai dokumen final dari file naskah DOCX (konsep ↔ final ONLYOFFICE) */
  draftLinked?: boolean;
  notes?: string;
  createdAt?: string;
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

/** Tulisan tangan (lihat features/notes/ink/ink-logic.ts). */
export interface NoteInk {
  version: 1;
  height: number;
  paper: "plain" | "lined" | "grid" | "dots";
  strokes: {
    tool: "pen" | "highlighter";
    color: string;
    size: number;
    points: number[];
    pressure: boolean;
  }[];
}

export interface FreeNote extends Owned {
  id: string | number;
  title: string;
  /** "text" (default) = diketik dengan editor; "handwriting" = halaman tulis tangan penuh */
  kind?: "text" | "handwriting";
  /**
   * Teks biasa untuk pencarian, pratinjau, chatbot, dan indeks AI: isi editor tanpa format (catatan ketik) atau teks
   * hasil pengenalan tulisan tangan.
   */
  content?: string;
  /** Isi editor berformat (JSON Tiptap). Catatan lama tanpa `doc` dibaca dari `content`. */
  doc?: unknown;
  /** Halaman tulis tangan (kind = handwriting) */
  ink?: NoteInk;
  color?: string;
  /** Disematkan di urutan teratas */
  /**
   * Berkas pemilik yang dilepas kolaborator berizin Edit (kolaborator tidak boleh menghapusnya) — dibersihkan saat
   * pemilik membuka Notes (`useOrphanUploadsJanitor`).
   */
  orphanUploadIds?: string[];
  pinned?: boolean;
  updatedAt?: string;
}

/** Lampiran file AI Note (berkas tersimpan di object storage). */
export interface NoteFileAttachment {
  /** Kunci dokumen di dalam catatan (`documentTexts`). */
  id?: string;
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
  /** Dokumen tambahan (bisa banyak); `fileAttachment` & `fileContext` = bentuk lama satu dokumen, tetap terbaca. */
  fileAttachments?: NoteFileAttachment[];
  /** Teks hasil baca per dokumen (kunci = `NoteFileAttachment.id`). */
  documentTexts?: Record<string, string>;
  /** Disematkan di urutan teratas */
  /**
   * Berkas pemilik yang dilepas kolaborator berizin Edit (kolaborator tidak boleh menghapusnya) — dibersihkan saat
   * pemilik membuka Notes (`useOrphanUploadsJanitor`).
   */
  orphanUploadIds?: string[];
  pinned?: boolean;
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
