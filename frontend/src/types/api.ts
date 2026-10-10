export type UserRole = "super_admin" | "admin" | "member" | "viewer";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  address: string | null;
  /** Hanya tersedia untuk user yang sedang login (profil sendiri). */
  apiKey?: string | null;
  createdAt: string;
  updatedAt: string;
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
