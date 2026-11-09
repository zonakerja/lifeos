import {
  ArrowLeftRight,
  BrainCircuit,
  Command as CommandIcon,
  FilePlus2,
  FileText,
  FolderOpen,
  Info,
  Link2,
  Loader2,
  PanelLeftClose,
  PanelRightClose,
  Search,
  Settings2,
} from "lucide-react";
import { lazy, Suspense, useEffect, useEffectEvent, useMemo, useState } from "react";
import { Link } from "react-router";
import { HeroStat, ModulePage } from "@/components/layout/module-page";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { useKnowledgeStatus } from "@/data/use-knowledge";
import { useKnowledgeTree } from "@/data/use-knowledge-workspace";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSearchParam, useSetSearchParams } from "@/hooks/use-search-param";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { KnowledgeNoteListItem, KnowledgeTree } from "@/types/api";
import { DailyNoteButton } from "../daily-note-button";
import { GraphTab } from "./graph-tab";
import { HealthTab, InboxTab } from "./inbox-health-tabs";
import { createResolver, folderOf, type NotePane } from "./knowledge-logic";
import { LeftPanel } from "./left-panel";
import { NoteLinkProvider } from "./note-markdown";
import { NoteSidebar } from "./note-sidebar";
import { NoteView } from "./note-view";
import { TableTab } from "./table-tab";
import { TasksTab } from "./tasks-tab";
import { WorkspaceDialogs } from "./workspace-dialogs";

/** Tab Bases dimuat malas (mesin ekspresi + penyunting tidak perlu dimuat untuk tab lain). */
const BasesTab = lazy(() => import("./bases-tab").then((m) => ({ default: m.BasesTab })));
/** Tab Canvas dimuat malas (papan kartu + penyunting). */
const CanvasTab = lazy(() => import("./canvas-tab").then((m) => ({ default: m.CanvasTab })));
import { NotePaneContext, openWorkspaceDialog, useOpenNote, useWorkspaceStore } from "./workspace-store";

/**
 * Menu Knowledge: antarmuka vault Obsidian di LifeOS (docs/AI-AGENT.md §25.2). Berkas vault tetap sumber kebenaran —
 * setiap perubahan ditulis ke berkas dan dibaca ulang pemantau vault (indeks RAG & graf ikut).
 */
export function Component() {
  const { data: status, isLoading } = useKnowledgeStatus();
  const ready = !!status?.configured && !!status.folder;

  // Ctrl/Cmd+O = pembuka cepat, Ctrl/Cmd+P = palet perintah (seperti Obsidian; Ctrl+P menggantikan cetak browser di sini)
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (!ready || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key !== "o" && key !== "p") return;
    e.preventDefault();
    openWorkspaceDialog({ kind: key === "o" ? "quick-switcher" : "command-palette" });
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <ModulePage
      module="knowledge"
      meta={
        ready && (
          <>
            <HeroStat>
              <FolderOpen className="size-3.5" /> <span className="font-mono">{status.folder}</span>
            </HeroStat>
            <HeroStat>
              <FileText className="size-3.5" /> {status.notes} catatan
            </HeroStat>
            <HeroStat>
              <Link2 className="size-3.5" /> {status.links} tautan
            </HeroStat>
            {status.scanning && (
              <HeroStat>
                <Loader2 className="size-3.5 animate-spin" /> memindai
              </HeroStat>
            )}
          </>
        )
      }
      actions={ready && <HeroActions />}
    >
      {(tab) =>
        isLoading ? (
          <Spinner className="m-6" />
        ) : !ready ? (
          <NoVault configured={!!status?.configured} />
        ) : (
          <>
            {tab === "graph" ? (
              <GraphTab />
            ) : tab === "table" ? (
              <TableTab />
            ) : tab === "canvas" ? (
              <Suspense fallback={<Spinner className="m-6" />}>
                <CanvasTab />
              </Suspense>
            ) : tab === "bases" ? (
              <Suspense fallback={<Spinner className="m-6" />}>
                <BasesTab />
              </Suspense>
            ) : tab === "tasks" ? (
              <TasksTab />
            ) : tab === "inbox" ? (
              <InboxTab />
            ) : tab === "health" ? (
              <HealthTab />
            ) : (
              <NotesTab />
            )}
            <WorkspaceDialogs />
          </>
        )
      }
    </ModulePage>
  );
}

