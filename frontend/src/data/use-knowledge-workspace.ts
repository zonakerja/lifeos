import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { knowledgeApi } from "@/lib/api/endpoints";
import type { KnowledgePrefs, KnowledgeTasks } from "@/types/api";

/** Kunci cache menu Knowledge (semua di bawah prefiks `knowledge` agar satu invalidasi menyegarkan semuanya). */
export const knowledgeKeys = {
  tree: ["knowledge", "tree"] as const,
  graph: ["knowledge", "graph"] as const,
  health: ["knowledge", "health"] as const,
  prefs: ["knowledge", "prefs"] as const,
  source: (id: string) => ["knowledge", "source", id] as const,
  unlinked: (id: string) => ["knowledge", "unlinked", id] as const,
  similar: (id: string) => ["knowledge", "similar", id] as const,
  tasks: ["knowledge", "tasks"] as const,
  versions: (id: string) => ["knowledge", "versions", id] as const,
  version: (id: string, versionId: string) => ["knowledge", "version", id, versionId] as const,
  bases: ["knowledge", "bases"] as const,
  canvases: ["knowledge", "canvases"] as const,
  canvas: (path: string) => ["knowledge", "canvas", path] as const,
  base: (path: string) => ["knowledge", "base", path] as const,
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

/** Isi mentah catatan + hash. `fresh` = selalu dibaca ulang saat dipasang (mis. dialog riwayat versi membandingkan isi terkini). */
export function useKnowledgeSource(id: string | null, options: { fresh?: boolean } = {}) {
  return useQuery({
    queryKey: knowledgeKeys.source(id ?? "-"),
    queryFn: () => knowledgeApi.source(id!),
    enabled: !!id,
    ...(options.fresh ? { refetchOnMount: "always" as const } : {}),
  });
}

export function useKnowledgeUnlinked(id: string | null) {
  return useQuery({
    queryKey: knowledgeKeys.unlinked(id ?? "-"),
    queryFn: () => knowledgeApi.unlinked(id!),
    enabled: !!id,
  });
}

export function useKnowledgeSimilar(id: string | null) {
  return useQuery({
    queryKey: knowledgeKeys.similar(id ?? "-"),
    queryFn: () => knowledgeApi.similar(id!),
    enabled: !!id,
    staleTime: 60_000,
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

/** Tugas lintas vault; disegarkan berkala seperti pohon (perubahan dari Obsidian ikut tampil). */
export function useKnowledgeTasks(enabled = true) {
  return useQuery({ queryKey: knowledgeKeys.tasks, queryFn: knowledgeApi.tasks, enabled, refetchInterval: 30_000 });
}

/** Centang tugas vault: optimistis di daftar, lalu semua data Knowledge disegarkan (isi catatan berubah). */
export function useToggleKnowledgeTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: knowledgeApi.toggleTask,
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: knowledgeKeys.tasks });
      client.setQueryData<KnowledgeTasks>(knowledgeKeys.tasks, (prev) =>
        prev
          ? {
              ...prev,
              tasks: prev.tasks.map((t) =>
                t.noteId === input.noteId && t.index === input.index
                  ? { ...t, status: input.done ? "done" : "todo", doneDate: input.done ? input.today : null }
                  : t,
              ),
            }
          : prev,
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["knowledge"] }),
  });
}

/** Riwayat versi satu catatan. */
export function useKnowledgeVersions(id: string | null) {
  return useQuery({
    queryKey: knowledgeKeys.versions(id ?? "-"),
    queryFn: () => knowledgeApi.versions(id!),
    enabled: !!id,
    refetchOnMount: "always",
  });
}

/** Isi satu versi (tidak berubah → disimpan lama di cache). */
export function useKnowledgeVersion(id: string | null, versionId: string | null) {
  return useQuery({
    queryKey: knowledgeKeys.version(id ?? "-", versionId ?? "-"),
    queryFn: () => knowledgeApi.version(id!, versionId!),
    enabled: !!id && !!versionId,
    staleTime: Infinity,
  });
}

/** Pulihkan versi → seluruh data Knowledge disegarkan (isi catatan berubah). */
export function useRestoreKnowledgeVersion() {
  const refresh = useRefreshKnowledge();
  return useMutation({
    mutationFn: (input: { id: string; versionId: string; baseHash: string }) =>
      knowledgeApi.restoreVersion(input.id, input.versionId, input.baseHash),
    onSuccess: () => void refresh(),
  });
}

/** Daftar berkas `.canvas` di vault. */
export function useKnowledgeCanvases(enabled = true) {
  return useQuery({ queryKey: knowledgeKeys.canvases, queryFn: knowledgeApi.canvases, enabled, staleTime: 15_000 });
}

/** Isi satu canvas (tidak dibaca ulang berkala agar tidak mengganggu penyuntingan; tombol muat ulang tersedia). */
export function useKnowledgeCanvas(path: string | null) {
  return useQuery({
    queryKey: knowledgeKeys.canvas(path ?? "-"),
    queryFn: () => knowledgeApi.canvasFile(path!),
    enabled: !!path,
    refetchOnWindowFocus: false,
  });
}

export function useKnowledgeCanvasActions() {
  const client = useQueryClient();
  const refreshList = () => client.invalidateQueries({ queryKey: knowledgeKeys.canvases });
  return {
    create: useMutation({
      mutationFn: knowledgeApi.createCanvas,
      onSuccess: (file) => {
        client.setQueryData(knowledgeKeys.canvas(file.path), file);
        void refreshList();
      },
    }),
    save: useMutation({ mutationFn: knowledgeApi.saveCanvas }),
    remove: useMutation({ mutationFn: knowledgeApi.deleteCanvas, onSuccess: () => void refreshList() }),
  };
}

/** Daftar berkas `.base` di vault. */
export function useKnowledgeBases(enabled = true) {
  return useQuery({ queryKey: knowledgeKeys.bases, queryFn: knowledgeApi.bases, enabled, staleTime: 15_000 });
}

/** Isi satu base (dibaca ulang berkala agar perubahan dari Obsidian ikut tampil). */
export function useKnowledgeBase(path: string | null) {
  return useQuery({
    queryKey: knowledgeKeys.base(path ?? "-"),
    queryFn: () => knowledgeApi.baseFile(path!),
    enabled: !!path,
    refetchInterval: 30_000,
  });
}

export function useKnowledgeBaseActions() {
  const client = useQueryClient();
  const refreshList = () => client.invalidateQueries({ queryKey: knowledgeKeys.bases });
  return {
    create: useMutation({
      mutationFn: knowledgeApi.createBase,
      onSuccess: (file) => {
        client.setQueryData(knowledgeKeys.base(file.path), file);
        void refreshList();
      },
    }),
    save: useMutation({
      mutationFn: knowledgeApi.saveBase,
      onSuccess: (file) => client.setQueryData(knowledgeKeys.base(file.path), file),
    }),
    remove: useMutation({ mutationFn: knowledgeApi.deleteBase, onSuccess: () => void refreshList() }),
  };
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

/** Segarkan semua data menu Knowledge (pohon, graf, detail, kesehatan, status) setelah menulis berkas. */
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
    openDaily: useMutation({ mutationFn: knowledgeApi.openDaily, onSuccess }),
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
