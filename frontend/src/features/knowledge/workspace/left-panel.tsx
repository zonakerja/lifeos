import {
  ChevronRight,
  ChevronsDownUp,
  Copy,
  FilePen,
  FilePlus2,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Hash,
  Paperclip,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useKnowledgeMutations } from "@/data/use-knowledge";
import { useKnowledgeActions, useKnowledgePrefs, useKnowledgeSearch } from "@/data/use-knowledge-workspace";
import { errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { KnowledgeNoteListItem, KnowledgeTree } from "@/types/api";
import { buildTree, folderOf, isMirrorNote, noteName, tagCounts, type TreeItem } from "./knowledge-logic";
import { openWorkspaceDialog, useOpenNote } from "./workspace-store";

/** Titik status di penjelajah (catatan berlaku tidak diberi titik). */
const STATUS_DOT: Record<string, string> = {
  draf: "bg-warning",
  dicabut: "bg-destructive",
  templat: "bg-muted-foreground",
};

type PanelTab = "files" | "search" | "tags" | "bookmarks";

/** Panel kiri: Penjelajah berkas · Pencarian · Tag · Penanda. */
export function LeftPanel({ tree, activeId }: { tree: KnowledgeTree; activeId: string | null }) {
  const [tab, setTab] = useState<PanelTab>("files");
  const [query, setQuery] = useState("");
  const tabs: { id: PanelTab; label: string; icon: typeof Folder }[] = [
    { id: "files", label: "Berkas", icon: Folder },
    { id: "search", label: "Cari", icon: Search },
    { id: "tags", label: "Tag", icon: Hash },
    { id: "bookmarks", label: "Penanda", icon: Star },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-0.5 border-b p-1">
        {tabs.map((t) => (
          <Tooltip key={t.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t.label}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold",
                  tab === t.id ? "bg-module-soft text-module" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <t.icon className="size-3.5" />
                <span className="hidden xl:inline">{t.label}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{t.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "files" && <Explorer tree={tree} activeId={activeId} />}
        {tab === "search" && <SearchPanel query={query} onQuery={setQuery} activeId={activeId} />}
        {tab === "tags" && (
          <TagsPanel
            notes={tree.notes}
            onPick={(tag) => {
              setQuery(`tag:${tag}`);
              setTab("search");
            }}
          />
        )}
        {tab === "bookmarks" && <BookmarksPanel notes={tree.notes} activeId={activeId} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Penjelajah

const ancestors = (path: string) => {
  const result: string[] = [];
  for (let d = folderOf(path); d; d = folderOf(d)) result.push(d);
  return result;
};

function Explorer({ tree, activeId }: { tree: KnowledgeTree; activeId: string | null }) {
  const items = useMemo(() => buildTree(tree.folders, tree.notes), [tree]);
  const activePath = tree.notes.find((n) => n.id === activeId)?.path ?? null;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(activePath ? ancestors(activePath) : []));
  const [lastActive, setLastActive] = useState(activePath);
  // Catatan aktif berganti → folder induknya dibuka (state turunan saat render)
  if (activePath !== lastActive) {
    setLastActive(activePath);
    if (activePath) setExpanded((prev) => new Set([...prev, ...ancestors(activePath)]));
  }
  const { moveNote } = useKnowledgeActions();
  const { scan } = useKnowledgeMutations();
  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const dropInto = (folder: string, noteId: string) => {
    const note = tree.notes.find((n) => n.id === noteId);
    if (!note || folderOf(note.path) === folder) return;
    const file = note.path.slice(note.path.lastIndexOf("/") + 1);
    moveNote.mutate(
      { id: note.id, path: folder ? `${folder}/${file}` : file },
      {
        onSuccess: (r) => toast.success(`Dipindah ke ${folder || "/"}`, { description: r.path }),
        onError: (error) => toast.error("Gagal memindah", { description: errorMessage(error) }),
      },
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-0.5 px-1.5 py-1">
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Catatan baru"
          title="Catatan baru"
          onClick={() => openWorkspaceDialog({ kind: "new-note", folder: activePath ? folderOf(activePath) : "" })}
        >
          <FilePlus2 />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Folder baru"
          title="Folder baru"
          onClick={() => openWorkspaceDialog({ kind: "new-folder", parent: activePath ? folderOf(activePath) : "" })}
        >
          <FolderPlus />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Tutup semua folder"
          title="Tutup semua"
          onClick={() => setExpanded(new Set())}
        >
          <ChevronsDownUp />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Pindai ulang vault"
          title="Pindai ulang vault"
          className="ml-auto"
          disabled={scan.isPending}
          onClick={() => scan.mutate(undefined, { onSuccess: () => toast.success("Vault dipindai ulang.") })}
        >
          <RefreshCw className={scan.isPending ? "animate-spin" : undefined} />
        </Button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-1 pb-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const id = e.dataTransfer.getData("text/x-knowledge-note");
          if (id && e.target === e.currentTarget) dropInto("", id);
        }}
      >
        {items.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">Vault masih kosong.</p>
        ) : (
          <TreeList items={items} depth={0} expanded={expanded} toggle={toggle} activeId={activeId} onDrop={dropInto} />
        )}
      </div>
    </div>
  );
}

function TreeList({
  items,
  depth,
  expanded,
  toggle,
  activeId,
  onDrop,
}: {
  items: TreeItem[];
  depth: number;
  expanded: Set<string>;
  toggle: (path: string) => void;
  activeId: string | null;
  onDrop: (folder: string, noteId: string) => void;
}) {
  return (
    <ul>
      {items.map((item) =>
        item.type === "folder" ? (
          <FolderRow
            key={item.path}
            item={item}
            depth={depth}
            expanded={expanded}
            toggle={toggle}
            activeId={activeId}
            onDrop={onDrop}
          />
        ) : (
          <NoteRow key={item.path} note={item.note} depth={depth} active={item.note.id === activeId} />
        ),
      )}
    </ul>
  );
}

function FolderRow({
  item,
  depth,
  expanded,
  toggle,
  activeId,
  onDrop,
}: {
  item: Extract<TreeItem, { type: "folder" }>;
  depth: number;
  expanded: Set<string>;
  toggle: (path: string) => void;
  activeId: string | null;
  onDrop: (folder: string, noteId: string) => void;
}) {
  const open = expanded.has(item.path);
  const [over, setOver] = useState(false);
  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={() => toggle(item.path)}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              setOver(false);
              const id = e.dataTransfer.getData("text/x-knowledge-note");
              if (id) onDrop(item.path, id);
            }}
            className={cn(
              "flex w-full items-center gap-1 rounded-md py-1 pr-1.5 text-left text-xs font-medium hover:bg-muted",
              over && "bg-module-soft ring-1 ring-module/40",
            )}
            style={{ paddingLeft: 4 + depth * 12 }}
          >
            <ChevronRight
              className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
            />
            {open ? (
              <FolderOpen className="size-3.5 shrink-0 text-module" />
            ) : (
              <Folder className="size-3.5 shrink-0 text-module" />
            )}
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{item.count}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => openWorkspaceDialog({ kind: "new-note", folder: item.path })}>
            <FilePlus2 /> Catatan baru di sini
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => openWorkspaceDialog({ kind: "new-folder", parent: item.path })}>
            <FolderPlus /> Folder baru di sini
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => openWorkspaceDialog({ kind: "move-folder", path: item.path })}>
            <FolderInput /> Ganti nama / pindah
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => openWorkspaceDialog({ kind: "delete-folder", path: item.path, count: item.count })}
          >
            <Trash2 /> Pindahkan ke sampah
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {open && item.children.length > 0 && (
        <TreeList
          items={item.children}
          depth={depth + 1}
          expanded={expanded}
          toggle={toggle}
          activeId={activeId}
          onDrop={onDrop}
        />
      )}
    </li>
  );
}

