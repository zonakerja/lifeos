import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { knowledgeApi } from "@/lib/api/endpoints";
import type { KnowledgeStatus } from "@/types/api";
import { queryKeys } from "./query-keys";

/** Status vault Obsidian user; dipantau berkala saat server sedang memindai. */
export function useKnowledgeStatus() {
  return useQuery({
    queryKey: queryKeys.knowledgeStatus,
    queryFn: knowledgeApi.status,
    refetchInterval: (query) => (query.state.data?.scanning ? 2_000 : false),
  });
}

export function useKnowledgeFolders(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.knowledgeFolders, queryFn: knowledgeApi.folders, enabled });
}

export function useKnowledgeNotes(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.knowledgeNotes, queryFn: () => knowledgeApi.notes(), enabled });
}

export function useKnowledgeNote(id: string | null) {
  return useQuery({
    queryKey: queryKeys.knowledgeNote(id ?? "-"),
    queryFn: () => knowledgeApi.note(id!),
    enabled: !!id,
  });
}

/** Status baru dari server (pilih/buat/lepas vault, pindai) → perbarui cache status & muat ulang daftar catatan. */
function useApplyStatus() {
  const client = useQueryClient();
  return (status: KnowledgeStatus) => {
    client.setQueryData(queryKeys.knowledgeStatus, status);
    void client.invalidateQueries({ queryKey: queryKeys.knowledgeNotes });
    void client.invalidateQueries({ queryKey: queryKeys.knowledgeFolders });
    void client.invalidateQueries({ queryKey: ["knowledge", "note"] });
  };
}

export function useKnowledgeMutations() {
  const apply = useApplyStatus();
  return {
    setVault: useMutation({ mutationFn: knowledgeApi.setVault, onSuccess: apply }),
    createVault: useMutation({ mutationFn: knowledgeApi.createVault, onSuccess: apply }),
    scan: useMutation({ mutationFn: knowledgeApi.scan, onSuccess: apply }),
  };
}

export function useAddToKnowledgeInbox() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: knowledgeApi.addToInbox,
    onSuccess: () => {
      // Server memindai ulang vault sesaat setelah menulis catatan
      setTimeout(() => {
        void client.invalidateQueries({ queryKey: queryKeys.knowledgeStatus });
        void client.invalidateQueries({ queryKey: queryKeys.knowledgeNotes });
      }, 2_000);
    },
  });
}
