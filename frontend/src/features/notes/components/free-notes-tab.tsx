import { ChevronLeft, Keyboard, NotebookPen, PenLine, Pin, PinOff, Plus, SearchX, Trash2 } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { PageLoader } from "@/components/common/page-loader";
import { PaginationControl } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useFreeNotes } from "@/data/collections";
import { fetchCompleteItem, useCompleteItem } from "@/data/use-complete-item";
import { errorMessage } from "@/lib/api/client";
import { usePagination } from "@/hooks/use-pagination";
import { usePermissions } from "@/hooks/use-permissions";
import { useSearchParam } from "@/hooks/use-search-param";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { FreeNote } from "@/types/entities";
import { emptyInk, normalizeInk, PAGE_HEIGHT } from "../ink/ink-logic";
import { InkSurface } from "../ink/ink-surface";
import { docUploadIds, filterFreeNotes, isFreeNoteEmpty, isHandwritingNote, sortFreeNotes } from "../lib/notes-logic";
import { removeUploads } from "../lib/remove-uploads";
import { useOrphanUploadsJanitor } from "../lib/use-orphan-uploads";
import { noteColor } from "../note-colors";
import { AccessScope } from "@/components/common/access-scope";
import { SharedBadge } from "@/features/sharing/shared-badge";
import { itemAccess } from "@/lib/sharing";
import { NoteDeleteDialog } from "@/features/resources/note-delete-dialog";
import { noteKey } from "@/features/resources/note-references";

// Editor (Tiptap + kanvas stylus) dimuat saat catatan dibuka agar daftar catatan tetap ringan
const FreeNoteEditor = lazy(() => import("./free-note-editor"));

/** `?note=new` → catatan ketik, `?note=new-ink` → catatan tulis tangan. */
const NEW_TEXT = "new";
const NEW_INK = "new-ink";

const emptyNote = (handwriting: boolean): FreeNote =>
  handwriting
    ? { id: "", title: "", content: "", color: "bg-yellow-50", kind: "handwriting", ink: emptyInk(PAGE_HEIGHT) }
    : { id: "", title: "", content: "", color: "bg-yellow-50", kind: "text" };

/** Pratinjau tulisan tangan di kartu (bagian atas halaman pertama). */
function InkPreview({ note }: { note: FreeNote }) {
  const ink = normalizeInk(note.ink, PAGE_HEIGHT);
  if (!ink.strokes.length) return <p className="text-sm text-muted-foreground italic">Halaman masih kosong.</p>;
  return (
    <div className="-mx-1 min-h-0 flex-1 overflow-hidden rounded-xl bg-card/70" aria-hidden>
      <InkSurface height={ink.height} viewHeight={Math.min(ink.height, 600)} paper="plain" strokes={ink.strokes} />
    </div>
  );
}

/** Tombol aksi kartu: muncul saat hover di perangkat ber-mouse, selalu terlihat di layar sentuh. */
const HOVER_ACTIONS =
  "transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100";

