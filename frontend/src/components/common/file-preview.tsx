import { Download, ExternalLink, FilePen, FileQuestion, FileText, Image as ImageIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";
import { useOfficeStatus } from "@/data/use-office";
import { OFFICE_KIND_ICON, openOfficeEditor } from "@/features/tools/onlyoffice/office-editor-host";
import { isOfficeEditable, officeKindOf, OFFICE_KIND_LABELS } from "@/features/tools/onlyoffice/office-formats";
import { DocumentLinksButton } from "@/features/tools/onlyoffice/document-links";

// Penampil dokumen kantor (DOCX/XLSX/PPTX, …) = editor ONLYOFFICE mode lihat, dimuat malas
const OfficeEditor = lazy(() => import("@/features/tools/onlyoffice/office-editor"));

/**
 * Pratinjau berkas dalam modal — dipakai bersama semua fitur: `previewFile({ uploadId, name, mimeType })`.
 * PDF & gambar ditampilkan langsung; dokumen kantor (DOCX, XLSX, PPTX, ODT, …) lewat ONLYOFFICE mode lihat bila server
 * ONLYOFFICE aktif. Berkas yang bisa diedit (DOCX/XLSX/PPTX/PDF) punya tombol "Edit di ONLYOFFICE".
 *
 * Berkas diambil sebagai blob lalu ditampilkan dari URL `blob:` agar header keamanan respons berkas
 * (`Content-Security-Policy: sandbox`) tidak menghalangi penampil PDF browser. CSP produksi mengizinkan `frame-src blob:`.
 */

export interface PreviewableFile {
  uploadId: string;
  /** Nama tampil; kosong → nama asli berkas dari metadata */
  name?: string;
  /** Kosong (undefined) → jenis berkas diambil dari metadata backend */
  mimeType?: string | null;
}

export type PreviewKind = "pdf" | "image" | "unsupported";

export const previewKind = (mimeType?: string | null, name = ""): PreviewKind => {
  const mime = (mimeType ?? "").toLowerCase();
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  // SVG bisa berisi skrip → tidak dipratinjau di dalam aplikasi
  if (
    (mime.startsWith("image/") && mime !== "image/svg+xml") ||
    ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp"].includes(ext)
  )
    return "image";
  return "unsupported";
};

const useFilePreviewStore = create<{ file: PreviewableFile | null; set: (file: PreviewableFile | null) => void }>(
  (set) => ({
    file: null,
    set: (file) => set({ file }),
  }),
);

/** Buka modal pratinjau berkas dari mana saja. */
export const previewFile = (file: PreviewableFile) => useFilePreviewStore.getState().set(file);

/** Dipasang sekali di AppShell. */
export function FilePreviewHost() {
  const file = useFilePreviewStore((s) => s.file);
  const set = useFilePreviewStore((s) => s.set);
  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && set(null)}>
      {/* Bingkai ringkas (padding & header tipis), area dokumen hampir selebar & setinggi layar */}
      <DialogContent className="flex h-[96svh] max-w-[calc(100%-1rem)] flex-col gap-1.5 rounded-2xl p-1.5 sm:max-w-[min(96vw,1400px)] [&>[data-slot=dialog-close]]:top-1.5 [&>[data-slot=dialog-close]]:right-1.5">
        {/* Di-mount ulang per berkas → blob lama dilepas, berkas baru dimuat */}
        {file && <PreviewBody key={file.uploadId} file={file} />}
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({ file: input }: { file: PreviewableFile }) {
  // Lampiran lama sering tidak membawa jenis/nama berkas → lengkapi dari metadata sebelum memilih penampil
  const needsInfo = input.mimeType === undefined || !input.name;
  const [info, setInfo] = useState<{ name: string; mimeType: string | null } | null>(
    needsInfo ? null : { name: input.name!, mimeType: input.mimeType ?? null },
  );
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = { uploadId: input.uploadId, name: info?.name ?? input.name ?? "Berkas", mimeType: info?.mimeType };
  const kind = info ? previewKind(info.mimeType, info.name) : null;
  const office = useOfficeStatus().data?.enabled ?? false;
  const officeKind = info ? officeKindOf(info.name, info.mimeType) : null;
  // Dokumen kantor non-PDF ditampilkan ONLYOFFICE; PDF tetap memakai penampil PDF browser (lebih ringan)
  const officeView = office && kind === "unsupported" && !!officeKind;
  const canEditInOffice = office && !!info && isOfficeEditable(info.name, info.mimeType);

  useEffect(() => {
    if (!needsInfo) return;
    let cancelled = false;
    uploadsApi.metadata(input.uploadId).then(
      (meta) => {
        if (!cancelled) setInfo({ name: input.name || meta.originalName, mimeType: input.mimeType ?? meta.mimeType });
      },
      (err) => !cancelled && setError(errorMessage(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [needsInfo, input.uploadId, input.name, input.mimeType]);

  useEffect(() => {
    if (!kind || kind === "unsupported") return;
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        const link = await uploadsApi.createLink(file.uploadId);
        const res = await fetch(link);
        if (!res.ok) throw new Error(`Berkas tidak dapat dimuat (status ${res.status}).`);
        const data = await res.arrayBuffer();
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([data], { type: kind === "pdf" ? "application/pdf" : file.mimeType || "" }));
        setBlobUrl(url);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.uploadId, file.mimeType, kind]);

  const openInTab = async () => {
    const tab = window.open("about:blank", "_blank");
    try {
      const link = await uploadsApi.createLink(file.uploadId);
      if (tab) tab.location.href = link;
    } catch (err) {
      tab?.close();
      setError(errorMessage(err));
    }
  };

  const download = async () => {
    try {
      const link = await uploadsApi.createLink(file.uploadId);
      const a = document.createElement("a");
      a.href = link;
      a.download = file.name;
      a.click();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const editInOffice = () => {
    useFilePreviewStore.getState().set(null);
    openOfficeEditor({ uploadId: file.uploadId, name: file.name });
  };

  const Icon =
    officeView && officeKind
      ? OFFICE_KIND_ICON[officeKind]
      : kind === "image"
        ? ImageIcon
        : kind === "pdf"
          ? FileText
          : FileQuestion;

  return (
    <>
      <DialogHeader className="h-7 flex-row items-center gap-2 space-y-0 pr-9 pl-2">
        <Icon className="size-4 shrink-0 text-module" />
        <DialogTitle className="min-w-0 truncate text-sm">{file.name}</DialogTitle>
        <DialogDescription className="hidden shrink-0 text-xs sm:block">
          {officeView && officeKind
            ? `· ${OFFICE_KIND_LABELS[officeKind]}`
            : kind === "pdf"
              ? "· Dokumen PDF"
              : kind === "image"
                ? "· Gambar"
                : kind === "unsupported"
                  ? "· Pratinjau belum tersedia"
                  : "· Memuat…"}
        </DialogDescription>
        <span className="flex-1" />
        {canEditInOffice && (
          <Button variant="ghost" size="xs" onClick={editInOffice}>
            <FilePen /> <span className="hidden sm:inline">Edit di ONLYOFFICE</span>
          </Button>
        )}
        <DocumentLinksButton uploadId={file.uploadId} name={file.name} />
        <Button variant="ghost" size="xs" onClick={() => void download()}>
          <Download /> <span className="hidden sm:inline">Unduh</span>
        </Button>
        <Button variant="ghost" size="xs" onClick={() => void openInTab()}>
          <ExternalLink /> <span className="hidden sm:inline">Tab baru</span>
        </Button>
      </DialogHeader>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-muted/40">
        {error ? (
          <p className="p-6 text-center text-sm text-destructive">{error}</p>
        ) : officeView ? (
          <Suspense fallback={<Spinner className="size-6" />}>
            <OfficeEditor uploadId={file.uploadId} mode="view" />
          </Suspense>
        ) : kind === "unsupported" ? (
          <div className="flex max-w-sm flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <FileQuestion className="size-10" />
            <p className="font-semibold text-foreground">Pratinjau untuk jenis berkas ini belum tersedia</p>
            <p>Unduh berkas atau buka di tab baru untuk melihat isinya.</p>
          </div>
        ) : !blobUrl ? (
          <Spinner className="size-6" />
        ) : kind === "pdf" ? (
          <iframe src={blobUrl} title={file.name} className="size-full bg-background" />
        ) : (
          <img src={blobUrl} alt={file.name} className="max-h-full max-w-full object-contain" />
        )}
      </div>
    </>
  );
}
