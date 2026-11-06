import { BrainCircuit, FilePlus2, FileText, Info, Link2, Loader2, Search, Settings2 } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { Link } from "react-router";
import { ModulePage } from "@/components/layout/module-page";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { useKnowledgeStatus } from "@/data/use-knowledge";
import { useKnowledgeTree } from "@/data/use-knowledge-workspace";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSearchParam } from "@/hooks/use-search-param";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { KnowledgeTree } from "@/types/api";
import { GraphTab } from "./graph-tab";
import { HealthTab, InboxTab } from "./inbox-health-tabs";
import { createResolver, folderOf } from "./knowledge-logic";
import { LeftPanel } from "./left-panel";
import { NoteLinkProvider } from "./note-markdown";
import { NoteSidebar } from "./note-sidebar";
import { NoteView } from "./note-view";
import { TableTab } from "./table-tab";
import { WorkspaceDialogs } from "./workspace-dialogs";
import { openWorkspaceDialog, useOpenNote } from "./workspace-store";

/**
 * Menu Pengetahuan: antarmuka vault Obsidian di LifeOS (docs/AI-AGENT.md §25.2). Berkas vault tetap sumber kebenaran —
 * setiap perubahan ditulis ke berkas dan dibaca ulang pemantau vault (indeks RAG & graf ikut).
 */
export function Component() {
  const { data: status, isLoading } = useKnowledgeStatus();
  const ready = !!status?.configured && !!status.folder;

  // Ctrl/Cmd+O = pembuka cepat (seperti Obsidian)
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (!ready || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "o") return;
    e.preventDefault();
    openWorkspaceDialog({ kind: "quick-switcher" });
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <ModulePage module="knowledge" hideHero>
      {(tab) =>
        isLoading ? (
          <Spinner className="m-6" />
        ) : !ready ? (
          <NoVault configured={!!status?.configured} />
        ) : (
          <>
            <HeaderBar notes={status.notes} links={status.links} scanning={status.scanning} folder={status.folder!} />
            <div className="mt-3">
              {tab === "graph" ? (
                <GraphTab />
              ) : tab === "table" ? (
                <TableTab />
              ) : tab === "inbox" ? (
                <InboxTab />
              ) : tab === "health" ? (
                <HealthTab />
              ) : (
                <NotesTab />
              )}
            </div>
            <WorkspaceDialogs />
          </>
        )
      }
    </ModulePage>
  );
}

