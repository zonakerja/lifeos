import { apiUrl, request } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth-store";
import type {
  AddNotebookSourceInput,
  AiGenerateResult,
  NotebookChatResult,
  NotebookDetail,
  NotebookListItem,
  NotebookMessage,
  NotebookNote,
  NotebookSource,
  NotebookSummary,
  OfficeConfigResult,
  OfficeDiagnostics,
  OfficeFonts,
  OfficeFormat,
  OfficeLinkBadges,
  OfficeLinkedFile,
  OfficeLinks,
  OfficePreferences,
  OfficeTemplate,
  OfficeStatus,
  OfficeVersions,
  AiIndexStatus,
  AiSearchHit,
  AiProviderId,
  AiSettings,
  ApiRecord,
  AppSettings,
  AppSettingsInput,
  AssetMetadata,
  AuthSession,
  PublicUser,
  RecordComment,
  RecordType,
  ShareableType,
  ShareEntry,
  SharePermission,
  UploadedAsset,
  UserRole,
  UserStats,
  UserSummary,
} from "@/types/api";

export interface ProfileInput {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface UserInput {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  phone?: string;
  address?: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    request<AuthSession>("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  logout: () => request<{ success: boolean }>("/auth/logout", { method: "POST", auth: false }),
  me: () => request<PublicUser>("/auth/me"),
  updateMe: (input: ProfileInput) => request<PublicUser>("/auth/me", { method: "PATCH", body: input }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>("/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    }),
};

export const settingsApi = {
  get: () => request<AppSettings>("/settings/app", { auth: false }),
  update: (input: AppSettingsInput) => request<AppSettings>("/settings/app", { method: "PATCH", body: input }),
};

export const usersApi = {
  list: () => request<PublicUser[]>("/users"),
  create: (input: UserInput) => request<PublicUser>("/users", { method: "POST", body: input }),
  update: (id: string, input: Partial<UserInput>) =>
    request<PublicUser>(`/users/${id}`, { method: "PATCH", body: input }),
  remove: (id: string) => request<{ success: boolean }>(`/users/${id}`, { method: "DELETE" }),
  /** Statistik pemakaian per user (admin) — tanpa isi data */
  stats: () => request<UserStats[]>("/users/stats"),
  /** Cari akun penerima berbagi (min. 3 huruf) */
  directory: (q: string) => request<UserSummary[]>("/users/directory", { query: { q } }),
};

export const sharesApi = {
  /** Penerima satu item milik sendiri */
  forItem: (recordType: ShareableType, recordId: string) =>
    request<ShareEntry[]>("/shares", { query: { recordType, recordId } }),
  outgoing: () => request<ShareEntry[]>("/shares/outgoing"),
  incoming: () => request<ShareEntry[]>("/shares/incoming"),
  create: (input: { recordType: ShareableType; recordId: string; email: string; permission: SharePermission }) =>
    request<ShareEntry>("/shares", { method: "POST", body: input }),
  update: (id: string, permission: SharePermission) =>
    request<ShareEntry>(`/shares/${id}`, { method: "PATCH", body: { permission } }),
  /** Pemilik mencabut, atau penerima keluar dari berbagi */
  remove: (id: string) => request<{ success: boolean }>(`/shares/${id}`, { method: "DELETE" }),
};

export interface CommentTarget {
  recordType: RecordType;
  recordId: string;
  /** Pemilik item; kosong = milik sendiri */
  ownerId?: string;
}

export const commentsApi = {
  list: (target: CommentTarget) => request<RecordComment[]>("/comments", { query: { ...target } }),
  create: (target: CommentTarget, body: string) =>
    request<RecordComment>("/comments", { method: "POST", body: { ...target, body } }),
  update: (id: string, body: string) => request<RecordComment>(`/comments/${id}`, { method: "PATCH", body: { body } }),
  remove: (id: string) => request<{ success: boolean }>(`/comments/${id}`, { method: "DELETE" }),
};

export const recordsApi = {
  list: <T>(type: RecordType, query?: { from?: string; to?: string }) =>
    request<ApiRecord<T>[]>(`/records/${type}`, { query }),
  upsert: <T>(type: RecordType, clientId: string, payload: T, userId?: string) =>
    request<ApiRecord<T>>(`/records/${type}/${encodeURIComponent(clientId)}`, {
      method: "PUT",
      body: { payload, userId },
    }),
  remove: (type: RecordType, clientId: string, userId?: string) =>
    request<{ success: boolean }>(`/records/${type}/${encodeURIComponent(clientId)}`, {
      method: "DELETE",
      query: { userId },
    }),
};

export const uploadsApi = {
  /** `ownerId` = pemilik item bersama (izin edit) tempat berkas dilampirkan; kosong = milik sendiri. */
  upload: (file: File, context?: string, ownerId?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (context) form.append("context", context);
    if (ownerId) form.append("ownerId", ownerId);
    return request<UploadedAsset>("/uploads", { method: "POST", body: form });
  },
  list: (take = 50) => request<UploadedAsset[]>("/uploads", { query: { take } }),
  remove: (id: string) => request<{ success: boolean }>(`/uploads/${id}`, { method: "DELETE" }),
  /** Metadata + hasil ekstraksi teks (PDF/DOCX/XLSX/teks; gambar lewat OCR Gemini) yang dikerjakan backend. */
  metadata: (id: string) => request<AssetMetadata>(`/uploads/${id}/metadata`),
  /** Link sementara (10 menit) yang bisa dibuka di tab baru / <img>. */
  createLink: async (id: string) => {
    const { url } = await request<{ url: string; expiresIn: number }>(`/uploads/${id}/link`, {
      method: "POST",
    });
    return apiUrl(url);
  },
};

/** Editor dokumen ONLYOFFICE (menu Tools → ONLYOFFICE). */
export const officeApi = {
  status: () => request<OfficeStatus>("/office/status"),
  /**
   * Dokumen baru (berkas milik user; dijadikan Resource Global oleh pemanggil): kosong sesuai `format`, atau salinan
   * berkas templat (`templateId`, format mengikuti templat). `context`/`ownerId` sama seperti upload lampiran.
   */
  createDocument: (
    source: { format: OfficeFormat } | { templateId: string },
    options: { title?: string; context?: string; ownerId?: string } = {},
  ) => request<UploadedAsset>("/office/documents", { method: "POST", body: { ...source, ...options } }),
  preferences: () => request<OfficePreferences>("/office/preferences"),
  updatePreferences: (input: { ai: boolean }) =>
    request<OfficePreferences>("/office/preferences", { method: "PATCH", body: input }),
  fonts: () => request<OfficeFonts>("/office/fonts"),
  /** Admin: unggah font .ttf/.otf/.ttc ke folder font bersama ONLYOFFICE. */
  uploadFont: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ name: string }>("/office/fonts", { method: "POST", body: form });
  },
  deleteFont: (name: string) =>
    request<{ files: unknown[] }>(`/office/fonts/${encodeURIComponent(name)}`, { method: "DELETE" }),
  /** Konsep & dokumen final yang tertaut dengan satu berkas. */
  links: (uploadId: string) => request<OfficeLinks>(`/office/files/${uploadId}/links`),
  /** Tautkan berkas `finalId` (dokumen final) ke konsep `draftId`; `null` = lepaskan. */
  setDraft: (finalId: string, draftId: string | null) =>
    request<OfficeLinks>(`/office/files/${finalId}/draft`, { method: "PUT", body: { draftId } }),
  linkBadges: (ids: string[]) => request<OfficeLinkBadges>("/office/links", { query: { ids: ids.join(",") } }),
  /** Berkas milik user yang bisa dipilih sebagai konsep (`draft`) / dokumen final (`final`). */
  linkCandidates: (role: "draft" | "final", q?: string) =>
    request<OfficeLinkedFile[]>("/office/link-candidates", { query: { role, ...(q ? { q } : {}) } }),
  /** Templat milik user; unggah lewat `uploadsApi.upload(file, "office-template")`, hapus lewat `uploadsApi.remove`. */
  templates: () => request<OfficeTemplate[]>("/office/templates"),
  diagnostics: () => request<OfficeDiagnostics>("/office/diagnostics"),
  /** Simpan paksa sesi edit yang terbuka (modal editor ditutup); menunggu sampai versi tersimpan. */
  forceSave: (uploadId: string) =>
    request<{ status: "saved" | "pending" | "no-changes" | "no-session" }>(`/office/files/${uploadId}/forcesave`, {
      method: "POST",
    }),
  config: (input: {
    uploadId: string;
    mode?: "edit" | "view";
    theme?: "light" | "dark";
    /** Origin aplikasi: plugin AI LifeOS dimuat dari sini */
    appOrigin?: string;
  }) => request<OfficeConfigResult>("/office/config", { method: "POST", body: input }),
  versions: (uploadId: string) => request<OfficeVersions>(`/office/files/${uploadId}/versions`),
  restore: (uploadId: string, version: number) =>
    request<OfficeVersions>(`/office/files/${uploadId}/versions/${version}/restore`, { method: "POST" }),
  /** Isi versi lama sebagai Blob (butuh header Authorization, jadi diunduh lewat fetch). */
  versionBlob: async (uploadId: string, version: number) => {
    const response = await fetch(apiUrl(`/office/files/${uploadId}/versions/${version}`), {
      headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ""}` },
      credentials: "include",
    });
    if (!response.ok) throw new Error(`Versi tidak dapat diunduh (status ${response.status}).`);
    return response.blob();
  },
};

export const aiApi = {
  settings: () => request<AiSettings>("/ai/settings"),
  update: (input: { activeProvider?: AiProviderId | null; fallbackEnabled?: boolean; indexEnabled?: boolean }) =>
    request<AiSettings>("/ai/settings", { method: "PATCH", body: input }),
  /** `apiKey` kosong = pertahankan key tersimpan; `model` null = model default provider. */
  saveProvider: (provider: AiProviderId, input: { apiKey?: string; model?: string | null }) =>
    request<AiSettings>(`/ai/settings/${provider}`, { method: "PUT", body: input }),
  removeProvider: (provider: AiProviderId) => request<AiSettings>(`/ai/settings/${provider}`, { method: "DELETE" }),
  indexStatus: () => request<AiIndexStatus>("/ai/index"),
  rebuildIndex: () => request<{ queued: boolean }>("/ai/index/rebuild", { method: "POST" }),
  searchIndex: (q: string, limit = 8) => request<AiSearchHit[]>("/ai/index/search", { query: { q, limit } }),
  test: (provider: AiProviderId) => request<AiGenerateResult>(`/ai/settings/${provider}/test`, { method: "POST" }),
  /** Prompt + lampiran (PDF/gambar/audio/teks) diproses di backend dengan provider aktif user. */
  generate: (prompt: string, files: Blob[] = []) => {
    const form = new FormData();
    form.append("prompt", prompt);
    files.forEach((file, i) => form.append("files", file, file instanceof File ? file.name : `lampiran-${i + 1}`));
    return request<AiGenerateResult>("/ai/generate", { method: "POST", body: form });
  },
};

/** My Notebook: sumber + chat RAG bersitasi + ringkasan Studio + catatan notebook. */
export const notebooksApi = {
  list: () => request<NotebookListItem[]>("/notebooks"),
  create: (input: { title: string; description?: string; icon?: string }) =>
    request<NotebookDetail>("/notebooks", { method: "POST", body: input }),
  get: (id: string) => request<NotebookDetail>(`/notebooks/${id}`),
  update: (id: string, input: { title?: string; description?: string | null; icon?: string | null }) =>
    request<NotebookDetail>(`/notebooks/${id}`, { method: "PATCH", body: input }),
  remove: (id: string) => request<{ success: boolean }>(`/notebooks/${id}`, { method: "DELETE" }),
  addSource: (id: string, input: AddNotebookSourceInput) =>
    request<NotebookSource>(`/notebooks/${id}/sources`, { method: "POST", body: input }),
  updateSource: (id: string, sourceId: string, input: { enabled?: boolean; title?: string }) =>
    request<NotebookSource>(`/notebooks/${id}/sources/${sourceId}`, { method: "PATCH", body: input }),
  refreshSource: (id: string, sourceId: string) =>
    request<NotebookSource>(`/notebooks/${id}/sources/${sourceId}/refresh`, { method: "POST" }),
  removeSource: (id: string, sourceId: string) =>
    request<{ success: boolean }>(`/notebooks/${id}/sources/${sourceId}`, { method: "DELETE" }),
  messages: (id: string) => request<NotebookMessage[]>(`/notebooks/${id}/messages`),
  clearMessages: (id: string) => request<{ success: boolean }>(`/notebooks/${id}/messages`, { method: "DELETE" }),
  chat: (id: string, message: string, fileIds: string[] = []) =>
    request<NotebookChatResult>(`/notebooks/${id}/chat`, { method: "POST", body: { message, fileIds } }),
  summarize: (id: string) =>
    request<{
      summary: NotebookSummary;
      summaryAt: string;
      summaryStale: boolean;
      fallback: AiGenerateResult["fallback"];
    }>(`/notebooks/${id}/summary`, { method: "POST" }),
  notes: (id: string) => request<NotebookNote[]>(`/notebooks/${id}/notes`),
  createNote: (id: string, input: { title: string; content: string; origin?: NotebookNote["origin"] }) =>
    request<NotebookNote>(`/notebooks/${id}/notes`, { method: "POST", body: input }),
  updateNote: (id: string, noteId: string, input: { title?: string; content?: string }) =>
    request<NotebookNote>(`/notebooks/${id}/notes/${noteId}`, { method: "PATCH", body: input }),
  removeNote: (id: string, noteId: string) =>
    request<{ success: boolean }>(`/notebooks/${id}/notes/${noteId}`, { method: "DELETE" }),
};
