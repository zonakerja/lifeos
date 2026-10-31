import { useQuery } from "@tanstack/react-query";
import { FileText, Inbox, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { SearchInput } from "@/components/common/search-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryKeys } from "@/data/query-keys";
import { useRequests } from "@/data/use-requests";
import { errorMessage } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";
import { trackPendingUpload } from "@/lib/pending-uploads";
import type { RequestSummary } from "@/types/api";
import type { SrikandiOutgoingFile } from "@/types/entities";
import { ATTACHMENT_EXTENSIONS, extensionOf, formatSize, MAIN_EXTENSIONS } from "./register-logic";

/** Context unggahan baru dari Register (berkas ikut terhapus bersama entri). */
export const REGISTER_UPLOAD_CONTEXT = "srikandi-register";

export interface PickedFile {
  file: SrikandiOutgoingFile;
  /** Dokumen pengajuan Approval asal berkas */
  request?: RequestSummary;
}

interface PickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "main" | "attachment";
  /** Berkas yang sudah dipakai entri (disembunyikan dari daftar) */
  exclude: string[];
  onPick: (picked: PickedFile) => void;
}

/**
 * Pilih berkas untuk Register Naskah Keluar: dokumen pengajuan Approval, berkas LifeOS (mis. konsep lampiran
 * Productivity), atau unggah baru. Berkas unggahan baru dicatat `trackPendingUpload` sampai entri disimpan.
 */
export function RegisterFilePicker({ open, onOpenChange, mode, exclude, onPick }: PickerProps) {
  const extensions: readonly string[] = mode === "main" ? MAIN_EXTENSIONS : ATTACHMENT_EXTENSIONS;
  const pick = (picked: PickedFile) => {
    onPick(picked);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-1 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "main" ? "Pilih file naskah" : "Tambah lampiran naskah"}</DialogTitle>
          <DialogDescription>
            {mode === "main"
              ? "Dokumen mentah yang akan didaftarkan ke SRIKANDI (PDF atau DOCX; SRIKANDI menyarankan PDF)."
              : "Format diterima SRIKANDI: JPG, PNG, DOC(X), PDF, XLS(X), PPT(X), MP4, WAV — maks. 5 MB per berkas, total 20 MB."}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Tabs defaultValue={mode === "main" ? "request" : "file"} className="min-w-0">
            <TabsList>
              <TabsTrigger value="request">Approval</TabsTrigger>
              <TabsTrigger value="file">Berkas LifeOS</TabsTrigger>
              <TabsTrigger value="upload">Unggah</TabsTrigger>
            </TabsList>
            <TabsContent value="request" className="min-w-0">
              <RequestDocuments extensions={extensions} exclude={exclude} onPick={pick} />
            </TabsContent>
            <TabsContent value="file" className="min-w-0">
              <LifeosFiles extensions={extensions} exclude={exclude} onPick={pick} />
            </TabsContent>
            <TabsContent value="upload" className="min-w-0">
              <UploadNew extensions={extensions} onPick={pick} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ListProps {
  extensions: readonly string[];
  exclude: string[];
  onPick: (picked: PickedFile) => void;
}

const fits = (name: string, extensions: readonly string[]) => extensions.includes(extensionOf(name));

function RequestDocuments({ extensions, exclude, onPick }: ListProps) {
  const { data: requests = [], isLoading } = useRequests();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const rows = requests
    .flatMap((request) => request.documents.map((doc) => ({ request, doc })))
    .filter(({ doc }) => fits(doc.name, extensions) && !exclude.includes(doc.uploadId))
    .filter(
      ({ request, doc }) =>
        !q || [request.title, request.subject ?? "", doc.name].some((v) => v.toLowerCase().includes(q)),
    )
    .sort((a, b) => b.doc.createdAt.localeCompare(a.doc.createdAt));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <SearchInput value={search} onChange={setSearch} placeholder="Cari pengajuan atau dokumen…" />
      {isLoading ? (
        <Loader2 className="mx-auto my-6 animate-spin text-muted-foreground" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Belum ada dokumen hasil templat di Approval yang cocok.
        </p>
      ) : (
        <ul className="flex max-h-[50svh] min-w-0 flex-col gap-1 overflow-y-auto">
          {rows.map(({ request, doc }) => (
            <li key={doc.uploadId}>
              <button
                type="button"
                className="flex w-full min-w-0 items-start gap-2 rounded-md p-2 text-left hover:bg-muted"
                onClick={() =>
                  onPick({
                    file: {
                      uploadId: doc.uploadId,
                      name: doc.name,
                      mimeType:
                        extensionOf(doc.name) === "pdf"
                          ? "application/pdf"
                          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    },
                    request,
                  })
                }
              >
                <Inbox className="mt-0.5 size-4 shrink-0 text-module" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{doc.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {request.title} · templat {doc.templateName}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LifeosFiles({ extensions, exclude, onPick }: ListProps) {
  const { data: uploads = [], isLoading } = useQuery({
    queryKey: queryKeys.uploads,
    queryFn: () => uploadsApi.list(100),
  });
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const rows = uploads.filter(
    (u) =>
      fits(u.originalName, extensions) && !exclude.includes(u.id) && (!q || u.originalName.toLowerCase().includes(q)),
  );
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <SearchInput value={search} onChange={setSearch} placeholder="Cari nama berkas…" />
      <p className="text-xs text-muted-foreground">
        100 berkas terbaru milik Anda (lampiran Productivity, dokumen ONLYOFFICE, …).
      </p>
      {isLoading ? (
        <Loader2 className="mx-auto my-6 animate-spin text-muted-foreground" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada berkas yang cocok.</p>
      ) : (
        <ul className="flex max-h-[50svh] min-w-0 flex-col gap-1 overflow-y-auto">
          {rows.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="flex w-full min-w-0 items-center gap-2 rounded-md p-2 text-left hover:bg-muted"
                onClick={() =>
                  onPick({ file: { uploadId: u.id, name: u.originalName, mimeType: u.mimeType, size: u.size } })
                }
              >
                <FileText className="size-4 shrink-0 text-module" />
                <span className="min-w-0 flex-1 truncate text-sm">{u.originalName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatSize(u.size)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadNew({ extensions, onPick }: { extensions: readonly string[]; onPick: (picked: PickedFile) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!fits(file.name, extensions)) {
      toast.error(`Format .${extensionOf(file.name) || "?"} tidak diterima di sini.`);
      return;
    }
    setUploading(true);
    try {
      const asset = await uploadsApi.upload(file, REGISTER_UPLOAD_CONTEXT);
      trackPendingUpload(asset.id);
      onPick({
        file: { uploadId: asset.id, name: asset.originalName, mimeType: asset.mimeType, size: asset.size, owned: true },
      });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
      <Upload className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Berkas yang diunggah di sini ikut terhapus bila entri register dihapus.
      </p>
      <input
        ref={input}
        type="file"
        hidden
        accept={extensions.map((e) => `.${e}`).join(",")}
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Button type="button" onClick={() => input.current?.click()} disabled={uploading}>
        {uploading ? <Loader2 className="animate-spin" /> : <Upload />} Pilih berkas
      </Button>
    </div>
  );
}
