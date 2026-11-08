import {
  ExternalLink,
  FileText,
  Frame,
  Link2,
  Maximize,
  Minus,
  Palette,
  Plus,
  RefreshCw,
  SquarePen,
  StickyNote,
  Trash2,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { RenameDialog } from "@/components/common/rename-dialog";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { useKnowledgeNote } from "@/data/use-knowledge";
import {
  useKnowledgeCanvas,
  useKnowledgeCanvasActions,
  useKnowledgeCanvases,
  useKnowledgeTree,
} from "@/data/use-knowledge-workspace";
import { useSearchParam } from "@/hooks/use-search-param";
import { ApiError, errorMessage } from "@/lib/api/client";
import { toExternalHref } from "@/lib/urls";
import { cn } from "@/lib/utils";
import type { KnowledgeNoteListItem } from "@/types/api";
import {
  addNode,
  CANVAS_COLORS,
  canvasColor,
  type CanvasData,
  type CanvasNode,
  type NewCanvasNode,
  connect,
  drawOrder,
  edgeGeometry,
  fitView,
  moveNode,
  removeEdge,
  removeNode,
  resizeNode,
  toCanvasData,
  updateNode,
} from "./canvas-logic";
import { createResolver, isImagePath, noteName } from "./knowledge-logic";
import { NoteLinkProvider, NoteMarkdown, VaultImage } from "./note-markdown";
import { useOpenNote } from "./workspace-store";

type Selection = { kind: "node" | "edge"; id: string } | null;
type Drag =
  | { kind: "pan"; startX: number; startY: number; viewX: number; viewY: number }
  | { kind: "move"; id: string; startX: number; startY: number; nodeX: number; nodeY: number; moved: boolean }
  | { kind: "resize"; id: string; startX: number; startY: number; width: number; height: number }
  | { kind: "connect"; from: string; x: number; y: number };

/**
 * Tab Canvas (K8, JSON Canvas — format yang sama dengan Canvas Obsidian): papan kartu teks / catatan / tautan / grup dengan
 * garis penghubung, geser & zoom, penyuntingan dasar, simpan otomatis ke berkas `.canvas` (berubah di Obsidian → dimuat ulang).
 */
export function CanvasTab() {
  const { data: list, isLoading } = useKnowledgeCanvases();
  const [current, setCurrent] = useSearchParam("canvas");
  const actions = useKnowledgeCanvasActions();
  const [creating, setCreating] = useState(false);
  const wanted = current?.toLowerCase();
  const active =
    (wanted &&
      list?.find((c) => c.path.toLowerCase() === wanted || `${c.name}.canvas`.toLowerCase() === wanted.split("/").pop())
        ?.path) ||
    current ||
    list?.[0]?.path ||
    null;

  if (isLoading) return <Spinner className="m-6" />;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-2xl border bg-card p-2">
        <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
          <span className="flex items-center gap-1.5 text-xs font-bold">
            <Frame className="size-3.5 text-module" /> Canvas
          </span>
          <Button size="xs" variant="outline" onClick={() => setCreating(true)}>
            <Plus /> Baru
          </Button>
        </div>
        {list?.length ? (
          <ul className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
            {list.map((item) => (
              <li key={item.path} className="shrink-0">
                <button
                  type="button"
                  title={item.path}
                  onClick={() => setCurrent(item.path)}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted",
                    item.path === active && "bg-module-soft font-semibold text-module",
                  )}
                >
                  <Frame className="size-3.5 shrink-0" />
                  <span className="truncate">{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 text-xs text-muted-foreground">Belum ada canvas.</p>
        )}
      </aside>
      <div className="min-w-0">
        {active ? (
          <CanvasBoard key={active} path={active} onDeleted={() => setCurrent(null)} />
        ) : (
          <Empty className="rounded-2xl border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Frame />
              </EmptyMedia>
              <EmptyTitle>Papan ide untuk vault Anda</EmptyTitle>
              <EmptyDescription>
                Canvas = berkas <code>.canvas</code> berisi kartu teks, catatan, dan tautan yang bisa dihubungkan garis
                — cocok untuk peta konsep atau alur kerja. Berkas yang sama terbuka di Canvas Obsidian.
              </EmptyDescription>
            </EmptyHeader>
            <Button onClick={() => setCreating(true)}>
              <Plus /> Buat canvas
            </Button>
          </Empty>
        )}
      </div>
      <RenameDialog
        open={creating}
        onOpenChange={setCreating}
        title="Canvas baru"
        label="Nama canvas (berkas .canvas di akar vault)"
        initialValue=""
        onSave={(name) =>
          actions.create.mutate(
            { name },
            {
              onSuccess: (file) => setCurrent(file.path),
              onError: (error) => toast.error("Gagal membuat canvas", { description: errorMessage(error) }),
            },
          )
        }
      />
    </div>
  );
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function CanvasBoard({ path, onDeleted }: { path: string; onDeleted: () => void }) {
  const { data: file, isLoading, refetch } = useKnowledgeCanvas(path);
  if (isLoading || !file) return <Spinner className="m-6" />;
  // dimuat ulang (key) setiap isi server berganti karena dimuat ulang / bentrok
  return <CanvasEditor key={file.hash} path={path} file={file} onReload={() => void refetch()} onDeleted={onDeleted} />;
}

function CanvasEditor({
  path,
  file,
  onReload,
  onDeleted,
}: {
  path: string;
  file: { hash: string; data: Record<string, unknown>; error: string | null; readOnly: boolean };
  onReload: () => void;
  onDeleted: () => void;
}) {
  const initial = useMemo(() => toCanvasData(file.data), [file.data]);
  // node/garis tak lengkap tidak bisa ditampilkan → jangan menulis (akan hilang dari berkas)
  const incomplete =
    (Array.isArray(file.data.nodes) ? file.data.nodes.length : 0) !== initial.nodes.length ||
    (Array.isArray(file.data.edges) ? file.data.edges.length : 0) !== initial.edges.length;
  const readOnly = file.readOnly || !!file.error || incomplete;
  const [data, setDataState] = useState<CanvasData>(initial);
  // isi terkini (juga di antara render) agar akhir seretan selalu menyimpan posisi terakhir
  const latest = useRef(initial);
  // dihitung langsung dari isi terkini (bukan updater React yang baru jalan saat render berikutnya)
  const setData = (next: CanvasData | ((prev: CanvasData) => CanvasData)) => {
    const value = typeof next === "function" ? next(latest.current) : next;
    latest.current = value;
    setDataState(value);
    return value;
  };
  const [view, setView] = useState({ x: 40, y: 40, zoom: 1 });
  const [selection, setSelection] = useState<Selection>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [connectLine, setConnectLine] = useState<{ from: string; x: number; y: number } | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const [picking, setPicking] = useState<"note" | "link" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const hash = useRef(file.hash);
  const pending = useRef<CanvasData | null>(null);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const actions = useKnowledgeCanvasActions();
  const { data: tree } = useKnowledgeTree();
  const notes = useMemo(() => tree?.notes ?? [], [tree]);
  const resolve = useMemo(() => createResolver(notes), [notes]);
  const openNote = useOpenNote();
  const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.canvas$/i, "");

  // ---- simpan otomatis (berantai: perubahan selama menyimpan dikirim setelahnya dengan hash terbaru)
  const flush = async () => {
    if (saving.current || !pending.current) return;
    saving.current = true;
    const next = pending.current;
    pending.current = null;
    setState("saving");
    try {
      const saved = await actions.save.mutateAsync({ path, data: next, baseHash: hash.current });
      hash.current = saved.hash;
      setState(pending.current ? "dirty" : "saved");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.error("Canvas diubah di Obsidian", { description: "Isi terbaru dimuat; ulangi perubahan terakhir." });
        onReload();
      } else {
        setState("error");
        toast.error("Gagal menyimpan canvas", { description: errorMessage(error) });
      }
    } finally {
      saving.current = false;
      if (pending.current) void flush();
    }
  };
  const commit = (change: CanvasData | ((prev: CanvasData) => CanvasData)) => {
    const next = setData(change);
    if (readOnly) return;
    pending.current = next;
    setState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  // ---- pas layar saat dibuka
  const fit = () => {
    const el = viewport.current;
    if (!el) return;
    setView(fitView(data.nodes, { width: el.clientWidth, height: el.clientHeight }));
  };
  const onMountFit = useEffectEvent(fit);
  useEffect(() => {
    onMountFit();
  }, []);

  const toWorld = (clientX: number, clientY: number) => {
    const rect = viewport.current?.getBoundingClientRect();
    return {
      x: (clientX - (rect?.left ?? 0) - view.x) / view.zoom,
      y: (clientY - (rect?.top ?? 0) - view.y) / view.zoom,
    };
  };
  const centerWorld = () => {
    const el = viewport.current;
    return el
      ? toWorld(
          el.getBoundingClientRect().left + el.clientWidth / 2,
          el.getBoundingClientRect().top + el.clientHeight / 2,
        )
      : { x: 0, y: 0 };
  };
  const zoomBy = (factor: number, clientX?: number, clientY?: number) => {
    const el = viewport.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (clientX ?? rect.left + el.clientWidth / 2) - rect.left;
    const py = (clientY ?? rect.top + el.clientHeight / 2) - rect.top;
    setView((v) => {
      const zoom = Math.min(2.5, Math.max(0.1, v.zoom * factor));
      return { zoom, x: px - ((px - v.x) / v.zoom) * zoom, y: py - ((py - v.y) / v.zoom) * zoom };
    });
  };

  // ---- roda tetikus: geser, Ctrl/Cmd + roda = zoom di posisi kursor (listener non-pasif agar halaman tidak ikut bergulir)
  const onWheel = useEffectEvent((e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
    else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
  });
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const handler = (e: WheelEvent) => onWheel(e);
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // ---- tombol Delete / Esc
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (editing || readOnly || !selection) return;
    const target = e.target as HTMLElement | null;
    if (target instanceof Element && target.closest("input, textarea, [contenteditable=true], [role=dialog]")) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      commit((d) => (selection.kind === "node" ? removeNode(d, selection.id) : removeEdge(d, selection.id)));
      setSelection(null);
    } else if (e.key === "Escape") setSelection(null);
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ---- seret: geser papan / pindah / ubah ukuran / hubungkan
  const onPointerMove = useEffectEvent((e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pan") {
      setView((v) => ({ ...v, x: d.viewX + e.clientX - d.startX, y: d.viewY + e.clientY - d.startY }));
    } else if (d.kind === "move") {
      const dx = (e.clientX - d.startX) / view.zoom;
      const dy = (e.clientY - d.startY) / view.zoom;
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      d.moved = true;
      setData((prev) => moveNode(prev, d.id, d.nodeX + dx, d.nodeY + dy));
    } else if (d.kind === "resize") {
      setData((prev) =>
        resizeNode(
          prev,
          d.id,
          d.width + (e.clientX - d.startX) / view.zoom,
          d.height + (e.clientY - d.startY) / view.zoom,
        ),
      );
    } else {
      const p = toWorld(e.clientX, e.clientY);
      setConnectLine({ from: d.from, x: p.x, y: p.y });
    }
  });
  const onPointerUp = useEffectEvent((e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind === "pan") return;
    if (d.kind === "connect") {
      setConnectLine(null);
      const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>(
        "[data-canvas-node]",
      );
      const next = target ? connect(latest.current, d.from, target.dataset.canvasNode!) : null;
      if (next) commit(next);
      return;
    }
    if (d.kind === "move" && !d.moved) return;
    commit(latest.current);
  });
  // satu pasang listener jendela selama papan terpasang; tidak berbuat apa-apa bila tidak ada seretan
  useEffect(() => {
    const move = (e: PointerEvent) => onPointerMove(e);
    const up = (e: PointerEvent) => onPointerUp(e);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);
  const startDrag = (next: Drag) => {
    drag.current = next;
  };

  const onBackgroundDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    setSelection(null);
    setEditing(null);
    startDrag({ kind: "pan", startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y });
  };

  const add = (node: Omit<NewCanvasNode, "x" | "y">) => {
    const c = centerWorld();
    const result = addNode(latest.current, { ...node, x: c.x - node.width / 2, y: c.y - node.height / 2 });
    commit(result.data);
    setSelection({ kind: "node", id: result.id });
    return result.id;
  };

  const selectedNode = selection?.kind === "node" ? data.nodes.find((n) => n.id === selection.id) : undefined;
  const nodeById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);

  return (
    <NoteLinkProvider
      value={{
        resolve,
        byId: (id) => notes.find((n) => n.id === id) ?? null,
        open: (id, heading) => openNote(id, heading),
      }}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border bg-card px-3 py-2">
          <div className="mr-auto min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-bold">
              <Frame className="size-4 shrink-0 text-module" /> {name}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {path} · {data.nodes.length} kartu · {data.edges.length} garis ·{" "}
              {readOnly
                ? "hanya dibaca"
                : state === "saving"
                  ? "menyimpan…"
                  : state === "dirty"
                    ? "belum disimpan…"
                    : state === "error"
                      ? "gagal menyimpan"
                      : state === "saved"
                        ? "tersimpan ke vault"
                        : "simpan otomatis"}
            </p>
          </div>
          {!readOnly && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(add({ type: "text", text: "", width: 260, height: 120 }))}
              >
                <StickyNote /> Teks
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPicking("note")}>
                <FileText /> Catatan
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPicking("link")}>
                <Link2 /> Tautan
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => add({ type: "group", label: "Grup", width: 600, height: 400 })}
              >
                <Frame /> Grup
              </Button>
            </>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="Perkecil" onClick={() => zoomBy(1 / 1.2)}>
            <Minus />
          </Button>
          <span className="w-10 text-center text-xs tabular-nums">{Math.round(view.zoom * 100)}%</span>
          <Button size="icon-sm" variant="ghost" aria-label="Perbesar" onClick={() => zoomBy(1.2)}>
            <Plus />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Pas layar" onClick={fit}>
            <Maximize />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Muat ulang dari vault" onClick={onReload}>
            <RefreshCw />
          </Button>
          {!file.readOnly && (
            <Button size="icon-sm" variant="ghost" aria-label="Hapus canvas" onClick={() => setDeleting(true)}>
              <Trash2 />
            </Button>
          )}
        </div>

        {(file.error || incomplete) && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
            {file.error
              ? `Berkas canvas tidak terbaca (${file.error}). Perbaiki di Obsidian — LifeOS tidak menimpanya.`
              : "Sebagian kartu/garis di berkas ini tidak lengkap sehingga canvas dibuka hanya-baca agar isinya tidak hilang."}
          </p>
        )}

        {selection && !readOnly && (
          <SelectionBar
            node={selectedNode}
            onColor={(color) =>
              selection.kind === "node"
                ? commit((d) => updateNode(d, selection.id, { color }))
                : commit((d) => ({ ...d, edges: d.edges.map((e) => (e.id === selection.id ? { ...e, color } : e)) }))
            }
            onEdit={selectedNode?.type === "text" ? () => setEditing(selectedNode.id) : undefined}
            onOpen={
              selectedNode?.type === "file"
                ? () => {
                    const note = resolve(selectedNode.file ?? "");
                    if (note) openNote(note.id);
                  }
                : undefined
            }
            onDelete={() => {
              commit((d) => (selection.kind === "node" ? removeNode(d, selection.id) : removeEdge(d, selection.id)));
              setSelection(null);
            }}
            isEdge={selection.kind === "edge"}
          />
        )}

        <div
          ref={viewport}
          onPointerDown={onBackgroundDown}
          className="relative h-[calc(100svh-17rem)] min-h-[360px] touch-none overflow-hidden rounded-2xl border bg-muted/20 select-none"
          style={{
            backgroundImage:
              "radial-gradient(color-mix(in oklch, var(--muted-foreground) 25%, transparent) 1px, transparent 1px)",
            backgroundSize: `${20 * view.zoom}px ${20 * view.zoom}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
          >
            <svg className="pointer-events-none absolute overflow-visible" width="1" height="1">
              <defs>
                <marker
                  id="canvas-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
                </marker>
              </defs>
              {data.edges.map((edge) => {
                const from = nodeById.get(edge.fromNode);
                const to = nodeById.get(edge.toNode);
                if (!from || !to) return null;
                const { path: d, mid } = edgeGeometry(edge, from, to);
                const color = canvasColor(edge.color) ?? "var(--muted-foreground)";
                const active = selection?.kind === "edge" && selection.id === edge.id;
                return (
                  <g key={edge.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      className="pointer-events-auto cursor-pointer"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelection({ kind: "edge", id: edge.id });
                      }}
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke={active ? "var(--module)" : color}
                      strokeWidth={active ? 3 : 2}
                      markerEnd={edge.toEnd === "none" ? undefined : "url(#canvas-arrow)"}
                      markerStart={edge.fromEnd === "arrow" ? "url(#canvas-arrow)" : undefined}
                    />
                    {edge.label && (
                      <text
                        x={mid.x}
                        y={mid.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-foreground text-[13px]"
                        paintOrder="stroke"
                        stroke="var(--background)"
                        strokeWidth={4}
                      >
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}
              {connectLine &&
                (() => {
                  const from = nodeById.get(connectLine.from);
                  if (!from) return null;
                  return (
                    <line
                      x1={from.x + from.width}
                      y1={from.y + from.height / 2}
                      x2={connectLine.x}
                      y2={connectLine.y}
                      stroke="var(--module)"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                    />
                  );
                })()}
            </svg>

            {drawOrder(data.nodes).map((node) => (
              <CanvasCard
                key={node.id}
                node={node}
                notes={notes}
                resolve={resolve}
                selected={selection?.kind === "node" && selection.id === node.id}
                editing={editing === node.id}
                readOnly={readOnly}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  setSelection({ kind: "node", id: node.id });
                  if (editing !== node.id) setEditing(null);
                  if (readOnly) return;
                  startDrag({
                    kind: "move",
                    id: node.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    nodeX: node.x,
                    nodeY: node.y,
                    moved: false,
                  });
                }}
                onResizeStart={(e) => {
                  e.stopPropagation();
                  startDrag({
                    kind: "resize",
                    id: node.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    width: node.width,
                    height: node.height,
                  });
                }}
                onConnectStart={(e) => {
                  e.stopPropagation();
                  const p = toWorld(e.clientX, e.clientY);
                  setConnectLine({ from: node.id, x: p.x, y: p.y });
                  startDrag({ kind: "connect", from: node.id, x: p.x, y: p.y });
                }}
                onEditStart={() => !readOnly && node.type === "text" && setEditing(node.id)}
                onTextChange={(text) => {
                  setEditing(null);
                  if (text !== node.text) commit((d) => updateNode(d, node.id, { text }));
                }}
                onOpenNote={openNote}
              />
            ))}
          </div>
          {!data.nodes.length && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Canvas kosong — tambahkan kartu dari tombol di atas.
            </p>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Seret papan untuk menggeser · Ctrl + roda tetikus untuk zoom · seret titik di sisi kanan kartu ke kartu lain
          untuk menghubungkan · klik dua kali kartu teks untuk menyunting · Delete menghapus yang dipilih.
        </p>
      </div>

      <NotePicker
        open={picking === "note"}
        notes={notes}
        onOpenChange={(open) => !open && setPicking(null)}
        onPick={(note) => {
          setPicking(null);
          add({ type: "file", file: note.path, width: 400, height: note.kind === "note" ? 300 : 120 });
        }}
      />
      <RenameDialog
        open={picking === "link"}
        onOpenChange={(open) => !open && setPicking(null)}
        title="Kartu tautan"
        label="Alamat web (https://…)"
        initialValue=""
        onSave={(url) => {
          const href = toExternalHref(url);
          if (!href) {
            toast.error("Alamat harus http/https.");
            return;
          }
          add({ type: "link", url: href, width: 400, height: 120 });
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Hapus canvas?"
        itemName={name}
        description="Berkas .canvas dipindahkan ke .trash vault. Catatan yang ditampilkan di canvas tidak terpengaruh."
        confirmLabel="Hapus"
        onConfirm={() =>
          actions.remove.mutate(path, {
            onSuccess: () => {
              toast.success("Canvas dipindahkan ke .trash");
              onDeleted();
            },
            onError: (error) => toast.error("Gagal menghapus canvas", { description: errorMessage(error) }),
          })
        }
      />
    </NoteLinkProvider>
  );
}

function SelectionBar({
  node,
  isEdge,
  onColor,
  onEdit,
  onOpen,
  onDelete,
}: {
  node?: CanvasNode;
  isEdge: boolean;
  onColor: (color: string | undefined) => void;
  onEdit?: () => void;
  onOpen?: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-card px-2 py-1 text-xs">
      <span className="mr-1 text-muted-foreground">
        {isEdge
          ? "Garis dipilih"
          : `Kartu ${node?.type === "file" ? "catatan" : node?.type === "link" ? "tautan" : node?.type === "group" ? "grup" : "teks"} dipilih`}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="xs" variant="ghost">
            <Palette /> Warna
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-auto gap-1 p-2">
          <button
            type="button"
            aria-label="Warna bawaan"
            className="size-6 rounded-full border bg-card"
            onClick={() => onColor(undefined)}
          />
          {CANVAS_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={c.label}
              title={c.label}
              className="size-6 rounded-full border"
              style={{ backgroundColor: c.token }}
              onClick={() => onColor(c.id)}
            />
          ))}
        </PopoverContent>
      </Popover>
      {onEdit && (
        <Button size="xs" variant="ghost" onClick={onEdit}>
          <SquarePen /> Sunting
        </Button>
      )}
      {onOpen && (
        <Button size="xs" variant="ghost" onClick={onOpen}>
          <FileText /> Buka catatan
        </Button>
      )}
      <Button size="xs" variant="ghost" className="text-destructive" onClick={onDelete}>
        <Trash2 /> Hapus
      </Button>
    </div>
  );
}

function CanvasCard({
  node,
  resolve,
  selected,
  editing,
  readOnly,
  onPointerDown,
  onResizeStart,
  onConnectStart,
  onEditStart,
  onTextChange,
  onOpenNote,
}: {
  node: CanvasNode;
  notes: KnowledgeNoteListItem[];
  resolve: (target: string) => KnowledgeNoteListItem | null;
  selected: boolean;
  editing: boolean;
  readOnly: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onResizeStart: (e: ReactPointerEvent) => void;
  onConnectStart: (e: ReactPointerEvent) => void;
  onEditStart: () => void;
  onTextChange: (text: string) => void;
  onOpenNote: (id: string) => void;
}) {
  const color = canvasColor(node.color);
  const group = node.type === "group";
  return (
    <div
      data-canvas-node={node.id}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEditStart();
      }}
      className={cn(
        "group/card absolute flex flex-col rounded-xl border-2",
        group ? "bg-transparent" : "bg-card shadow-sm",
        selected ? "ring-2 ring-module ring-offset-2 ring-offset-background" : "",
        !readOnly && "cursor-grab active:cursor-grabbing",
      )}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        borderColor: color ?? "var(--border)",
        backgroundColor: group && color ? `color-mix(in oklch, ${color} 8%, transparent)` : undefined,
      }}
    >
      {group ? (
        <span className="absolute -top-6 left-1 truncate text-sm font-semibold" style={{ color: color ?? undefined }}>
          {node.label || "Grup"}
        </span>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <CardBody
            node={node}
            resolve={resolve}
            editing={editing}
            onTextChange={onTextChange}
            onOpenNote={onOpenNote}
          />
        </div>
      )}
      {!readOnly && (
        <>
          <span
            onPointerDown={onResizeStart}
            className="absolute -right-1.5 -bottom-1.5 size-3.5 cursor-nwse-resize rounded-sm border-2 border-module bg-background opacity-0 group-hover/card:opacity-100 pointer-coarse:opacity-100"
            aria-label="Ubah ukuran"
          />
          {!group && (
            <span
              onPointerDown={onConnectStart}
              title="Seret ke kartu lain untuk menghubungkan"
              className="absolute top-1/2 -right-2 size-4 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-module bg-background opacity-0 group-hover/card:opacity-100 pointer-coarse:opacity-100"
            />
          )}
        </>
      )}
    </div>
  );
}

function CardBody({
  node,
  resolve,
  editing,
  onTextChange,
  onOpenNote,
}: {
  node: CanvasNode;
  resolve: (target: string) => KnowledgeNoteListItem | null;
  editing: boolean;
  onTextChange: (text: string) => void;
  onOpenNote: (id: string) => void;
}) {
  if (node.type === "text") {
    if (editing) {
      return (
        <textarea
          autoFocus
          defaultValue={node.text ?? ""}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.currentTarget.blur();
          }}
          className="size-full resize-none bg-transparent font-mono text-xs outline-none"
          placeholder="Tulis Markdown…"
        />
      );
    }
    return node.text ? (
      <NoteMarkdown content={node.text} className="text-[13px]" depth={1} />
    ) : (
      <p className="text-xs text-muted-foreground italic">Kartu kosong — klik dua kali untuk menulis.</p>
    );
  }
  if (node.type === "link") {
    const href = toExternalHref(node.url ?? "");
    let host = node.url ?? "";
    try {
      host = new URL(href ?? "").host;
    } catch {
      /* alamat tidak valid → tampilkan apa adanya */
    }
    return (
      <div className="flex h-full flex-col justify-center gap-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Link2 className="size-4 text-module" /> {host}
        </p>
        <p className="truncate text-xs text-muted-foreground">{node.url}</p>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-info underline"
          >
            Buka <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    );
  }
  // file
  const target = node.file ?? "";
  if (isImagePath(target)) return <VaultImage name={target} alt={target} />;
  const note = resolve(target);
  if (!note) return <p className="text-xs text-warning">Berkas tidak ditemukan di vault: {target}</p>;
  return <FileCardBody note={note} subpath={node.subpath} onOpenNote={onOpenNote} />;
}

function FileCardBody({
  note,
  subpath,
  onOpenNote,
}: {
  note: KnowledgeNoteListItem;
  subpath?: string;
  onOpenNote: (id: string) => void;
}) {
  const { data, isLoading } = useKnowledgeNote(note.kind === "note" ? note.id : null);
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onOpenNote(note.id)}
        className="flex items-center gap-1.5 text-left text-sm font-bold text-module hover:underline"
      >
        <FileText className="size-4 shrink-0" />
        <span className="truncate">
          {note.kind === "note" ? note.title : noteName(note.path)}
          {subpath ? ` ${subpath.replace(/^#/, "› ")}` : ""}
        </span>
      </button>
      {note.kind === "note" &&
        (isLoading ? (
          <Spinner />
        ) : (
          <NoteMarkdown content={data?.content ?? ""} noteId={note.id} className="text-[12px]" depth={1} />
        ))}
    </div>
  );
}

function NotePicker({
  open,
  notes,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  notes: KnowledgeNoteListItem[];
  onOpenChange: (open: boolean) => void;
  onPick: (note: KnowledgeNoteListItem) => void;
}) {
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Tambah kartu catatan"
      description="Pilih catatan atau berkas vault"
    >
      <Command>
        <CommandInput placeholder="Cari catatan…" />
        <CommandList>
          <CommandEmpty>Tidak ada catatan cocok.</CommandEmpty>
          {notes.slice(0, 500).map((note) => (
            <CommandItem key={note.id} value={`${note.title} ${note.path}`} onSelect={() => onPick(note)}>
              <FileText />
              <span className="truncate">{note.title}</span>
              <span className="ml-auto truncate text-xs text-muted-foreground">{note.path}</span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

const EMBED_HEIGHT = 340;

/**
 * Sematan `![[x.canvas]]` di catatan: papan mini baca-saja yang dipaskan ke kotak (seperti pratinjau canvas di Obsidian);
 * klik judul / klik dua kali papan → tab Canvas untuk menyunting.
 */
export function EmbeddedCanvas({ target }: { target: string }) {
  const { data: list, isLoading: listLoading } = useKnowledgeCanvases();
  const wanted = target.trim().toLowerCase();
  const match = list?.find(
    (c) => c.path.toLowerCase() === wanted || `${c.name}.canvas`.toLowerCase() === wanted.split("/").pop(),
  );
  const { data: file, isLoading } = useKnowledgeCanvas(match?.path ?? null);
  const { data: tree } = useKnowledgeTree();
  const notes = useMemo(() => tree?.notes ?? [], [tree]);
  const resolve = useMemo(() => createResolver(notes), [notes]);
  const openNote = useOpenNote();
  const navigate = useNavigate();
  const markerId = `canvas-arrow-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [file]);
  const data = useMemo(() => (file ? toCanvasData(file.data) : null), [file]);
  const nodeById = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data]);

  if (listLoading || isLoading) return <Spinner className="my-2" />;
  if (!match) return <span className="text-xs text-warning">Canvas tidak ditemukan: {target}</span>;
  if (!file || !data) return null;
  const view = fitView(data.nodes, { width, height: EMBED_HEIGHT }, 24);
  const open = () => void navigate(`/knowledge/canvas?canvas=${encodeURIComponent(match.path)}`);
  return (
    <div className="my-3 rounded-xl border-l-4 border-module/40 bg-muted/30 p-2">
      <button
        type="button"
        onClick={open}
        className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-module hover:underline"
      >
        <Frame className="size-3.5" /> {match.name} · {data.nodes.length} kartu
      </button>
      {file.error ? (
        <p className="text-xs text-warning">{file.error}</p>
      ) : (
        <NoteLinkProvider
          value={{
            resolve,
            byId: (id) => notes.find((n) => n.id === id) ?? null,
            open: (id, heading) => openNote(id, heading),
          }}
        >
          <div
            ref={box}
            onDoubleClick={open}
            title="Klik dua kali untuk membuka di tab Canvas"
            className="relative overflow-hidden rounded-lg border bg-background select-none"
            style={{ height: EMBED_HEIGHT }}
          >
            {width > 0 && (
              <div
                className="absolute top-0 left-0 origin-top-left"
                style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
              >
                <svg className="pointer-events-none absolute overflow-visible" width="1" height="1">
                  <defs>
                    <marker
                      id={markerId}
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="7"
                      markerHeight="7"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
                    </marker>
                  </defs>
                  {data.edges.map((edge) => {
                    const from = nodeById.get(edge.fromNode);
                    const to = nodeById.get(edge.toNode);
                    if (!from || !to) return null;
                    const { path: d, mid } = edgeGeometry(edge, from, to);
                    return (
                      <g key={edge.id}>
                        <path
                          d={d}
                          fill="none"
                          stroke={canvasColor(edge.color) ?? "var(--muted-foreground)"}
                          strokeWidth={2}
                          markerEnd={edge.toEnd === "none" ? undefined : `url(#${markerId})`}
                          markerStart={edge.fromEnd === "arrow" ? `url(#${markerId})` : undefined}
                        />
                        {edge.label && (
                          <text
                            x={mid.x}
                            y={mid.y}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="fill-foreground text-[13px]"
                            paintOrder="stroke"
                            stroke="var(--background)"
                            strokeWidth={4}
                          >
                            {edge.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
                {drawOrder(data.nodes).map((node) => (
                  <CanvasCard
                    key={node.id}
                    node={node}
                    notes={notes}
                    resolve={resolve}
                    selected={false}
                    editing={false}
                    readOnly
                    onPointerDown={noop}
                    onResizeStart={noop}
                    onConnectStart={noop}
                    onEditStart={noop}
                    onTextChange={noop}
                    onOpenNote={(id) => openNote(id)}
                  />
                ))}
              </div>
            )}
          </div>
        </NoteLinkProvider>
      )}
    </div>
  );
}

const noop = () => undefined;
