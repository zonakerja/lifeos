import { create } from "zustand";
import type { AuthSession, PublicUser } from "@/types/api";

/** unknown = sesi belum dipulihkan (saat aplikasi baru dibuka). */
export type AuthStatus = "unknown" | "authenticated" | "anonymous";

interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  /** Access token berumur pendek, HANYA di memori (tidak pernah ke localStorage). */
  accessToken: string | null;
  setSession: (session: AuthSession) => void;
  setUser: (user: PublicUser) => void;
  clear: () => void;
}

/**
 * Sesi login. Refresh token disimpan server di cookie httpOnly (tidak terbaca JavaScript);
 * saat aplikasi dibuka, sesi dipulihkan lewat `bootstrapSession()` (lib/api/client.ts).
 * Tidak ada data sesi yang disimpan di localStorage.
 */
export const useAuthStore = create<AuthState>()((set) => ({
  status: "unknown",
  user: null,
  accessToken: null,
  setSession: ({ user, accessToken }) => set({ status: "authenticated", user, accessToken }),
  setUser: (user) => set({ user }),
  clear: () => set({ status: "anonymous", user: null, accessToken: null }),
}));

export const isAdminRole = (role?: string | null) => role === "super_admin" || role === "admin";
/** Semua akun login boleh menulis datanya sendiri; izin atas item milik user lain diatur per item (berbagi). */
export const canWrite = (role?: string | null) => !!role;
