import "katex/dist/katex.min.css";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FilePlus2, Frame, Paperclip } from "lucide-react";
import {
  Children,
  createContext,
  isValidElement,
  lazy,
  type ComponentProps,
  type ReactNode,
  Suspense,
  useContext,
  useMemo,
  useState,
} from "react";
import ReactMarkdown, { defaultUrlTransform, type ExtraProps } from "react-markdown";
import { Link } from "react-router";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { previewFile } from "@/components/common/file-preview";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useKnowledgeNote } from "@/data/use-knowledge";
import { apiUrl } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { KnowledgeNoteListItem } from "@/types/api";
import {
  BLOCK_SCHEME,
  calloutTone,
  EMBED_SCHEME,
  MARK_SCHEME,
  isImagePath,
  LINK_SCHEME,
  linkHeading,
  parseCallout,
  slugify,
  toReaderMarkdown,
  outline,
} from "./knowledge-logic";
import { blockAnchor, extractBlock, extractSection, linkBlock } from "./note-blocks";
import { openWorkspaceDialog } from "./workspace-store";

/** Sematan base `![[x.base]]` dimuat malas (mesin Bases ada di chunk tab Bases). */
const EmbeddedBase = lazy(() => import("./bases-tab"));
const MermaidDiagram = lazy(() => import("./mermaid-diagram"));
const EmbeddedCanvas = lazy(() => import("./canvas-tab").then((m) => ({ default: m.EmbeddedCanvas })));

const urlTransform = (url: string) =>
  url.startsWith(LINK_SCHEME) || url.startsWith(EMBED_SCHEME) || url.startsWith(BLOCK_SCHEME) || url === MARK_SCHEME
    ? url
    : defaultUrlTransform(url);

/** Jangkar lompat untuk target tautan: `#^id` → blok, `#Judul` → judul, selain itu tidak ada. */
const targetAnchor = (target: string) => {
  const block = linkBlock(target);
  if (block) return blockAnchor(block);
  const heading = linkHeading(target);
  return heading ? slugify(heading) : undefined;
};

/** Bagian yang disematkan: `#^id` = satu blok, `#Judul` = bagian di bawah judul, selain itu seluruh catatan. */
function embeddedPart(content: string, target: string) {
  const block = linkBlock(target);
  if (block) return { text: extractBlock(content, block), label: `^${block}` };
  const heading = linkHeading(target);
  if (heading) return { text: extractSection(content, heading), label: heading };
  return { text: content, label: null };
}

const TONE: Record<ReturnType<typeof calloutTone>, string> = {
  info: "border-info/40 bg-info/8 [&_.callout-title]:text-info",
  success: "border-success/40 bg-success/8 [&_.callout-title]:text-success",
  warning: "border-warning/40 bg-warning/8 [&_.callout-title]:text-warning",
  destructive: "border-destructive/40 bg-destructive/8 [&_.callout-title]:text-destructive",
  module: "border-module/40 bg-module-soft [&_.callout-title]:text-module",
};

/**
 * Blok kode; ```mermaid → diagram. Sengaja di tingkat modul: komponen yang dibuat ulang tiap render (`components={{…}}`) membuat
 * React memasang ulang isinya, jadi diagram akan digambar ulang setiap catatan dirender ulang.
 */
function NotePre({ node, children }: ComponentProps<"pre"> & ExtraProps) {
  const first = node?.children[0];
  const classes = first?.type === "element" ? first.properties?.className : null;
  if (first?.type === "element" && Array.isArray(classes) && classes.includes("language-mermaid")) {
    const code = first.children.map((c) => (c.type === "text" ? c.value : "")).join("");
    return (
      <Suspense fallback={<Spinner className="my-2" />}>
        <MermaidDiagram code={code.trim()} />
      </Suspense>
    );
  }
  return <pre>{children}</pre>;
}

const FOOTNOTE_LABELS = { footnoteLabel: "Catatan kaki", footnoteBackLabel: "Kembali ke teks" };

const textOf = (node: ReactNode): string =>
  typeof node === "string" || typeof node === "number"
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join("")
      : isValidElement<{ children?: ReactNode }>(node)
        ? textOf(node.props.children)
        : "";

