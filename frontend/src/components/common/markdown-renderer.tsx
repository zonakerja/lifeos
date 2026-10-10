import "katex/dist/katex.min.css";
import { Link2 } from "lucide-react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import { useNavigate } from "react-router";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { resolveAppLink } from "@/lib/deep-links";
import { cn } from "@/lib/utils";

/** Izinkan skema `app:` (link internal dari chatbot), sisanya pakai sanitasi bawaan. */
const urlTransform = (url: string) => (url.startsWith("app:") ? url : defaultUrlTransform(url));

/**
 * Renderer Markdown standar (GFM + rumus KaTeX `$...$` / `$$...$$`).
 * Link `app:<type>:<id>` dirender sebagai tombol navigasi internal.
 */
export default function MarkdownRenderer({ content, className }: { content: string; className?: string }) {
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        "max-w-none space-y-3 text-sm leading-relaxed break-words",
        "[&_h1]:mt-5 [&_h1]:border-b [&_h1]:pb-2 [&_h1]:text-xl [&_h1]:font-extrabold",
        "[&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:font-bold [&_h3]:text-module",
        "[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
        "[&_li]:marker:text-module [&_strong]:font-bold [&_strong]:text-foreground",
        "[&_blockquote]:border-l-4 [&_blockquote]:border-module/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_hr]:my-5 [&_table]:w-full [&_table]:text-left [&_td]:border-t [&_td]:p-2 [&_th]:bg-muted [&_th]:p-2 [&_th]:font-bold",
        "[&_.katex-display]:overflow-x-auto [&_.katex-display]:rounded-xl [&_.katex-display]:bg-muted/60 [&_.katex-display]:p-3",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={urlTransform}
        components={{
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-xl border">
              <table>{children}</table>
            </div>
          ),
          a: ({ href = "", children }) => {
            if (href.startsWith("app:")) {
              const target = resolveAppLink(href);
              return (
                <button
                  type="button"
                  disabled={!target}
                  onClick={() => target && void navigate(target)}
                  className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-module/30 bg-module-soft px-1.5 py-0.5 text-xs font-semibold text-module hover:bg-module/15 disabled:opacity-50"
                >
                  <Link2 className="size-3" />
                  {children}
                </button>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-info underline-offset-2 hover:underline"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
