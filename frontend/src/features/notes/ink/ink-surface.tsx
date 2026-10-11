import { useId } from "react";
import { cn } from "@/lib/utils";
import { cachedStrokePath, INK_COLOR_VAR, INK_WIDTH, type InkStroke, PAGE_HEIGHT, type PaperStyle } from "./ink-logic";

/** Jarak garis/kotak/titik kertas (satuan logis). */
const RULE = 40;

function PaperPattern({ id, paper }: { id: string; paper: PaperStyle }) {
  if (paper === "plain") return null;
  return (
    <defs>
      <pattern id={id} width={RULE} height={RULE} patternUnits="userSpaceOnUse">
        {paper === "lined" && (
          <line x1="0" y1={RULE - 0.5} x2={RULE} y2={RULE - 0.5} stroke="var(--border)" strokeWidth="1.2" />
        )}
        {paper === "grid" && (
          <path d={`M${RULE} 0 L0 0 0 ${RULE}`} fill="none" stroke="var(--border)" strokeWidth="1" />
        )}
        {paper === "dots" && <circle cx={RULE / 2} cy={RULE / 2} r="1.6" fill="var(--border)" />}
      </pattern>
    </defs>
  );
}

/** Goresan statis: stabilo di lapisan bawah, pena di atasnya. */
export function InkStrokes({ strokes }: { strokes: InkStroke[] }) {
  return (
    <>
      <g opacity={0.38}>
        {strokes.map(
          (s, i) => s.tool === "highlighter" && <path key={i} d={cachedStrokePath(s)} fill={INK_COLOR_VAR[s.color]} />,
        )}
      </g>
      <g>
        {strokes.map(
          (s, i) => s.tool === "pen" && <path key={i} d={cachedStrokePath(s)} fill={INK_COLOR_VAR[s.color]} />,
        )}
      </g>
    </>
  );
}

/** Kertas + goresan dalam koordinat logis. Dipakai kanvas interaktif dan pratinjau. */
export function InkSurface({
  height,
  paper,
  strokes,
  pageBreaks = false,
  className,
  viewHeight,
  children,
  ...svgProps
}: {
  height: number;
  paper: PaperStyle;
  strokes: InkStroke[];
  /** Garis putus-putus pemisah halaman (catatan tulis tangan penuh) */
  pageBreaks?: boolean;
  /** Tampilkan hanya bagian atas setinggi ini (pratinjau) */
  viewHeight?: number;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.SVGProps<SVGSVGElement>, "height" | "children">) {
  const patternId = useId();
  const shown = viewHeight ?? height;
  const breaks = pageBreaks ? Math.floor((height - 1) / PAGE_HEIGHT) : 0;

  return (
    <svg viewBox={`0 0 ${INK_WIDTH} ${shown}`} className={cn("block w-full select-none", className)} {...svgProps}>
      <PaperPattern id={patternId} paper={paper} />
      {paper !== "plain" && <rect width={INK_WIDTH} height={height} fill={`url(#${patternId})`} />}
      {Array.from({ length: breaks }, (_, i) => (
        <line
          key={i}
          x1="0"
          x2={INK_WIDTH}
          y1={(i + 1) * PAGE_HEIGHT}
          y2={(i + 1) * PAGE_HEIGHT}
          stroke="var(--muted-foreground)"
          strokeOpacity="0.5"
          strokeWidth="2"
          strokeDasharray="12 10"
        />
      ))}
      <InkStrokes strokes={strokes} />
      {children}
    </svg>
  );
}
