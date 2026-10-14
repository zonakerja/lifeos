import {
  AlertCircle,
  ExternalLink,
  Eye,
  FileSearch,
  Library,
  MoreVertical,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useResources } from "@/data/collections";
import { useNotebookSources } from "@/data/use-notebooks";
import { previewFile } from "@/components/common/file-preview";
import { openAttachment } from "@/features/resources/resource-utils";
import { links } from "@/lib/deep-links";
import { errorMessage } from "@/lib/api/client";
import { toExternalHref } from "@/lib/urls";
import { cn } from "@/lib/utils";
import type { NotebookSource } from "@/types/api";
import { AddSourceDialog } from "./add-source-dialog";
import { RECORD_TYPE_LABEL, readySources, SOURCE_KIND_META } from "./notebook-utils";

function StatusBadge({ source }: { source: NotebookSource }) {
  if (source.status === "processing")
    return (
      <Badge className="bg-warning/20 text-warning-foreground dark:text-warning">
        <Spinner className="size-3" /> Dibaca…
      </Badge>
    );
  if (source.status === "failed") return <Badge className="bg-destructive/12 text-destructive">Gagal</Badge>;
  if (source.status === "missing") return <Badge className="bg-destructive/12 text-destructive">Terhapus</Badge>;
  return null;
}

/** Tautan item LifeOS di menu asalnya (Catatan, Notes AI, List, Resource). */
const recordPath = (source: NotebookSource) => {
  const id = source.recordId ?? "";
  switch (source.recordType) {
    case "free_note":
      return links.note("free", id);
    case "ai_note":
      return links.note("ai", id);
    case "list":
      return links.list(id);
    case "para_resource":
      return links.resource(id);
    default:
      return null;
  }
};