/** Gambar vault dibaca lewat API (Bearer) sebagai blob — tag <img> tidak bisa mengirim token. */
export function VaultImage({ name, alt }: { name: string; alt: string }) {
  const token = useAuthStore((s) => s.accessToken);
  const { data, isLoading, error } = useQuery({
    queryKey: ["knowledge", "attachment", name],
    queryFn: async () => {
      const response = await fetch(apiUrl("/knowledge/attachment", { path: name }), {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!response.ok)
        throw new Error(response.status === 404 ? "Gambar tidak ditemukan di vault." : "Gambar gagal dimuat.");
      return URL.createObjectURL(await response.blob());
    },
    staleTime: 5 * 60_000,
  });
  if (isLoading) return <Spinner className="my-2" />;
  if (error || !data)
    return <span className="text-xs text-warning">{error instanceof Error ? error.message : alt}</span>;
  return <img src={data} alt={alt} className="my-2 max-h-[480px] max-w-full rounded-lg border" />;
}

/** Sematan catatan `![[catatan]]`: isi catatan tujuan dalam bingkai (satu tingkat, tidak berulang). */
function EmbeddedNote({
  note,
  target,
  depth,
  onOpen,
}: {
  note: KnowledgeNoteListItem;
  /** Target sematan lengkap (`catatan#Judul` / `catatan#^id`) */
  target: string;
  depth: number;
  onOpen: (id: string, anchor?: string) => void;
}) {
  const { data, isLoading } = useKnowledgeNote(note.id);
  const part = embeddedPart(data?.content ?? "", target);
  return (
    <div className="my-3 rounded-xl border-l-4 border-module/40 bg-muted/30 p-3">
      <button
        type="button"
        className="mb-1 text-xs font-semibold text-module hover:underline"
        onClick={() => onOpen(note.id, targetAnchor(target))}
      >
        {note.title}
        {part.label ? ` › ${part.label}` : ""}
      </button>
      {isLoading ? (
        <Spinner />
      ) : depth >= 1 ? (
        <p className="text-xs text-muted-foreground">Sematan bertingkat tidak ditampilkan.</p>
      ) : part.text === null ? (
        <p className="text-xs text-warning">
          {linkBlock(target) ? "Blok" : "Judul"} {part.label} tidak ditemukan di catatan ini.
        </p>
      ) : (
        <NoteMarkdown content={part.text} noteId={note.id} depth={depth + 1} />
      )}
    </div>
  );
}

/** Pratinjau saat kursor di atas tautan (seperti Obsidian Page preview). */
function LinkPreview({ id }: { id: string }) {
  const { data, isLoading } = useKnowledgeNote(id);
  if (isLoading) return <Spinner />;
  const text = (data?.content ?? "").replace(/\s+/g, " ").trim();
  return (
    <div className="max-w-xs">
      <p className="font-semibold">{data?.title}</p>
      <p className="mt-1 line-clamp-6 text-xs opacity-90">{text.slice(0, 600) || "Catatan kosong."}</p>
    </div>
  );
}

function Callout({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter((c) => !(typeof c === "string" && !c.trim()));
  const first = items[0];
  const firstText = isValidElement<{ children?: ReactNode }>(first) ? textOf(first.props.children) : "";
  const [firstLine, ...restLines] = firstText.split("\n");
  const callout = parseCallout(firstLine ?? "");
  const [open, setOpen] = useState(!callout?.folded);
  if (!callout) return <blockquote>{children}</blockquote>;
  const tone = TONE[calloutTone(callout.type)];
  const title = callout.title || callout.type.charAt(0).toUpperCase() + callout.type.slice(1);
  return (
    <div className={cn("my-3 rounded-xl border-l-4 px-4 py-2.5 not-italic", tone)}>
      <button
        type="button"
        className="callout-title flex w-full items-center gap-1 text-left text-sm font-bold"
        onClick={() => callout.folded !== undefined && setOpen((v) => !v)}
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {title}
      </button>
      {open && (
        <div className="mt-1 text-sm text-foreground [&>p]:my-1">
          {restLines.join("\n").trim() && <p>{restLines.join("\n").trim()}</p>}
          {items.slice(1)}
        </div>
      )}
    </div>
  );
}

interface NoteMarkdownProps {
  content: string;
  className?: string;
  /** Kedalaman sematan (0 = catatan utama) */
  depth?: number;
  /** Id catatan yang ditampilkan — untuk tautan/sematan ke catatan sendiri (`[[#Judul]]`, `![[#^id]]`) */
  noteId?: string;
}

/**
 * Pembaca catatan vault: GFM + KaTeX + sintaks Obsidian (`[[tautan]]` bisa diklik + pratinjau, `![[sematan]]` gambar /
 * berkas / catatan, callout `> [!note]`). Judul diberi id (garis besar & `[[catatan#judul]]`).
 */
export function NoteMarkdown({ content, className, depth = 0, noteId }: NoteMarkdownProps) {
  const ctx = useNoteLinkContext();
  // Target tanpa nama catatan (`#Judul`, `#^id`) = catatan ini sendiri
  const resolveTarget = (target: string) =>
    target.startsWith("#") ? (noteId ? (ctx.byId?.(noteId) ?? null) : null) : ctx.resolve(target);
  const markdown = useMemo(() => toReaderMarkdown(content), [content]);
  // id judul diambil dari `outline()` menurut nomor baris (sama persis dengan garis besar, tidak bergantung urutan render)
  const ids = useMemo(() => new Map(outline(content).map((h) => [h.line, h.id])), [content]);
  const heading =
    (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") =>
    ({
      children,
      node,
      id,
      className,
    }: {
      children?: ReactNode;
      id?: string;
      className?: string;
      node?: { position?: { start: { line: number } } };
    }) => (
      <Tag
        // judul bawaan catatan kaki membawa id & kelas sendiri (`sr-only`)
        id={id ?? ids.get(node?.position?.start.line ?? 0) ?? slugify(textOf(children))}
        className={cn("scroll-mt-4", className)}
      >
        {children}
      </Tag>
    );

  return (
    <div
      data-note-md
      className={cn(
        "max-w-none space-y-3 text-sm leading-relaxed break-words",
        "[&_mark]:rounded [&_mark]:bg-warning/30 [&_mark]:px-0.5 [&_mark]:text-foreground",
        "[&_section[data-footnotes]]:mt-6 [&_section[data-footnotes]]:border-t [&_section[data-footnotes]]:pt-3 [&_section[data-footnotes]]:text-xs",
        "[&_h1]:mt-5 [&_h1]:border-b [&_h1]:pb-2 [&_h1]:text-xl [&_h1]:font-extrabold",
        "[&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:font-bold [&_h3]:text-module [&_h4]:font-semibold",
        "[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
        "[&_li]:marker:text-module [&_strong]:font-bold [&_strong]:text-foreground",
        "[&_blockquote]:border-l-4 [&_blockquote]:border-module/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_hr]:my-5 [&_table]:w-full [&_table]:text-left [&_td]:border-t [&_td]:p-2 [&_th]:bg-muted [&_th]:p-2 [&_th]:font-bold",
        "[&_input[type=checkbox]]:mr-1.5 [&_input[type=checkbox]]:accent-module",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        remarkRehypeOptions={FOOTNOTE_LABELS}
        urlTransform={urlTransform}
        components={{
          // paragraf berisi sematan (catatan, base, canvas = blok <div>) dirender sebagai <div>: <div> di dalam <p> tidak sah
          p: ({ node, children }) =>
            node?.children.some(
              (c) =>
                c.type === "element" && c.tagName === "img" && String(c.properties?.src ?? "").startsWith(EMBED_SCHEME),
            ) ? (
              <div className="my-[1.25em]">{children}</div>
            ) : (
              <p>{children}</p>
            ),
          pre: NotePre,
          h1: heading("h1"),
          h2: heading("h2"),
          h3: heading("h3"),
          h4: heading("h4"),
          h5: heading("h5"),
          h6: heading("h6"),
          blockquote: ({ children }) => <Callout>{children}</Callout>,
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-xl border">
              <table>{children}</table>
            </div>
          ),
          a: ({ href = "", children }) => {
            if (href.startsWith(BLOCK_SCHEME)) {
              return <span id={blockAnchor(href.slice(BLOCK_SCHEME.length))} className="scroll-mt-4" />;
            }
            if (href === MARK_SCHEME) return <mark>{children}</mark>;
            // Catatan kaki & jangkar di catatan yang sama: gulir di dalam catatan ini (bukan tab baru)
            if (href.startsWith("#")) {
              return (
                <a
                  href={href}
                  className="text-info underline underline-offset-2"
                  onClick={(event) => {
                    event.preventDefault();
                    event.currentTarget
                      .closest("[data-note-md]")
                      ?.querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  {children}
                </a>
              );
            }
            if (!href.startsWith(LINK_SCHEME)) {
              return (
                <a href={href} target="_blank" rel="noreferrer" className="text-info underline underline-offset-2">
                  {children}
                </a>
              );
            }
            const target = decodeURIComponent(href.slice(LINK_SCHEME.length));
            if (/\.base(?:#|$)/i.test(target)) {
              return (
                <Link
                  to={`/knowledge/bases?base=${encodeURIComponent(target.split("#")[0].trim())}`}
                  className="font-medium text-module underline decoration-module/40 underline-offset-2"
                >
                  {children}
                </Link>
              );
            }
            if (/\.canvas$/i.test(target.trim())) {
              return (
                <Link
                  to={`/knowledge/canvas?canvas=${encodeURIComponent(target.trim())}`}
                  className="font-medium text-module underline decoration-module/40 underline-offset-2"
                >
                  {children}
                </Link>
              );
            }
            const note = resolveTarget(target);
            if (!note) {
              return (
                <button
                  type="button"
                  title="Catatan belum ada — klik untuk membuat"
                  className="inline-flex items-center gap-0.5 font-medium text-muted-foreground underline decoration-dashed underline-offset-2 hover:text-module"
                  onClick={() => openWorkspaceDialog({ kind: "new-note", title: target.replace(/[#^].*$/, "") })}
                >
                  {children}
                  <FilePlus2 className="size-3" />
                </button>
              );
            }
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="font-medium text-module underline decoration-module/40 underline-offset-2 hover:decoration-module"
                    onClick={() => ctx.open(note.id, targetAnchor(target))}
                  >
                    {children}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm">
                  <LinkPreview id={note.id} />
                </TooltipContent>
              </Tooltip>
            );
          },
          img: ({ src = "", alt = "" }) => {
            const url = typeof src === "string" ? src : "";
            if (!url.startsWith(EMBED_SCHEME)) {
              return <img src={url} alt={alt} className="my-2 max-h-[480px] max-w-full rounded-lg border" />;
            }
            const target = decodeURIComponent(url.slice(EMBED_SCHEME.length));
            if (/\.base(?:#|$)/i.test(target)) {
              if (depth >= 1)
                return <span className="text-xs text-muted-foreground">Sematan bertingkat tidak ditampilkan.</span>;
              return (
                <Suspense fallback={<Spinner className="my-2" />}>
                  <EmbeddedBase target={target} />
                </Suspense>
              );
            }
            if (/\.canvas$/i.test(target.trim())) {
              // di dalam kartu/sematan lain → kartu pembuka saja (mencegah sematan bertingkat)
              if (depth >= 1)
                return (
                  <Link
                    to={`/knowledge/canvas?canvas=${encodeURIComponent(target.trim())}`}
                    className="my-2 inline-flex items-center gap-1.5 rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium text-module hover:bg-muted"
                  >
                    <Frame className="size-4" /> {target.replace(/\.canvas$/i, "")} (canvas)
                  </Link>
                );
              return (
                <Suspense fallback={<Spinner className="my-2" />}>
                  <EmbeddedCanvas target={target.trim()} />
                </Suspense>
              );
            }
            if (isImagePath(target)) return <VaultImage name={target.replace(/[#^|].*$/, "")} alt={alt} />;
            const note = resolveTarget(target);
            if (!note) {
              return <span className="text-xs text-warning">Sematan tidak ditemukan: {target}</span>;
            }
            if (note.kind === "file") {
              return (
                <Button
                  size="xs"
                  variant="outline"
                  className="my-1"
                  disabled={!note.assetId}
                  onClick={() => note.assetId && previewFile({ uploadId: note.assetId, name: note.title })}
                >
                  <Paperclip /> {note.title}
                </Button>
              );
            }
            return <EmbeddedNote note={note} target={target} depth={depth} onOpen={ctx.open} />;
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

// ---------------------------------------------------------------- Konteks pencocok tautan

interface NoteLinkContext {
  resolve: (target: string) => KnowledgeNoteListItem | null;
  /** Catatan menurut id (tautan ke catatan sendiri) */
  byId?: (id: string) => KnowledgeNoteListItem | null;
  open: (id: string, heading?: string) => void;
}

const LinkContext = createContext<NoteLinkContext>({ resolve: () => null, open: () => undefined });

export const NoteLinkProvider = LinkContext.Provider;
const useNoteLinkContext = () => useContext(LinkContext);
