import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/data/query-keys";
import { notebooksApi } from "@/lib/api/endpoints";
import type {
  AddNotebookSourceInput,
  NotebookAttachment,
  NotebookDetail,
  NotebookMessage,
  NotebookNote,
  NotebookSource,
} from "@/types/api";

/** Daftar notebook milik user. */
export function useNotebooks() {
  return useQuery({ queryKey: queryKeys.notebooks, queryFn: notebooksApi.list });
}

/** Detail notebook + sumber; diperbarui tiap 3 detik selama ada sumber yang masih diproses (ekstraksi berkas). */
export function useNotebook(id: string | null) {
  return useQuery({
    queryKey: queryKeys.notebook(id ?? ""),
    queryFn: () => notebooksApi.get(id!),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.sources.some((s) => s.status === "processing") ? 3000 : false),
  });
}

export function useNotebookMessages(id: string) {
  return useQuery({ queryKey: queryKeys.notebookMessages(id), queryFn: () => notebooksApi.messages(id) });
}

export function useNotebookNotes(id: string) {
  return useQuery({ queryKey: queryKeys.notebookNotes(id), queryFn: () => notebooksApi.notes(id) });
}

export function useCreateNotebook() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: notebooksApi.create,
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.notebooks, exact: true }),
  });
}

export function useUpdateNotebook(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof notebooksApi.update>[1]) => notebooksApi.update(id, input),
    onSuccess: (updated) => {
      client.setQueryData<NotebookDetail>(queryKeys.notebook(id), (prev) =>
        prev ? { ...prev, ...updated, sources: prev.sources } : prev,
      );
      void client.invalidateQueries({ queryKey: queryKeys.notebooks, exact: true });
    },
  });
}

export function useDeleteNotebook() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: notebooksApi.remove,
    onSuccess: (_, id) => {
      client.removeQueries({ queryKey: queryKeys.notebook(id) });
      void client.invalidateQueries({ queryKey: queryKeys.notebooks, exact: true });
    },
  });
}

/** Mutasi sumber notebook; hasilnya langsung dipasang ke cache detail (tanpa menunggu refetch). */
export function useNotebookSources(id: string) {
  const client = useQueryClient();
  const patchSources = (fn: (sources: NotebookSource[]) => NotebookSource[]) => {
    client.setQueryData<NotebookDetail>(queryKeys.notebook(id), (prev) =>
      prev ? { ...prev, sources: fn(prev.sources) } : prev,
    );
    // Ringkasan bisa menjadi usang & jumlah sumber di daftar berubah
    void client.invalidateQueries({ queryKey: queryKeys.notebook(id), exact: true });
    void client.invalidateQueries({ queryKey: queryKeys.notebooks, exact: true });
  };
  const upsert = (source: NotebookSource) =>
    patchSources((list) =>
      list.some((s) => s.id === source.id) ? list.map((s) => (s.id === source.id ? source : s)) : [...list, source],
    );

  return {
    add: useMutation({
      mutationFn: (input: AddNotebookSourceInput) => notebooksApi.addSource(id, input),
      onSuccess: upsert,
    }),
    update: useMutation({
      mutationFn: ({ sourceId, ...input }: { sourceId: string; enabled?: boolean; title?: string }) =>
        notebooksApi.updateSource(id, sourceId, input),
      onSuccess: upsert,
    }),
    refresh: useMutation({
      mutationFn: (sourceId: string) => notebooksApi.refreshSource(id, sourceId),
      onSuccess: (source) => {
        upsert(source);
        if (source.error) toast.error("Halaman gagal dimuat ulang", { description: source.error });
        else toast.success("Halaman web dimuat ulang.");
      },
    }),
    remove: useMutation({
      mutationFn: (sourceId: string) => notebooksApi.removeSource(id, sourceId),
      onSuccess: (_, sourceId) => patchSources((list) => list.filter((s) => s.id !== sourceId)),
    }),
  };
}

/** Kirim pertanyaan; pesan user tampil seketika, jawaban AI ditambahkan saat selesai. */
export function useNotebookChat(id: string) {
  const client = useQueryClient();
  const key = queryKeys.notebookMessages(id);
  return useMutation({
    mutationFn: ({ message, attachments = [] }: { message: string; attachments?: NotebookAttachment[] }) =>
      notebooksApi.chat(
        id,
        message,
        attachments.map((a) => a.uploadId),
      ),
    onMutate: ({ message, attachments }) => {
      const pending: NotebookMessage = {
        id: `pending-${Date.now()}`,
        role: "user",
        content: message,
        citations: null,
        attachments,
        createdAt: new Date().toISOString(),
      };
      client.setQueryData<NotebookMessage[]>(key, (prev) => [...(prev ?? []), pending]);
      return { pendingId: pending.id };
    },
    onSuccess: (result, _, context) => {
      client.setQueryData<NotebookMessage[]>(key, (prev) => [
        ...(prev ?? []).filter((m) => m.id !== context?.pendingId),
        result.userMessage,
        result.assistantMessage,
      ]);
      if (result.fallback) toast.info("Provider AI cadangan dipakai", { description: result.fallback.message });
    },
    onError: (_, __, context) =>
      client.setQueryData<NotebookMessage[]>(key, (prev) => (prev ?? []).filter((m) => m.id !== context?.pendingId)),
  });
}

export function useClearNotebookChat(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => notebooksApi.clearMessages(id),
    onSuccess: () => client.setQueryData<NotebookMessage[]>(queryKeys.notebookMessages(id), []),
  });
}

export function useSummarizeNotebook(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => notebooksApi.summarize(id),
    onSuccess: (result) => {
      client.setQueryData<NotebookDetail>(queryKeys.notebook(id), (prev) =>
        prev ? { ...prev, summary: result.summary, summaryAt: result.summaryAt, summaryStale: false } : prev,
      );
      void client.invalidateQueries({ queryKey: queryKeys.notebooks, exact: true });
      if (result.fallback) toast.info("Provider AI cadangan dipakai", { description: result.fallback.message });
    },
  });
}

export function useNotebookNoteMutations(id: string) {
  const client = useQueryClient();
  const key = queryKeys.notebookNotes(id);
  const set = (fn: (notes: NotebookNote[]) => NotebookNote[]) => {
    client.setQueryData<NotebookNote[]>(key, (prev) => fn(prev ?? []));
    void client.invalidateQueries({ queryKey: queryKeys.notebooks, exact: true });
  };
  return {
    create: useMutation({
      mutationFn: (input: Parameters<typeof notebooksApi.createNote>[1]) => notebooksApi.createNote(id, input),
      onSuccess: (note) => set((notes) => [note, ...notes]),
    }),
    update: useMutation({
      mutationFn: ({ noteId, ...input }: { noteId: string; title?: string; content?: string }) =>
        notebooksApi.updateNote(id, noteId, input),
      onSuccess: (note) => set((notes) => [note, ...notes.filter((n) => n.id !== note.id)]),
    }),
    remove: useMutation({
      mutationFn: (noteId: string) => notebooksApi.removeNote(id, noteId),
      onSuccess: (_, noteId) => set((notes) => notes.filter((n) => n.id !== noteId)),
    }),
  };
}
