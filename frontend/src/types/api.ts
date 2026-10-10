export type UserRole = "super_admin" | "admin" | "member" | "viewer";

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
  appLogo: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AppSettingsInput = Partial<
  Pick<AppSettings, "name" | "navSub" | "loginSub" | "motto" | "welcomeTitle" | "welcomeSub" | "footerText">
> & { appLogo?: string };

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
