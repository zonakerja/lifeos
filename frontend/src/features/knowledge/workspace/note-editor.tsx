import { autocompletion, type CompletionContext, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { defineLanguageFacet, HighlightStyle, Language, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { GFM, parser as markdownParser } from "@lezer/markdown";
import { useEffect, useEffectEvent, useRef } from "react";
import type { KnowledgeNoteListItem } from "@/types/api";
import { noteName } from "./knowledge-logic";

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
  notes: KnowledgeNoteListItem[];
  onChange: (text: string) => void;
  onSave: () => void;
}

/**
 * Editor sumber Markdown (CodeMirror 6, sama dengan mode sumber Obsidian): sintaks `[[…]]`, properti, dan callout tetap
 * apa adanya saat disimpan. `[[` memunculkan pelengkap judul catatan; Ctrl/Cmd+S = simpan sekarang.
 */
export default function NoteEditor({ initial, notes, onChange, onSave }: NoteEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
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
          autocompletion({ override: [wikiCompletion], icons: false }),
          placeholder("Tulis catatan… ketik [[ untuk menautkan catatan lain"),
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
    return () => view.destroy();
    // Isi awal hanya dipakai saat dibuat; komponen di-key per catatan/versi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
