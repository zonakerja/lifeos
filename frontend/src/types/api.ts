export type UserRole = "super_admin" | "admin" | "member";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  address: string | null;
  /** Provider AI yang sedang dipakai (null = AI belum diatur). */
  aiProvider: AiProviderId | null;
  createdAt: string;
  updatedAt: string;
}

export type AiProviderId = "gemini" | "anthropic" | "openai";
export type AiAttachmentKind = "image" | "pdf" | "audio" | "text";

export interface AiProviderSettings {
  id: AiProviderId;
  label: string;
  defaultModel: string;
  suggestedModels: string[];
  supports: Record<AiAttachmentKind, boolean>;
  keyUrl: string;
  configured: boolean;
  /** 4 karakter terakhir API key (key utuh tidak pernah dikirim ke browser). */
  keyHint: string | null;
  /** null = model default provider. */
  model: string | null;
  updatedAt: string | null;
}

export interface AiSettings {
  activeProvider: AiProviderId | null;
  /** Cadangan otomatis ke provider lain yang punya key (kuota habis, tidak terjangkau, lampiran tak didukung). */
  fallbackEnabled: boolean;
  /** Indeks pengetahuan (RAG) dengan embedding Gemini. */
  indexEnabled: boolean;
  providers: AiProviderSettings[];
}

export interface AiIndexStatus {
  enabled: boolean;
  /** User punya API key Gemini (dipakai untuk embedding). */
  embeddingAvailable: boolean;
  model: string;
  sources: number;
  chunks: number;
  /** Potongan yang sudah ber-embedding (sisanya hanya bisa dicari dengan kata persis). */
  embeddedChunks: number;
  lastIndexedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  /** Job indeks yang belum selesai (semua user). */
  pendingJobs: number;
}

export interface AiSearchHit {
  id: string;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  title: string;
  content: string;
  score: number;
}

export interface AiGenerateResult {
  text: string;
  provider: AiProviderId;
  model: string;
  /** Terisi bila jawaban diberikan provider cadangan, bukan provider aktif. */
  fallback?: {
    from: AiProviderId;
    reason: "attachment" | "quota" | "unavailable" | "credential";
    message: string;
  } | null;
}

/** Respons login/refresh. Refresh token dikirim sebagai cookie httpOnly, bukan di body. */
export interface AuthSession {
  user: PublicUser;
  accessToken: string;
}

