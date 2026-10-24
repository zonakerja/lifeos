import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { aiChatApi } from "@/lib/api/endpoints";
import type { AiChatMessage } from "@/types/api";
import { queryKeys } from "./query-keys";

/** Riwayat percakapan chatbot LifeOS (30 terbaru). */
export function useAiConversations(enabled = true) {
  return useQuery({ queryKey: queryKeys.aiConversations, queryFn: aiChatApi.conversations, enabled });
}

/** Pesan satu percakapan; `id` null = percakapan baru (belum tersimpan). */
export function useAiConversationMessages(id: string | null) {
  return useQuery({
    queryKey: queryKeys.aiConversationMessages(id ?? "-"),
    queryFn: () => aiChatApi.messages(id!),
    enabled: !!id,
  });
}

/**
 * Kirim pertanyaan ke chatbot. Pertanyaan tampil segera (pesan sementara); hasilnya menggantikan pesan sementara di
 * cache percakapan. Percakapan baru → `onCreated(id)` agar komponen pindah ke percakapan itu.
 */
export function useAiChat() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: aiChatApi.send,
    onSuccess: (result) => {
      client.setQueryData<{ messages: AiChatMessage[]; hasMore: boolean }>(
        queryKeys.aiConversationMessages(result.conversation.id),
        (prev) => ({
          messages: [...(prev?.messages ?? []), result.userMessage, result.assistantMessage],
          hasMore: prev?.hasMore ?? false,
        }),
      );
      void client.invalidateQueries({ queryKey: queryKeys.aiConversations });
      if (result.fallback) toast.info("Provider AI cadangan dipakai", { description: result.fallback.message });
    },
  });
}

export function useDeleteAiConversation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: aiChatApi.remove,
    onSuccess: (_, id) => {
      client.removeQueries({ queryKey: queryKeys.aiConversationMessages(id) });
      void client.invalidateQueries({ queryKey: queryKeys.aiConversations });
    },
  });
}

/** Profil kerja & instruksi tetap yang selalu ikut di chat AI. */
export function useAiProfile() {
  return useQuery({ queryKey: queryKeys.aiProfile, queryFn: aiChatApi.profile });
}

export function useSaveAiProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: aiChatApi.saveProfile,
    onSuccess: (data) => client.setQueryData(queryKeys.aiProfile, data),
  });
}
