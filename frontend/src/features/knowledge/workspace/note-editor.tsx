import {
  autocompletion,
  type Completion,
  type CompletionContext,
  completionKeymap,
  startCompletion,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { defineLanguageFacet, HighlightStyle, Language, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { GFM, parser as markdownParser } from "@lezer/markdown";
import { useEffect, useEffectEvent, useRef } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api/client";
import { knowledgeApi } from "@/lib/api/endpoints";
import type { KnowledgeNoteListItem } from "@/types/api";
import {
  expandSnippet,
  isSlashTrigger,
  matchSnippets,
  type Snippet,
  SNIPPETS,
  templateInsertText,
} from "./editor-snippets";
import { createResolver, noteName, outline, templateNotes } from "./knowledge-logic";
import { addBlockId, blockCandidates, newBlockId } from "./note-blocks";
import { useWorkspaceStore } from "./workspace-store";

const nowDate = () => new Date();

/** Sisipkan potongan Markdown menggantikan `from..to` (pilihan teks / `/perintah` yang diketik). */
function insertSnippet(view: EditorView, snippet: Snippet, from: number, to: number) {
  const { doc } = view.state;
  const line = doc.lineAt(from);
  const endLine = doc.lineAt(to);
  const { text, cursor } = expandSnippet(snippet, {
    lineBefore: line.text.slice(0, from - line.from),
    lineAfter: endLine.text.slice(to - endLine.from),
    prevLine: line.number > 1 ? doc.line(line.number - 1).text : null,
    now: nowDate(),
  });
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + cursor },
    scrollIntoView: true,
    userEvent: "input",
  });
  view.focus();
  if (snippet.completeAfter) startCompletion(view);
}

/** Sisipkan isi templat `90-Templat/…` di posisi kursor (isi templat diambil dari server saat dipakai). */
async function insertTemplate(view: EditorView, templateId: string, title: string) {
  try {
    const source = await knowledgeApi.source(templateId);
    const { from, to } = view.state.selection.main;
    const text = templateInsertText(source.raw, {
      title,
      now: nowDate(),
      atDocStart: from === 0,
      docHasFrontmatter: view.state.doc.sliceString(0, 4) === "---\n",
    });
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      scrollIntoView: true,
      userEvent: "input",
    });
    view.focus();
  } catch (error) {
    toast.error("Gagal memuat templat", { description: errorMessage(error) });
  }
}

/** Isi tanpa properti (frontmatter) + jumlah baris properti, agar nomor baris isi bisa dipetakan ke dokumen editor. */
function splitBody(doc: string) {
  const match = /^---\n[\s\S]*?\n---[ \t]*(?:\n|$)/.exec(doc);
  return match
    ? { body: doc.slice(match[0].length), offset: match[0].split("\n").length - 1 }
    : { body: doc, offset: 0 };
}

const shorten = (text: string) => (text.length > 90 ? `${text.slice(0, 88)}…` : text);
const ANCHOR_VALID = /^[^\]\n|#]*$/;

/**
 * Pelengkap `[[catatan#` (judul) dan `[[catatan#^` (blok; seperti Obsidian, blok tanpa id diberi `^id` baru di berkasnya).
 * Nama kosong (`[[#…`) = catatan yang sedang disunting.
 */
