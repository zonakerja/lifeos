import {
  ChevronLeft,
  FileText,
  MessageSquareText,
  MoreVertical,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { IconPicker } from "@/components/common/icon-picker";
import { PageLoader } from "@/components/common/page-loader";
import { SearchInput } from "@/components/common/search-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateNotebook,
  useDeleteNotebook,
  useNotebook,
  useNotebooks,
  useUpdateNotebook,
} from "@/data/use-notebooks";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSearchParam } from "@/hooks/use-search-param";
import { useToday } from "@/hooks/use-today";
import { errorMessage } from "@/lib/api/client";
import { formatRelative } from "@/lib/dates";
import { getAppIcon } from "@/lib/icons/icon-registry";
import type { NotebookDetail, NotebookListItem } from "@/types/api";
import { ChatPanel, useNotebookAsker } from "./chat-panel";
import { SourcesPanel } from "./sources-panel";
import { NotesPanel, SummaryCard } from "./notebook-panels";

const DEFAULT_ICON = "book-open";

/** Tab My Notebook (Notes Space): daftar notebook, atau satu notebook bila `?notebook=<id>`. */
export default function NotebookTab() {
  const [notebookId, setNotebookId] = useSearchParam("notebook");
  return notebookId ? (
    <NotebookView key={notebookId} id={notebookId} onBack={() => setNotebookId(null)} />
  ) : (
    <NotebookList onOpen={(id) => setNotebookId(id, { replace: false })} />
  );
}

// ---------------------------------------------------------------------------- Daftar

