import {
  BookmarkPlus,
  ChevronDown,
  Eye,
  FileOutput,
  Lightbulb,
  MoreVertical,
  NotebookText,
  PencilLine,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Markdown } from "@/components/common/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useNotebookNoteMutations, useNotebookNotes, useSummarizeNotebook } from "@/data/use-notebooks";
import { AI_NOT_CONFIGURED, useAi } from "@/lib/ai/use-ai";
import { ApiError, errorMessage } from "@/lib/api/client";
import { formatDateTime, formatDayMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { NotebookDetail, NotebookNote } from "@/types/api";
import { readySources, shortTitle, summaryToNote } from "./notebook-utils";
import { useSendToFreeNotes } from "./use-send-to-free-notes";

const ORIGIN_LABEL: Record<NotebookNote["origin"], string> = {
  chat: "Dari chat",
  summary: "Ringkasan",
  manual: "Manual",
};

/**
 * Ringkasan notebook (ikhtisar, poin kunci, saran pertanyaan) — tampil di bagian atas chat. Bisa dilipat agar ruang
 * percakapan tetap lega; terbuka otomatis saat chat masih kosong.
 */
export function SummaryCard({
  notebook,
  onAsk,
  defaultOpen,
}: {
  notebook: NotebookDetail;
  onAsk: (question: string) => void;
  defaultOpen: boolean;
}) {
  const ai = useAi();
  const summarize = useSummarizeNotebook(notebook.id);
  const noteMutations = useNotebookNoteMutations(notebook.id);
  const [open, setOpen] = useState(defaultOpen);
  const ready = readySources(notebook.sources);
  const { summary } = notebook;

  const generate = () => {
    if (!ai.isConfigured) {
      toast.error("AI belum diatur", { description: AI_NOT_CONFIGURED });
      return;
    }
    setOpen(true);
    summarize.mutate(undefined, {
      onError: (error) => {
        const quota = error instanceof ApiError && error.status === 429;
        toast.error(quota ? "Limit API Tercapai ⚠️" : "Gagal membuat ringkasan", { description: errorMessage(error) });
      },
    });
  };

  const saveSummary = () =>
    summary &&
    noteMutations.create.mutate(summaryToNote(notebook.title, summary), {
      onSuccess: () => toast.success("Ringkasan disimpan ke catatan notebook."),
      onError: (error) => toast.error("Gagal menyimpan", { description: errorMessage(error) }),
    });

  if (!summary) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-dashed bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-module" />
          {ready.length
            ? "Buat ringkasan: ikhtisar, poin kunci, dan saran pertanyaan dari seluruh sumber yang aktif."
            : "Ringkasan bisa dibuat setelah ada minimal satu sumber yang siap."}
        </p>
        <Button size="sm" className="shrink-0" disabled={summarize.isPending || !ready.length} onClick={generate}>
          {summarize.isPending ? (
            <>
              <Spinner /> Membaca sumber…
            </>
          ) : (
            <>
              <Sparkles /> Buat ringkasan
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-2xl border bg-card">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Sparkles className="size-4 shrink-0 text-module" />
          <span className="shrink-0 text-sm font-bold">Ringkasan notebook</span>
          {!open && (
            <span className="truncate text-xs text-muted-foreground">{summary.overview.replace(/[*#_`]/g, "")}</span>
          )}
          <ChevronDown className={cn("ml-auto size-4 shrink-0 transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
        {notebook.summaryStale && (
          <Badge className="bg-warning/20 text-warning-foreground dark:text-warning">Usang</Badge>
        )}
      </div>
      <CollapsibleContent className="flex flex-col gap-3 border-t px-4 pt-3 pb-4">
        <Markdown content={summary.overview} />
        {summary.keyPoints.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase">
              <Lightbulb className="size-3.5" /> Poin kunci
            </p>
            <Markdown content={summary.keyPoints.map((p) => `- ${p}`).join("\n")} />
          </div>
        )}
        {summary.questions.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-bold text-muted-foreground uppercase">Tanyakan</p>
            <div className="flex flex-wrap gap-1.5">
              {summary.questions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onAsk(q);
                  }}
                  className="rounded-full border bg-muted/40 px-3 py-1.5 text-left text-xs transition-colors hover:border-module hover:text-module"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs" variant="outline" disabled={summarize.isPending || !ready.length} onClick={generate}>
            {summarize.isPending ? <Spinner /> : <RefreshCw />} Perbarui
          </Button>
          <Button size="xs" variant="ghost" disabled={noteMutations.create.isPending} onClick={saveSummary}>
            <BookmarkPlus /> Simpan ke catatan
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {notebook.summaryAt && `Dibuat ${formatDateTime(notebook.summaryAt)}`}
            {notebook.summaryStale && " · sumber sudah berubah sejak ringkasan dibuat"}
          </span>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Studio: catatan hasil notebook (disimpan dari chat/ringkasan atau ditulis sendiri) — tampil di bawah daftar sumber,
 * dengan scroll sendiri.
 */
export function NotesPanel({ notebook, fill = false }: { notebook: NotebookDetail; fill?: boolean }) {
  const { data: notes = [] } = useNotebookNotes(notebook.id);
  const noteMutations = useNotebookNoteMutations(notebook.id);
  const sendToFreeNotes = useSendToFreeNotes();
  const [editing, setEditing] = useState<NotebookNote | "new" | null>(null);
  const [deleting, setDeleting] = useState<NotebookNote | null>(null);

  return (
    <section className={cn("flex min-h-0 flex-col gap-2", fill && "h-full")}>
      <div className="flex items-center gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-bold">
          <NotebookText className="size-4 shrink-0 text-module" /> Studio
        </h3>
        <span className="truncate text-[11px] text-muted-foreground">{notes.length} catatan</span>
        <Button size="xs" variant="outline" className="ml-auto shrink-0" onClick={() => setEditing("new")}>
          <Plus /> Catatan
        </Button>
      </div>
      {notes.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
          Simpan jawaban chat atau ringkasan ke sini, atau tulis catatan sendiri.
        </p>
      ) : (
        // Digulir di dalam panel Studio (HP: maks. ± 4 catatan terlihat)
        <ul className={cn("flex flex-col gap-1 overflow-y-auto pr-0.5", fill ? "min-h-0 flex-1" : "max-h-[15.5rem]")}>
          {notes.map((note) => (
            <li key={note.id} className="flex shrink-0 items-center gap-2 rounded-lg border bg-card px-2 py-1">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                title={`${note.title}\n${ORIGIN_LABEL[note.origin]} · ${formatDateTime(note.updatedAt)}`}
                onClick={() => setEditing(note)}
              >
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{note.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{formatDayMonth(note.updatedAt)}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label="Aksi catatan">
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(note)}>
                    <PencilLine /> Buka / ubah
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void sendToFreeNotes(note.title, note.content)}>
                    <FileOutput /> Salin ke Catatan Bebas
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(note)}>
                    <Trash2 /> Hapus
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <NoteDialog notebookId={notebook.id} note={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Catatan Notebook?"
        description="Catatan ini dihapus permanen. Salinan yang sudah dikirim ke Catatan Bebas tidak terpengaruh."
        itemName={deleting?.title}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting)
            noteMutations.remove.mutate(deleting.id, {
              onError: (error) => toast.error("Gagal menghapus", { description: errorMessage(error) }),
            });
          setDeleting(null);
        }}
      />
    </section>
  );
}

function NoteDialog({
  notebookId,
  note,
  onClose,
}: {
  notebookId: string;
  note: NotebookNote | "new" | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!note} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-2xl">
        {/* Di-mount ulang setiap dibuka → state awal dari catatan yang dipilih */}
        {note && (
          <NoteForm
            key={note === "new" ? "new" : note.id}
            notebookId={notebookId}
            note={note === "new" ? null : note}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NoteForm({ notebookId, note, onDone }: { notebookId: string; note: NotebookNote | null; onDone: () => void }) {
  const { create, update } = useNotebookNoteMutations(notebookId);
  const sendToFreeNotes = useSendToFreeNotes();
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [mode, setMode] = useState<"view" | "edit">(note ? "view" : "edit");
  const busy = create.isPending || update.isPending;
  const finalTitle = title.trim() || shortTitle(content) || "Catatan";

  const save = () => {
    const onError = (error: unknown) => toast.error("Gagal menyimpan", { description: errorMessage(error) });
    if (note) update.mutate({ noteId: note.id, title: finalTitle, content }, { onSuccess: onDone, onError });
    else create.mutate({ title: finalTitle, content, origin: "manual" }, { onSuccess: onDone, onError });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{note ? "Catatan Notebook" : "Catatan Baru"}</DialogTitle>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="nb-note-title">Judul</FieldLabel>
        <Input id="nb-note-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">Isi (Markdown)</span>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={mode}
          onValueChange={(v) => v && setMode(v as "view" | "edit")}
        >
          <ToggleGroupItem value="view">
            <Eye /> Lihat
          </ToggleGroupItem>
          <ToggleGroupItem value="edit">
            <PencilLine /> Ubah
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "view" ? (
          <div className="rounded-xl border p-4">
            {content.trim() ? (
              <Markdown content={content} />
            ) : (
              <p className="text-sm text-muted-foreground italic">Kosong.</p>
            )}
          </div>
        ) : (
          <Textarea
            rows={14}
            aria-label="Isi catatan"
            className="font-mono text-sm"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        )}
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        <Button variant="ghost" disabled={!content.trim()} onClick={() => void sendToFreeNotes(finalTitle, content)}>
          <FileOutput /> Salin ke Catatan Bebas
        </Button>
        <Button disabled={busy || !content.trim()} onClick={save}>
          {busy && <Spinner />} Simpan
        </Button>
      </DialogFooter>
    </>
  );
}
