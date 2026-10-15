import { Download, History, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useOfficeVersions, useRestoreOfficeVersion } from "@/data/use-office";
import { errorMessage } from "@/lib/api/client";
import { officeApi } from "@/lib/api/endpoints";
import { formatDateTime } from "@/lib/dates";
import type { OfficeVersion } from "@/types/api";

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

interface VersionHistoryDialogProps {
  uploadId: string;
  /** Nama berkas (untuk nama unduhan versi lama) */
  fileName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Versi dipulihkan → editor yang terbuka perlu dimuat ulang */
  onRestored?: () => void;
}

/**
 * Riwayat versi dokumen ONLYOFFICE: versi saat ini + hingga 9 versi sebelumnya (satu sesi edit = satu versi).
 * Pulihkan = isi versi lama menjadi versi terbaru (isi saat ini tetap tersimpan di riwayat).
 */
export function VersionHistoryDialog({
  uploadId,
  fileName,
  open,
  onOpenChange,
  onRestored,
}: VersionHistoryDialogProps) {
  const { data, isLoading, error } = useOfficeVersions(open ? uploadId : null);
  const restore = useRestoreOfficeVersion(uploadId);
  const [confirming, setConfirming] = useState<OfficeVersion | null>(null);

  const download = async (version: OfficeVersion) => {
    try {
      const blob = await officeApi.versionBlob(uploadId, version.version);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = version.current ? fileName : `v${version.version} - ${fileName}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast.error("Versi gagal diunduh", { description: errorMessage(err) });
    }
  };

  const confirmRestore = () => {
    if (!confirming) return;
    const version = confirming.version;
    restore.mutate(version, {
      onSuccess: () => {
        toast.success(`Versi ${version} dipulihkan sebagai versi terbaru.`);
        onRestored?.();
      },
      onError: (err) => toast.error("Gagal memulihkan versi", { description: errorMessage(err) }),
    });
    setConfirming(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-4 text-module" /> Riwayat versi
            </DialogTitle>
            <DialogDescription>
              Setiap sesi edit yang disimpan menjadi satu versi. LifeOS menyimpan 10 versi terakhir.
            </DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner className="size-5" />
            </div>
          ) : error ? (
            <p className="py-4 text-sm text-destructive">{errorMessage(error)}</p>
          ) : (
            <ul className="-mx-1 flex max-h-[60svh] flex-col gap-1 overflow-y-auto px-1">
              {data?.versions.map((v) => (
                <li key={v.version} className="flex items-center gap-3 rounded-xl border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      Versi {v.version}
                      {v.current && <Badge variant="secondary">Saat ini</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDateTime(v.createdAt)}
                      {v.authorName ? ` · ${v.authorName}` : ""} · {formatBytes(v.size)}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label="Unduh versi" onClick={() => void download(v)}>
                    <Download />
                  </Button>
                  {data.canRestore && !v.current && (
                    <Button variant="outline" size="sm" disabled={restore.isPending} onClick={() => setConfirming(v)}>
                      <RotateCcw /> Pulihkan
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={`Pulihkan versi ${confirming?.version ?? ""}?`}
        description="Isi versi ini menjadi versi terbaru. Isi saat ini tetap tersimpan di riwayat sehingga bisa dipulihkan lagi."
        confirmLabel="Pulihkan"
        destructive={false}
        onConfirm={confirmRestore}
      />
    </>
  );
}