function HeaderBar({
  notes,
  links,
  scanning,
  folder,
}: {
  notes: number;
  links: number;
  scanning: boolean;
  folder: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-3 py-2">
      <span className="flex size-8 items-center justify-center rounded-xl bg-module-gradient text-white">
        <BrainCircuit className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold">Pengetahuan</p>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Vault <b className="font-mono">{folder}</b> · {notes} catatan · {links} tautan
          {scanning && (
            <>
              · <Loader2 className="size-3 animate-spin" /> memindai
            </>
          )}
        </p>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={() => openWorkspaceDialog({ kind: "quick-switcher" })}>
          <Search /> Buka cepat <Kbd className="hidden sm:inline-flex">Ctrl O</Kbd>
        </Button>
        <Button size="sm" onClick={() => openWorkspaceDialog({ kind: "new-note" })}>
          <FilePlus2 /> Catatan baru
        </Button>
        <Button size="icon-sm" variant="ghost" asChild aria-label="Pengaturan vault">
          <Link to="/tools/knowledge" title="Pengaturan vault (Tools → Basis Pengetahuan)">
            <Settings2 />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function NoVault({ configured }: { configured: boolean }) {
  return (
    <Empty className="rounded-2xl border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BrainCircuit />
        </EmptyMedia>
        <EmptyTitle>
          {configured ? "Vault Obsidian belum dipilih" : "Konektor Obsidian belum diatur di server"}
        </EmptyTitle>
        <EmptyDescription>
          {configured
            ? "Pilih folder vault atau buat vault baru dari templat di Tools → Basis Pengetahuan, lalu kembali ke sini."
            : "Administrator perlu mengisi KNOWLEDGE_VAULTS_DIR di server (docs/DEPLOYMENT.md)."}
        </EmptyDescription>
      </EmptyHeader>
      {configured && (
        <EmptyContent>
          <Button asChild>
            <Link to="/tools/knowledge">
              <Settings2 /> Buka Basis Pengetahuan
            </Link>
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}

type Pane = "files" | "note" | "info";

const PANES = [
  ["files", "Berkas", FileText],
  ["note", "Catatan", BrainCircuit],
  ["info", "Info", Info],
] as const;

function PaneSwitch({ value, onChange, panes }: { value: Pane; onChange: (p: Pane) => void; panes: Pane[] }) {
  return (
    <div className={cn("grid gap-1 rounded-xl bg-muted/60 p-1", panes.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {PANES.filter(([id]) => panes.includes(id)).map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-semibold",
            value === id ? "bg-module text-module-foreground" : "text-muted-foreground",
          )}
        >
          <Icon className="size-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Tab Catatan: ≥ 1280 px tiga kolom (penjelajah | catatan | info); 1024–1279 px penjelajah + Catatan/Info; di bawahnya
 * satu panel per tab. Hanya satu tata letak yang dirender.
 */
function NotesTab() {
  const { data: tree, isLoading } = useKnowledgeTree();
  const [noteId] = useSearchParam("note");
  const three = useMediaQuery("(min-width: 1280px)");
  const two = useMediaQuery("(min-width: 1024px)");
  const [pane, setPane] = useState<Pane>(noteId ? "note" : "files");
  const [lastNote, setLastNote] = useState(noteId);
  // Catatan lain dibuka → kembali ke panel catatan (state turunan saat render)
  if (noteId !== lastNote) {
    setLastNote(noteId);
    if (noteId) setPane("note");
  }
  const openNote = useOpenNote();
  const resolve = useMemo(() => createResolver(tree?.notes ?? []), [tree]);

  if (isLoading || !tree) return <Spinner className="m-6" />;
  const item = tree.notes.find((n) => n.id === noteId) ?? null;
  const center = noteId ? (
    <NoteView key={noteId} id={noteId} item={item} notes={tree.notes} />
  ) : (
    <Welcome tree={tree} />
  );
  const info = (
    <div className="h-full overflow-y-auto">
      {noteId ? <NoteSidebar key={noteId} id={noteId} notes={tree.notes} /> : <SidebarHint />}
    </div>
  );
  const frame = "h-[calc(100svh-12.5rem)] min-h-[460px] overflow-hidden rounded-2xl border bg-card";

  let layout;
  if (three) {
    layout = (
      <div
        className={cn(frame, "grid grid-cols-[16rem_minmax(0,1fr)_19rem] 2xl:grid-cols-[17rem_minmax(0,1fr)_21rem]")}
      >
        <div className="min-h-0 border-r">
          <LeftPanel tree={tree} activeId={noteId} />
        </div>
        <div className="min-h-0 min-w-0">{center}</div>
        <div className="min-h-0 border-l">{info}</div>
      </div>
    );
  } else if (two) {
    const right = pane === "info" ? "info" : "note";
    layout = (
      <div className={cn(frame, "grid grid-cols-[15rem_minmax(0,1fr)]")}>
        <div className="min-h-0 border-r">
          <LeftPanel tree={tree} activeId={noteId} />
        </div>
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="shrink-0 border-b p-1.5">
            <PaneSwitch value={right} onChange={setPane} panes={["note", "info"]} />
          </div>
          <div className="min-h-0 flex-1">{right === "info" ? info : center}</div>
        </div>
      </div>
    );
  } else {
    layout = (
      <div className="flex flex-col gap-2">
        <PaneSwitch value={pane} onChange={setPane} panes={["files", "note", "info"]} />
        <div className="h-[calc(100svh-13rem)] min-h-[420px] overflow-hidden rounded-2xl border bg-card">
          {pane === "files" ? <LeftPanel tree={tree} activeId={noteId} /> : pane === "info" ? info : center}
        </div>
      </div>
    );
  }

  return (
    <NoteLinkProvider value={{ resolve, open: (id, heading) => openNote(id, heading) }}>{layout}</NoteLinkProvider>
  );
}

function SidebarHint() {
  return (
    <p className="p-4 text-xs text-muted-foreground">
      Pilih catatan untuk melihat properti, backlink, dan graf lokalnya.
    </p>
  );
}

/** Tanpa catatan terpilih: catatan terakhir diubah + cara memakai. */
function Welcome({ tree }: { tree: KnowledgeTree }) {
  const openNote = useOpenNote();
  const recent = [...tree.notes]
    .filter((n) => n.kind === "note")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);
  const start = tree.notes.find((n) => /^mulai di sini\.md$/i.test(n.path));
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <div>
          <h2 className="text-xl font-extrabold">Vault Anda</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Semua yang Anda ubah di sini ditulis ke berkas vault dan tersinkron ke Obsidian. Ketik <code>[[</code> di
            editor untuk menautkan catatan; buka <b>Graf</b> untuk melihat jaringan pengetahuan.
          </p>
          {start && (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => openNote(start.id)}>
              <Link2 /> Buka "Mulai di sini"
            </Button>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Terakhir diubah</p>
          <ul className="flex flex-col divide-y rounded-xl border">
            {recent.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                  onClick={() => openNote(n.id)}
                >
                  <FileText className="size-3.5 shrink-0 text-module" />
                  <span className="min-w-0 flex-1 truncate text-sm">{n.title}</span>
                  <span className="hidden truncate font-mono text-[10px] text-muted-foreground sm:block">
                    {folderOf(n.path)}
                  </span>
                  <span className="text-[10px] whitespace-nowrap text-muted-foreground">
                    {formatDateTime(n.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
