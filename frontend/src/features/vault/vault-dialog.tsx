import { Copy, ExternalLink, FileText, FolderLock, Loader2, RefreshCw, ScrollText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { previewFile } from "@/components/common/file-preview";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useVault, useVaultAccesses, useVaultActions } from "@/data/use-vaults";
import { errorMessage } from "@/lib/api/client";
import { formatDateTime } from "@/lib/dates";
import { distinctVisitors, formatVaultSize, VAULT_ACTION_LABELS, vaultUrl } from "./vault-utils";

/** Penanda brankas di baris renaksi: jumlah pembukaan; klik = kelola brankas & log akses. */
export function VaultButton({
  vaultId,
  url,
  onRotated,
}: {
  vaultId: string;
  url?: string;
  /** Tautan diganti → isi `documentUrl` entri ikut diperbarui */
  onRotated: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const vault = useVault(vaultId);
  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1 text-module hover:underline"
        title="Brankas digital — berkas & log akses"
        onClick={() => setOpen(true)}
      >
        <FolderLock className="size-3 shrink-0" /> Brankas
        {vault.data ? ` · ${vault.data.files.length} berkas · dibuka ${vault.data.accessCount}×` : ""}
      </button>
      <VaultDialog open={open} onOpenChange={setOpen} vaultId={vaultId} url={url} onRotated={onRotated} />
    </>
  );
}

function VaultDialog({
  open,
  onOpenChange,
  vaultId,
  url,
  onRotated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaultId: string;
  url?: string;
  onRotated: (url: string) => void;
}) {
  const vault = useVault(vaultId);
  const accesses = useVaultAccesses(vaultId, open);
  const actions = useVaultActions(vaultId);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const rows = accesses.data ?? [];

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Tautan brankas disalin.");
    } catch {
      toast.error("Tidak dapat menyalin — salin manual dari kotak tautan.");
    }
  };

  const rotate = async () => {
    try {
      const next = await actions.rotate.mutateAsync();
      onRotated(vaultUrl(next.path!));
      toast.success("Tautan baru dibuat — tautan lama tidak berlaku lagi.", {
        description: "Bila renaksi sudah di e-Kinerja, kirim perubahan agar tautan baru ikut terisi.",
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-1 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderLock className="size-5 text-module" /> Brankas digital
          </DialogTitle>
          <DialogDescription className="line-clamp-2">{vault.data?.title ?? "Memuat…"}</DialogDescription>
        </DialogHeader>

        {url && (
          <div className="flex min-w-0 items-center gap-2 rounded-md bg-muted/50 p-2">
            <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
            <Button variant="ghost" size="icon-sm" title="Salin tautan" onClick={() => void copy()}>
              <Copy />
            </Button>
            <Button asChild variant="ghost" size="icon-sm" title="Buka seperti pengunjung (tercatat di log)">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink />
              </a>
            </Button>
          </div>
        )}

        <section className="grid grid-cols-1 gap-1.5">
          <p className="text-sm font-semibold">Berkas ({vault.data?.files.length ?? 0})</p>
          {vault.data?.files.map((f) => (
            <button
              key={f.id}
              type="button"
              className="flex min-w-0 items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => previewFile({ uploadId: f.id, name: f.name, mimeType: f.mimeType })}
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatVaultSize(f.size)}</span>
            </button>
          ))}
          <p className="text-xs text-muted-foreground">Ganti berkas lewat Ubah renaksi — tautan tetap sama.</p>
        </section>

        <section className="grid grid-cols-1 gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <ScrollText className="size-4 text-module" /> Log akses
              <Badge variant="secondary">{rows.length}</Badge>
              {rows.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  dari {distinctVisitors(rows)} alamat IP
                </span>
              )}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmRotate(true)}
              disabled={actions.rotate.isPending}
            >
              {actions.rotate.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Ganti tautan
            </Button>
          </div>
          <div className="max-h-[min(22rem,45svh)] overflow-y-auto rounded-md border">
            {accesses.isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">Memuat…</p>
            ) : rows.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Belum pernah dibuka.</p>
            ) : (
              <ul className="divide-y text-xs">
                {rows.map((r) => (
                  <li key={r.id} className="grid grid-cols-1 gap-0.5 px-3 py-2 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
                    <span className="text-muted-foreground">{formatDateTime(r.at)}</span>
                    <span className="min-w-0">
                      <strong>{VAULT_ACTION_LABELS[r.action]}</strong>
                      {r.fileName ? ` · ${r.fileName}` : ""}
                      <span className="block break-all text-muted-foreground">
                        IP {r.ip ?? "?"} · {r.location}
                        {r.network ? ` · ${r.network}` : ""}
                        {r.browser ? ` · ${r.browser}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Lokasi diperkirakan dari alamat IP (bisa berupa kota penyedia internet / VPN, bukan lokasi pasti).
          </p>
        </section>

        <ConfirmDialog
          open={confirmRotate}
          onOpenChange={setConfirmRotate}
          title="Ganti tautan brankas?"
          description="Tautan lama langsung tidak berlaku (mis. bila tautan tersebar ke pihak yang tidak berwenang). Bila renaksi sudah terisi di e-Kinerja, kirim perubahan agar tautan baru ikut terisi."
          confirmLabel="Ganti tautan"
          destructive={false}
          onConfirm={() => {
            setConfirmRotate(false);
            void rotate();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