function NoteRow({ note, depth, active }: { note: KnowledgeNoteListItem; depth: number; active: boolean }) {
  const openNote = useOpenNote();
  const { prefs, save } = useKnowledgePrefs();
  const bookmarked = prefs.bookmarks.includes(note.path);
  const mirror = isMirrorNote(note);
  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/x-knowledge-note", note.id)}
            onClick={() => openNote(note.id)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md py-1 pr-1.5 text-left text-xs hover:bg-muted",
              active && "bg-module-soft font-semibold text-module",
            )}
            style={{ paddingLeft: 18 + depth * 12 }}
            title={note.path}
          >
            {note.kind === "note" ? (
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate">{note.kind === "note" ? noteName(note.path) : note.title}</span>
            {note.status && STATUS_DOT[note.status] && (
              <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[note.status])} title={note.status} />
            )}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {!mirror && (
            <>
              <ContextMenuItem onSelect={() => openWorkspaceDialog({ kind: "move-note", note, mode: "rename" })}>
                <FilePen /> Ganti nama
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => openWorkspaceDialog({ kind: "move-note", note, mode: "move" })}>
                <FolderInput /> Pindahkan
              </ContextMenuItem>
            </>
          )}
          <ContextMenuItem
            onSelect={() =>
              void save({
                ...prefs,
                bookmarks: bookmarked
                  ? prefs.bookmarks.filter((b) => b !== note.path)
                  : [...prefs.bookmarks, note.path],
              })
            }
          >
            <Star /> {bookmarked ? "Hapus penanda" : "Tandai"}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void navigator.clipboard.writeText(`[[${noteName(note.path)}]]`)}>
            <Copy /> Salin tautan [[…]]
          </ContextMenuItem>
          {!mirror && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onSelect={() => openWorkspaceDialog({ kind: "delete-note", note })}
              >
                <Trash2 /> Pindahkan ke sampah
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </li>
  );
}

