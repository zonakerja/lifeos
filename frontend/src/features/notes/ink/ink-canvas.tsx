import { Eraser, FilePlus2, Hand, Highlighter, Notebook, PenLine, Redo2, Trash2, Undo2 } from "lucide-react";
import { type ReactNode, useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  eraseStrokes,
  grownHeight,
  HIGHLIGHT_COLORS,
  HIGHLIGHT_SIZES,
  INK_COLOR_LABEL,
  INK_COLOR_VAR,
  INK_SIZE_WARNING_BYTES,
  INK_WIDTH,
  inkByteSize,
  type InkColorId,
  type InkData,
  type InkStroke,
  type InkTool,
  PAGE_HEIGHT,
  PAPER_LABEL,
  type PaperStyle,
  PEN_COLORS,
  PEN_SIZES,
  pushPoint,
  strokeBounds,
  strokePath,
} from "./ink-logic";
import { InkSurface } from "./ink-surface";

// ---------------------------------------------------------------------------- Preferensi alat (per perangkat)

interface ToolPrefs {
  tool: InkTool;
  penColor: InkColorId;
  highlightColor: InkColorId;
  penSize: number;
  highlightSize: number;
  penOnly: boolean;
}

const PREFS_KEY = "lifeos.ink.prefs";
const DEFAULT_PREFS: ToolPrefs = {
  tool: "pen",
  penColor: "ink",
  highlightColor: "yellow",
  penSize: 1,
  highlightSize: 1,
  penOnly: false,
};

const loadPrefs = (): ToolPrefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ToolPrefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
};

const savePrefs = (prefs: ToolPrefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Penyimpanan browser tidak tersedia (mode privat) — preferensi hanya berlaku sesi ini
  }
};

/** Elemen yang menggulir halaman (untuk menggulir dengan jari saat mode pena aktif). */
const scrollParentOf = (el: Element | null): Element => {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement ?? document.documentElement;
};

type Gesture =
  | { kind: "draw"; pointerId: number; pointerType: string; stroke: InkStroke }
  | { kind: "erase"; pointerId: number; x: number; y: number; strokes: InkStroke[] }
  | { kind: "scroll"; pointerId: number; clientY: number; scroller: Element };

const HISTORY_LIMIT = 100;

/**
 * Kanvas tulisan tangan. Mendukung stylus (tekanan, tombol samping S Pen = penghapus), mouse, dan jari.
 * Mode pena: hanya stylus yang menulis, jari menggulir halaman (mencegah coretan dari telapak tangan) — aktif otomatis
 * saat stylus pertama kali dipakai. Komponen terkendali: setiap perubahan dikirim lewat `onChange`.
 */
