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
  /** Alamat API router; null = langsung ke API resmi provider. */
  baseUrl: string | null;
  apiFormat: AiApiFormat | null;
  /** ID model embedding di router (null = ID resmi). */
  embeddingModel: string | null;
  /** Host router untuk label (null = langsung). */
  via: string | null;
  /** Format API yang bisa dipakai provider ini lewat router. */
  formats: AiApiFormat[];
  /** Model embedding resmi (null = provider ini tidak dipakai untuk embedding). */
  defaultEmbeddingModel: string | null;
}

/** Format API router: OpenAI Chat Completions atau Anthropic Messages (khusus Claude). */
export type AiApiFormat = "openai" | "anthropic";

export interface AiProviderInput {
  apiKey?: string;
  model?: string | null;
  /** null/"" = langsung ke API resmi; alamat = lewat router */
  baseUrl?: string | null;
  apiFormat?: AiApiFormat;
  embeddingModel?: string | null;
}

export interface AiSettings {
  activeProvider: AiProviderId | null;
  /** Cadangan otomatis ke provider lain yang punya key (kuota habis, tidak terjangkau, lampiran tak didukung). */
  fallbackEnabled: boolean;
  /** Indeks pengetahuan (RAG) dengan embedding Gemini/OpenAI. */
  indexEnabled: boolean;
  /** Pembagian tugas AI yang dipilih user (kosong = bawaan) */
  routing: AiRouting;
  /** Provider yang benar-benar dipakai per tugas (pilihan + key yang tersedia) */
  effective: {
    chat: AiProviderId | null;
    general: AiProviderId | null;
    agent: AiProviderId | null;
    ocr: AiProviderId | null;
    embedding: AiEmbeddingProvider | null;
    /** Cadangan pertama yang benar-benar dipakai bila provider tugas gagal (null = tidak ada cadangan) */
    chatBackup: AiProviderId | null;
    generalBackup: AiProviderId | null;
    agentBackup: AiProviderId | null;
  };
  providers: AiProviderSettings[];
}

export type AiEmbeddingProvider = "gemini" | "openai";

export interface AiRouting {
  chat?: AiProviderId | null;
  general?: AiProviderId | null;
  agent?: AiProviderId | null;
  ocr?: AiProviderId | null;
  embedding?: AiEmbeddingProvider | null;
  /** Cadangan pertama per tugas (kuota habis / provider sibuk / tak terjangkau); kosong = urutan bawaan */
  chatBackup?: AiProviderId | null;
  generalBackup?: AiProviderId | null;
  agentBackup?: AiProviderId | null;
}

export interface AiIndexStatus {
  enabled: boolean;
  /** User punya API key untuk embedding (Gemini atau OpenAI). */
  embeddingAvailable: boolean;
  embeddingProvider: AiEmbeddingProvider | null;
  /** Model embedding yang dipakai; null = pencarian kata saja */
  model: string | null;
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
  /** `knowledge` = basis pengetahuan (vault Obsidian), `workspace` = data kerja */
  collection: string;
  metadata: Record<string, unknown> | null;
  score: number;
}

// ---------------------------------------------------------------- Integrasi agen (token akses + MCP)

export type ApiScope =
  | "knowledge:read"
  | "knowledge:write"
  | "workspace:read"
  | "workspace:write"
  | "ai:chat"
  | "requests:read"
  | "requests:write"
  | "ai:model";

