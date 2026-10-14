import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  Clock,
  Eye,
  FileBox,
  FileX,
  Globe,
  Handshake,
  HardDrive,
  MapPin,
  RotateCcw,
  Shield,
  Trash2,
  Truck,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
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
import { type ArchiveFile, archiveTitle, classificationCode, isManagedArchive, isPermanent } from "../lib/archive";
import { hasArchiveDocument, openArchiveDocument } from "../lib/archive-document";
import { useFileControlActions } from "../use-file-control";
import { RetentionBadge, StatusBadge } from "./archive-ui";
import { AccessScope } from "@/components/common/access-scope";
import { CommentsPanel } from "@/features/sharing/comments-panel";
import { ShareButton } from "@/features/sharing/share-dialog";
import { SharedBadge } from "@/features/sharing/shared-badge";

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
        {file && (
          <AccessScope item={file}>
            <ArchiveDetail file={file} onClose={onClose} />
          </AccessScope>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ArchiveDetail({ file, onClose }: { file: ArchiveFile; onClose: () => void }) {
  const [confirmRestore, setConfirmRestore] = useState(false);
  // Arsip bersama merujuk klasifikasi/JRA/wadah milik pemiliknya
  const { items: classifications } = useClassifications({ includeShared: true });
  const { items: jraList } = useJraList({ includeShared: true });
  const { items: physRefs } = usePhysRefs({ includeShared: true });
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
  const hasAttachment = hasArchiveDocument(file);
  const isPending = !isManagedArchive(file) && !isDestroyed && !isStatic;

  /** Banner ringkasan kondisi arsip sesuai siklusnya. */
  const banner = isDestroyed
    ? {
        tone: "border-destructive/30 bg-destructive/10 text-destructive",
        icon: FileX,
        title: "Arsip telah dimusnahkan",
      }
    : isStatic
      ? { tone: "border-info/30 bg-info/10 text-info", icon: Truck, title: "Diserahkan ke ANRI (Statis)" }
      : isPending
        ? {
            tone: "border-border bg-muted text-muted-foreground",
            icon: ArchiveRestore,
            title: "Belum diberkaskan",
            text: "Arsip masih di tab Gantung. Lakukan Proses Pemberkasan untuk mengklasifikasikan dan menetapkan retensinya.",
          }
        : status === "expired"
          ? {
              tone: "border-destructive/30 bg-destructive/10 text-destructive",
              icon: AlertTriangle,
              title: "Perlu tindak lanjut",
              text: `Masa retensi inaktif berakhir ${dateText(file.retentionInactiveDate)}. Lakukan ${isPermanent(jra) ? "penyerahan statis" : "pemusnahan"} sesuai JRA.`,
            }
          : status === "inactive"
            ? {
                tone: "border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning",
                icon: Clock,
                title: file.isVital ? "Arsip vital (inaktif)" : "Arsip inaktif",
                text: file.isVital
                  ? "Arsip vital tetap dipertahankan walau masa retensinya lewat."
                  : `Disimpan di Record Center hingga ${dateText(file.retentionInactiveDate)}.`,
              }
            : {
                tone: "border-success/30 bg-success/10 text-success",
                icon: CheckCircle2,
                title: "Arsip aktif",
                text: file.retentionActiveDate
                  ? `Masa aktif hingga ${dateText(file.retentionActiveDate)}.`
                  : "Arsip dikelola dengan baik.",
              };
  const BannerIcon = banner.icon;

  return (
    <>
      <DialogHeader className="border-b p-6">
        <DialogTitle className="text-xl">Detail Arsip</DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-2 font-mono">
          {file.archiveRegId || "-"}
          <SharedBadge item={file} recordType={file.isArchived ? undefined : "para_resource"} />
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div
          className={cn(
            "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
            banner.tone,
          )}
        >
          <div className="flex items-center gap-3">
            <BannerIcon className="size-6 shrink-0" />
            <div>
              <h4 className="text-sm font-bold uppercase">{banner.title}</h4>
              <p className="text-xs opacity-80">
                {(isDestroyed || isStatic) && disposition?.executedAt
                  ? `Dieksekusi pada: ${formatFullDate(new Date(disposition.executedAt))}`
                  : banner.text}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {hasAttachment && (
              <Button size="sm" variant="outline" onClick={() => void openArchiveDocument(file)}>
                <Eye /> Lihat Dokumen
              </Button>
            )}
            {!file.isArchived && <ShareButton item={file} recordType="para_resource" title={archiveTitle(file)} />}
            {(isDestroyed || isStatic) && isSuperAdmin && !file.share && (
              <Button size="sm" variant="outline" onClick={() => setConfirmRestore(true)}>
                <RotateCcw /> Restore Data
              </Button>
            )}
            <ConfirmDialog
              open={confirmRestore}
              onOpenChange={setConfirmRestore}
              title="Pulihkan Arsip?"
              itemName={archiveTitle(file)}
              description={`Status ${isDestroyed ? "Musnah" : "Statis"} dibatalkan: arsip kembali dikelola (status dihitung ulang dari tanggal retensi), tag ${isDestroyed ? "Musnah" : "Statis"} dan data penyusutan dihapus, Auto-Dispose dimatikan. Berita acara yang sudah tercatat tetap ada.`}
              destructive={false}
              confirmLabel="Ya, Pulihkan"
              onConfirm={() => {
                actions.restore(file);
                toast.success(`Arsip "${archiveTitle(file)}" berhasil dikembalikan ke status Dinamis.`);
                setConfirmRestore(false);
                onClose();
              }}
            />
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
              {isPending ? (
                <Badge
                  variant="outline"
                  className="border-warning/40 bg-warning/20 text-warning-foreground dark:text-warning"
                >
                  <ArchiveRestore /> Gantung
                </Badge>
              ) : (
                <>
                  <StatusBadge status={status} />
                  <RetentionBadge jra={jra} isVital={file.isVital} />
                  <Badge variant="outline">
                    {file.archivalStatus === "physical" ? <FileBox /> : <HardDrive />}
                    {file.archivalStatus === "physical" ? "Fisik" : "Digital"}
                  </Badge>
                </>
              )}
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

        {file.physLocationId && file.archivalStatus === "physical" && (
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
        {!file.isArchived && <CommentsPanel recordType="para_resource" item={file} />}
      </div>
    </>
  );
}
