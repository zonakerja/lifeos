import { useEffect, useId, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { resolveTheme, useUiStore } from "@/stores/ui-store";

/** Hasil gambar terakhir (tema + kode → SVG): diagram yang dipasang ulang / dibuka lagi tampil seketika tanpa menggambar ulang. */
const CACHE_LIMIT = 40;
const rendered = new Map<string, string>();

function remember(key: string, svg: string) {
  rendered.set(key, svg);
  if (rendered.size > CACHE_LIMIT) rendered.delete(rendered.keys().next().value as string);
}

/**
 * Blok ```mermaid di catatan vault (sintaks sama dengan Obsidian). Pustaka dimuat malas hanya saat catatan berisi diagram.
 * `securityLevel: "strict"`: isi vault bisa berasal dari luar (agen, sinkron) — HTML disandikan & klik/skrip di diagram dimatikan.
 */
export default function MermaidDiagram({ code }: { code: string }) {
  const theme = useUiStore((s) => resolveTheme(s.theme));
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const key = `${theme}|${code}`;
  const [result, setResult] = useState<{ key: string; svg: string | null; error: string | null } | null>(null);
  const cached = rendered.get(key);

  useEffect(() => {
    if (rendered.has(key)) return;
    let cancelled = false;
    void (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: theme === "dark" ? "dark" : "default",
          fontFamily: "inherit",
          suppressErrorRendering: true,
        });
        const { svg } = await mermaid.render(id, code);
        remember(key, svg);
        if (!cancelled) setResult({ key, svg, error: null });
      } catch (error) {
        if (!cancelled) setResult({ key, svg: null, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, id, code, theme]);

  const current = cached ? { key, svg: cached, error: null } : result;
  if (!current || current.key !== key) return <Spinner className="my-2" />;
  if (current.error !== null) {
    return (
      <div className="my-2 rounded-xl border border-warning/40 bg-warning/8 p-3 text-xs">
        <p className="font-semibold text-warning">Diagram Mermaid tidak bisa digambar</p>
        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{current.error.slice(0, 400)}</p>
        <pre className="mt-2 overflow-x-auto font-mono">{code}</pre>
      </div>
    );
  }
  return (
    <div
      className="my-2 overflow-x-auto rounded-xl border bg-card p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      // SVG hasil Mermaid mode ketat (sudah disaring DOMPurify di dalam pustaka)
      dangerouslySetInnerHTML={{ __html: current.svg ?? "" }}
    />
  );
}
