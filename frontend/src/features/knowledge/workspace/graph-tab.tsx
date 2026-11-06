import { ChevronRight, Pause, Play, Plus, RotateCcw, SlidersHorizontal, Trash2, X } from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useKnowledgeGraph, useKnowledgePrefs } from "@/data/use-knowledge-workspace";
import { cn } from "@/lib/utils";
import type { KnowledgeGraphColor } from "@/types/api";
import { GRAPH_COLOR_LABELS, GRAPH_COLOR_VARS, nodeColorVar } from "./graph-colors";
import {
  animationOrder,
  DEFAULT_GRAPH_SETTINGS,
  forceParams,
  GRAPH_RANGES,
  type GraphSettings,
  loadGraphSettings,
  saveGraphSettings,
} from "./graph-settings";
import { INBOX_DIR, isEmptyQuery, matchesNodeQuery, MIRROR_DIR, parseNodeQuery, TEMPLATE_DIR } from "./knowledge-logic";
import { openWorkspaceDialog, useOpenNote } from "./workspace-store";

const GraphCanvas = lazy(() => import("./graph-canvas"));
const COLORS = Object.keys(GRAPH_COLOR_VARS) as KnowledgeGraphColor[];
/** Lama animasi pertumbuhan graf (berapa pun jumlah catatannya). */
const ANIMATION_MS = 8_000;

/**
 * Tab Graf: graf global vault bergaya Graph view Obsidian — panel Filter, Grup, Tampilan, dan Gaya (forces), serta
 * tombol Animasi yang memutar pertumbuhan vault dari catatan tertua.
 */
