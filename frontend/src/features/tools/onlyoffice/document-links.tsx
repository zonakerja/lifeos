import { FileCheck2, FileSignature, Link2, Link2Off, Search, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { previewFile } from "@/components/common/file-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { useResources } from "@/data/collections";
import { queryKeys } from "@/data/query-keys";
import { useOfficeLinks } from "@/data/use-office";
import { errorMessage } from "@/lib/api/client";
import { officeApi, uploadsApi } from "@/lib/api/endpoints";
import { generateId } from "@/lib/ids";
import { formatNumericDate } from "@/lib/dates";
import { useAuthStore } from "@/stores/auth-store";
import type { OfficeLinkedFile } from "@/types/api";
import { fileControlStatus } from "@/features/resources/file-control-intake";
import { useQuery, useQueryClient } from "@tanstack/react-query";

/** Konteks upload dokumen final (PDF bertanda tangan) yang diunggah dari konsepnya. */
export const FINAL_UPLOAD_CONTEXT = "office-final";
/** Tag asal Resource Global yang dibuat dari "Unggah dokumen final". */
export const FINAL_CONTEXT_TAG = "Dokumen Final";

const stripExt = (name: string) => name.replace(/\.[^.]+$/, "");

/**
 * Tautan konsep ↔ dokumen final (keputusan user): konsep = dokumen ONLYOFFICE (surat, nota dinas, …), final = berkas
 * hasil tanda tangan (biasanya PDF, manual/elektronik). Keduanya disimpan dan saling tertaut agar mudah ditelusuri.
 * Tombol + popover dipasang di header pratinjau berkas dan editor ONLYOFFICE.
 */
export function DocumentLinksButton({ uploadId, name }: { uploadId: string; name: string }) {
  const { data } = useOfficeLinks(uploadId);
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"upload" | "final" | "draft" | null>(null);
  if (!data || (!data.draftCapable && !data.draft && data.finals.length === 0 && !isFinalCandidate(name))) return null;

  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.officeLinksAll });
  const unlink = async (finalId: string) => {
    try {
      await officeApi.setDraft(finalId, null);
      toast.success("Tautan dilepas");
    } catch (err) {
      toast.error("Tautan gagal dilepas", { description: errorMessage(err) });
    } finally {
      void refresh();
    }
  };
  const view = (file: OfficeLinkedFile) => {
    setOpen(false);
    previewFile({ uploadId: file.id, name: file.originalName, mimeType: file.mimeType });
  };
  const count = data.finals.length + (data.draft ? 1 : 0);
  const openDialog = (next: "upload" | "final" | "draft") => {
    setOpen(false);
    setDialog(next);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="xs" title="Konsep & dokumen final">
            <Link2 /> <span className="hidden sm:inline">{data.draftCapable ? "Dokumen final" : "Konsep"}</span>
            {count > 0 && <Badge className="h-4 bg-module px-1 text-[10px] text-module-foreground">{count}</Badge>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 space-y-3">
          {data.draft && (
            <section className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">Konsep dokumen ini</p>
              <LinkedRow file={data.draft} icon={FileSignature} onView={view} onUnlink={() => void unlink(uploadId)} />
            </section>
          )}
          {data.draftCapable && (
            <section className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">Dokumen final (setelah ditandatangani)</p>
              {data.finals.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Belum ada. Unggah PDF bertanda tangan atau tautkan berkas yang ada.
                </p>
              ) : (
                data.finals.map((file) => (
                  <LinkedRow
                    key={file.id}
                    file={file}
                    icon={FileCheck2}
                    onView={view}
                    onUnlink={() => void unlink(file.id)}
                  />
                ))
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="xs" onClick={() => openDialog("upload")}>
                  <Upload /> Unggah dokumen final
                </Button>
                <Button size="xs" variant="outline" onClick={() => openDialog("final")}>
                  <Link2 /> Tautkan berkas
                </Button>
              </div>
            </section>
          )}
          {!data.draftCapable && !data.draft && (
            <section className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Berkas ini belum tertaut ke konsep. Tautkan bila ini dokumen final (mis. hasil tanda tangan) dari konsep
                di LifeOS.
              </p>
              <Button size="xs" variant="outline" onClick={() => openDialog("draft")}>
                <Link2 /> Tautkan ke konsep
              </Button>
            </section>
          )}
        </PopoverContent>
      </Popover>

      <UploadFinalDialog
        open={dialog === "upload"}
        onOpenChange={(value) => !value && setDialog(null)}
        draftId={uploadId}
        draftName={name}
        draftOwnerId={data.ownerId}
        onDone={refresh}
      />
      <LinkExistingDialog
        open={dialog === "final" || dialog === "draft"}
        onOpenChange={(value) => !value && setDialog(null)}
        role={dialog === "draft" ? "draft" : "final"}
        currentId={uploadId}
        onDone={refresh}
      />
    </>
  );
}

/** PDF/gambar tanpa tautan tetap menampilkan tombol "Tautkan ke konsep". */
const isFinalCandidate = (name: string) => /\.(pdf|png|jpe?g|tiff?)$/i.test(name);

function LinkedRow({
  file,
  icon: Icon,
  onView,
  onUnlink,
}: {
  file: OfficeLinkedFile;
  icon: typeof Link2;
  onView: (file: OfficeLinkedFile) => void;
  onUnlink: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border p-1.5">
      <Icon className="size-4 shrink-0 text-module" />
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
        title={`Lihat ${file.originalName}`}
        onClick={() => onView(file)}
      >
        {file.originalName}
      </button>
      <span className="shrink-0 text-[10px] text-muted-foreground">{formatNumericDate(file.createdAt)}</span>
      <Button variant="ghost" size="icon-xs" title="Lepas tautan (berkas tidak dihapus)" onClick={onUnlink}>
        <Link2Off />
      </Button>
    </div>
  );
}

/**
 * Unggah dokumen final dari konsepnya: berkas disimpan di ruang pemilik konsep, ditautkan, lalu dijadikan Resource
 * Global (keputusan user) dengan centang "Masukkan ke File Control" tercentang otomatis.
 */
function UploadFinalDialog({
  open,
  onOpenChange,
  draftId,
  draftName,
  draftOwnerId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftId: string;
  draftName: string;
  draftOwnerId: string;
  onDone: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <UploadFinalForm
            draftId={draftId}
            draftName={draftName}
            draftOwnerId={draftOwnerId}
            onDone={onDone}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UploadFinalForm({
  draftId,
  draftName,
  draftOwnerId,
  onDone,
  onClose,
}: {
  draftId: string;
  draftName: string;
  /** Pemilik konsep: final disimpan di ruangnya (konsep milik user lain lewat berbagi Edit) agar pemilik bisa membukanya */
  draftOwnerId: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const userId = useAuthStore((state) => state.user?.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(() => `${stripExt(draftName)} (final)`);
  const [toFileControl, setToFileControl] = useState(true);
  const [busy, setBusy] = useState(false);
  const { setItems: setResources } = useResources();

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const asset = await uploadsApi.upload(
        file,
        FINAL_UPLOAD_CONTEXT,
        draftOwnerId && draftOwnerId !== userId ? draftOwnerId : undefined,
      );
      try {
        await officeApi.setDraft(asset.id, draftId);
      } catch (err) {
        // Tautan ditolak → berkas yang baru diunggah dibuang agar tidak menjadi sampah di storage
        await uploadsApi.remove(asset.id).catch(() => undefined);
        throw err;
      }
      const now = new Date().toISOString();
      setResources((prev) => [
        ...prev,
        {
          id: generateId("res"),
          title: title.trim() || stripExt(file.name),
          type: "file",
          uploadId: asset.id,
          mimeType: asset.mimeType,
          date: now,
          createdAt: now,
          tags: [FINAL_CONTEXT_TAG],
          content: `Dokumen final dari konsep "${draftName}".`,
          ...(toFileControl ? { archivalStatus: fileControlStatus(undefined, true) } : {}),
        },
      ]);
      toast.success("Dokumen final ditautkan", {
        description: toFileControl
          ? "Tersimpan di Resource Global dan masuk File Control (Gantung)."
          : "Tersimpan di Resource Global.",
      });
      onDone();
      onClose();
    } catch (err) {
      toast.error("Dokumen final gagal disimpan", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Unggah dokumen final</DialogTitle>
        <DialogDescription className="truncate">Konsep: {draftName}</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,image/*,.docx,.xlsx,.pptx,.odt"
          className="hidden"
          onChange={(event) => {
            const picked = event.target.files?.[0] ?? null;
            event.target.value = "";
            setFile(picked);
          }}
        />
        <Button variant="outline" className="w-full justify-start" onClick={() => inputRef.current?.click()}>
          <Upload />{" "}
          <span className="truncate">{file ? file.name : "Pilih berkas (PDF bertanda tangan, pindaian, …)"}</span>
        </Button>
        <div className="space-y-1.5">
          <Label htmlFor="final-title">Nama Resource</Label>
          <Input id="final-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={toFileControl} onCheckedChange={(value) => setToFileControl(value === true)} />
          Masukkan ke File Control
        </Label>
        <p className="text-xs text-muted-foreground">
          Dokumen final menjadi Resource Global bertag "{FINAL_CONTEXT_TAG}" dan tertaut ke konsepnya; konsep tetap
          tersimpan.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Batal
        </Button>
        <Button onClick={() => void submit()} disabled={!file || busy}>
          {busy && <Spinner />} Simpan & tautkan
        </Button>
      </DialogFooter>
    </>
  );
}

/** Pilih berkas yang sudah ada: dokumen final untuk konsep ini (`final`), atau konsep untuk berkas final ini (`draft`). */
function LinkExistingDialog({
  open,
  onOpenChange,
  role,
  currentId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: "draft" | "final";
  currentId: string;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { data: candidates = [], isFetching } = useQuery({
    queryKey: ["office", "links", "candidates", role, query.trim()],
    queryFn: () => officeApi.linkCandidates(role, query.trim() || undefined),
    enabled: open,
  });

  const choose = async (file: OfficeLinkedFile) => {
    setBusy(file.id);
    try {
      // role "final": berkas terpilih = final dari konsep ini; role "draft": berkas ini = final dari konsep terpilih
      if (role === "final") await officeApi.setDraft(file.id, currentId);
      else await officeApi.setDraft(currentId, file.id);
      toast.success("Dokumen ditautkan");
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error("Dokumen gagal ditautkan", { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{role === "final" ? "Tautkan dokumen final" : "Tautkan ke konsep"}</DialogTitle>
          <DialogDescription>
            {role === "final"
              ? "Pilih berkas di LifeOS (mis. PDF bertanda tangan) yang merupakan versi final konsep ini."
              : "Pilih konsep (dokumen ONLYOFFICE) dari berkas final ini."}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Cari nama berkas..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {candidates
            .filter((file) => file.id !== currentId)
            .map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  disabled={!!busy}
                  className="flex w-full min-w-0 items-center gap-2 rounded-lg border p-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                  onClick={() => void choose(file)}
                >
                  {busy === file.id ? <Spinner /> : <Link2 className="size-4 shrink-0 text-module" />}
                  <span className="min-w-0 flex-1 truncate font-medium">{file.originalName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatNumericDate(file.updatedAt)}</span>
                </button>
              </li>
            ))}
          {!isFetching && candidates.filter((file) => file.id !== currentId).length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">Tidak ada berkas yang cocok.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** Penanda kecil di tabel: konsep yang sudah punya final / dokumen final dari sebuah konsep. */
export function DocumentLinkBadge({ link }: { link?: { draftId: string | null; finals: number } }) {
  if (!link) return null;
  if (link.finals > 0) {
    return (
      <Badge className="gap-1 bg-success/15 text-[10px] text-success" title="Konsep ini sudah punya dokumen final">
        <FileCheck2 className="size-3" /> Final{link.finals > 1 ? ` ×${link.finals}` : ""}
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 bg-info/15 text-[10px] text-info" title="Dokumen final — tertaut ke konsepnya">
      <FileSignature className="size-3" /> Dari konsep
    </Badge>
  );
}
