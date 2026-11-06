import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { knowledgeApi } from "@/lib/api/endpoints";
import type { KnowledgePrefs } from "@/types/api";

/** Kunci cache menu Pengetahuan (semua di bawah prefiks `knowledge` agar satu invalidasi menyegarkan semuanya). */
export const knowledgeKeys = {
  tree: ["knowledge", "tree"] as const,
  graph: ["knowledge", "graph"] as const,
  health: ["knowledge", "health"] as const,
  prefs: ["knowledge", "prefs"] as const,
  source: (id: string) => ["knowledge", "source", id] as const,
  unlinked: (id: string) => ["knowledge", "unlinked", id] as const,
  search: (q: string, mode: string) => ["knowledge", "search", mode, q] as const,
};

/** Pohon vault; disegarkan berkala agar perubahan dari Obsidian (Syncthing) ikut tampil. */
export function useKnowledgeTree(enabled = true) {
  return useQuery({ queryKey: knowledgeKeys.tree, queryFn: knowledgeApi.tree, enabled, refetchInterval: 30_000 });
}

export function useKnowledgeGraph(enabled = true) {
  return useQuery({ queryKey: knowledgeKeys.graph, queryFn: knowledgeApi.graph, enabled, staleTime: 15_000 });
}

export function useKnowledgeHealth(enabled = true) {
  return useQuery({ queryKey: knowledgeKeys.health, queryFn: knowledgeApi.health, enabled });
}

export function useKnowledgeSource(id: string | null) {
  return useQuery({
    queryKey: knowledgeKeys.source(id ?? "-"),
    queryFn: () => knowledgeApi.source(id!),
    enabled: !!id,
  });
}

export function useKnowledgeUnlinked(id: string | null) {
  return useQuery({
    queryKey: knowledgeKeys.unlinked(id ?? "-"),
    queryFn: () => knowledgeApi.unlinked(id!),
    enabled: !!id,
  });
}

export function useKnowledgeSearch(q: string, mode: "text" | "semantic") {
  return useQuery({
    queryKey: knowledgeKeys.search(q, mode),
    queryFn: () => knowledgeApi.search(q, mode),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

const EMPTY_PREFS: KnowledgePrefs = { bookmarks: [], graphGroups: [] };

export function useKnowledgePrefs() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: knowledgeKeys.prefs, queryFn: knowledgeApi.prefs });
  const save = useMutation({
    mutationFn: knowledgeApi.setPrefs,
    onMutate: (next) => client.setQueryData(knowledgeKeys.prefs, next),
    onSuccess: (saved) => client.setQueryData(knowledgeKeys.prefs, saved),
  });
  return { prefs: query.data ?? EMPTY_PREFS, save: (next: KnowledgePrefs) => save.mutateAsync(next) };
}

/** Segarkan semua data menu Pengetahuan (pohon, graf, detail, kesehatan, status) setelah menulis berkas. */
export function useRefreshKnowledge() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["knowledge"] });
}

/** Mutasi berkas vault; setiap sukses menyegarkan seluruh cache pengetahuan. */
export function useKnowledgeActions() {
  const refresh = useRefreshKnowledge();
  const client = useQueryClient();
  const onSuccess = () => void refresh();
  return {
    save: useMutation({
      mutationFn: (input: { id: string; content: string; baseHash: string }) =>
        knowledgeApi.save(input.id, { content: input.content, baseHash: input.baseHash }),
      onSuccess: (source) => {
        client.setQueryData(knowledgeKeys.source(source.id), source);
        void client.invalidateQueries({
          predicate: (q) => q.queryKey[0] === "knowledge" && q.queryKey[1] !== "source",
        });
      },
    }),
    setProperties: useMutation({
      mutationFn: (input: { id: string; set?: Record<string, unknown>; remove?: string[]; baseHash: string }) =>
        knowledgeApi.setProperties(input.id, { set: input.set, remove: input.remove, baseHash: input.baseHash }),
      onSuccess,
    }),
    createNote: useMutation({ mutationFn: knowledgeApi.createNote, onSuccess }),
    moveNote: useMutation({
      mutationFn: (input: { id: string; path: string; updateLinks?: boolean }) =>
        knowledgeApi.moveNote(input.id, { path: input.path, updateLinks: input.updateLinks }),
      onSuccess,
    }),
    deleteNote: useMutation({ mutationFn: knowledgeApi.deleteNote, onSuccess }),
    linkMention: useMutation({
      mutationFn: (input: { id: string; sourceId: string }) => knowledgeApi.linkMention(input.id, input.sourceId),
      onSuccess,
    }),
    createFolder: useMutation({ mutationFn: knowledgeApi.createFolder, onSuccess }),
    moveFolder: useMutation({
      mutationFn: (input: { from: string; to: string }) => knowledgeApi.moveFolder(input.from, input.to),
      onSuccess,
    }),
    deleteFolder: useMutation({ mutationFn: knowledgeApi.deleteFolder, onSuccess }),
  };
}