function NotebookList({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: notebooks = [], isLoading } = useNotebooks();
  const remove = useDeleteNotebook();
  const now = useToday();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<NotebookListItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<NotebookListItem | null>(null);
  const q = query.trim().toLowerCase();
  const visible = notebooks.filter((n) => !q || `${n.title} ${n.description ?? ""}`.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border bg-module-soft/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-bold">
            <Sparkles className="size-4 text-module" /> My Notebook
          </h3>
          <p className="text-sm text-muted-foreground">
            Kumpulkan dokumen, catatan, dan halaman web dalam satu notebook, lalu tanyakan apa saja — AI menjawab hanya
            dari sumber Anda, lengkap dengan rujukannya.
          </p>
        </div>
        <Button className="shrink-0" onClick={() => setEditing("new")}>
          <Plus /> Notebook Baru
        </Button>
      </div>

      {notebooks.length > 0 && (
        <SearchInput value={query} onChange={setQuery} placeholder="Cari notebook…" className="md:w-72" />
      )}

      {isLoading ? (
        <PageLoader />
      ) : visible.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="bg-module-soft text-module">
              <Sparkles />
            </EmptyMedia>
            <EmptyTitle>{q ? "Tidak ada notebook yang cocok." : "Belum ada notebook."}</EmptyTitle>
            {!q && (
              <EmptyDescription>
                Contoh: "Regulasi Kearsipan", "Materi Kuliah Statistik", atau "Riset Program Kerja 2027".
              </EmptyDescription>
            )}
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((notebook) => {
            const Icon = getAppIcon(notebook.icon, DEFAULT_ICON).icon;
            return (
              <div
                key={notebook.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(notebook.id)}
                onKeyDown={(e) => e.key === "Enter" && onOpen(notebook.id)}
                className="group relative flex cursor-pointer flex-col gap-3 rounded-2xl border bg-card p-5 transition-all hover:border-module/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-module-soft text-module">
                    <Icon className="size-5" />
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Aksi notebook"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onSelect={() => setEditing(notebook)}>
                        <PencilLine /> Ubah
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(notebook)}>
                        <Trash2 /> Hapus
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="min-w-0">
                  <h4 className="line-clamp-2 text-lg font-bold">{notebook.title}</h4>
                  {notebook.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{notebook.description}</p>
                  )}
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="size-3.5" /> {notebook._count.sources} sumber
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquareText className="size-3.5" /> {notebook._count.messages} pesan
                  </span>
                  <span className="ml-auto">{formatRelative(notebook.updatedAt, now)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NotebookFormDialog
        notebook={editing}
        onClose={() => setEditing(null)}
        onCreated={(id) => {
          setEditing(null);
          onOpen(id);
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Notebook?"
        description="Notebook beserta riwayat chat, catatan, dan berkas yang diunggah langsung ke notebook (termasuk lampiran chat) dihapus permanen. Item LifeOS dan berkas LifeOS yang dipakai sebagai sumber (catatan, Notes AI, resource, PDF, dsb.) tetap utuh."
        itemName={deleting?.title}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting)
            remove.mutate(deleting.id, {
              onSuccess: () => toast.success("Notebook dihapus."),
              onError: (error) => toast.error("Gagal menghapus notebook", { description: errorMessage(error) }),
            });
          setDeleting(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------- Form

type NotebookFields = Pick<NotebookListItem, "id" | "title" | "description" | "icon">;

function NotebookFormDialog({
  notebook,
  onClose,
  onCreated,
}: {
  notebook: NotebookFields | "new" | null;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  return (
    <Dialog open={!!notebook} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{notebook === "new" ? "Notebook Baru" : "Ubah Notebook"}</DialogTitle>
          <DialogDescription>
            Satu notebook untuk satu topik — sumber dan chat-nya terpisah dari notebook lain.
          </DialogDescription>
        </DialogHeader>
        {notebook && (
          <NotebookForm
            key={notebook === "new" ? "new" : notebook.id}
            notebook={notebook === "new" ? null : notebook}
            onDone={onClose}
            onCreated={onCreated}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NotebookForm({
  notebook,
  onDone,
  onCreated,
}: {
  notebook: NotebookFields | null;
  onDone: () => void;
  onCreated?: (id: string) => void;
}) {
  const create = useCreateNotebook();
  const update = useUpdateNotebook(notebook?.id ?? "");
  const [title, setTitle] = useState(notebook?.title ?? "");
  const [description, setDescription] = useState(notebook?.description ?? "");
  const [icon, setIcon] = useState(notebook?.icon ?? DEFAULT_ICON);
  const busy = create.isPending || update.isPending;

  const submit = () => {
    const input = { title: title.trim(), description: description.trim(), icon };
    const onError = (error: unknown) => toast.error("Gagal menyimpan notebook", { description: errorMessage(error) });
    if (notebook) {
      update.mutate({ ...input, description: input.description || null }, { onSuccess: onDone, onError });
    } else {
      create.mutate(
        { ...input, description: input.description || undefined },
        { onSuccess: (created) => (onCreated ? onCreated(created.id) : onDone()), onError },
      );
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) submit();
      }}
    >
      <div className="flex items-end gap-3">
        <Field className="w-auto">
          <FieldLabel>Ikon</FieldLabel>
          <IconPicker value={icon} onChange={setIcon} aiSubject={title} aiContext="notebook riset / belajar" />
        </Field>
        <Field className="flex-1">
          <FieldLabel htmlFor="nb-title">Judul</FieldLabel>
          <Input
            id="nb-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="mis. Regulasi Kearsipan"
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="nb-desc">Deskripsi (opsional)</FieldLabel>
        <Textarea id="nb-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={!title.trim() || busy}>
          {busy && <Spinner />} {notebook ? "Simpan" : "Buat Notebook"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------- Satu notebook

type Panel = "sources" | "chat";

function NotebookView({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: notebook, isLoading, error } = useNotebook(id);
  const [panel, setPanel] = useState<Panel>("chat");
  const [editing, setEditing] = useState(false);
  const asker = useNotebookAsker(id);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const wide = useMediaQuery("(min-width: 1024px)");
  const headerRef = useRef<HTMLDivElement>(null);
  const loaded = !!notebook;

  // Laptop: gulir halaman sampai judul notebook di atas agar area kerja (Sumber, Studio, Chat) memenuhi layar.
  // Isi di atasnya (statistik hero, dsb.) bisa selesai dimuat belakangan dan menggeser posisi → selama 3 detik pertama
  // penjajaran diulang setiap tata letak berubah, kecuali user sudah menggulir sendiri.
  useEffect(() => {
    if (!loaded || !wide) return;
    const scroller = document.scrollingElement ?? document.documentElement;
    let expected: number | null = null;
    const align = () => {
      if (expected !== null && Math.abs(scroller.scrollTop - expected) > 2) return; // user menggulir sendiri
      headerRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
      expected = scroller.scrollTop;
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(document.body);
    const timer = setTimeout(() => observer.disconnect(), 3000);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [loaded, wide]);

  if (isLoading) return <PageLoader label="Membuka notebook…" />;
  if (!notebook) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyTitle>Notebook tidak ditemukan</EmptyTitle>
          <EmptyDescription>{error ? errorMessage(error) : "Notebook mungkin sudah dihapus."}</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft /> Kembali ke daftar
        </Button>
      </Empty>
    );
  }

  const Icon = getAppIcon(notebook.icon, DEFAULT_ICON).icon;
  const ask = (question: string) => {
    setPanel("chat");
    asker.ask(question);
  };
  const openSource = (sourceId: string) => {
    setHighlightId(sourceId);
    setPanel("sources");
  };

  // Kolom kiri: Sumber dan Studio sebagai dua panel terpisah, masing-masing dengan scroll sendiri
  const panelClass = "flex min-h-0 min-w-0 flex-col rounded-2xl border bg-card/40 p-3";
  const side = wide ? (
    <div className="grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,11fr)_minmax(0,9fr)] gap-3">
      <div className={panelClass}>
        <SourcesPanel notebookId={notebook.id} sources={notebook.sources} highlightId={highlightId} fill />
      </div>
      <div className={panelClass}>
        <NotesPanel notebook={notebook} fill />
      </div>
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      <div className={panelClass}>
        <SourcesPanel notebookId={notebook.id} sources={notebook.sources} highlightId={highlightId} />
      </div>
      <div className={panelClass}>
        <NotesPanel notebook={notebook} />
      </div>
    </div>
  );
  const chat = (
    <ChatPanel
      notebookId={notebook.id}
      sources={notebook.sources}
      renderSummary={(hasMessages) => <SummaryCard notebook={notebook} onAsk={ask} defaultOpen={!hasMessages} />}
      asker={asker}
      onOpenSource={openSource}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div ref={headerRef} className="flex scroll-mt-[9.5rem] items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Kembali ke daftar notebook" onClick={onBack}>
          <ChevronLeft />
        </Button>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-module-soft text-module">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold">{notebook.title}</h3>
          {notebook.description && <p className="truncate text-xs text-muted-foreground">{notebook.description}</p>}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Ubah notebook" onClick={() => setEditing(true)}>
          <PencilLine />
        </Button>
      </div>

      {/* Satu tata letak saja yang dirender (panel chat tidak boleh terpasang dua kali) */}
      {wide ? (
        // Desktop: dua kolom — Sumber + Studio | Chat (lebar, dengan ringkasan di atasnya). Tinggi = layar dikurangi
        // header aplikasi & judul notebook, sehingga di laptop biasa (± 650 px) Sumber dan Studio sama-sama terlihat
        <div className="grid h-[calc(100svh-13.25rem)] min-h-[26rem] grid-cols-[18rem_minmax(0,1fr)] gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="min-h-0 min-w-0">{side}</div>
          <div className="flex min-h-0 flex-col">{chat}</div>
        </div>
      ) : (
        // HP & tablet: tab
        <Tabs value={panel} onValueChange={(v) => setPanel(v as Panel)}>
          <TabsList className="w-full">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="sources">Sumber ({notebook.sources.length}) & Studio</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="flex flex-col">
            {chat}
          </TabsContent>
          <TabsContent value="sources">{side}</TabsContent>
        </Tabs>
      )}

      <NotebookFormDialog
        notebook={editing ? (notebook satisfies NotebookDetail) : null}
        onClose={() => setEditing(false)}
      />
    </div>
  );
}
