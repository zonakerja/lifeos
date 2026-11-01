import { Download, FileQuestion, FileText, Image as ImageIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { previewKind } from "@/components/common/file-preview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { publicVaultApi } from "@/lib/api/endpoints";
import type { PublicVaultView } from "@/types/api";

// pdf.js (± 1 MB) hanya dimuat saat PDF dibuka
const PdfPages = lazy(() => import("./pdf-pages"));

type VaultFile = PublicVaultView["files"][number];

/**
 * Modal pratinjau berkas brankas publik (tanpa membuka tab baru / mengunduh): berkas diambil sebagai blob (tercatat
 * "lihat" di server) lalu PDF digambar pdf.js, gambar ditampilkan langsung; jenis lain cukup tombol Unduh.
 */
export function VaultFileViewer({
  token,
  file,
  onClose,
}: {
  token: string;
  file: VaultFile | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[92svh] max-w-[calc(100%-1rem)] flex-col gap-1.5 rounded-2xl p-1.5 sm:max-w-[min(96vw,1100px)] [&>[data-slot=dialog-close]]:top-1.5 [&>[data-slot=dialog-close]]:right-1.5">
        {/* Di-mount ulang per berkas → isi berkas sebelumnya dilepas */}
        {file && <ViewerBody key={file.id} token={token} file={file} />}
      </DialogContent>
    </Dialog>
  );
}

function ViewerBody({ token, file }: { token: string; file: VaultFile }) {
  const kind = previewKind(file.mimeType, file.name);
  const [data, setData] = useState<ArrayBuffer | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kind === "unsupported") return;
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        const res = await fetch(publicVaultApi.fileUrl(token, file.id));
        if (!res.ok) throw new Error(`Berkas tidak dapat dimuat (status ${res.status}).`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;
        if (kind === "image") {
          url = URL.createObjectURL(new Blob([buffer], { type: file.mimeType }));
          setImageUrl(url);
        } else setData(buffer);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, file.id, file.mimeType, kind]);

  const Icon = kind === "image" ? ImageIcon : kind === "pdf" ? FileText : FileQuestion;
  return (
    <>
      <DialogHeader className="h-7 flex-row items-center gap-2 space-y-0 pr-9 pl-2">
        <Icon className="size-4 shrink-0 text-module" />
        <DialogTitle className="min-w-0 truncate text-sm">{file.name}</DialogTitle>
        <DialogDescription className="hidden shrink-0 text-xs sm:block">
          {kind === "pdf" ? "· Dokumen PDF" : kind === "image" ? "· Gambar" : "· Pratinjau belum tersedia"}
        </DialogDescription>
        <span className="flex-1" />
        <Button asChild variant="ghost" size="xs">
          <a href={publicVaultApi.fileUrl(token, file.id, true)} rel="noopener noreferrer">
            <Download /> <span className="hidden sm:inline">Unduh</span>
          </a>
        </Button>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-muted/40">
        {error ? (
          <p className="p-6 text-center text-sm text-destructive">{error}</p>
        ) : kind === "unsupported" ? (
          <div className="flex max-w-sm flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <FileQuestion className="size-10" />
            <p className="font-semibold text-foreground">Pratinjau untuk jenis berkas ini belum tersedia</p>
            <p>Gunakan tombol Unduh untuk membuka berkas di perangkat Anda.</p>
          </div>
        ) : kind === "image" ? (
          imageUrl ? (
            <img src={imageUrl} alt={file.name} className="max-h-full max-w-full object-contain" />
          ) : (
            <Spinner className="size-6" />
          )
        ) : data ? (
          <Suspense fallback={<Spinner className="size-6" />}>
            <PdfPages data={data} name={file.name} />
          </Suspense>
        ) : (
          <Spinner className="size-6" />
        )}
      </div>
    </>
  );
}