/** Panel sumber: daftar, aktif/nonaktif (ikut dibaca AI atau tidak), buka dokumen, muat ulang, hapus. */
export function SourcesPanel({
  notebookId,
  sources,
  highlightId,
  fill = false,
}: {
  notebookId: string;
  sources: NotebookSource[];
  /** Sumber yang disorot (klik sitasi di chat) */
  highlightId?: string | null;
  /** Mengisi tinggi wadah; daftar digulir di dalam panel ini saja */
  fill?: boolean;
}) {
  const { update, refresh, remove } = useNotebookSources(notebookId);
  const { items: resources } = useResources();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [previewing, setPreviewing] = useState<NotebookSource | null>(null);
  const [deleting, setDeleting] = useState<NotebookSource | null>(null);
  const ready = readySources(sources);
  const allEnabled = sources.length > 0 && sources.every((s) => s.enabled);

  useEffect(() => {
    if (highlightId) document.querySelector(`[data-source-id="${highlightId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlightId]);

  /**
   * Klik sumber = buka dokumen aslinya: berkas → modal pratinjau, halaman web → tab baru, item LifeOS → menu asalnya
   * (resource berkas/link langsung dibuka). Hanya sumber teks tempelan yang ditampilkan isinya di sini.
   */
  const openSource = (source: NotebookSource) => {
    if (source.kind === "upload" && source.assetId) {
      previewFile({ uploadId: source.assetId, name: source.title, mimeType: source.mimeType });
    } else if (source.kind === "web" && source.url) {
      const href = toExternalHref(source.url);
      if (href) window.open(href, "_blank", "noopener,noreferrer");
    } else if (source.kind === "record" && source.status !== "missing") {
      const resource =
        source.recordType === "para_resource" ? resources.find((r) => r.id === source.recordId) : undefined;
      if (resource && (resource.uploadId || (resource.type === "link" && resource.url)))
        void openAttachment({ ...resource, name: resource.title });
      else {
        const path = recordPath(source);
        if (path) navigate(path);
      }
    } else {
      setPreviewing(source);
    }
  };

  const setEnabled = (source: NotebookSource, enabled: boolean) =>
    update.mutate(
      { sourceId: source.id, enabled },
      { onError: (error) => toast.error("Gagal mengubah sumber", { description: errorMessage(error) }) },
    );

  return (
    <section className={cn("flex min-h-0 flex-col gap-2", fill && "h-full")}>
      {/* Header satu baris: centang semua · judul · jumlah dipakai · Tambah */}
      <div className="flex items-center gap-2">
        {sources.length > 1 && (
          <Checkbox
            checked={allEnabled}
            aria-label="Pilih semua sumber"
            title="Pilih / lepas semua sumber"
            onCheckedChange={(checked) =>
              sources.filter((s) => s.enabled !== !!checked).forEach((s) => setEnabled(s, !!checked))
            }
          />
        )}
        <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-bold">
          <Library className="size-4 shrink-0 text-module" /> Sumber
        </h3>
        <span className="truncate text-[11px] text-muted-foreground" title="Sumber yang dipakai AI">
          {ready.length}/{sources.length} dipakai
        </span>
        <Button size="xs" className="ml-auto shrink-0" onClick={() => setAdding(true)}>
          <Plus /> Tambah
        </Button>
      </div>

      {sources.length === 0 ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:border-module hover:bg-module-soft hover:text-module"
        >
          <Plus className="size-6" />
          <span className="font-semibold">Tambahkan sumber pertama</span>
          <span className="text-xs">Berkas, catatan LifeOS, teks, atau halaman web</span>
        </button>
      ) : (
        // Digulir di dalam panel sumber (HP: maks. ± 5 sumber terlihat)
        <ul className={cn("flex flex-col gap-1 overflow-y-auto pr-0.5", fill ? "min-h-0 flex-1" : "max-h-[22rem]")}>
          {sources.map((source) => {
            const meta = SOURCE_KIND_META[source.kind];
            const Icon = meta.icon;
            return (
              <li
                key={source.id}
                data-source-id={source.id}
                className={cn(
                  "group flex shrink-0 items-center gap-2 rounded-lg border bg-card px-2 py-1 transition-colors",
                  !source.enabled && "opacity-60",
                  highlightId === source.id && "border-module ring-2 ring-module/40",
                )}
              >
                <Checkbox
                  checked={source.enabled}
                  onCheckedChange={(checked) => setEnabled(source, !!checked)}
                  aria-label={source.enabled ? "Jangan pakai sumber ini" : "Pakai sumber ini"}
                />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col text-left"
                  title={`${source.title}\n${source.recordType ? RECORD_TYPE_LABEL[source.recordType] : meta.label}`}
                  onClick={() => openSource(source)}
                >
                  {/* Satu baris: ikon jenis · judul · status (bila belum siap) */}
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Icon className="size-3.5 shrink-0 text-module" />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{source.title}</span>
                    <StatusBadge source={source} />
                  </span>
                  {source.error && (
                    <span className="mt-0.5 flex items-start gap-1 text-[10px] text-destructive">
                      <AlertCircle className="mt-px size-3 shrink-0" /> {source.error}
                    </span>
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-xs" aria-label="Aksi sumber">
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {source.kind === "text" ? (
                      <DropdownMenuItem onSelect={() => setPreviewing(source)}>
                        <Eye /> Lihat isi
                      </DropdownMenuItem>
                    ) : (
                      source.status !== "missing" && (
                        <DropdownMenuItem onSelect={() => openSource(source)}>
                          {source.kind === "upload" ? <FileSearch /> : <ExternalLink />}
                          {source.kind === "upload"
                            ? "Buka berkas"
                            : source.kind === "web"
                              ? "Buka halaman"
                              : `Buka di ${source.recordType ? RECORD_TYPE_LABEL[source.recordType] : "LifeOS"}`}
                        </DropdownMenuItem>
                      )
                    )}
                    {source.kind === "web" && source.url && (
                      <>
                        <DropdownMenuItem
                          disabled={refresh.isPending}
                          onSelect={() =>
                            refresh.mutate(source.id, {
                              onError: (error) =>
                                toast.error("Gagal memuat ulang", { description: errorMessage(error) }),
                            })
                          }
                        >
                          <RefreshCw /> Muat ulang
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(source)}>
                      <Trash2 /> Hapus sumber
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      <AddSourceDialog notebookId={notebookId} sources={sources} open={adding} onOpenChange={setAdding} />

      <Dialog open={!!previewing} onOpenChange={(open) => !open && setPreviewing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="pr-6">{previewing?.title}</DialogTitle>
            <DialogDescription>{previewing && SOURCE_KIND_META[previewing.kind].label}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60svh] overflow-y-auto rounded-xl bg-muted/50 p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {previewing?.preview ? (
              <>
                {previewing.preview}
                {previewing.chars > previewing.preview.length && (
                  <span className="mt-3 block text-xs text-muted-foreground italic">… (cuplikan awal)</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground italic">{previewing?.error ?? "Isi belum tersedia."}</span>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Sumber?"
        description={
          deleting?.kind === "upload" && deleting.ownedByNotebook
            ? "Sumber dan berkas yang diunggah ke notebook ini ikut dihapus. Riwayat chat & catatan tetap ada."
            : deleting?.kind === "upload" || deleting?.kind === "record"
              ? "Sumber dilepas dari notebook. Berkas/item aslinya di LifeOS tidak terhapus."
              : "Sumber dihapus dari notebook. Riwayat chat & catatan tetap ada."
        }
        itemName={deleting?.title}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting)
            remove.mutate(deleting.id, {
              onError: (error) => toast.error("Gagal menghapus sumber", { description: errorMessage(error) }),
            });
          setDeleting(null);
        }}
      />
    </section>
  );
}