export function InkCanvas({
  value,
  onChange,
  readOnly = false,
  variant,
  actions,
}: {
  value: InkData;
  onChange: (ink: InkData) => void;
  readOnly?: boolean;
  /** page = catatan tulis tangan penuh; block = blok coretan di dalam catatan ketik */
  variant: "page" | "block";
  /** Tombol tambahan di toolbar (mis. Ubah ke teks) */
  actions?: ReactNode;
}) {
  const [prefs, setPrefsState] = useState<ToolPrefs>(loadPrefs);
  const [preview, setPreview] = useState<InkStroke[] | null>(null);
  const [eraserAt, setEraserAt] = useState<{ x: number; y: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [history, setHistory] = useState<{ undo: InkData[]; redo: InkData[] }>({ undo: [], redo: [] });
  const svgRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<SVGPathElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const frameRef = useRef(0);
  const sizeWarnedRef = useRef(false);

  const step = variant === "page" ? PAGE_HEIGHT / 2 : 200;
  const strokes = preview ?? value.strokes;

  const setPrefs = (patch: Partial<ToolPrefs>) =>
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });

  const commit = (next: InkData) => {
    setHistory((h) => ({ undo: [...h.undo.slice(-(HISTORY_LIMIT - 1)), value], redo: [] }));
    onChange(next);
    if (!sizeWarnedRef.current && inkByteSize(next) > INK_SIZE_WARNING_BYTES) {
      sizeWarnedRef.current = true;
      toast.warning("Tulisan tangan sudah sangat banyak", {
        description: "Lanjutkan di catatan baru agar penyimpanan tetap lancar.",
      });
    }
  };

  const undo = () => {
    const prev = history.undo.at(-1);
    if (!prev) return;
    setHistory((h) => ({ undo: h.undo.slice(0, -1), redo: [...h.redo, value] }));
    onChange(prev);
  };

  const redo = () => {
    const next = history.redo.at(-1);
    if (!next) return;
    setHistory((h) => ({ undo: [...h.undo, value], redo: h.redo.slice(0, -1) }));
    onChange(next);
  };

  // Pintasan Ctrl+Z / Ctrl+Y (hanya catatan tulis tangan penuh; di blok, undo dipegang editor teks)
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (readOnly || variant !== "page" || !(e.ctrlKey || e.metaKey)) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, [contenteditable=true], [role=dialog]")) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (key === "y" || (key === "z" && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  // ---------------------------------------------------------------- Pointer
  const toLogical = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const scale = INK_WIDTH / rect.width;
    return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
  };

  const samplesOf = (e: React.PointerEvent) => {
    const native = e.nativeEvent;
    const coalesced = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    return coalesced.length ? coalesced : [native];
  };

  const renderLive = () => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const gesture = gestureRef.current;
      if (gesture?.kind === "draw" && liveRef.current) {
        liveRef.current.setAttribute("d", strokePath(gesture.stroke, false));
      }
    });
  };

  const clearLive = () => {
    cancelAnimationFrame(frameRef.current);
    liveRef.current?.setAttribute("d", "");
  };

  const isEraserInput = (e: React.PointerEvent) =>
    prefs.tool === "eraser" ||
    // Ujung penghapus stylus, atau tombol samping S Pen ditekan saat menulis
    (e.pointerType === "pen" && ((e.buttons & 32) !== 0 || e.button === 5 || (e.buttons & 2) !== 0));

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly || (e.pointerType === "mouse" && e.button !== 0)) return;
    const current = gestureRef.current;
    if (e.pointerType === "pen") {
      // Stylus menyentuh saat telapak tangan sedang "menulis" → buang coretan telapak tangan
      if (current?.kind === "draw" && current.pointerType === "touch") {
        gestureRef.current = null;
        clearLive();
      }
      if (!prefs.penOnly) {
        setPrefs({ penOnly: true });
        toast.info("Mode pena aktif", {
          description: "Hanya stylus yang menulis; jari dipakai untuk menggulir. Ubah lewat tombol tangan di toolbar.",
        });
      }
    } else if (current) {
      return; // Satu gestur pada satu waktu (abaikan jari kedua / telapak tangan)
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer sudah tidak aktif — gestur tetap berjalan tanpa capture
    }

    if (e.pointerType === "touch" && prefs.penOnly) {
      gestureRef.current = {
        kind: "scroll",
        pointerId: e.pointerId,
        clientY: e.clientY,
        scroller: scrollParentOf(e.currentTarget),
      };
      return;
    }

    e.preventDefault();
    const { x, y } = toLogical(e);
    if (isEraserInput(e)) {
      gestureRef.current = { kind: "erase", pointerId: e.pointerId, x, y, strokes: value.strokes };
      const kept = eraseStrokes(value.strokes, x, y, x, y);
      gestureRef.current.strokes = kept;
      setPreview(kept);
      setEraserAt({ x, y });
      return;
    }

    const highlighter = prefs.tool === "highlighter";
    const stroke: InkStroke = {
      tool: highlighter ? "highlighter" : "pen",
      color: highlighter ? prefs.highlightColor : prefs.penColor,
      size: highlighter ? HIGHLIGHT_SIZES[prefs.highlightSize] : PEN_SIZES[prefs.penSize],
      points: [],
      pressure: e.pointerType === "pen",
    };
    pushPoint(stroke.points, x, y, e.pointerType === "pen" ? e.pressure || 0.5 : 0.5, 0);
    gestureRef.current = { kind: "draw", pointerId: e.pointerId, pointerType: e.pointerType, stroke };
    renderLive();
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;

    if (gesture.kind === "scroll") {
      gesture.scroller.scrollBy(0, gesture.clientY - e.clientY);
      gesture.clientY = e.clientY;
      return;
    }

    if (gesture.kind === "erase") {
      let kept = gesture.strokes;
      let last = { x: gesture.x, y: gesture.y };
      for (const sample of samplesOf(e)) {
        const p = toLogical(sample);
        kept = eraseStrokes(kept, last.x, last.y, p.x, p.y);
        last = p;
      }
      gesture.x = last.x;
      gesture.y = last.y;
      if (kept !== gesture.strokes) {
        gesture.strokes = kept;
        setPreview(kept);
      }
      setEraserAt(last);
      return;
    }

    let changed = false;
    for (const sample of samplesOf(e)) {
      const { x, y } = toLogical(sample);
      const pressure = gesture.stroke.pressure ? sample.pressure || 0.5 : 0.5;
      changed = pushPoint(gesture.stroke.points, x, y, pressure) || changed;
    }
    if (changed) renderLive();
  };

  const finish = (e: React.PointerEvent<SVGSVGElement>, cancelled: boolean) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    gestureRef.current = null;

    if (gesture.kind === "erase") {
      setPreview(null);
      setEraserAt(null);
      if (gesture.strokes !== value.strokes) commit({ ...value, strokes: gesture.strokes });
      return;
    }
    if (gesture.kind !== "draw") return;
    clearLive();
    // Gestur dibatalkan sistem (mis. telapak tangan terdeteksi) → coretan jari tidak disimpan
    if (cancelled && gesture.pointerType !== "pen") return;
    const { stroke } = gesture;
    if (!stroke.points.length) return;
    const bottom = strokeBounds(stroke.points).maxY + stroke.size;
    commit({
      ...value,
      strokes: [...value.strokes, stroke],
      height: grownHeight(value.height, bottom, step),
    });
  };

  // ---------------------------------------------------------------- Tampilan
  const colors = prefs.tool === "highlighter" ? HIGHLIGHT_COLORS : PEN_COLORS;
  const activeColor = prefs.tool === "highlighter" ? prefs.highlightColor : prefs.penColor;
  const sizes = prefs.tool === "highlighter" ? HIGHLIGHT_SIZES : PEN_SIZES;
  const activeSize = prefs.tool === "highlighter" ? prefs.highlightSize : prefs.penSize;

  return (
    <div className="flex flex-col">
      {!readOnly && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-1.5 border-b bg-card/95 px-2 py-1.5 backdrop-blur",
            variant === "page" && "sticky top-0 z-10 rounded-t-xl",
          )}
        >
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={prefs.tool}
            onValueChange={(v) => v && setPrefs({ tool: v as InkTool })}
          >
            <ToggleGroupItem value="pen" aria-label="Pena" title="Pena">
              <PenLine />
            </ToggleGroupItem>
            <ToggleGroupItem value="highlighter" aria-label="Stabilo" title="Stabilo">
              <Highlighter />
            </ToggleGroupItem>
            <ToggleGroupItem value="eraser" aria-label="Penghapus" title="Penghapus (atau tekan tombol samping S Pen)">
              <Eraser />
            </ToggleGroupItem>
          </ToggleGroup>

          {prefs.tool !== "eraser" && (
            <>
              <div className="flex items-center gap-1 border-l pl-1.5">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={INK_COLOR_LABEL[c]}
                    aria-label={`Warna ${INK_COLOR_LABEL[c]}`}
                    aria-pressed={activeColor === c}
                    onClick={() => setPrefs(prefs.tool === "highlighter" ? { highlightColor: c } : { penColor: c })}
                    className={cn(
                      "size-6 rounded-full border shadow-xs transition-transform",
                      activeColor === c && "scale-110 ring-2 ring-ring ring-offset-2 ring-offset-card",
                    )}
                    style={{ background: INK_COLOR_VAR[c] }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-0.5 border-l pl-1.5">
                {sizes.map((size, i) => (
                  <Button
                    key={size}
                    type="button"
                    variant={activeSize === i ? "secondary" : "ghost"}
                    size="icon-sm"
                    aria-label={`Ketebalan ${i + 1}`}
                    title={["Tipis", "Sedang", "Tebal"][i]}
                    onClick={() => setPrefs(prefs.tool === "highlighter" ? { highlightSize: i } : { penSize: i })}
                  >
                    <span
                      className="rounded-full bg-foreground"
                      style={{ width: 4 + i * 4, height: 4 + i * 4 }}
                      aria-hidden
                    />
                  </Button>
                ))}
              </div>
            </>
          )}

          <div className="flex items-center gap-0.5 border-l pl-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Urungkan"
              title="Urungkan (Ctrl+Z)"
              disabled={!history.undo.length}
              onClick={undo}
            >
              <Undo2 />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Ulangi"
              title="Ulangi (Ctrl+Y)"
              disabled={!history.redo.length}
              onClick={redo}
            >
              <Redo2 />
            </Button>
          </div>

          <div className="flex items-center gap-0.5 border-l pl-1.5">
            <Toggle
              size="sm"
              pressed={prefs.penOnly}
              onPressedChange={(penOnly) => setPrefs({ penOnly })}
              aria-label="Mode pena: jari untuk menggulir"
              title={
                prefs.penOnly
                  ? "Mode pena aktif: hanya stylus yang menulis, jari menggulir"
                  : "Jari & mouse ikut menulis (ketuk untuk mode pena)"
              }
            >
              <Hand />
            </Toggle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Jenis kertas" title="Jenis kertas">
                  <Notebook />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Kertas</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={value.paper}
                  onValueChange={(paper) => commit({ ...value, paper: paper as PaperStyle })}
                >
                  {(Object.keys(PAPER_LABEL) as PaperStyle[]).map((p) => (
                    <DropdownMenuRadioItem key={p} value={p}>
                      {PAPER_LABEL[p]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {variant === "page" && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Tambah halaman"
                title="Tambah halaman"
                onClick={() => commit({ ...value, height: (Math.ceil(value.height / PAGE_HEIGHT) + 1) * PAGE_HEIGHT })}
              >
                <FilePlus2 />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Hapus semua coretan"
              title="Hapus semua coretan"
              className="hover:text-destructive"
              disabled={!value.strokes.length}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 />
            </Button>
          </div>
          {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
        </div>
      )}

      <InkSurface
        ref={svgRef}
        height={value.height}
        paper={value.paper}
        strokes={strokes}
        pageBreaks={variant === "page"}
        className={cn(
          !readOnly && "touch-none",
          !readOnly && prefs.tool === "eraser" ? "cursor-cell" : "cursor-crosshair",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onContextMenu={(e) => !readOnly && e.preventDefault()}
        aria-label="Area tulis tangan"
        role="img"
      >
        <path
          ref={liveRef}
          fill={INK_COLOR_VAR[activeColor]}
          opacity={prefs.tool === "highlighter" ? 0.38 : 1}
          pointerEvents="none"
        />
        {eraserAt && (
          <circle
            cx={eraserAt.x}
            cy={eraserAt.y}
            r={12}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth="1.5"
            pointerEvents="none"
          />
        )}
      </InkSurface>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Hapus Semua Coretan?"
        description="Semua tulisan tangan di area ini dihapus. Bisa dibatalkan dengan Urungkan selama catatan masih terbuka."
        confirmLabel="Hapus Semua"
        onConfirm={() => {
          commit({ ...value, strokes: [] });
          setConfirmClear(false);
        }}
      />
    </div>
  );
}
