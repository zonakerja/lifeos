import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-2d";
import { labelAlpha } from "./graph-settings";

export interface GraphNodeInput {
  id: string;
  label: string;
  /** Ukuran relatif (mis. jumlah backlink) */
  weight: number;
  /** Nama token warna CSS (`--graph-blue`, `--module`, …); kosong = netral */
  colorVar?: string;
  /** Node bayangan (catatan belum ada), berkas lampiran, dan tag digambar berbeda */
  variant?: "note" | "missing" | "file" | "tag";
}

export interface GraphEdgeInput {
  source: string;
  target: string;
}

/** Parameter simulasi (lihat `forceParams` di graph-settings.ts). */
export interface GraphForces {
  charge: number;
  center: number;
  link: number;
  distance: number;
}

interface GraphCanvasProps {
  nodes: GraphNodeInput[];
  edges: GraphEdgeInput[];
  /** Node yang disorot (catatan aktif) */
  focusId?: string | null;
  onNodeClick?: (id: string) => void;
  /** `always` = label selalu tampil (graf lokal); selain itu memudar menurut `textFade` */
  showLabels?: "always" | "fade";
  /** Zoom minimal agar label tampil (0 = selalu) */
  textFade?: number;
  nodeScale?: number;
  linkThickness?: number;
  arrows?: boolean;
  forces?: Partial<GraphForces>;
  /** Tinggi tetap (graf lokal); kosong = mengikuti kontainer */
  height?: number;
}

const DEFAULT_FORCES: GraphForces = { charge: -60, center: 0.03, link: 0.6, distance: 40 };

type GNode = NodeObject<GraphNodeInput & { color: string }>;
type GLink = LinkObject<GNode>;

/** Baca token warna dari CSS (kanvas tidak memahami `var()`); dihitung ulang saat tema berganti. */
function useCssColors(element: React.RefObject<HTMLElement | null>, names: string[]) {
  const [colors, setColors] = useState<Record<string, string>>({});
  const key = names.join("|");
  useEffect(() => {
    const read = () => {
      const el = element.current ?? document.documentElement;
      const style = getComputedStyle(el);
      setColors(Object.fromEntries(key.split("|").map((n) => [n, style.getPropertyValue(n).trim() || "gray"])));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-module", "data-theme"],
    });
    return () => observer.disconnect();
  }, [element, key]);
  return colors;
}

/** Tarikan ke titik pusat (seperti "Center force" Obsidian) — d3 forceCenter hanya menggeser titik berat. */
function gravity(strength: number) {
  let nodes: GNode[] = [];
  const force = (alpha: number) => {
    for (const n of nodes) {
      n.vx = (n.vx ?? 0) - (n.x ?? 0) * strength * alpha;
      n.vy = (n.vy ?? 0) - (n.y ?? 0) * strength * alpha;
    }
  };
  force.initialize = (list: GNode[]) => {
    nodes = list;
  };
  return force;
}

interface D3Force {
  strength?: (value: number) => unknown;
  distance?: (value: number) => unknown;
}

/**
 * Graf force-directed bergaya Obsidian (react-force-graph-2d, kanvas): node netral berukuran menurut backlink, label
 * memudar menurut zoom, hover menyorot tetangga, node bisa diseret, panah arah opsional, dan gaya simulasi (pusat,
 * tolakan, tautan, jarak) bisa diatur. Posisi node dipertahankan saat data berubah (filter / animasi), seperti
 * Obsidian. Dipakai graf global (tab Graf) dan graf lokal (panel kanan).
 */
