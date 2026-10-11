import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { PenLine, ScanText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { InkCanvas } from "../ink/ink-canvas";
import { BLOCK_HEIGHT, emptyInk, type InkData, normalizeInk } from "../ink/ink-logic";
import { useHandwritingRecognition } from "../ink/use-handwriting-recognition";
import { textToParagraphs } from "../lib/notes-logic";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    inkBlock: {
      /** Sisipkan blok coretan (tulisan tangan) di posisi kursor. */
      insertInkBlock: () => ReturnType;
    };
  }
}

function InkBlockView({ node, editor, getPos, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const ink = normalizeInk(node.attrs.ink, BLOCK_HEIGHT);
  const readOnly = !editor.isEditable;
  const { recognize, recognizing } = useHandwritingRecognition();

  const toText = async () => {
    const text = await recognize(ink);
    const pos = getPos();
    if (!text || typeof pos !== "number") return;
    // Teks hasil pengenalan disisipkan tepat di bawah blok; blok coretan tetap ada (bisa dihapus manual)
    editor
      .chain()
      .insertContentAt(pos + node.nodeSize, textToParagraphs(text))
      .run();
  };

  return (
    <NodeViewWrapper className="ink-block my-3 overflow-hidden rounded-xl border bg-card" data-drag-handle={false}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-1 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <PenLine className="size-3.5" /> Coretan
        </span>
        {!readOnly && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={recognizing || !ink.strokes.length}
              onClick={() => void toText()}
              title="Ubah tulisan tangan menjadi teks di bawah blok ini (AI)"
            >
              {recognizing ? <Spinner /> : <ScanText />} Ubah ke teks
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Hapus blok coretan"
              title="Hapus blok coretan"
              className="hover:text-destructive"
              onClick={deleteNode}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
      <InkCanvas
        variant="block"
        value={ink}
        readOnly={readOnly}
        onChange={(next: InkData) => updateAttributes({ ink: next })}
      />
    </NodeViewWrapper>
  );
}

/** Blok tulisan tangan di dalam catatan ketik. Data goresan disimpan di atribut `ink` (ikut JSON dokumen). */
export const InkBlock = Node.create({
  name: "inkBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      ink: {
        default: null,
        parseHTML: (element) => {
          try {
            return JSON.parse(element.getAttribute("data-ink") ?? "null");
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => ({ "data-ink": JSON.stringify(attributes.ink ?? null) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-ink-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-ink-block": "" })];
  },

  // Tidak menyumbang teks (pencarian memakai teks hasil "Ubah ke teks" yang disisipkan di bawahnya)
  renderText: () => "",

  addCommands() {
    return {
      insertInkBlock:
        () =>
        ({ state, commands }) => {
          const content = [{ type: this.name, attrs: { ink: emptyInk(BLOCK_HEIGHT) } }, { type: "paragraph" }];
          // Kursor di dalam tabel → sisipkan di bawah tabel (kanvas terlalu sempit di dalam sel)
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name === "table") return commands.insertContentAt($from.after(depth), content);
          }
          return commands.insertContent(content);
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(InkBlockView, {
      // Semua interaksi di dalam blok (menulis, toolbar) ditangani komponen, bukan editor teks
      stopEvent: () => true,
      ignoreMutation: () => true,
    });
  },
});