export interface AppSettings {
  id: string;
  name: string;
  navSub: string;
  loginSub: string;
  motto: string;
  welcomeTitle: string;
  welcomeSub: string;
  footerText: string;
  /** Penanda versi logo (null = belum ada logo); gambar via `appLogoUrl()`. */
  logoVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AppSettingsInput = Partial<
  Pick<AppSettings, "name" | "navSub" | "loginSub" | "motto" | "welcomeTitle" | "welcomeSub" | "footerText">
> & {
  /** Data URL gambar = ganti logo, string kosong = hapus; tidak dikirim = tetap. */
  appLogo?: string;
};

export const RECORD_TYPES = [
  "agenda_type",
  "routine",
  "schedule",
  "todo",
  "completion",
  "free_note",
  "ai_note",
  "list",
  "para_project",
  "para_area",
  "para_task",
  "para_activity",
  "para_resource",
  "para_archive",
  "para_archive_log",
  "archive_classification",
  "archive_jra",
  "archive_physical_reference",
  "archive_borrowing",
  "archive_disposition",
  "archive_move_log",
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

export interface ApiRecord<T = Record<string, unknown>> {
  id: string;
  clientId: string;
  type: RecordType;
  userId: string;
  title: string | null;
  date: string | null;
  payload: T;
  createdAt: string;
  updatedAt: string;
  /** Terisi bila record milik user lain yang dibagikan ke user ini */
  share?: ShareMeta;
}

// ============================================================================
// Berbagi & komentar
// ============================================================================

/** view = baca; comment = baca + komentar; edit = ubah isi & tambah turunan. */
export type SharePermission = "view" | "comment" | "edit";

/** Record type yang bisa dibagikan sebagai item induk (sama dengan backend `SHAREABLE_TYPES`). */
export type ShareableType =
  | "para_project"
  | "para_area"
  | "para_resource"
  | "free_note"
  | "ai_note"
  | "list"
  | "schedule"
  /** Seluruh pertemuan satu seri agenda berulang (id = `seriesId`) */
  | "schedule_series";

/** Penanda item milik user lain yang dapat diakses lewat berbagi. */
export interface ShareMeta {
  ownerId: string;
  ownerName: string;
  permission: SharePermission;
  /** true = item yang dibagikan langsung; false = turunan/rujukan/lampirannya */
  root: boolean;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
}

export interface ShareEntry {
  id: string;
  ownerId: string;
  recipientId: string;
  recordType: ShareableType;
  recordId: string;
  permission: SharePermission;
  createdAt: string;
  updatedAt: string;
  recipient?: UserSummary;
  owner?: UserSummary;
  /** Judul item (null = sudah dihapus/diarsipkan pemilik) — hanya di daftar masuk/keluar */
  item?: { title: string | null; date: string | null } | null;
}

export interface RecordComment {
  id: string;
  ownerId: string;
  recordType: string;
  recordId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string };
}

/** Statistik pemakaian per user untuk admin (tanpa isi data). */
export interface UserStats {
  userId: string;
  records: number;
  files: number;
  storageBytes: number;
  sharesOut: number;
  sharesIn: number;
  lastActiveAt: string | null;
}

export interface UploadedAsset {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  checksum: string;
  status: "uploaded" | "queued" | "extracting" | "ready" | "failed";
  context: string | null;
  extractionStatus: "pending" | "extracting" | "completed" | "unsupported" | "failed" | null;
  summary: string | null;
  createdAt: string;
  url: string;
}

/** Hasil ekstraksi teks berkas di backend (`GET /uploads/:id/metadata`). */
export interface AssetExtractionInfo {
  status: "pending" | "extracting" | "completed" | "unsupported" | "failed";
  extractedText: string | null;
  /** `reason` diisi bila tidak ada teks: unsupported_type | too_large | needs_gemini_key | empty */
  metadata: { reason?: string; method?: string; pages?: number } | null;
  error: string | null;
}

export interface AssetMetadata {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  extraction: AssetExtractionInfo | null;
}

// ---------------------------------------------------------------------------- My Notebook

export type NotebookSourceKind = "upload" | "record" | "text" | "web";
export type NotebookSourceStatus = "ready" | "processing" | "failed" | "missing";
/** Item LifeOS yang bisa dijadikan sumber notebook (sama dengan backend `NOTEBOOK_RECORD_TYPES`). */
export type NotebookRecordType = "free_note" | "ai_note" | "list" | "para_resource";

export interface NotebookListItem {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  hasSummary: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { sources: number; notes: number; messages: number };
}

export interface NotebookSource {
  id: string;
  kind: NotebookSourceKind;
  title: string;
  enabled: boolean;
  assetId: string | null;
  recordType: NotebookRecordType | null;
  recordId: string | null;
  url: string | null;
  status: NotebookSourceStatus;
  error: string | null;
  /** Jenis berkas (sumber unggahan) */
  mimeType: string | null;
  /** true = diunggah langsung ke notebook (ikut terhapus bersama notebook); false = berkas/ item dari LifeOS */
  ownedByNotebook: boolean;
  /** Jumlah karakter teks yang dibaca AI */
  chars: number;
  preview: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotebookSummary {
  overview: string;
  keyPoints: string[];
  questions: string[];
}

export interface NotebookDetail {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  summary: NotebookSummary | null;
  summaryAt: string | null;
  summaryStale: boolean;
  createdAt: string;
  updatedAt: string;
  sources: NotebookSource[];
}

export interface NotebookCitation {
  n: number;
  /** ID sumber notebook */
  sourceId: string;
  title: string;
  excerpt: string;
}

export interface NotebookAttachment {
  uploadId: string;
  name: string;
  mimeType: string;
}

export interface NotebookMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: NotebookCitation[] | null;
  /** Gambar yang dilampirkan pengguna */
  attachments?: NotebookAttachment[] | null;
  createdAt: string;
}

export interface NotebookChatResult {
  userMessage: NotebookMessage;
  assistantMessage: NotebookMessage;
  /** full = seluruh sumber dibaca; rag = potongan paling relevan */
  mode: "full" | "rag";
  fallback: AiGenerateResult["fallback"];
}

export interface NotebookNote {
  id: string;
  title: string;
  /** Markdown */
  content: string;
  origin: "chat" | "summary" | "manual";
  createdAt: string;
  updatedAt: string;
}

export type AddNotebookSourceInput =
  | { kind: "upload"; assetId: string; title?: string }
  | { kind: "record"; recordType: NotebookRecordType; recordId: string }
  | { kind: "text"; content: string; title?: string }
  | { kind: "web"; url: string; title?: string };

// ---------------------------------------------------------------------------- ONLYOFFICE (Tools → ONLYOFFICE)

export type OfficeFormat = "docx" | "xlsx" | "pptx" | "pdf";
export type OfficeAccess = "edit" | "comment" | "view";

export interface OfficeStatus {
  enabled: boolean;
  /** URL server ONLYOFFICE yang dibuka browser (memuat `api.js`) */
  documentServerUrl: string | null;
  /** Format yang bisa disunting (edit + lossy-edit, daftar resmi ONLYOFFICE) */
  editableFormats: string[];
  /** Semua format yang bisa dibuka */
  viewableFormats: string[];
}

/** Halaman Tools → ONLYOFFICE: kesehatan server; `details` hanya untuk admin. */
export interface OfficeDiagnostics extends OfficeStatus {
  jwtConfigured: boolean;
  healthy: boolean;
  version: string | null;
  details: { internalUrl: string; backendUrl: string; maxVersions: number } | null;
}

/** Config `DocsAPI.DocEditor` bertanda tangan dari backend — dipakai apa adanya (tidak boleh diubah). */
export interface OfficeEditorConfig {
  documentType: string;
  document: { fileType: string; key: string; title: string };
  editorConfig: { mode: "edit" | "view" };
  token: string;
  [key: string]: unknown;
}

export interface OfficePreferences {
  /** Tab AI di editor ONLYOFFICE aktif (memakai provider & key di Pengaturan → AI) */
  ai: boolean;
  /** Provider AI aktif user punya API key */
  aiReady: boolean;
  /** Provider & model yang akan menjawab; null = AI belum diatur */
  provider: { label: string; model: string } | null;
}

/** Ringkasan berkas pada tautan konsep ↔ dokumen final. */
export interface OfficeLinkedFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

/** Tautan satu berkas: konsepnya (bila berkas ini final) dan dokumen final-nya (bila berkas ini konsep). */
export interface OfficeLinks {
  /** Pemilik berkas ini (dokumen final diunggah ke ruang pemilik konsep) */
  ownerId: string;
  /** Berkas bisa menjadi konsep (dokumen/spreadsheet/presentasi) */
  draftCapable: boolean;
  draft: OfficeLinkedFile | null;
  finals: OfficeLinkedFile[];
}

/** Penanda tautan per id berkas (hanya berkas yang punya konsep atau final). */
export type OfficeLinkBadges = Record<string, { draftId: string | null; finals: number }>;

/** Templat dokumen milik user (Tools → ONLYOFFICE), berkas dengan konteks `office-template`. */
export interface OfficeTemplate {
  id: string;
  /** Nama tanpa ekstensi */
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  /** Jenis dokumen baru yang dibuat dari templat ini */
  target: OfficeFormat;
}

export interface OfficeFontFile {
  name: string;
  size: number;
  updatedAt: string;
}

/** Font server ONLYOFFICE (khusus admin). */
export interface OfficeFonts {
  /** Server ONLYOFFICE menjawab */
  available: boolean;
  families: string[];
  /** Berkas font tambahan di folder bersama */
  files: OfficeFontFile[];
  /** Folder font diatur di server (ONLYOFFICE_FONTS_DIR) → admin bisa mengunggah */
  uploadEnabled: boolean;
}

export interface OfficeConfigResult {
  documentServerUrl: string;
  access: OfficeAccess;
  /** Tab AI (AI LifeOS) aktif di sesi editor ini */
  ai: boolean;
  /** Format bisa disunting tetapi sebagian format bisa hilang saat disimpan (ODT, RTF, CSV, TXT, …) */
  lossy: boolean;
  version: number;
  config: OfficeEditorConfig;
}

export interface OfficeVersion {
  version: number;
  current: boolean;
  size: number;
  createdAt: string;
  authorName: string | null;
}

export interface OfficeVersions {
  canRestore: boolean;
  versions: OfficeVersion[];
}