export function FreeNotesTab() {
  const { items: notes, setItems, isLoading } = useFreeNotes();
  const { canEdit } = usePermissions();
  // Editor dikendalikan URL: ?note=<id>|new|new-ink
  const [noteParam, setNoteParam] = useSearchParam("note");
  const [deleting, setDeleting] = useState<FreeNote | null>(null);
  const [query, setQuery] = useState("");
  useOrphanUploadsJanitor("free_note", notes, setItems);

  const visible = sortFreeNotes(filterFreeNotes(notes, query));
  const { pageItems, setPage, controlProps } = usePagination(visible, 12);

  const isNew = noteParam === NEW_TEXT || noteParam === NEW_INK;
  const target = isNew ? emptyNote(noteParam === NEW_INK) : (notes.find((n) => String(n.id) === noteParam) ?? null);
  // Daftar memuat versi ringan (tanpa dokumen/coretan lengkap) → isi lengkap diambil saat catatan dibuka
  const complete = useCompleteItem("free_note", target);
  const editing = complete.item;
  // ?note=<id> untuk catatan yang tidak ada (sudah dihapus / tidak lagi dibagikan)
  const missing = !!noteParam && !isNew && !isLoading && !target;

  const upsert = (note: FreeNote) =>
    setItems((prev) =>
      prev.some((n) => n.id === note.id) ? prev.map((n) => (n.id === note.id ? note : n)) : [...prev, note],
    );

  if (missing || complete.error) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-muted text-muted-foreground">
            <SearchX />
          </EmptyMedia>
          <EmptyTitle>{missing ? "Catatan tidak ditemukan" : "Catatan gagal dibuka"}</EmptyTitle>
          <EmptyDescription>
            {missing
              ? "Catatan ini mungkin sudah dihapus atau tidak lagi dibagikan kepada Anda."
              : errorMessage(complete.error)}
          </EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onClick={() => setNoteParam(null)}>
          <ChevronLeft /> Kembali ke daftar
        </Button>
      </Empty>
    );
  }
  if (target && complete.isLoading) return <PageLoader label="Membuka catatan..." />;

  if (editing) {
    return (
      <Suspense fallback={<PageLoader label="Membuka editor..." />}>
        <AccessScope item={editing}>
          <FreeNoteEditor
            key={noteParam}
            note={editing}
            readOnly={!canEdit || !itemAccess(editing).canEdit}
            onChange={upsert}
            onClose={(last) => {
              // Catatan yang dikosongkan dibuang agar tidak ada kartu kosong (catatan bersama tidak dihapus kolaborator)
              if (last && !last.share && isFreeNoteEmpty(last) && notes.some((n) => n.id === last.id)) {
                setItems((prev) => prev.filter((n) => n.id !== last.id));
                toast.info("Catatan kosong dibuang.");
              }
              setNoteParam(null);
            }}
          />
        </AccessScope>
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          placeholder="Cari judul atau isi catatan..."
          className="md:w-72"
        />
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus /> Catatan Baru
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setNoteParam(NEW_TEXT)}>
                <Keyboard /> Ketik
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNoteParam(NEW_INK)}>
                <PenLine /> Tulis tangan (stylus)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {isLoading ? (
        <PageLoader />
      ) : visible.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="bg-module-soft text-module">
              <NotebookPen />
            </EmptyMedia>
            <EmptyTitle>{query ? "Tidak ada catatan yang cocok." : "Belum ada catatan."}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid auto-rows-[200px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pageItems.map((note) => (
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
              <h4 className="mb-2 line-clamp-1 flex items-center gap-1.5 pr-16 text-lg font-bold">
                {note.pinned && <Pin className="size-3.5 shrink-0 fill-current text-module" aria-label="Disematkan" />}
                <span className="truncate">{note.title || "Tanpa Judul"}</span>
              </h4>
              <SharedBadge item={note} recordType="free_note" className="mb-2" />
              {isHandwritingNote(note) ? (
                <InkPreview note={note} />
              ) : (
                <p className="line-clamp-5 flex-1 text-sm whitespace-pre-wrap text-foreground/85">{note.content}</p>
              )}
              <span className="mt-3 flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
                {isHandwritingNote(note) && (
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                    <PenLine /> Tulis tangan
                  </Badge>
                )}
                {note.updatedAt ? `Diubah ${formatDateTime(note.updatedAt)}` : ""}
              </span>
              {/* Sematkan & hapus hanya untuk catatan milik sendiri */}
              {canEdit && !note.share && (
                <div className={cn("absolute top-3 right-3 flex gap-0.5", HOVER_ACTIONS)}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={note.pinned ? "Lepas sematan" : "Sematkan"}
                    title={note.pinned ? "Lepas sematan" : "Sematkan"}
                    className="bg-card/60"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Menyematkan tidak mengubah "terakhir diubah"
                      upsert({ ...note, pinned: !note.pinned });
                    }}
                  >
                    {note.pinned ? <PinOff /> : <Pin />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Hapus catatan"
                    title="Hapus"
                    className="bg-card/60 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleting(note);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <PaginationControl {...controlProps} sizes={[12, 24, 48]} />

      <NoteDeleteDialog
        noteKey={deleting ? noteKey("free", deleting.id) : null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Catatan?"
        description="Catatan ini akan dihapus permanen."
        itemName={deleting?.title || "Tanpa Judul"}
        onConfirm={() => {
          const note = deleting;
          setDeleting(null);
          if (!note) return;
          // Gambar di dokumen ikut dihapus — dokumen lengkap diambil dulu (daftar hanya memuat versi ringan)
          void fetchCompleteItem("free_note", note)
            .then((full) => {
              setItems((prev) => prev.filter((n) => n.id !== note.id));
              removeUploads(docUploadIds(full.doc));
            })
            .catch((error: unknown) => toast.error("Gagal menghapus catatan", { description: errorMessage(error) }));
        }}
      />
    </div>
  );
}
