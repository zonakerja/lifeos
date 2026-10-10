import {
  CheckCircle2,
  Eye,
  FileBox,
  FileX,
  Globe,
  Handshake,
  HardDrive,
  History,
  MapPin,
  RotateCcw,
  Shield,
  Trash2,
  Truck,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useBorrowings, useClassifications, useJraList, usePhysRefs } from "@/data/collections";
import { openAttachment } from "@/features/resources/resource-utils";
import { usePermissions } from "@/hooks/use-permissions";
import { useRetained } from "@/hooks/use-retained";
import { formatFullDate, formatNumericDate, parseLocalYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { type ArchiveFile, archiveTitle, classificationCode, isPermanent } from "../lib/archive";
import { useFileControlActions } from "../use-file-control";
import { StatusBadge } from "./archive-ui";

const toDate = (value?: string) => (value ? (parseLocalYMD(value) ?? new Date(value)) : null);
const yearOf = (value?: string) => toDate(value)?.getFullYear() ?? "...";
const dateText = (value?: string) => {
  const d = toDate(value);
  return d ? formatNumericDate(d) : "-";
};

function Info({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] font-bold text-muted-foreground uppercase">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

/** Detail lengkap arsip. */
export function ArchiveDetailDialog({ file: fileProp, onClose }: { file: ArchiveFile | null; onClose: () => void }) {
  const file = useRetained(fileProp);
  return (
    <Dialog open={!!fileProp} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {file && <ArchiveDetail file={file} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ArchiveDetail({ file, onClose }: { file: ArchiveFile; onClose: () => void }) {
  const { items: classifications } = useClassifications();
  const { items: jraList } = useJraList();
  const { items: physRefs } = usePhysRefs();
  const { items: borrowings } = useBorrowings();
  const { isSuperAdmin } = usePermissions();
  const actions = useFileControlActions();

  const cls = classifications.find((c) => c.id === file.classificationId);
  const jra = jraList.find((j) => j.id === file.jraId);
  const ref = (id?: string) => physRefs.find((r) => r.id === id);
  const refText = (id?: string) => {
    const r = ref(id);
    return r ? `${r.code} - ${r.name}` : "-";
  };
  const status = file.dynamicStatus;
  const isDestroyed = status === "destroyed";
  const isStatic = status === "static";
  const activeBorrowing = borrowings.find((b) => b.status === "active" && b.items?.some((i) => i.id === file.id));
  const disposition = file.dispositionData;
  const hasAttachment = !!(file.uploadId || file.url);

  return (
    <>
      <DialogHeader className="border-b p-6">
        <DialogTitle className="text-xl">Detail Arsip</DialogTitle>
        <DialogDescription className="font-mono">{file.archiveRegId || "-"}</DialogDescription>
      </DialogHeader>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div
          className={cn(
            "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
            isDestroyed
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : isStatic
                ? "border-info/30 bg-info/10 text-info"
                : "border-success/30 bg-success/10 text-success",
          )}
        >
          <div className="flex items-center gap-3">
            {isDestroyed ? (
              <FileX className="size-6" />
            ) : isStatic ? (
              <Truck className="size-6" />
            ) : (
              <CheckCircle2 className="size-6" />
            )}
            <div>
              <h4 className="text-sm font-bold uppercase">
                {isDestroyed ? "Arsip telah dimusnahkan" : isStatic ? "Diserahkan ke ANRI (Statis)" : "Arsip tersimpan"}
              </h4>
              <p className="text-xs opacity-80">
                {disposition?.executedAt
                  ? `Dieksekusi pada: ${formatFullDate(new Date(disposition.executedAt))}`
                  : "Arsip dikelola dengan baik."}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {hasAttachment && (
              <Button size="sm" variant="outline" onClick={() => void openAttachment(file)}>
                <Eye /> Preview File
              </Button>
            )}
            {(isDestroyed || isStatic) && isSuperAdmin && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  actions.restore(file);
                  toast.success(`Arsip "${archiveTitle(file)}" berhasil dikembalikan ke status Dinamis.`);
                  onClose();
                }}
              >
                <RotateCcw /> Restore Data
              </Button>
            )}
          </div>
        </div>

        {activeBorrowing && (
          <div className="flex items-start gap-4 rounded-xl border border-warning/40 bg-warning/10 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/25 text-warning-foreground dark:text-warning">
              <Handshake className="size-5" />
            </span>
            <div className="w-full">
              <h4 className="mb-2 text-sm font-bold">Arsip Sedang Dipinjam</h4>
              <div className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg bg-card/60 p-3 text-xs md:grid-cols-2">
                <Info label="Peminjam">{activeBorrowing.borrowerName}</Info>
                <Info label="Unit/Instansi">{activeBorrowing.unit || "-"}</Info>
                <Info label="Tgl Pinjam">{dateText(activeBorrowing.date)}</Info>
                <Info label="Target Kembali">{dateText(activeBorrowing.returnDate)}</Info>
                <Info label="Keperluan" className="md:col-span-2">
                  {activeBorrowing.purpose || "-"}
                </Info>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-5">
          <Info label="Nomor Dokumen">{file.number || "-"}</Info>
          <Info label="Tanggal Dokumen">{dateText(file.date)}</Info>
          <Info label="Judul / Nama Berkas" className="col-span-2">
            <span className="font-bold">{archiveTitle(file)}</span>
          </Info>
          <Info label="Deskripsi" className="col-span-2">
            <span className="font-normal text-muted-foreground">{file.description || file.content || "-"}</span>
          </Info>
          <div className="col-span-2">
            <p className="mb-2 text-[10px] font-bold text-muted-foreground uppercase">Label &amp; Kategori</p>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={status} />
              <Badge variant="outline" className={cn(isPermanent(jra) && "border-info/30 bg-info/10 text-info")}>
                <History /> {isPermanent(jra) ? "PERMANEN" : "NON PERMANEN"}
              </Badge>
              <Badge variant="outline">
                {file.archivalStatus === "physical" ? <FileBox /> : <HardDrive />}
                {file.archivalStatus === "physical" ? "FISIK" : "DIGITAL"}
              </Badge>
              {file.isVital && (
                <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                  <Shield /> VITAL
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <Info label="Kode & Jenis Arsip">
            <span className="font-mono font-bold text-module">
              {cls ? `${classificationCode(cls)} - ${cls.namaItem}` : "-"}
            </span>
          </Info>
          <Info label="Jenis Retensi Arsip">{jra?.jenisArsip || "-"}</Info>
          <Info label="Periode Aktif">
            {yearOf(file.date)} s/d {yearOf(file.retentionActiveDate)} ({dateText(file.retentionActiveDate)})
          </Info>
          <Info label="Periode Inaktif">
            {yearOf(file.retentionActiveDate)} s/d {yearOf(file.retentionInactiveDate)} (
            {dateText(file.retentionInactiveDate)})
          </Info>
        </div>

        {file.physLocationId && (
          <div className="rounded-xl border bg-muted/40 p-4">
            <h5 className="mb-2 flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase">
              <MapPin className="size-3.5" />{" "}
              {isDestroyed || isStatic ? "Riwayat Lokasi Simpan" : "Lokasi Simpan Fisik"}
            </h5>
            <div className="space-y-1 text-sm font-medium">
              <p>🏢 {refText(file.physLocationId)}</p>
              <div className="space-y-1 border-l-2 pl-4 text-muted-foreground">
                <p>🗄️ {refText(file.physRackId)}</p>
                <p>📦 {refText(file.physBoxId)}</p>
                <p>📂 {refText(file.physFolderId)}</p>
              </div>
            </div>
          </div>
        )}

        {file.archivalStatus === "digital" && (
          <div className="rounded-xl border bg-muted/40 p-4">
            <h5 className="mb-3 flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase">
              <HardDrive className="size-3.5" /> Lokasi Arsip Digital
            </h5>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <Info label="Aplikasi / Sistem">{file.digitalApp || "-"}</Info>
              <Info label="Link Dokumen">
                {file.digitalLink ? (
                  <a
                    href={file.digitalLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-module hover:underline"
                  >
                    <Globe className="size-3.5" /> Buka Tautan
                  </a>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </Info>
            </div>
          </div>
        )}

        {file.notes && (
          <div className="rounded-xl border bg-muted/40 p-4">
            <h5 className="mb-2 text-xs font-bold text-muted-foreground uppercase">Catatan Kearsipan</h5>
            <p className="text-sm text-muted-foreground italic">{file.notes}</p>
          </div>
        )}

        {(isDestroyed || isStatic) && disposition && (
          <div className="rounded-xl border bg-muted/40 p-4">
            <h5 className="mb-3 flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase">
              {isDestroyed ? <Trash2 className="size-3.5" /> : <Truck className="size-3.5" />} Detail{" "}
              {isDestroyed ? "Pemusnahan" : "Penyerahan"}
            </h5>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <Info label="Dasar Pelaksanaan">{disposition.legalNumber || "-"}</Info>
              <Info label="Tanggal Eksekusi">{disposition.date || "-"}</Info>
              <Info label="Keterangan / Berita Acara" className="col-span-2">
                {disposition.description || "-"}
              </Info>
              <Info label="Catatan User" className="col-span-2">
                <span className="text-muted-foreground">&quot;{disposition.userNote || ""}&quot;</span>
              </Info>
              {(disposition.uploadId || disposition.fileUrl) && (
                <div className="col-span-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void openAttachment({ uploadId: disposition.uploadId, url: disposition.fileUrl })}
                  >
                    <Eye /> {disposition.fileName || "Berkas SK/BA"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
