import { ArrowLeft, ArrowRight, FileText, Link2, Paperclip, TriangleAlert } from "lucide-react";
import { create } from "zustand";
import { previewFile } from "@/components/common/file-preview";
import { Markdown } from "@/components/common/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useKnowledgeNote } from "@/data/use-knowledge";
import { errorMessage } from "@/lib/api/client";
import type { KnowledgeNoteRef } from "@/types/api";
import { noteDisplayMarkdown, STATUS_LABEL, STATUS_TONE } from "./knowledge-utils";

/**
 * Lihat catatan basis pengetahuan (vault Obsidian) dari mana saja: `openKnowledgeNote(id)` — dipakai sitasi chatbot &
 * daftar catatan Tools → Basis Pengetahuan. Catatan hanya dibaca di sini; menyunting tetap di Obsidian.
 */
const useKnowledgeNoteStore = create<{ id: string | null; set: (id: string | null) => void }>((set) => ({
  id: null,
  set: (id) => set({ id }),
}));

export const openKnowledgeNote = (id: string) => useKnowledgeNoteStore.getState().set(id);

/** Dipasang sekali di AppShell. */
export function KnowledgeNoteHost() {
  const id = useKnowledgeNoteStore((s) => s.id);
  const set = useKnowledgeNoteStore((s) => s.set);
  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && set(null)}>
      <DialogContent className="flex max-h-[90svh] flex-col gap-3 sm:max-w-2xl">
        {id && <NoteBody key={id} id={id} onOpen={set} />}
      </DialogContent>
    </Dialog>
  );
}

function NoteLinks({
  title,
  icon: Icon,
  items,
  onOpen,
}: {
  title: string;
  icon: typeof ArrowRight;
  items: { label: string; note: KnowledgeNoteRef | null }[];
  onOpen: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        <Icon className="size-3.5" /> {title} ({items.length})
      </p>
      <div className="flex flex-wrap gap-1">
        {items.map(({ label, note }, i) =>
          note ? (
            <Button key={`${note.id}-${i}`} variant="outline" size="xs" onClick={() => onOpen(note.id)}>
              <Link2 /> {note.title}
            </Button>
          ) : (
            <Badge key={`${label}-${i}`} variant="outline" className="text-warning" title="Catatan tujuan belum ada">
              {label}
            </Badge>
          ),
        )}
      </div>
    </div>
  );
}

function NoteBody({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const { data: note, isLoading, error } = useKnowledgeNote(id);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <DialogTitle className="sr-only">Memuat catatan</DialogTitle>
        <Spinner />
      </div>
    );
  }
  if (!note) {
    return (
      <DialogHeader>
        <DialogTitle>Catatan tidak ditemukan</DialogTitle>
        <DialogDescription>
          {error ? errorMessage(error) : "Catatan mungkin sudah dihapus dari vault."}
        </DialogDescription>
      </DialogHeader>
    );
  }

  const status = note.metadata.status;
  return (
    <>
      <DialogHeader className="min-w-0">
        <DialogTitle className="flex items-center gap-2 pr-6">
          <FileText className="size-4 shrink-0 text-module" />
          <span className="truncate">{note.title}</span>
        </DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-mono text-[11px]">{note.path}</span>
          {note.metadata.jenis && <Badge variant="secondary">{note.metadata.jenis}</Badge>}
          {status && <Badge className={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>}
          {note.metadata.publik !== undefined && (
            <Badge variant="outline">{note.metadata.publik ? "Publik" : "Internal"}</Badge>
          )}
          {note.metadata.diperbarui && <span className="text-[11px]">Diperbarui {note.metadata.diperbarui}</span>}
        </DialogDescription>
      </DialogHeader>

      {!!note.problems.length && (
        <p className="flex items-start gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {note.problems.join(" · ")}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-muted/20 p-4">
        {note.kind === "file" ? (
          <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
            <p>Berkas lampiran vault — isinya dibaca server dan ikut diindeks sebagai pengetahuan.</p>
            {note.assetId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => previewFile({ uploadId: note.assetId!, name: note.title })}
              >
                <Paperclip /> Lihat berkas
              </Button>
            )}
          </div>
        ) : note.content?.trim() ? (
          <Markdown content={noteDisplayMarkdown(note.content)} />
        ) : (
          <p className="text-sm text-muted-foreground">Catatan kosong.</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <NoteLinks
          title="Tautan keluar"
          icon={ArrowRight}
          items={note.linksOut.map((l) => ({ label: l.target, note: l.note }))}
          onOpen={onOpen}
        />
        <NoteLinks
          title="Ditautkan dari"
          icon={ArrowLeft}
          items={note.backlinks.map((l) => ({ label: l.note.title, note: l.note }))}
          onOpen={onOpen}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">Sunting catatan ini di Obsidian — perubahan terbaca otomatis.</p>
    </>
  );
}