/** Tombol di banner; varian `secondary` seperti aksi banner menu lain karena latar banner berwarna modul. */
function HeroActions() {
  return (
    <>
      <DailyNoteButton />
      <Button size="sm" variant="secondary" onClick={() => openWorkspaceDialog({ kind: "quick-switcher" })}>
        <Search /> Buka cepat <Kbd className="hidden xl:inline-flex">Ctrl O</Kbd>
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => openWorkspaceDialog({ kind: "command-palette" })}
        title="Palet perintah: semua aksi Knowledge (sunting, pindah, sisip tabel/callout/templat, catatan harian, …)"
      >
        <CommandIcon /> Perintah <Kbd className="hidden xl:inline-flex">Ctrl P</Kbd>
      </Button>
      <Button size="sm" variant="secondary" onClick={() => openWorkspaceDialog({ kind: "new-note" })}>
        <FilePlus2 /> Catatan baru
      </Button>
      <Button size="icon-sm" variant="secondary" asChild aria-label="Pengaturan vault">
        <Link to="/tools/knowledge" title="Pengaturan vault (Tools → Basis Pengetahuan)">
          <Settings2 />
        </Link>
      </Button>
    </>
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
const PRIMARY_PANE = { focused: true, headingParam: "h" } as const;
const SECONDARY_PANE = { focused: true, headingParam: "h2" } as const;

/** Satu panel dari dua catatan berdampingan: pointer/fokus di dalamnya menjadikannya panel aktif sebelum klik diproses. */
function SplitPane({
  pane,
  id,
  focused,
  item,
  notes,
}: {
  pane: NotePane;
  id: string;
  focused: boolean;
  item: KnowledgeNoteListItem | null;
  notes: KnowledgeNoteListItem[];
}) {
  const value = useMemo(
    () => ({ focused, headingParam: pane === "primary" ? ("h" as const) : ("h2" as const) }),
    [focused, pane],
  );
  const activate = () => {
    if (useWorkspaceStore.getState().focusedPane !== pane) useWorkspaceStore.setState({ focusedPane: pane });
  };
  return (
    <div
      onPointerDownCapture={activate}
      onFocusCapture={activate}
      data-pane={pane}
      className={cn("min-h-0 min-w-0 border-t-2", focused ? "border-module" : "border-transparent")}
    >
      <NotePaneContext.Provider value={value}>
        <NoteView key={id} id={id} item={item} notes={notes} />
      </NotePaneContext.Provider>
    </div>
  );
}

/** Dua catatan berdampingan (K11): panel info mengikuti panel aktif dan disembunyikan bawaan agar kedua catatan cukup lebar. */
function SplitView({
  left,
  right,
  focused,
  notes,
  itemOf,
  info,
  onToggleInfo,
}: {
  left: string;
  right: string;
  focused: NotePane;
  notes: KnowledgeNoteListItem[];
  itemOf: (id: string) => KnowledgeNoteListItem | null;
  info: boolean;
  onToggleInfo: () => void;
}) {
  const setParams = useSetSearchParams();
  const closeSide = (pane: NotePane) => {
    useWorkspaceStore.setState({ focusedPane: "primary" });
    setParams(pane === "primary" ? { note: right, with: null, h: null, h2: null } : { with: null, h2: null });
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1">
        <Button size="xs" variant="ghost" onClick={() => closeSide("primary")}>
          <PanelLeftClose /> Tutup kiri
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setParams({ note: right, with: left, h: null, h2: null })}>
          <ArrowLeftRight /> Tukar
        </Button>
        <Button size="xs" variant="ghost" onClick={() => closeSide("secondary")}>
          <PanelRightClose /> Tutup kanan
        </Button>
        <Button size="xs" variant={info ? "secondary" : "ghost"} className="ml-auto" onClick={onToggleInfo}>
          <Info /> Info
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x">
        <SplitPane pane="primary" id={left} focused={focused === "primary"} item={itemOf(left)} notes={notes} />
        <SplitPane pane="secondary" id={right} focused={focused === "secondary"} item={itemOf(right)} notes={notes} />
      </div>
    </div>
  );
}

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
  const [sideParam] = useSearchParam("with");
  const storedPane = useWorkspaceStore((s) => s.focusedPane);
  const [sideInfo, setSideInfo] = useState(false);
  // Dua panel hanya di tata letak tiga kolom; catatan yang sama tidak dibuka dua kali
  const sideId = three && noteId && sideParam && sideParam !== noteId ? sideParam : null;
  const focusedPane = sideId ? storedPane : "primary";
  const focusedId = focusedPane === "secondary" ? sideId : noteId;
  const resolve = useMemo(() => createResolver(tree?.notes ?? []), [tree]);
  const byId = useMemo(() => {
    const map = new Map((tree?.notes ?? []).map((n) => [n.id, n]));
    return (id: string) => map.get(id) ?? null;
  }, [tree]);

  if (isLoading || !tree) return <Spinner className="m-6" />;
  const itemOf = (id: string) => tree.notes.find((n) => n.id === id) ?? null;
  const item = noteId ? itemOf(noteId) : null;
  const center =
    sideId && noteId ? (
      <SplitView
        left={noteId}
        right={sideId}
        focused={focusedPane}
        notes={tree.notes}
        itemOf={itemOf}
        info={sideInfo}
        onToggleInfo={() => setSideInfo((v) => !v)}
      />
    ) : noteId ? (
      <NoteView key={noteId} id={noteId} item={item} notes={tree.notes} />
    ) : (
      <Welcome tree={tree} />
    );
  const info = (
    <div className="h-full overflow-y-auto">
      {focusedId ? (
        <NotePaneContext.Provider value={focusedPane === "secondary" ? SECONDARY_PANE : PRIMARY_PANE}>
          <NoteSidebar key={focusedId} id={focusedId} notes={tree.notes} />
        </NotePaneContext.Provider>
      ) : (
        <SidebarHint />
      )}
    </div>
  );
  const frame = "h-[calc(100svh-12.5rem)] min-h-[460px] overflow-hidden rounded-2xl border bg-card";

  let layout;
  if (three) {
    layout = (
      <div
        className={cn(
          frame,
          "grid",
          sideId && !sideInfo
            ? "grid-cols-[16rem_minmax(0,1fr)] 2xl:grid-cols-[17rem_minmax(0,1fr)]"
            : "grid-cols-[16rem_minmax(0,1fr)_19rem] 2xl:grid-cols-[17rem_minmax(0,1fr)_21rem]",
        )}
      >
        <div className="min-h-0 border-r">
          <LeftPanel tree={tree} activeId={focusedId} />
        </div>
        <div className="min-h-0 min-w-0">{center}</div>
        {(!sideId || sideInfo) && <div className="min-h-0 border-l">{info}</div>}
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
    <NoteLinkProvider value={{ resolve, byId, open: (id, heading, options) => openNote(id, heading, options) }}>
      {layout}
    </NoteLinkProvider>
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
