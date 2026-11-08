import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CloudOff,
  Copy,
  ExternalLink,
  FilePen,
  FolderInput,
  History,
  FolderSync,
  Loader2,
  Combine,
  MoreHorizontal,
  Paperclip,
  Pencil,
  RefreshCw,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { previewFile } from "@/components/common/file-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useKnowledgeNote, useKnowledgeStatus } from "@/data/use-knowledge";
import { useKnowledgeActions, useKnowledgePrefs, useKnowledgeSource } from "@/data/use-knowledge-workspace";
import { useSearchParam } from "@/hooks/use-search-param";
import { ApiError, errorMessage } from "@/lib/api/client";
import { STATUS_LABEL, STATUS_TONE } from "@/features/knowledge/knowledge-utils";
import { cn } from "@/lib/utils";
import type { KnowledgeNoteListItem } from "@/types/api";
import { folderOf, isMirrorNote, mirrorAppPath, noteName, obsidianUri } from "./knowledge-logic";
import { NoteMarkdown } from "./note-markdown";
import { openWorkspaceDialog, useWorkspaceStore, type EditorControl } from "./workspace-store";

const NoteEditor = lazy(() => import("./note-editor"));

/** Isi sudah diawali `# Judul` yang sama → judul tidak ditampilkan dua kali. */
const startsWithTitle = (content: string | null, title: string) => {
  const first = (content ?? "").trimStart().split("\n")[0] ?? "";
  return /^#\s/.test(first) && first.replace(/^#\s+/, "").trim().toLowerCase() === title.trim().toLowerCase();
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

/** Kolom tengah: catatan terpilih — mode Baca (Markdown + tautan) dan Sunting (sumber, simpan otomatis bertanda hash). */
export function NoteView({
  id,
  item,
  notes,
}: {
  id: string;
  item: KnowledgeNoteListItem | null;
  notes: KnowledgeNoteListItem[];
}) {
  const navigate = useNavigate();
  const { data: note, isLoading, error } = useKnowledgeNote(id);
  const { data: status } = useKnowledgeStatus();
  const { prefs, save: savePrefs } = useKnowledgePrefs();
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [heading, setHeading] = useSearchParam("h");
  const scroller = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorControl | null>(null);

  const switchMode = useCallback(
    async (next: "read" | "edit") => {
      if (next === mode) return;
      if (mode === "edit" && editorRef.current && !(await editorRef.current.flush())) return;
      setMode(next);
    },
    [mode],
  );

  // Catatan terbuka → palet perintah (Ctrl+P) bisa menjalankan aksi catatan ini
  useEffect(() => {
    if (!note) return;
    const mirror = isMirrorNote({ path: note.path, properties: note.frontmatter });
    const bookmarked = prefs.bookmarks.includes(note.path);
    useWorkspaceStore.setState({
      active: {
        id,
        path: note.path,
        title: note.title,
        item,
        editable: note.kind === "note" && !mirror,
        mirror,
        mode,
        setMode: (next) => void switchMode(next),
        control: editorRef,
        bookmarked,
        toggleBookmark: () =>
          void savePrefs({
            ...prefs,
            bookmarks: bookmarked ? prefs.bookmarks.filter((b) => b !== note.path) : [...prefs.bookmarks, note.path],
          }),
      },
    });
  }, [id, note, item, mode, prefs, savePrefs, switchMode]);
  useEffect(
    () => () => {
      if (useWorkspaceStore.getState().active?.id === id) useWorkspaceStore.setState({ active: null });
    },
    [id],
  );

  // Lompat ke judul (`[[catatan#judul]]` / garis besar) setelah isi tampil
  useEffect(() => {
    if (!heading || !note || mode !== "read") return;
    const timer = setTimeout(() => {
      scroller.current
        ?.querySelector(`#${CSS.escape(heading)}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      setHeading(null, { replace: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [heading, note, mode, setHeading]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!note) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <TriangleAlert className="size-6 text-warning" />
        {error ? errorMessage(error) : "Catatan tidak ditemukan — mungkin sudah dipindah atau dihapus dari vault."}
      </div>
    );
  }

  const bookmarked = prefs.bookmarks.includes(note.path);
  const toggleBookmark = () =>
    void savePrefs({
      ...prefs,
      bookmarks: bookmarked ? prefs.bookmarks.filter((b) => b !== note.path) : [...prefs.bookmarks, note.path],
    });
  const statusValue = note.metadata.status;
  const mirror = isMirrorNote({ path: note.path, properties: note.frontmatter });
  const appPath = mirror ? mirrorAppPath(note.frontmatter, window.location.origin) : null;
  const editable = note.kind === "note" && !mirror;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="@container flex shrink-0 items-center gap-1.5 border-b px-3 py-2">
        <Button variant="ghost" size="icon-sm" aria-label="Kembali" onClick={() => void navigate(-1)}>
          <ArrowLeft />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Maju" onClick={() => void navigate(1)}>
          <ArrowRight />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{note.title}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{folderOf(note.path) || "/"}</p>
        </div>
        {statusValue && (
          <Badge className={cn("hidden @md:inline-flex", STATUS_TONE[statusValue])}>{STATUS_LABEL[statusValue]}</Badge>
        )}
        {mirror && (
          <Badge variant="outline" className="hidden @md:inline-flex" title="Dikelola LifeOS — baca saja">
            <FolderSync /> Cermin LifeOS
          </Badge>
        )}
        {mirror && appPath && (
          <Button size="sm" variant="outline" aria-label="Buka di LifeOS" onClick={() => void navigate(appPath)}>
            <ExternalLink /> <span className="hidden @lg:inline">Buka di LifeOS</span>
          </Button>
        )}
        {editable && (
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={mode}
            onValueChange={(v) => v && void switchMode(v as "read" | "edit")}
          >
            <ToggleGroupItem value="read" aria-label="Mode baca">
              <BookOpen /> <span className="hidden @lg:inline">Baca</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="edit" aria-label="Mode sunting">
              <Pencil /> <span className="hidden @lg:inline">Sunting</span>
            </ToggleGroupItem>
          </ToggleGroup>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={bookmarked ? "Hapus penanda" : "Tandai"}
          onClick={toggleBookmark}
          className={bookmarked ? "text-warning" : undefined}
        >
          <Star className={bookmarked ? "fill-current" : undefined} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Aksi lain">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {item && !mirror && (
              <>
                <DropdownMenuItem
                  onSelect={() => openWorkspaceDialog({ kind: "move-note", note: item, mode: "rename" })}
                >
                  <FilePen /> Ganti nama
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openWorkspaceDialog({ kind: "move-note", note: item, mode: "move" })}>
                  <FolderInput /> Pindahkan
                </DropdownMenuItem>
              </>
            )}
            {!mirror && note.kind === "note" && (
              <DropdownMenuItem
                onSelect={() =>
                  openWorkspaceDialog({ kind: "compose", mode: "merge", source: { id: note.id, path: note.path } })
                }
              >
                <Combine /> Gabungkan ke catatan lain…
              </DropdownMenuItem>
            )}
            {!mirror && (
              <DropdownMenuItem
                onSelect={() => openWorkspaceDialog({ kind: "versions", id: note.id, title: note.title })}
              >
                <History /> Riwayat versi
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(`[[${noteName(note.path)}]]`)}>
              <Copy /> Salin tautan [[…]]
            </DropdownMenuItem>
            {status?.folder && (
              <DropdownMenuItem asChild>
                <a href={obsidianUri(status.folder, note.path)}>
                  <ExternalLink /> Buka di Obsidian
                </a>
              </DropdownMenuItem>
            )}
            {item && !mirror && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => openWorkspaceDialog({ kind: "delete-note", note: item })}
                >
                  <Trash2 /> Pindahkan ke sampah
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!!note.problems.length && mode === "read" && (
        <p className="mx-3 mt-2 flex shrink-0 items-start gap-1.5 rounded-lg bg-warning/10 px-3 py-1.5 text-xs text-warning">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {note.problems.join(" · ")}
        </p>
      )}

      {note.kind === "file" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
          <Paperclip className="size-8 text-module" />
          <p>Berkas lampiran vault — isinya dibaca server dan ikut diindeks sebagai pengetahuan.</p>
          {note.assetId && (
            <Button size="sm" onClick={() => previewFile({ uploadId: note.assetId!, name: note.title })}>
              <Paperclip /> Lihat berkas
            </Button>
          )}
        </div>
      ) : mode === "edit" && editable ? (
        <EditPane key={id} id={id} title={note.title} notes={notes} controlRef={editorRef} />
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8">
          <div className="mx-auto max-w-3xl">
            {!startsWithTitle(note.content, note.title) && (
              <h1 className="mb-4 text-2xl font-extrabold tracking-tight">{note.title}</h1>
            )}
            {note.content?.trim() ? (
              <NoteMarkdown content={note.content} noteId={note.id} />
            ) : mirror ? null : (
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-module"
                onClick={() => void switchMode("edit")}
              >
                Catatan kosong — klik untuk mulai menulis.
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Mode sunting: isi mentah berkas; simpan otomatis 1,5 detik setelah berhenti mengetik. */
function EditPane({
  id,
  title,
  notes,
  controlRef,
}: {
  id: string;
  title: string;
  notes: KnowledgeNoteListItem[];
  controlRef: React.RefObject<EditorControl | null>;
}) {
  const { data: source, isLoading, refetch } = useKnowledgeSource(id);
  const { save, createNote } = useKnowledgeActions();
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<SaveState>("idle");
  const text = useRef<string | null>(null);
  const hash = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saving = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (source && hash.current === null) hash.current = source.hash;
  }, [source]);

  const doSave = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    if (text.current === null || !hash.current) return true;
    if (saving.current) await saving.current;
    if (text.current === null) return true;
    const content = text.current;
    setState("saving");
    const run = (async () => {
      try {
        const saved = await save.mutateAsync({ id, content, baseHash: hash.current! });
        hash.current = saved.hash;
        if (text.current === content) {
          text.current = null;
          setState("saved");
        } else setState("dirty");
        return true;
      } catch (error) {
        setState(error instanceof ApiError && error.status === 409 ? "conflict" : "error");
        if (!(error instanceof ApiError && error.status === 409))
          toast.error("Gagal menyimpan", { description: errorMessage(error) });
        return false;
      } finally {
        saving.current = null;
      }
    })();
    saving.current = run;
    return run;
  }, [id, save]);

  const reloadLatest = useCallback(async () => {
    clearTimeout(timer.current);
    text.current = null;
    hash.current = null;
    const fresh = await refetch();
    hash.current = fresh.data?.hash ?? null;
    setVersion((v) => v + 1);
    setState("idle");
  }, [refetch]);

  useEffect(() => {
    controlRef.current = { flush: doSave, reload: reloadLatest };
    return () => {
      controlRef.current = null;
      // Keluar dari mode sunting / pindah catatan: perubahan yang belum tersimpan dikirim
      if (text.current !== null) void doSave();
    };
  }, [controlRef, doSave, reloadLatest]);

  const saveAsCopy = async () => {
    if (text.current === null || !source) return;
    try {
      const copy = await createNote.mutateAsync({
        folder: folderOf(source.path),
        title: `${noteName(source.path)} (salinan)`,
        content: text.current,
      });
      toast.success(`Versi Anda disimpan sebagai ${copy.path}`);
      await reloadLatest();
    } catch (error) {
      toast.error("Gagal menyimpan salinan", { description: errorMessage(error) });
    }
  };

  if (isLoading || !source) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {state === "conflict" ? (
        <div className="mx-3 mt-2 flex shrink-0 flex-wrap items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
          <TriangleAlert className="size-4" />
          <span className="flex-1">
            Catatan sudah diubah di Obsidian / perangkat lain. Perubahan Anda belum disimpan agar tidak menimpa.
          </span>
          <Button size="xs" variant="outline" onClick={() => void saveAsCopy()}>
            <Copy /> Simpan versi saya sebagai salinan
          </Button>
          <Button size="xs" onClick={() => void reloadLatest()}>
            <RefreshCw /> Muat versi terbaru
          </Button>
        </div>
      ) : (
        <p className="flex shrink-0 items-center justify-end gap-1 px-3 pt-1.5 text-[11px] text-muted-foreground">
          {state === "saving" && (
            <>
              <Loader2 className="size-3 animate-spin" /> Menyimpan…
            </>
          )}
          {state === "saved" && (
            <>
              <Check className="size-3 text-success" /> Tersimpan ke vault
            </>
          )}
          {state === "dirty" && "Belum disimpan…"}
          {state === "error" && (
            <>
              <CloudOff className="size-3 text-destructive" /> Gagal menyimpan —{" "}
              <button type="button" className="underline" onClick={() => void doSave()}>
                coba lagi
              </button>
            </>
          )}
          {state === "idle" && "Simpan otomatis · Ctrl+S"}
        </p>
      )}
      <div className="min-h-0 flex-1 px-2 sm:px-6">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          }
        >
          <NoteEditor
            key={version}
            initial={source.raw}
            noteId={id}
            title={title}
            notes={notes}
            onChange={(value) => {
              text.current = value;
              setState("dirty");
              clearTimeout(timer.current);
              timer.current = setTimeout(() => void doSave(), 1500);
            }}
            onSave={() => void doSave()}
          />
        </Suspense>
      </div>
    </div>
  );
}
