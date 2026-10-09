import { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";

// Renderer (react-markdown + KaTeX ±0,6 MB) dimuat saat markdown pertama kali ditampilkan
const MarkdownRenderer = lazy(() => import("./markdown-renderer"));

/**
 * Renderer Markdown standar (GFM + rumus KaTeX `$...$` / `$$...$$`).
 * Link `app:<type>:<id>` dirender sebagai tombol navigasi internal.
 */
export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <Suspense fallback={<p className={cn("text-sm leading-relaxed whitespace-pre-wrap", className)}>{content}</p>}>
      <MarkdownRenderer content={content} className={className} />
    </Suspense>
  );
}
