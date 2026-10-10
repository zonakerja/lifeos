import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { aiApi } from "@/lib/api/endpoints";
import { queryKeys } from "@/data/query-keys";
import { useAuthStore } from "@/stores/auth-store";
import type { AiProviderId, AiSettings } from "@/types/api";

/** Pengaturan AI milik user (provider aktif, key tersimpan, model). */
export function useAiSettings() {
  return useQuery({ queryKey: queryKeys.aiSettings, queryFn: aiApi.settings, refetchOnMount: "always" });
}

/** Simpan hasil ke cache + sinkronkan `user.aiProvider` (dipakai `useAi().isConfigured`). */
function useApplySettings() {
  const client = useQueryClient();
  return (settings: AiSettings) => {
    client.setQueryData(queryKeys.aiSettings, settings);
    void client.invalidateQueries({ queryKey: queryKeys.aiIndex });
    const { user, setUser } = useAuthStore.getState();
    if (user) setUser({ ...user, aiProvider: settings.activeProvider });
  };
}

export function useSaveAiProvider() {
  const apply = useApplySettings();
  return useMutation({
    mutationFn: ({ provider, ...input }: { provider: AiProviderId; apiKey?: string; model?: string | null }) =>
      aiApi.saveProvider(provider, input),
    onSuccess: apply,
  });
}

export function useRemoveAiProvider() {
  const apply = useApplySettings();
  return useMutation({ mutationFn: aiApi.removeProvider, onSuccess: apply });
}

/** Ganti provider aktif dan/atau sakelar cadangan otomatis. */
export function useUpdateAiSettings() {
  const apply = useApplySettings();
  return useMutation({ mutationFn: aiApi.update, onSuccess: apply });
}

export function useTestAiProvider() {
  return useMutation({ mutationFn: aiApi.test });
}

/** Status indeks pengetahuan; diperbarui tiap 5 detik selama masih ada job indeks berjalan. */
export function useAiIndexStatus() {
  return useQuery({
    queryKey: queryKeys.aiIndex,
    queryFn: aiApi.indexStatus,
    refetchOnMount: "always",
    refetchInterval: (query) => (query.state.data?.pendingJobs ? 5000 : false),
  });
}

export function useRebuildAiIndex() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: aiApi.rebuildIndex,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.aiIndex }),
  });
}

export function useSearchAiIndex() {
  return useMutation({ mutationFn: (q: string) => aiApi.searchIndex(q) });
}