// ---------------------------------------------------------------- Pencarian

function SearchPanel({
  query,
  onQuery,
  activeId,
}: {
  query: string;
  onQuery: (q: string) => void;
  activeId: string | null;
}) {
  const [mode, setMode] = useState<"text" | "semantic">("text");
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const { data, isFetching, error } = useKnowledgeSearch(debounced, mode);
  const openNote = useOpenNote();
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <Input
        autoFocus
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Cari di vault…"
        className="h-8 text-xs"
      />
      <div className="flex items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={mode}
          onValueChange={(v) => v && setMode(v as "text" | "semantic")}
        >
          <ToggleGroupItem value="text" className="text-xs">
            Kata
          </ToggleGroupItem>
          <ToggleGroupItem value="semantic" className="text-xs">
            Makna (AI)
          </ToggleGroupItem>
        </ToggleGroup>
        {isFetching && <Spinner className="size-3.5" />}
      </div>
      {mode === "text" && (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Operator: <code>path:</code> <code>tag:</code> <code>status:</code> <code>jenis:</code> <code>file:</code>,
          frasa dalam "tanda kutip".
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && <p className="text-xs text-destructive">{errorMessage(error)}</p>}
        {debounced.trim().length >= 2 && data && data.length === 0 && (
          <p className="text-xs text-muted-foreground">Tidak ada hasil.</p>
        )}
        <ul className="flex flex-col gap-1">
          {(data ?? []).map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => openNote(hit.id)}
                className={cn(
                  "w-full rounded-lg p-2 text-left hover:bg-muted",
                  hit.id === activeId && "bg-module-soft",
                )}
              >
                <p className="truncate text-xs font-semibold">{hit.title}</p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">{hit.path}</p>
                {hit.snippet && <p className="mt-0.5 line-clamp-3 text-[11px] text-muted-foreground">{hit.snippet}</p>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Tag & penanda

function TagsPanel({ notes, onPick }: { notes: KnowledgeNoteListItem[]; onPick: (tag: string) => void }) {
  const tags = useMemo(() => tagCounts(notes), [notes]);
  if (!tags.length)
    return <p className="p-3 text-xs text-muted-foreground">Belum ada tag (properti tags atau #tag di isi).</p>;
  return (
    <ul className="h-full overflow-y-auto p-1.5">
      {tags.map((t) => (
        <li key={t.tag}>
          <button
            type="button"
            onClick={() => onPick(t.tag)}
            className="flex w-full items-center gap-1.5 rounded-md py-1 pr-1.5 text-left text-xs hover:bg-muted"
            style={{ paddingLeft: 6 + t.depth * 12 }}
          >
            <Hash className="size-3 text-module" />
            <span className="min-w-0 flex-1 truncate">{t.tag.slice(t.tag.lastIndexOf("/") + 1)}</span>
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {t.count}
            </Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}

function BookmarksPanel({ notes, activeId }: { notes: KnowledgeNoteListItem[]; activeId: string | null }) {
  const { prefs, save } = useKnowledgePrefs();
  const openNote = useOpenNote();
  if (!prefs.bookmarks.length)
    return <p className="p-3 text-xs text-muted-foreground">Belum ada penanda. Klik ★ di catatan untuk menandainya.</p>;
  return (
    <ul className="h-full overflow-y-auto p-1.5">
      {prefs.bookmarks.map((path) => {
        const note = notes.find((n) => n.path === path);
        return (
          <li key={path} className="group flex items-center gap-1">
            <button
              type="button"
              disabled={!note}
              onClick={() => note && openNote(note.id)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted disabled:line-through disabled:opacity-60",
                note?.id === activeId && "bg-module-soft text-module",
              )}
              title={path}
            >
              <Star className="size-3 shrink-0 fill-current text-warning" />
              <span className="truncate">{note?.title ?? noteName(path)}</span>
            </button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Hapus penanda"
              className="pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
              onClick={() => void save({ ...prefs, bookmarks: prefs.bookmarks.filter((b) => b !== path) })}
            >
              <Trash2 />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
