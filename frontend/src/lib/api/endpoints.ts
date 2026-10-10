import { apiUrl, request } from "@/lib/api/client";
import type {
  AiGenerateResult,
  AiIndexStatus,
  AiSearchHit,
  AiProviderId,
  AiSettings,
  ApiRecord,
  AppSettings,
  AppSettingsInput,
  AuthSession,
  PublicUser,
  RecordType,
  UploadedAsset,
  UserRole,
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
};

export const recordsApi = {
  list: <T>(type: RecordType, query?: { userId?: string; from?: string; to?: string }) =>
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
  upload: (file: File, context?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (context) form.append("context", context);
    return request<UploadedAsset>("/uploads", { method: "POST", body: form });
  },
  list: (take = 50) => request<UploadedAsset[]>("/uploads", { query: { take } }),
  remove: (id: string) => request<{ success: boolean }>(`/uploads/${id}`, { method: "DELETE" }),
  /** Link sementara (10 menit) yang bisa dibuka di tab baru / <img>. */
  createLink: async (id: string) => {
    const { url } = await request<{ url: string; expiresIn: number }>(`/uploads/${id}/link`, {
      method: "POST",
    });
    return apiUrl(url);
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