export default function GraphCanvas({
  nodes,
  edges,
  focusId,
  onNodeClick,
  showLabels = "fade",
  textFade = 1.4,
  nodeScale = 1,
  linkThickness = 1,
  arrows = false,
  forces,
  height,
}: GraphCanvasProps) {
  const box = useRef<HTMLDivElement>(null);
  const graph = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  // Peta id → objek node (dimutasi di tempat, bukan state yang memicu render)
  const [cache] = useState(() => new Map<string, GNode>());
  const fitted = useRef(false);
  const [size, setSize] = useState({ width: 300, height: height ?? 300 });
  const [hover, setHover] = useState<string | null>(null);
  const colorVars = useMemo(
    () => [
      "--muted-foreground",
      "--border",
      "--foreground",
      "--module",
      "--warning",
      "--card",
      "--graph-teal",
      ...new Set(nodes.flatMap((n) => (n.colorVar ? [n.colorVar] : []))),
    ],
    [nodes],
  );
  const colors = useCssColors(box, colorVars);
  const f = { ...DEFAULT_FORCES, ...forces };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height: h } = entry.contentRect;
      if (width > 0) setSize({ width, height: height ?? Math.max(h, 200) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [height]);

  // Objek node dipakai ulang per id (pustaka menyimpan x/y/vx/vy di objek itu) → posisi tidak melompat saat difilter
  const data = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    const list = nodes.map((n) => {
      const node = Object.assign(cache.get(n.id) ?? ({} as GNode), n, { color: "" });
      cache.set(n.id, node);
      return node;
    });
    for (const id of [...cache.keys()]) if (!ids.has(id)) cache.delete(id);
    return {
      nodes: list,
      links: edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e })) as GLink[],
    };
  }, [nodes, edges, cache]);

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!map.has(e.source)) map.set(e.source, new Set());
      if (!map.has(e.target)) map.set(e.target, new Set());
      map.get(e.source)!.add(e.target);
      map.get(e.target)!.add(e.source);
    }
    return map;
  }, [edges]);

  useEffect(() => {
    const g = graph.current;
    if (!g) return;
    (g.d3Force("charge") as D3Force | undefined)?.strength?.(f.charge);
    const link = g.d3Force("link") as D3Force | undefined;
    link?.distance?.(f.distance);
    link?.strength?.(f.link);
    g.d3Force("gravity", gravity(f.center) as never);
    g.d3ReheatSimulation();
  }, [f.charge, f.center, f.link, f.distance, data]);

  const radius = (node: GNode) =>
    node.variant === "tag" ? 2 * nodeScale : (2.5 + Math.sqrt(node.weight) * 1.6) * nodeScale;
  const active = hover ?? null;
  const isLit = (id: string) => !active || id === active || !!neighbors.get(active)?.has(id);
  const endId = (end: GLink["source"]) => (typeof end === "object" ? String((end as GNode).id) : String(end));
  const touches = (l: GLink) => !!active && (endId(l.source) === active || endId(l.target) === active);
  const linkColor = (l: GLink) => (touches(l) ? colors["--module"] : colors["--border"]);

  return (
    <div ref={box} className="relative h-full w-full overflow-hidden" style={height ? { height } : undefined}>
      <ForceGraph2D<GNode, GLink>
        ref={graph}
        graphData={data}
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={150}
        onEngineStop={() => {
          // Pas ke layar sekali saja; setelah itu tampilan diatur user (seperti Obsidian)
          if (fitted.current) return;
          fitted.current = true;
          graph.current?.zoomToFit(400, 30);
        }}
        nodeRelSize={1}
        nodeVal={(n) => radius(n) ** 2}
        linkColor={linkColor}
        linkWidth={(l) => (touches(l) ? 1.8 : 0.7) * linkThickness}
        linkDirectionalArrowLength={arrows ? 2 + 1.5 * linkThickness : 0}
        linkDirectionalArrowRelPos={1}
        linkDirectionalArrowColor={linkColor}
        onNodeHover={(n) => setHover(n ? String(n.id) : null)}
        onNodeClick={(n) => onNodeClick?.(String(n.id))}
        onNodeDragEnd={(n) => {
          // Node yang diseret dilepas lagi ke simulasi (tidak dipaku), seperti Obsidian
          n.fx = undefined;
          n.fy = undefined;
        }}
        nodeCanvasObject={(node, ctx, scale) => {
          const id = String(node.id);
          const r = radius(node);
          const base =
            id === focusId
              ? colors["--module"]
              : node.variant === "missing"
                ? colors["--warning"]
                : node.variant === "tag"
                  ? colors["--graph-teal"]
                  : node.colorVar
                    ? colors[node.colorVar]
                    : colors["--muted-foreground"];
          const lit = isLit(id);
          ctx.globalAlpha = lit ? 1 : 0.15;
          ctx.beginPath();
          if (node.variant === "file") ctx.rect(node.x! - r, node.y! - r, r * 2, r * 2);
          else ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI);
          if (node.variant === "missing") {
            ctx.strokeStyle = base;
            ctx.lineWidth = 1 / scale + 0.6;
            ctx.stroke();
          } else {
            ctx.fillStyle = id === active ? colors["--module"] : base;
            ctx.fill();
          }
          if (id === focusId) {
            ctx.strokeStyle = colors["--foreground"];
            ctx.lineWidth = 1.2 / scale;
            ctx.stroke();
          }
          const emphasised = id === active || id === focusId || (!!active && lit);
          const alpha = showLabels === "always" || id === active || id === focusId ? 1 : labelAlpha(scale, textFade);
          const shown = emphasised ? Math.max(alpha, active ? 1 : 0) : alpha;
          if (shown > 0.02) {
            const font = Math.max(10 / scale, 2.5);
            ctx.globalAlpha = (lit ? 1 : 0.15) * shown;
            ctx.font = `${id === active ? "600 " : ""}${font}px Figtree, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = colors["--foreground"];
            ctx.fillText(
              node.label.length > 40 ? `${node.label.slice(0, 38)}…` : node.label,
              node.x!,
              node.y! + r + 1.5,
            );
          }
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, radius(node) + 2, 0, 2 * Math.PI);
          ctx.fill();
        }}
      />
    </div>
  );
}
