import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { whatsappApi } from "@/lib/api/endpoints";
import type { ContactGroupInput, WaContactInput } from "@/types/api";
import { queryKeys } from "./query-keys";

export function useWhatsappStatus() {
  return useQuery({ queryKey: queryKeys.whatsappStatus, queryFn: whatsappApi.status });
}

export function useContactGroups() {
  return useQuery({ queryKey: queryKeys.whatsappGroups, queryFn: whatsappApi.groups });
}

export function useBotProfile() {
  return useQuery({ queryKey: queryKeys.whatsappProfile, queryFn: whatsappApi.profile });
}

export function useWaContacts() {
  return useQuery({ queryKey: queryKeys.whatsappContacts, queryFn: whatsappApi.contacts });
}

/** Daftar percakapan; diperbarui berkala (pesan masuk & balasan bot datang dari server). */
export function useWaConversations() {
  return useQuery({
    queryKey: queryKeys.whatsappConversations,
    queryFn: whatsappApi.conversations,
    refetchInterval: 10_000,
  });
}

/** Isi percakapan; lebih sering diperbarui selama ada pesan yang masih diproses bot. */
export function useWaMessages(phone: string | null) {
  return useQuery({
    queryKey: queryKeys.whatsappMessages(phone ?? "-"),
    queryFn: () => whatsappApi.messages(phone!),
    enabled: !!phone,
    refetchInterval: (query) => (query.state.data?.some((m) => m.status === "received") ? 2_000 : 10_000),
  });
}

export function useWhatsappMutations() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: queryKeys.whatsapp });
  return {
    updateProfile: useMutation({ mutationFn: whatsappApi.updateProfile, onSuccess: refresh }),
    createGroup: useMutation({ mutationFn: whatsappApi.createGroup, onSuccess: refresh }),
    updateGroup: useMutation({
      mutationFn: ({ id, ...input }: Partial<ContactGroupInput> & { id: string }) => whatsappApi.updateGroup(id, input),
      onSuccess: refresh,
    }),
    removeGroup: useMutation({ mutationFn: whatsappApi.removeGroup, onSuccess: refresh }),
    createContact: useMutation({ mutationFn: whatsappApi.createContact, onSuccess: refresh }),
    updateContact: useMutation({
      mutationFn: ({ id, ...input }: Partial<WaContactInput> & { id: string }) => whatsappApi.updateContact(id, input),
      onSuccess: refresh,
    }),
    removeContact: useMutation({ mutationFn: whatsappApi.removeContact, onSuccess: refresh }),
    reply: useMutation({
      mutationFn: ({
        phone,
        ...input
      }: {
        phone: string;
        text: string;
        saveToInbox?: { title: string; question?: string };
      }) => whatsappApi.reply(phone, input),
      onSuccess: refresh,
    }),
    resolve: useMutation({ mutationFn: whatsappApi.resolve, onSuccess: refresh }),
    simulate: useMutation({
      mutationFn: whatsappApi.simulate,
      onSuccess: () => {
        refresh();
        // Balasan bot diproses antrian → muat ulang pengajuan juga (berkas → pengajuan baru)
        void client.invalidateQueries({ queryKey: queryKeys.requests });
      },
    }),
  };
}
