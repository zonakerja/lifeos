import { type Editor, type JSONContent } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import {
  Bold,
  ChevronDown,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  PenLine,
  Plus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Table2,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { errorMessage } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";
import { toExternalHref } from "@/lib/urls";
import { cn } from "@/lib/utils";
import { noteExtensions } from "./note-extensions";
import { usePermissions } from "@/hooks/use-permissions";

export interface RichTextChange {
  doc: JSONContent;
  /** Teks tanpa format (untuk pencarian, pratinjau, chatbot, indeks AI) */
  text: string;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function ToolButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Toggle
      size="sm"
      pressed={!!active}
      disabled={disabled}
      onPressedChange={onClick}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      // Jangan memindahkan fokus dari editor saat tombol diklik
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </Toggle>
  );
}

const Divider = () => <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />;

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const apply = () => {
    const href = toExternalHref(value);
    if (!href) {
      toast.error("Link tidak valid", { description: "Gunakan alamat web http/https." });
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setValue((editor.getAttributes("link").href as string | undefined) ?? "");
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Toggle size="sm" pressed={active} aria-label="Link" title="Link" onMouseDown={(e) => e.preventDefault()}>
          <Link2 />
        </Toggle>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <Input autoFocus placeholder="https://contoh.com" value={value} onChange={(e) => setValue(e.target.value)} />
          <div className="flex justify-end gap-2">
            {active && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setOpen(false);
                }}
              >
                Hapus link
              </Button>
            )}
            <Button type="submit" size="sm">
              Simpan
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function Toolbar({ editor, onUploaded }: { editor: Editor; onUploaded?: (uploadId: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Di dalam item bersama (izin edit), berkas disimpan atas nama pemilik item
  const { uploadOwnerId } = usePermissions();
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      highlight: e.isActive("highlight"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const blockLabel = state.h1 ? "Judul 1" : state.h2 ? "Judul 2" : state.h3 ? "Judul 3" : "Paragraf";

  const uploadImage = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Hanya berkas gambar yang bisa disisipkan.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Gambar terlalu besar", { description: "Maksimal 10 MB." });
      return;
    }
    setUploading(true);
    try {
      const asset = await uploadsApi.upload(file, "free_note_image", uploadOwnerId);
      onUploaded?.(asset.id);
      chain().insertUploadedImage({ uploadId: asset.id, alt: file.name }).run();
    } catch (error) {
      toast.error("Gambar gagal diunggah", { description: errorMessage(error) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border-b bg-card/95 px-2 py-1.5 backdrop-blur">
      <ToolButton label="Urungkan" shortcut="Ctrl+Z" disabled={!state.canUndo} onClick={() => chain().undo().run()}>
        <Undo2 />
      </ToolButton>
      <ToolButton label="Ulangi" shortcut="Ctrl+Y" disabled={!state.canRedo} onClick={() => chain().redo().run()}>
        <Redo2 />
      </ToolButton>
      <Divider />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="w-28 justify-between" title="Jenis teks">
            {blockLabel} <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DropdownMenuItem onSelect={() => chain().setParagraph().run()}>
            <Type /> Paragraf
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => chain().toggleHeading({ level: 1 }).run()}>
            <Heading1 /> Judul 1
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => chain().toggleHeading({ level: 2 }).run()}>
            <Heading2 /> Judul 2
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => chain().toggleHeading({ level: 3 }).run()}>
            <Heading3 /> Judul 3
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Divider />
      <ToolButton label="Tebal" shortcut="Ctrl+B" active={state.bold} onClick={() => chain().toggleBold().run()}>
        <Bold />
      </ToolButton>
      <ToolButton label="Miring" shortcut="Ctrl+I" active={state.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic />
      </ToolButton>
      <ToolButton
        label="Garis bawah"
        shortcut="Ctrl+U"
        active={state.underline}
        onClick={() => chain().toggleUnderline().run()}
      >
        <Underline />
      </ToolButton>
      <ToolButton label="Coret" active={state.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough />
      </ToolButton>
      <ToolButton label="Stabilo" active={state.highlight} onClick={() => chain().toggleHighlight().run()}>
        <Highlighter />
      </ToolButton>
      <ToolButton label="Kode" active={state.code} onClick={() => chain().toggleCode().run()}>
        <Code />
      </ToolButton>
      <LinkButton editor={editor} active={state.link} />
      <Divider />
      <ToolButton label="Daftar poin" active={state.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List />
      </ToolButton>
      <ToolButton label="Daftar bernomor" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolButton>
      <ToolButton label="Checklist" active={state.task} onClick={() => chain().toggleTaskList().run()}>
        <ListChecks />
      </ToolButton>
      <Divider />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="secondary" title="Sisipkan" disabled={uploading}>
            {uploading ? <Spinner /> : <Plus />} Sisipkan
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DropdownMenuItem onSelect={() => chain().insertInkBlock().run()}>
            <PenLine /> Coretan (tulis tangan)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
            <ImagePlus /> Gambar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
            <Table2 /> Tabel
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => chain().toggleBlockquote().run()}>
            <Quote /> Kutipan
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => chain().toggleCodeBlock().run()}>
            <SquareCode /> Blok kode
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => chain().setHorizontalRule().run()}>
            <Minus /> Garis pemisah
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {state.table && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="ghost" title="Atur tabel">
              <Table2 /> Tabel <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
            <DropdownMenuLabel>Baris</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => chain().addRowBefore().run()}>Tambah baris di atas</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => chain().addRowAfter().run()}>Tambah baris di bawah</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => chain().deleteRow().run()}>Hapus baris</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Kolom</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => chain().addColumnBefore().run()}>Tambah kolom di kiri</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => chain().addColumnAfter().run()}>Tambah kolom di kanan</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => chain().deleteColumn().run()}>Hapus kolom</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => chain().toggleHeaderRow().run()}>Baris judul on/off</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => chain().deleteTable().run()}>
              Hapus tabel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Unggah gambar"
        onChange={(e) => {
          void uploadImage(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * Editor teks kaya (Tiptap): judul, format, daftar, checklist, tabel, link, gambar, dan blok coretan stylus.
 * Pintasan Markdown bawaan: "# " judul, "- " daftar, "1. " bernomor, "[ ] " checklist, "> " kutipan, "```" blok kode.
 */
export function RichTextEditor({
  initialContent,
  readOnly = false,
  onChange,
  onUploaded,
}: {
  initialContent: JSONContent;
  readOnly?: boolean;
  onChange: (change: RichTextChange) => void;
  /** Dipanggil setiap gambar berhasil diunggah (untuk membersihkan berkas yang tidak jadi dipakai) */
  onUploaded?: (uploadId: string) => void;
}) {
  const editor = useEditor({
    editable: !readOnly,
    content: initialContent,
    shouldRerenderOnTransaction: false,
    extensions: [
      ...noteExtensions(),
      Placeholder.configure({ placeholder: "Ketik catatan di sini… (Sisipkan → Coretan untuk menulis tangan)" }),
    ],
    editorProps: {
      attributes: { class: "rich-text min-h-[50svh] px-4 py-4 outline-none sm:px-6", "aria-label": "Isi catatan" },
    },
    onUpdate: ({ editor: e }) =>
      onChange({
        doc: e.getJSON(),
        // Daftar bersarang menghasilkan baris kosong berlebih → rapikan untuk pratinjau & pencarian
        text: e
          .getText({ blockSeparator: "\n" })
          .replace(/\n{2,}/g, "\n")
          .trim(),
      }),
  });

  return (
    <div className={cn("flex flex-col rounded-xl border bg-card", readOnly && "border-transparent")}>
      {!readOnly && <Toolbar editor={editor} onUploaded={onUploaded} />}
      <EditorContent editor={editor} />
    </div>
  );
}
