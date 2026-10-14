import { useAuthStore } from "@/stores/auth-store";
import type { AuthSession } from "@/types/api";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type QueryValue = string | number | boolean | null | undefined;

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Default true: sertakan access token & coba refresh sekali bila 401. */
  auth?: boolean;
  signal?: AbortSignal;
}

export const apiUrl = (path: string, query?: Record<string, QueryValue>) => {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
};

const parseError = async (response: Response) => {
  let message = `Permintaan gagal (${response.status}).`;
  let details: unknown;
  try {
    details = await response.json();
    const raw = (details as { message?: unknown })?.message;
    if (Array.isArray(raw)) message = raw.join(", ");
    else if (typeof raw === "string") message = raw;
  } catch {
    // Respons bukan JSON
  }
  if (response.status === 0 || response.status >= 502) {
    message = "Server tidak dapat dihubungi. Periksa koneksi atau status backend.";
  }
  return new ApiError(response.status, message, details);
};

// Satu proses refresh untuk semua request paralel yang terkena 401
let refreshPromise: Promise<boolean> | null = null;

/**
 * Minta access token baru memakai cookie refresh httpOnly (dikirim otomatis oleh browser).
 * Gagal karena sesi tidak valid → status "anonymous"; gagal jaringan → sesi tidak diubah.
 */
const refreshSession = () => {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const { setSession, clear } = useAuthStore.getState();
    try {
      const response = await fetch(apiUrl("/auth/refresh"), { method: "POST", credentials: "include" });
      if (!response.ok) {
        clear();
        return false;
      }
      setSession((await response.json()) as AuthSession);
      return true;
    } catch {
      if (useAuthStore.getState().status === "unknown") clear();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
};

/** Pulihkan sesi saat aplikasi dibuka (dipanggil sekali dari main.tsx). */
export const bootstrapSession = () => refreshSession();

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, auth = true, signal } = options;

  const send = () => {
    const headers = new Headers();
    const isFormData = body instanceof FormData;
    if (body !== undefined && !isFormData) headers.set("Content-Type", "application/json");
    const token = useAuthStore.getState().accessToken;
    if (auth && token) headers.set("Authorization", `Bearer ${token}`);

    return fetch(apiUrl(path, query), {
      method,
      headers,
      signal,
      credentials: "include",
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    });
  };

  let response: Response;
  try {
    response = await send();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "Server tidak dapat dihubungi. Periksa koneksi atau status backend.");
  }

  if (response.status === 401 && auth && useAuthStore.getState().status === "authenticated") {
    if (await refreshSession()) response = await send();
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  return (contentType.includes("application/json") ? response.json() : response.text()) as Promise<T>;
}

/** Pesan error yang ramah untuk ditampilkan di UI. */
export const errorMessage = (error: unknown, fallback = "Terjadi kesalahan.") =>
  error instanceof Error && error.message ? error.message : fallback;