export interface ApiTokenInfo {
  id: string;
  name: string;
  /** Awal token untuk dikenali (bukan rahasia) */
  prefix: string;
  scopes: ApiScope[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

/** Token baru: `token` utuh hanya dikirim sekali saat dibuat */
export interface CreatedApiToken extends ApiTokenInfo {
  token: string;
}

export interface AgentActivity {
  id: string;
  tokenName: string;
  tool: string;
  input: unknown;
  status: "ok" | "error";
  message: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------- Chatbot LifeOS & basis pengetahuan

export interface AiChatCitation {
  n: number;
  /** Record type, `asset`, atau `obsidian` (catatan vault) */
  sourceType: string;
  sourceId: string;
  collection: string;
  title: string;
  excerpt: string;
  /** Catatan tertaut (graf `[[...]]`), bukan hasil pencarian langsung */
  linked?: boolean;
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: AiChatCitation[] | null;
  createdAt: string;
}

export interface AiConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatResult {
  conversation: AiConversation;
  userMessage: AiChatMessage;
  assistantMessage: AiChatMessage;
  fallback?: { from: AiProviderId; reason: string; message: string };
  used: { knowledge: number; workspace: number };
}

export type KnowledgeExportKind = "notes" | "lists" | "aiNotes" | "notebooks" | "productivity";

/** Cermin satu arah hasil kerja LifeOS ke folder `80-LifeOS` vault (`GET /knowledge/export`). */
export interface KnowledgeExport {
  enabled: boolean;
  kinds: Record<KnowledgeExportKind, boolean>;
  folder: string;
  vaultReady: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastError: string | null;
  files: number | null;
  written: number | null;
  removed: number | null;
}

export interface KnowledgeStatus {
  /** Server punya folder vault (KNOWLEDGE_VAULTS_DIR) */
  configured: boolean;
  folder: string | null;
  folderExists: boolean;
  watching: boolean;
  scanning: boolean;
  lastScanAt: string | null;
  lastError: string | null;
  notes: number;
  files: number;
  links: number;
  unresolvedLinks: { target: string; noteId: string; path: string }[];
  problems: { noteId: string; path: string; issues: string[] }[];
}

export type KnowledgeNoteStatus = "berlaku" | "draf" | "dicabut" | "templat";

export interface KnowledgeNoteListItem {
  id: string;
  path: string;
  kind: "note" | "file";
  title: string;
  assetId: string | null;
  updatedAt: string;
  jenis: string | null;
  status: KnowledgeNoteStatus | null;
  publik: boolean | null;
  /** Tag properti + tag inline `#tag` */
  tags: string[];
  /** Properti tersimpan (frontmatter) */
  properties: Record<string, unknown> | null;
  links: number;
  backlinks: number;
}

export interface KnowledgeNoteRef {
  id: string;
  title: string;
  path: string;
}

export interface KnowledgeNoteDetail {
  id: string;
  path: string;
  kind: "note" | "file";
  title: string;
  content: string | null;
  frontmatter: Record<string, unknown> | null;
  metadata: {
    path: string;
    jenis?: string;
    status?: KnowledgeNoteStatus;
    publik?: boolean;
    topik?: string[];
    diperbarui?: string;
  };
  problems: string[];
  assetId: string | null;
  /** SHA-256 isi berkas saat terakhir dipindai */
  hash: string;
  updatedAt: string;
  linksOut: { target: string; kind: string; note: KnowledgeNoteRef | null }[];
  backlinks: { kind: string; note: KnowledgeNoteRef }[];
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
  "skp",
  "skp_target",
  "action_plan_entry",
  "action_plan_month",
  "srikandi_letter",
  "srikandi_reference",
  "srikandi_outgoing",
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
  /** Daftar ringan: key payload yang tidak utuh (isi lengkap lewat `recordsApi.get`) */
  partial?: string[];
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
  /** Tab AI di editor ONLYOFFICE aktif (memakai provider & key di Pengaturan → Model AI) */
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

/** Riwayat chat notebook per halaman (pesan terbaru). */
export interface NotebookMessagePage {
  messages: NotebookMessage[];
  /** Masih ada pesan yang lebih lama */
  hasMore: boolean;
}

/** Item LifeOS / berkas yang menjadi sumber notebook (`GET /notebooks/usage`). */
export interface NotebookUsage {
  notebookId: string;
  notebookTitle: string;
  recordType: NotebookRecordType | null;
  recordId: string | null;
  assetId: string | null;
}

// ---------------------------------------------------------------- Pengajuan & Antrian Verifikasi

export type RequestKind = "psp" | "penghapusan" | "pemanfaatan" | "surat" | "lainnya";
export type RequestStatus = "baru" | "diproses" | "menunggu_verifikasi" | "disetujui" | "dikirim" | "ditolak";

export interface RequestAttachment {
  uploadId: string;
  name: string;
  mimeType: string;
}

export interface RequestDocument {
  uploadId: string;
  name: string;
  templateName: string;
  createdAt: string;
}

export interface RequestChecklistItem {
  dokumen: string;
  status: "ada" | "tidak_ada" | "perlu_dicek";
  catatan: string;
}

export interface RequestAnalysis {
  summary: string;
  fields: Record<string, unknown>;
  checklist: RequestChecklistItem[];
  missing: string[];
  suggestion: string;
  sources: { n: number; title: string; sourceType: string; sourceId: string }[];
  analyzedAt: string;
  provider?: string;
}

export interface RequestHistoryEntry {
  at: string;
  status: RequestStatus;
  by: "user" | "agen" | "kebijakan";
  note?: string;
}

/** Keputusan Kebijakan Otomatis atas satu pengajuan (docs/AI-AGENT.md §24). */
export interface RequestAutoDecision {
  policyId: string;
  policyName: string;
  mode: AgentPolicyMode;
  outcome: "approve" | "review";
  /** Keputusan benar-benar diterapkan (mode auto); shadow = hanya dicatat */
  applied: boolean;
  reasons: string[];
  score: number | null;
  decidedAt: string;
  registerId?: string;
  /** Konsep dijadwalkan disimpan ke SRIKANDI pada waktu ini (masa tunda) */
  sendAt?: string;
  sentAt?: string;
  cancelledAt?: string;
  error?: string;
}

export interface AssetClaim {
  nup?: string;
  kodeBarang?: string;
  nama?: string;
  nilai?: number | string;
}

export interface RequestAssetCheck {
  source: string | null;
  available: boolean;
  checkedAt: string;
  threshold: number;
  total: number;
  matched: number;
  score: number;
  items: {
    claimed: AssetClaim;
    master: { nup: string; kodeBarang: string; nama?: string; nilai?: number } | null;
    status: "cocok" | "berbeda" | "tidak_ditemukan";
    diffs: { field: AssetField; claimed: string | number | null; master: string | number | null }[];
  }[];
}

export type AgentPolicyMode = "off" | "shadow" | "auto";
export type AssetField = "nup" | "kodeBarang" | "nama" | "nilai";

export interface AgentPolicyInput {
  name: string;
  skill: string;
  requestKind: RequestKind;
  groupCodes: string[];
  mode: AgentPolicyMode;
  threshold: number;
  criticalFields: AssetField[];
  valueTolerance: number;
  dailyLimit: number;
  holdMinutes: number;
  registerTemplate: string | null;
}

export interface AgentPolicy extends AgentPolicyInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  stats: { decisions: number; applied: number; judged: number; agree: number };
}

export interface AgentPolicyList {
  paused: boolean;
  policies: AgentPolicy[];
}

export interface RequestSummary {
  id: string;
  kind: RequestKind;
  title: string;
  /** Nama pemohon (satker / instansi / perorangan) */
  applicant: string | null;
  /** Kode grup kontak pemohon */
  groupCode: string | null;
  letterNumber: string | null;
  letterDate: string | null;
  subject: string | null;
  status: RequestStatus;
  source: "manual" | "mcp" | "whatsapp";
  attachments: RequestAttachment[];
  documents: RequestDocument[];
  autoDecision: RequestAutoDecision | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequestDetail extends RequestSummary {
  message: string | null;
  notes: string | null;
  analysis: RequestAnalysis | null;
  review: string | null;
  reviewCitations: AiChatCitation[] | null;
  draftReply: string | null;
  history: RequestHistoryEntry[];
  assetCheck: RequestAssetCheck | null;
  files: (RequestAttachment & { extraction: string | null })[];
}

export interface RequestInput {
  kind: RequestKind;
  title: string;
  applicant?: string;
  groupCode?: string;
  letterNumber?: string;
  letterDate?: string;
  subject?: string;
  message?: string;
  uploadIds?: string[];
}

export type RequestUpdate = Partial<
  Omit<RequestInput, "kind" | "title"> & {
    kind: RequestKind;
    title: string;
    notes: string | null;
    review: string | null;
    draftReply: string | null;
    status: RequestStatus;
    statusNote: string;
  }
>;

export interface RequestTemplateFields {
  templateName: string;
  tags: { name: string; srikandi: boolean }[];
  slots: { name: string; instruction: string }[];
}

// ---------------------------------------------------------------- Bot WhatsApp

export interface WhatsappStatus {
  /** Kredensial Meta lengkap di server */
  configured: boolean;
  ownerFound: boolean;
  /** Bot sungguhan memakai akun ini (selain itu hanya simulator) */
  isOwner: boolean;
  webhookPath: string;
  graphVersion: string;
  contacts: number;
  verified: number;
  needsReply: number;
}

export type GroupKind = "satker" | "instansi" | "masyarakat" | "internal" | "lainnya";

/** Grup kontak: menentukan data yang boleh diakses anggotanya lewat bot. */
export interface ContactGroup {
  id: string;
  code: string;
  name: string;
  kind: GroupKind;
  notes: string | null;
  /** Anggota boleh mengirim berkas pengajuan */
  allowRequests: boolean;
  /** Anggota boleh melihat status pengajuan seluruh grup */
  shareRequests: boolean;
  _count: { contacts: number };
}

export interface ContactGroupInput {
  code: string;
  name: string;
  kind?: GroupKind;
  notes?: string;
  allowRequests?: boolean;
  shareRequests?: boolean;
}

export interface WaBotProfile {
  serviceName: string;
  topic: string;
}

export interface WaContact {
  id: string;
  phone: string;
  name: string;
  position: string | null;
  groupId: string | null;
  group: Pick<ContactGroup, "id" | "code" | "name" | "kind" | "allowRequests" | "shareRequests"> | null;
  verified: boolean;
  active: boolean;
  notes: string | null;
  lastInboundAt: string | null;
}

export interface WaContactInput {
  phone: string;
  name: string;
  position?: string;
  groupId?: string | null;
  verified?: boolean;
  active?: boolean;
  notes?: string;
}

export type WaMessageStatus = "received" | "answered" | "needs_reply" | "ignored" | "sent" | "simulated" | "failed";

export interface WaMessage {
  id: string;
  phone: string;
  direction: "in" | "out";
  text: string;
  attachments: { uploadId?: string; mediaId?: string; name: string; mimeType: string }[];
  status: WaMessageStatus;
  intent: string | null;
  requestId: string | null;
  citations: { n: number; title: string; sourceType: string; sourceId: string }[] | null;
  error: string | null;
  simulated: boolean;
  createdAt: string;
}

export interface WaConversation {
  phone: string;
  contact: WaContact | null;
  lastMessage: { text: string; direction: "in" | "out"; createdAt: string; status: WaMessageStatus };
  needsReply: number;
}

// ---------------------------------------------------------------- Konektor robot (SRIKANDI, e-Kinerja) & tautan publik

export type RobotSystem = "srikandi" | "ekinerja";
export type RobotConnectorStatus = "none" | "active" | "expired" | "error";

export interface RobotConnector {
  system: RobotSystem;
  label: string;
  description: string;
  defaultUrl: string;
  flows: { label: string; scheduled: boolean }[];
  limits: string;
  baseUrl: string;
  extraHosts: string[];
  loginMarkers: string[];
  status: RobotConnectorStatus;
  hasSession: boolean;
  /** Kredensial tersimpan di brankas (nilainya tidak pernah dikirim ke browser) */
  hasCredentials: boolean;
  credentialHint: string | null;
  credentialsUpdatedAt: string | null;
  lastLoginAt: string | null;
  lastCheckAt: string | null;
  lastUrl: string | null;
  lastError: string | null;
}

export interface RobotRun {
  id: string;
  system: RobotSystem;
  kind: "login" | "check" | "capture" | "credentials";
  status: "ok" | "failed";
  url: string | null;
  title: string | null;
  note: string | null;
  error: string | null;
  hasScreenshot: boolean;
  createdAt: string;
  /** Hanya di detail */
  aria?: string | null;
}

// ---------------------------------------------------------------- Otomasi terjadwal (tab Connector)

export type AutomationKind =
  | "ekinerja_session"
  | "ekinerja_skp"
  | "ekinerja_renaksi"
  | "srikandi_session"
  | "srikandi_letters"
  | "srikandi_references"
  | "srikandi_classifications";
export type AutomationTimezone = "Asia/Jakarta" | "Asia/Makassar" | "Asia/Jayapura";

export type AutomationSchedule =
  | { mode: "daily"; time: string; days: number[]; timezone: AutomationTimezone }
  | { mode: "hourly"; minute: number; from: number; to: number; days: number[]; timezone: AutomationTimezone }
  | { mode: "cron"; pattern: string; timezone: AutomationTimezone };

export type AutomationRunStatus = "queued" | "running" | "ok" | "failed" | "skipped";

export interface AutomationJob {
  kind: AutomationKind;
  system: RobotSystem;
  label: string;
  enabled: boolean;
  schedule: AutomationSchedule;
  cron: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: "ok" | "failed" | "skipped" | null;
  lastMessage: string | null;
  activeRun: { id: string; status: "queued" | "running"; createdAt: string } | null;
}

/** Hal robot yang perlu ditindaklanjuti (lonceng & toast). `id` berubah bila kejadiannya baru. */
export interface AutomationAlert {
  id: string;
  kind: "session_expired" | "session_missing" | "job_failed";
  system: RobotSystem;
  title: string;
  message: string;
  at: string | null;
  path: string;
}

export interface AutomationRun {
  id: string;
  kind: AutomationKind;
  /** schedule = jadwal, manual = "Jalankan sekarang", button = tombol sinkron di menu asal */
  trigger: "schedule" | "manual" | "button";
  status: AutomationRunStatus;
  message: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RobotPageInfo {
  url: string;
  title: string;
  loggedIn: boolean;
}

export type RobotInput =
  | { type: "click" | "dblclick" | "move"; x: number; y: number }
  | { type: "scroll"; x: number; y: number; dy: number }
  | { type: "type"; text: string }
  | { type: "key"; key: string }
  | { type: "goto"; url: string }
  | { type: "back" | "reload" };

export type RobotLoginStage = "done" | "captcha" | "otp" | "credentials" | "unknown";

export interface RobotLoginStep {
  sessionId: string;
  stage: RobotLoginStage;
  url: string;
  title: string;
  /** Pesan dari situs (mis. CAPTCHA salah) */
  message?: string;
  /** PNG base64 */
  captchaImage?: string;
  connector?: RobotConnector;
}

export interface PublicLinkInfo {
  id: string;
  prefix: string;
  label: string | null;
  expiresAt: string | null;
  accessCount: number;
  lastAccessAt: string | null;
  createdAt: string;
  /** Hanya saat dibuat (token tampil sekali) */
  path?: string;
}

/** Brankas digital: satu tautan publik baca-saja berisi beberapa berkas (bukti data dukung satu poin renaksi). */
export interface VaultFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface VaultDetail {
  id: string;
  prefix: string;
  title: string;
  description: string | null;
  entryId: string | null;
  accessCount: number;
  lastAccessAt: string | null;
  createdAt: string;
  files: VaultFile[];
  /** Hanya saat dibuat / tautan diganti (token tampil sekali) */
  path?: string;
}

export interface VaultAccess {
  id: string;
  at: string;
  action: "open" | "view" | "download";
  fileName: string | null;
  ip: string | null;
  location: string;
  network: string | null;
  browser: string | null;
}

/** Isi brankas untuk pengunjung publik + catatan akses pengunjung itu sendiri. */
export interface PublicVaultView {
  title: string;
  description: string | null;
  owner: string;
  updatedAt: string;
  files: VaultFile[];
  visitor: { ip: string | null; location: string; browser: string | null; at: string };
}

/** Menu Knowledge (antarmuka Obsidian di LifeOS). */
export interface KnowledgeTree {
  folders: string[];
  notes: KnowledgeNoteListItem[];
}

export interface KnowledgeGraphNode {
  id: string;
  title: string;
  path: string;
  kind: "note" | "file";
  status: KnowledgeNoteStatus | null;
  jenis: string | null;
  tags: string[];
  links: number;
  backlinks: number;
  /** Perkiraan waktu dibuat (urutan animasi graf) */
  createdAt: string;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  /** Tautan ke catatan yang belum ada (node bayangan, id `missing:<target>`) */
  missing: { id: string; title: string; count: number }[];
  edges: { source: string; target: string; kind: string }[];
}

export interface KnowledgeSearchHit {
  id: string;
  path: string;
  title: string;
  kind: "note" | "file";
  snippet: string;
  score: number;
}

export interface KnowledgeSource {
  id: string;
  path: string;
  raw: string;
  hash: string;
  frontmatter: Record<string, unknown> | null;
}

export interface KnowledgeHealth {
  problems: { noteId: string; path: string; issues: string[] }[];
  broken: { target: string; note: KnowledgeNoteRef }[];
  orphans: KnowledgeNoteRef[];
  duplicates: { name: string; notes: KnowledgeNoteRef[] }[];
}

export type KnowledgeGraphColor = "blue" | "green" | "orange" | "red" | "violet" | "teal" | "pink" | "yellow";

export interface KnowledgePrefs {
  bookmarks: string[];
  graphGroups: { query: string; color: KnowledgeGraphColor }[];
}

/** Catatan serupa menurut embedding indeks (`available: false` = catatan ini belum punya vektor). */
/** Satu versi di riwayat catatan vault (tanpa isi). */
export interface KnowledgeNoteVersion {
  id: string;
  hash: string;
  size: number;
  /** observed | before_save | before_properties | before_task | before_link | before_move | before_restore */
  reason: string;
  createdAt: string;
  /** Sama dengan isi berkas sekarang */
  current: boolean;
}

export interface KnowledgeNoteVersionDetail {
  id: string;
  content: string;
  reason: string;
  createdAt: string;
  size: number;
}

/** Berkas Bases (`.base` Obsidian) di vault. */
export interface KnowledgeBaseListItem {
  path: string;
  name: string;
  mtime: string;
}

export interface KnowledgeBaseFile {
  path: string;
  hash: string;
  /** Isi YAML (filters, formulas, properties, views) */
  data: Record<string, unknown>;
  /** Galat sintaks YAML (berkas tetap bisa diperbaiki di Obsidian) */
  error: string | null;
  /** Di folder 80-LifeOS (dikelola LifeOS) */
  readOnly: boolean;
}

/** Tugas lintas vault (`- [ ]` di catatan; pola plugin Tasks Obsidian). */
export interface KnowledgeTask {
  noteId: string;
  path: string;
  noteTitle: string;
  /** Urutan tugas di catatan */
  index: number;
  /** Nomor baris di isi catatan tanpa properti */
  line: number;
  /** Baris asli (kunci saat menulis balik) */
  raw: string;
  text: string;
  status: "todo" | "in_progress" | "done" | "cancelled";
  due: string | null;
  scheduled: string | null;
  start: string | null;
  doneDate: string | null;
  priority: "highest" | "high" | "medium" | "low" | "lowest" | null;
  recurrence: string | null;
  tags: string[];
  heading: string | null;
}

export interface KnowledgeTasks {
  tasks: KnowledgeTask[];
  truncated: boolean;
}

export interface KnowledgeSimilar {
  available: boolean;
  items: { id: string; path: string; title: string; kind: string; score: number }[];
}

export interface KnowledgeUnlinkedMention {
  id: string;
  path: string;
  title: string;
  snippet: string;
}