export function GraphTab() {
  const { data: graph, isLoading } = useKnowledgeGraph();
  const { prefs, save } = useKnowledgePrefs();
  const openNote = useOpenNote();
  const [settings, setSettings] = useState<GraphSettings>(loadGraphSettings);
  const [filter, setFilter] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [newGroup, setNewGroup] = useState("");
  const [newColor, setNewColor] = useState<KnowledgeGraphColor>("blue");
  /** Jumlah node yang sudah muncul saat animasi berjalan (null = tidak beranimasi) */
  const [revealed, setRevealed] = useState<number | null>(null);

  const set = <K extends keyof GraphSettings>(key: K, value: GraphSettings[K]) =>
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveGraphSettings(next);
      return next;
    });
  const reset = () => {
    saveGraphSettings(DEFAULT_GRAPH_SETTINGS);
    setSettings(DEFAULT_GRAPH_SETTINGS);
  };

  const graphGroups = prefs.graphGroups;
  const full = useMemo(() => {
    if (!graph) return null;
    const s = settings;
    const query = parseNodeQuery(filter);
    const top = (path: string) => path.split("/")[0];
    const nodes = graph.nodes.filter(
      (n) =>
        (s.showFiles || n.kind === "note") &&
        (s.showOrphans || n.links + n.backlinks > 0 || (s.showTags && n.tags.length > 0)) &&
        (s.showSpecial || ![INBOX_DIR, TEMPLATE_DIR].includes(top(n.path))) &&
        (s.showMirror || top(n.path) !== MIRROR_DIR) &&
        (isEmptyQuery(query) || matchesNodeQuery(n, query)),
    );
    const ids = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter(
      (e) => ids.has(e.source) && (ids.has(e.target) || (!s.existingOnly && e.target.startsWith("missing:"))),
    );
    const missing = s.existingOnly ? [] : graph.missing.filter((m) => edges.some((e) => e.target === m.id));
    const tagEdges: { source: string; target: string }[] = [];
    const tagCount = new Map<string, number>();
    if (s.showTags)
      for (const n of nodes)
        for (const tag of n.tags) {
          tagEdges.push({ source: n.id, target: `tag:${tag.toLowerCase()}` });
          tagCount.set(tag.toLowerCase(), (tagCount.get(tag.toLowerCase()) ?? 0) + 1);
        }
    const mapped = [
      ...nodes.map((n) => ({
        id: n.id,
        label: n.title,
        weight: n.backlinks,
        colorVar: nodeColorVar(n, graphGroups, s.byStatus),
        variant: n.kind === "file" ? ("file" as const) : ("note" as const),
        createdAt: n.createdAt,
        path: n.path,
      })),
      ...missing.map((m) => ({ id: m.id, label: m.title, weight: m.count, variant: "missing" as const })),
      ...[...tagCount].map(([tag, count]) => ({
        id: `tag:${tag}`,
        label: `#${tag}`,
        weight: count,
        variant: "tag" as const,
      })),
    ];
    return { nodes: mapped, edges: [...edges, ...tagEdges], order: animationOrder(mapped) };
  }, [graph, filter, settings, graphGroups]);

  // Animasi: munculkan node satu per satu menurut urutan waktu, lalu kembali ke graf penuh
  useEffect(() => {
    if (revealed === null || !full) return;
    if (revealed >= full.order.length) {
      const done = setTimeout(() => setRevealed(null), 600);
      return () => clearTimeout(done);
    }
    const step = Math.max(1, Math.ceil(full.order.length / 120));
    const timer = setTimeout(
      () => setRevealed((n) => (n === null ? null : n + step)),
      ANIMATION_MS / Math.ceil(full.order.length / step),
    );
    return () => clearTimeout(timer);
  }, [revealed, full]);

  const data = useMemo(() => {
    if (!full || revealed === null) return full;
    const visible = new Set(full.order.slice(0, revealed));
    return {
      ...full,
      nodes: full.nodes.filter((n) => visible.has(n.id)),
      edges: full.edges.filter((e) => visible.has(e.source) && visible.has(e.target)),
    };
  }, [full, revealed]);

  const addGroup = () => {
    if (!newGroup.trim()) return;
    void save({ ...prefs, graphGroups: [...prefs.graphGroups, { query: newGroup.trim(), color: newColor }] });
    setNewGroup("");
  };
  const f = forceParams(settings);

  return (
    <div className="relative flex h-[calc(100svh-12.5rem)] min-h-[460px] overflow-hidden rounded-2xl border bg-card">
      <div className="relative min-w-0 flex-1">
        {isLoading || !data ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : full?.nodes.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Tidak ada catatan yang cocok.
          </p>
        ) : (
          <Suspense fallback={<Spinner className="m-6" />}>
            <GraphCanvas
              nodes={data.nodes}
              edges={data.edges}
              textFade={settings.textFade}
              nodeScale={settings.nodeSize}
              linkThickness={settings.linkThickness}
              arrows={settings.arrows}
              forces={{ charge: f.charge, center: f.center, link: f.link, distance: settings.linkDistance }}
              onNodeClick={(id) =>
                id.startsWith("missing:")
                  ? openWorkspaceDialog({ kind: "new-note", title: data.nodes.find((n) => n.id === id)?.label })
                  : id.startsWith("tag:")
                    ? setFilter(`tag:${id.slice(4)}`)
                    : openNote(id)
              }
            />
          </Suspense>
        )}
        <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-muted-foreground">
          {data?.nodes.length ?? 0} node · {data?.edges.length ?? 0} tautan · seret node / latar, gulir untuk zoom
        </p>
        <div className="absolute top-2 right-2 flex gap-1">
          {!panelOpen && (
            <Button size="sm" variant="outline" onClick={() => setPanelOpen(true)}>
              <SlidersHorizontal /> Pengaturan graf
            </Button>
          )}
        </div>
      </div>

      {panelOpen && (
        <aside className="absolute inset-y-0 right-0 z-10 flex w-72 max-w-[85%] flex-col overflow-y-auto border-l bg-card shadow-lg md:static md:shadow-none">
          <div className="flex items-center justify-between gap-1 border-b px-3 py-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <SlidersHorizontal className="size-4" /> Pengaturan graf
            </p>
            <div className="flex">
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Kembalikan bawaan"
                title="Kembalikan bawaan"
                onClick={reset}
              >
                <RotateCcw />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label="Tutup pengaturan" onClick={() => setPanelOpen(false)}>
                <X />
              </Button>
            </div>
          </div>

          <Section title="Filter" defaultOpen>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Cari: tag:bmn path:10-Peraturan"
              className="h-8 text-xs"
            />
            <Toggle label="Tag sebagai node" checked={settings.showTags} onChange={(v) => set("showTags", v)} />
            <Toggle label="Berkas lampiran" checked={settings.showFiles} onChange={(v) => set("showFiles", v)} />
            <Toggle
              label="Hanya berkas yang ada"
              checked={settings.existingOnly}
              onChange={(v) => set("existingOnly", v)}
            />
            <Toggle label="Catatan yatim" checked={settings.showOrphans} onChange={(v) => set("showOrphans", v)} />
            <Toggle
              label="Cermin LifeOS (80-LifeOS)"
              checked={settings.showMirror}
              onChange={(v) => set("showMirror", v)}
            />
            <Toggle label="Inbox & Templat" checked={settings.showSpecial} onChange={(v) => set("showSpecial", v)} />
          </Section>

          <Section title="Grup">
            <Toggle label="Warna menurut status" checked={settings.byStatus} onChange={(v) => set("byStatus", v)} />
            {prefs.graphGroups.map((group, index) => (
              <div key={`${group.query}-${index}`} className="flex items-center gap-1.5">
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: `var(${GRAPH_COLOR_VARS[group.color]})` }}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{group.query}</span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Hapus grup"
                  onClick={() => void save({ ...prefs, graphGroups: prefs.graphGroups.filter((_, i) => i !== index) })}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-1">
              <Input
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addGroup()}
                placeholder="kueri, mis. jenis:faq"
                className="h-7 flex-1 text-xs"
              />
              <Select value={newColor} onValueChange={(v) => setNewColor(v as KnowledgeGraphColor)}>
                <SelectTrigger size="sm" className="h-7 w-24 text-xs" aria-label="Warna grup">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLORS.map((c) => (
                    <SelectItem key={c} value={c}>
                      <span className="size-2.5 rounded-full" style={{ background: `var(${GRAPH_COLOR_VARS[c]})` }} />
                      {GRAPH_COLOR_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="icon-xs"
                variant="outline"
                aria-label="Tambah grup"
                disabled={!newGroup.trim()}
                onClick={addGroup}
              >
                <Plus />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Grup pertama yang cocok menentukan warna; disimpan untuk akun Anda. Contoh: <code>path:80-LifeOS</code>.
            </p>
          </Section>

          <Section title="Tampilan" defaultOpen>
            <Toggle label="Panah arah tautan" checked={settings.arrows} onChange={(v) => set("arrows", v)} />
            <Slider
              label="Ambang pudar teks"
              hint={settings.textFade === 0 ? "selalu tampil" : `zoom ≥ ${settings.textFade.toFixed(1)}×`}
              value={settings.textFade}
              range={GRAPH_RANGES.textFade}
              onChange={(v) => set("textFade", v)}
            />
            <Slider
              label="Ukuran node"
              value={settings.nodeSize}
              range={GRAPH_RANGES.nodeSize}
              onChange={(v) => set("nodeSize", v)}
            />
            <Slider
              label="Tebal tautan"
              value={settings.linkThickness}
              range={GRAPH_RANGES.linkThickness}
              onChange={(v) => set("linkThickness", v)}
            />
            <Button
              size="sm"
              variant={revealed === null ? "outline" : "default"}
              disabled={!full?.nodes.length}
              onClick={() => setRevealed((r) => (r === null ? 1 : null))}
            >
              {revealed === null ? <Play /> : <Pause />} {revealed === null ? "Animasi" : "Hentikan animasi"}
            </Button>
          </Section>

          <Section title="Gaya" defaultOpen>
            <Slider
              label="Gaya pusat"
              value={settings.centerForce}
              range={GRAPH_RANGES.centerForce}
              onChange={(v) => set("centerForce", v)}
            />
            <Slider
              label="Gaya tolak"
              value={settings.repelForce}
              range={GRAPH_RANGES.repelForce}
              onChange={(v) => set("repelForce", v)}
            />
            <Slider
              label="Gaya tautan"
              value={settings.linkForce}
              range={GRAPH_RANGES.linkForce}
              onChange={(v) => set("linkForce", v)}
            />
            <Slider
              label="Jarak tautan"
              value={settings.linkDistance}
              range={GRAPH_RANGES.linkDistance}
              onChange={(v) => set("linkDistance", v)}
            />
          </Section>
        </aside>
      )}
    </div>
  );
}

function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b">
      <CollapsibleTrigger className="flex w-full items-center gap-1 px-3 py-2 text-xs font-semibold hover:bg-muted/50">
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} /> {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2 px-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Slider({
  label,
  hint,
  value,
  range,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  range: readonly [number, number, number];
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="flex items-center justify-between gap-2">
        {label}
        <span className="text-[10px] text-muted-foreground tabular-nums">{hint ?? value}</span>
      </span>
      <input
        type="range"
        min={range[0]}
        max={range[1]}
        step={range[2]}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-module"
      />
    </label>
  );
}
