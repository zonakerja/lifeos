import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { authApi, type ProfileInput } from "@/lib/api/endpoints";
import { flushPendingWrites } from "@/data/use-collection";
import { queryKeys } from "@/data/query-keys";
import { useAuthStore } from "@/stores/auth-store";

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => authApi.login(email.trim(), password),
    onSuccess: (session) => {
      client.clear();
      setSession(session);
    },
  });
}

export function useLogout() {
  const client = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await flushPendingWrites();
    await authApi.logout().catch(() => undefined);
    useAuthStore.getState().clear();
    client.clear();
    void navigate("/login", { replace: true });
  };
}

/** Sinkronkan profil user dari server (mis. setelah diubah di perangkat lain). */
export function useProfileSync() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  return useQuery({
    queryKey: queryKeys.profile,
    enabled: !!user,
    queryFn: async () => {
      const profile = await authApi.me();
      setUser(profile);
      return profile;
    },
    staleTime: 60_000,
  });
}

export function useUpdateProfile() {
  const setUser = useAuthStore((s) => s.setUser);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) => authApi.updateMe(input),
    onSuccess: (profile) => {
      setUser(profile);
      client.setQueryData(queryKeys.profile, profile);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(currentPassword, newPassword),
  });
}