function anchorCompletion(
  getNotes: () => KnowledgeNoteListItem[],
  noteId: string,
  cache: Map<string, { at: number; content: string }>,
) {
  const load = async (id: string) => {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < 30_000) return hit.content;
    const content = (await knowledgeApi.note(id)).content ?? "";
    cache.set(id, { at: Date.now(), content });
    return content;
  };
  const insertLink = (view: EditorView, start: number, end: number, id: string) =>
    view.dispatch({
      changes: { from: start, to: end, insert: `${id}]]` },
      selection: { anchor: start + id.length + 2 },
    });

  return async (context: CompletionContext) => {
    const match = context.matchBefore(/\[\[[^\]\n|#]*#\^?[^\]\n|#]*/);
    if (!match) return null;
    const [, name, caret] = /^\[\[([^\]\n|#]*)#(\^?)/.exec(match.text)!;
    const from = match.from + 2 + name.length + 1 + caret.length;
    const target = name.trim() ? createResolver(getNotes())(name) : null;
    if (name.trim() && (!target || target.kind !== "note")) return null;
    const self = !target || target.id === noteId;
    const content = self ? splitBody(context.state.doc.toString()).body : await load(target.id).catch(() => null);
    if (content === null) return null;

    if (!caret) {
      const options: Completion[] = outline(content).map((h) => ({
        label: h.text,
        detail: "#".repeat(h.level),
        apply: `${h.text}]]`,
      }));
      return options.length ? { from, options, validFor: ANCHOR_VALID } : null;
    }

    // baris yang sedang diketik (tautan ini sendiri) bukan calon blok
    const cursorLine = self
      ? context.state.doc.lineAt(context.pos).number - 1 - splitBody(context.state.doc.toString()).offset
      : -1;
    const blocks = blockCandidates(content).filter((b) => b.line !== cursorLine);
    const used = blocks.flatMap((b) => (b.id ? [b.id] : []));
    const options: Completion[] = blocks.map((block) => ({
      label: shorten(block.text),
      detail: block.id ? `^${block.id}` : "id baru",
      apply: (view, _completion, start, end) => {
        if (block.id) return insertLink(view, start, end, block.id);
        const id = newBlockId(used);
        if (self) {
          // tandai blok di dokumen ini juga, satu transaksi dengan tautannya
          const { offset } = splitBody(view.state.doc.toString());
          const lineEnd = view.state.doc.line(offset + block.line + 1).to;
          const insert = `${id}]]`;
          const changes = [
            { from: start, to: end, insert },
            { from: lineEnd, insert: ` ^${id}` },
          ].sort((a, b) => a.from - b.from);
          const shift = lineEnd < start ? id.length + 2 : 0;
          view.dispatch({ changes, selection: { anchor: start + shift + insert.length } });
          return;
        }
        void (async () => {
          try {
            const source = await knowledgeApi.source(target!.id);
            const next = addBlockId(source.raw, content.split("\n")[block.line], id);
            if (next === null) throw new Error("Blok tidak ditemukan lagi — catatan tujuan sudah berubah.");
            await knowledgeApi.save(target!.id, { content: next, baseHash: source.hash });
            cache.delete(target!.id);
            insertLink(view, start, end, id);
          } catch (error) {
            toast.error("Gagal menandai blok di catatan tujuan", { description: errorMessage(error) });
          }
        })();
      },
    }));
    return options.length ? { from, options, validFor: ANCHOR_VALID } : null;
  };
}

/**
 * Bahasa Markdown (GFM) langsung dari parser Lezer — tanpa bahasa HTML/CSS/JS yang ikut `@codemirror/lang-markdown`
 * (chunk editor > 500 kB). Parser sudah membawa tag sorotan sintaks Markdown.
 */
const markdownLanguage = new Language(defineLanguageFacet(), markdownParser.configure(GFM), [], "markdown");

/** Warna sintaks dari token design system (bukan warna tetap) agar ikut tema terang/gelap & warna modul. */
const highlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.35em", fontWeight: "800", color: "var(--foreground)" },
  { tag: tags.heading2, fontSize: "1.2em", fontWeight: "700", color: "var(--foreground)" },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: "700", color: "var(--module)" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--info)" },
  { tag: [tags.monospace, tags.comment], fontFamily: "var(--font-mono, monospace)", color: "var(--module)" },
  { tag: tags.quote, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: "var(--muted-foreground)" },
  { tag: tags.list, color: "var(--module)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px", backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.7", padding: "12px 4px" },
  ".cm-content": { caretColor: "var(--module)", maxWidth: "860px", margin: "0 auto" },
  ".cm-cursor": { borderLeftColor: "var(--module)" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklch, var(--module) 22%, transparent) !important",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--module-soft)", color: "var(--module)" },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in oklch, var(--warning) 30%, transparent)" },
});

interface NoteEditorProps {
  /** Isi awal (berkas mentah termasuk properti). Ganti `key` komponen untuk memuat isi lain. */
  initial: string;
  /** Id catatan yang disunting (pelengkap `[[#^` untuk blok di catatan ini) */
  noteId: string;
  /** Judul catatan (penanda `{{judul}}` saat menyisipkan templat). */
  title: string;
  notes: KnowledgeNoteListItem[];
  onChange: (text: string) => void;
  onSave: () => void;
}

/**
 * Editor sumber Markdown (CodeMirror 6, sama dengan mode sumber Obsidian): sintaks `[[…]]`, properti, dan callout tetap
 * apa adanya saat disimpan. `[[` memunculkan pelengkap judul catatan; `/` di awal baris / setelah spasi = perintah sisip
 * (judul, daftar tugas, callout, tabel, tanggal, templat — K5); Ctrl/Cmd+S = simpan sekarang.
 */
export default function NoteEditor({ initial, noteId, title, notes, onChange, onSave }: NoteEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const notesRef = useRef(notes);
  const titleRef = useRef(title);
  useEffect(() => {
    notesRef.current = notes;
    titleRef.current = title;
  }, [notes, title]);
  const handleChange = useEffectEvent(onChange);
  const handleSave = useEffectEvent(onSave);

  useEffect(() => {
    const wikiCompletion = (context: CompletionContext) => {
      const before = context.matchBefore(/\[\[[^\]\n|#]*/);
      if (!before) return null;
      // CodeMirror sendiri menyaring & mengurutkan opsi menurut teks yang diketik
      const options = notesRef.current.map((n) => {
        const name = n.kind === "note" ? noteName(n.path) : n.path.slice(n.path.lastIndexOf("/") + 1);
        return {
          label: name,
          detail: n.path.includes("/") ? n.path.slice(0, n.path.lastIndexOf("/")) : "",
          apply: `${name}]]`,
        };
      });
      return { from: before.from + 2, options, validFor: /^[^\]\n|#]*$/ };
    };
    // `/perintah`: disaring sendiri (label + kata kunci), bukan oleh CodeMirror
    const slashCompletion = (context: CompletionContext) => {
      const before = context.matchBefore(/\/[^\s/]*/);
      if (!before) return null;
      const line = context.state.doc.lineAt(before.from);
      const charBefore = before.from > line.from ? context.state.doc.sliceString(before.from - 1, before.from) : null;
      if (!isSlashTrigger(charBefore)) return null;
      const query = before.text.slice(1);
      const options: Completion[] = matchSnippets(query).map((snippet) => ({
        label: snippet.label,
        detail: snippet.group,
        apply: (view, _completion, from, to) => insertSnippet(view, snippet, from, to),
      }));
      const words = query.toLowerCase();
      for (const t of templateNotes(notesRef.current)) {
        const name = noteName(t.path);
        if (words && !`templat template ${name}`.toLowerCase().includes(words)) continue;
        options.push({
          label: `Templat: ${name}`,
          detail: "Templat",
          apply: (view, _completion, from, to) => {
            view.dispatch({ changes: { from, to, insert: "" }, selection: { anchor: from } });
            void insertTemplate(view, t.id, titleRef.current);
          },
        });
      }
      if (!options.length) return null;
      return { from: before.from, options, filter: false };
    };
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdownLanguage,
          syntaxHighlighting(highlight),
          highlightSelectionMatches(),
          autocompletion({
            override: [wikiCompletion, anchorCompletion(() => notesRef.current, noteId, new Map()), slashCompletion],
            icons: false,
          }),
          placeholder("Tulis catatan… ketik [[ untuk menautkan catatan lain, / untuk menyisipkan"),
          keymap.of([
            { key: "Mod-s", preventDefault: true, run: () => (handleSave(), true) },
            indentWithTab,
            ...completionKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) handleChange(update.state.doc.toString());
          }),
          theme,
        ],
      }),
    });
    view.focus();
    // Jembatan untuk grup "Sisipkan" di palet perintah (Ctrl+P)
    const bridge = {
      insertSnippet: (snippetId: string) => {
        const snippet = SNIPPETS.find((s) => s.id === snippetId);
        const { from, to } = view.state.selection.main;
        if (snippet) insertSnippet(view, snippet, from, to);
      },
      insertTemplate: (templateId: string) => insertTemplate(view, templateId, titleRef.current),
    };
    useWorkspaceStore.setState({ editor: bridge });
    return () => {
      if (useWorkspaceStore.getState().editor === bridge) useWorkspaceStore.setState({ editor: null });
      view.destroy();
    };
    // Isi awal hanya dipakai saat dibuat; komponen di-key per catatan/versi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
