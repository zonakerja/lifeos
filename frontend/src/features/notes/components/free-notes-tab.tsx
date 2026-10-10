import { Check, ChevronLeft, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useFreeNotes } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import { useSearchParam } from "@/hooks/use-search-param";
import { formatNumericDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { FreeNote } from "@/types/entities";
import { NOTE_COLORS, noteColor } from "../note-colors";

const emptyNote = (): FreeNote => ({ id: "", title: "", content: "", color: "bg-yellow-50" });

export function FreeNotesTab() {
  const { items: notes, setItems } = useFreeNotes();
  const { canEdit } = usePermissions();
  // Editor dikendalikan URL: ?note=<id>|new
  const [noteParam, setNoteParam] = useSearchParam("note");
  const [deleting, setDeleting] = useState<FreeNote | null>(null);

  const editing = noteParam === "new" ? emptyNote() : (notes.find((n) => String(n.id) === noteParam) ?? null);

  if (editing) {
    return (
      <FreeNoteEditor
        key={noteParam}
        note={editing}
        readOnly={!canEdit}
        onClose={(saved) => {
          if (saved && (saved.title || saved.content)) {
            const data = { ...saved, updatedAt: new Date().toISOString() };
            setItems((prev) =>
              saved.id ? prev.map((n) => (n.id === saved.id ? data : n)) : [...prev, { ...data, id: Date.now() }],
            );
          }
          setNoteParam(null);
        }}
      />
    );
  }

  return (
    <>
      <div className="grid auto-rows-[200px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {canEdit && (
          <button
            type="button"
            onClick={() => setNoteParam("new")}
            className="flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed text-muted-foreground transition-colors hover:border-module hover:bg-module-soft hover:text-module"
          >
            <Plus className="size-8" />
            <span className="font-bold">Catatan Baru</span>
          </button>
        )}
        {notes.map((note) => (
          <div
            key={note.id}
            role="button"
            tabIndex={0}
            onClick={() => setNoteParam(String(note.id))}
            onKeyDown={(e) => e.key === "Enter" && setNoteParam(String(note.id))}
            className={cn(
              "group relative flex cursor-pointer flex-col rounded-3xl border border-transparent p-5 shadow-xs transition-all hover:shadow-md",
              noteColor(note.color).card,
            )}
          >
            <h4 className="mb-2 line-clamp-1 pr-8 text-lg font-bold">{note.title || "Tanpa Judul"}</h4>
            <p className="line-clamp-5 flex-1 text-sm whitespace-pre-wrap text-foreground/85">{note.content}</p>
            <span className="mt-3 text-[10px] font-medium text-muted-foreground">
              {note.updatedAt ? formatNumericDate(note.updatedAt) : ""}
            </span>
            {canEdit && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Hapus catatan"
                className="absolute top-3 right-3 bg-card/60 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleting(note);
                }}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Catatan?"
        description="Catatan ini akan dihapus permanen."
        itemName={deleting?.title || "Tanpa Judul"}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting) setItems((prev) => prev.filter((n) => n.id !== deleting.id));
          setDeleting(null);
        }}
      />
    </>
  );
}

function FreeNoteEditor({
  note,
  readOnly,
  onClose,
}: {
  note: FreeNote;
  readOnly: boolean;
  /** Kirim catatan untuk disimpan, atau null bila hanya menutup */
  onClose: (saved: FreeNote | null) => void;
}) {
  const [draft, setDraft] = useState<FreeNote>(note);
  const close = () => onClose(readOnly ? null : draft);

  return (
    <Card className="min-h-[70svh] animate-in fade-in zoom-in-95">
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Kembali" onClick={close}>
              <ChevronLeft />
            </Button>
            {!readOnly && (
              <div className="flex gap-1.5 border-l pl-3">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    aria-label={`Warna ${c.label}`}
                    onClick={() => setDraft({ ...draft, color: c.id })}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-white shadow-sm transition-transform",
                      c.swatch,
                      draft.color === c.id && "scale-110 ring-2 ring-ring ring-offset-2 ring-offset-card",
                    )}
                  >
                    {draft.color === c.id && <Check className="size-3.5" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!readOnly && <Button onClick={close}>Selesai</Button>}
        </div>
        <input
          placeholder="Judul Catatan..."
          readOnly={readOnly}
          className="w-full bg-transparent text-3xl font-extrabold outline-none placeholder:text-muted-foreground/50"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <textarea
          placeholder="Ketik catatan Anda di sini..."
          readOnly={readOnly}
          className={cn(
            "min-h-[50svh] w-full flex-1 resize-none bg-transparent text-lg leading-10 outline-none placeholder:text-muted-foreground/50",
            // Garis buku catatan
            "[background-attachment:local] [background-image:linear-gradient(transparent_95%,var(--border)_95%)] [background-size:100%_2.5rem]",
          )}
          value={draft.content}
          onChange={(e) => setDraft({ ...draft, content: e.target.value })}
        />
      </CardContent>
    </Card>
  );
}
