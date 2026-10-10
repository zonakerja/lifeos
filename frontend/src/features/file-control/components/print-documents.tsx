import { Printer } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePhysRefs } from "@/data/collections";
import { useRetained } from "@/hooks/use-retained";
import { useToday } from "@/hooks/use-today";
import { parseLocalYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { ArchiveBorrowing, ArchiveDispositionLog, PhysicalReference } from "@/types/entities";
import { type ArchiveFile, archiveTitle, printStatusLabel } from "../lib/archive";
import { printElement } from "../lib/print";
import { useArchiveFiles } from "../use-file-control";
import { QrImage } from "./archive-ui";

const toDate = (value?: string) => (value ? (parseLocalYMD(value) ?? new Date(value)) : null);
const idDate = (value?: string) => toDate(value)?.toLocaleDateString("id-ID") ?? "-";
const idFullDate = (value?: string) => toDate(value)?.toLocaleDateString("id-ID", { dateStyle: "full" }) ?? "-";

/** Kerangka pratinjau cetak A4: toolbar + lembar putih yang dicetak apa adanya. */
function A4PreviewDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[95svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[230mm]">
        <DialogHeader className="flex-row items-center justify-between gap-4 border-b p-4 pr-14">
          <div>
            <DialogTitle>Mode Pratinjau Cetak (A4)</DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </div>
          <Button onClick={() => printElement(sheetRef.current, title, "a4")}>
            <Printer /> Cetak
          </Button>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-muted p-4 md:p-8">
          <div
            ref={sheetRef}
            className="print-sheet relative mx-auto min-h-[297mm] w-[210mm] bg-white p-[20mm] text-sm text-black shadow-2xl"
          >
            {children}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const cell = "border border-black p-2";

/** Daftar isi arsip sebuah box/folder (cetak A4). */
export function ContainerPrintDialog({
  container: containerProp,
  onClose,
}: {
  container: PhysicalReference | null;
  onClose: () => void;
}) {
  const container = useRetained(containerProp);
  const today = useToday();
  const userName = useAuthStore((s) => s.user?.name);
  const { items: refs } = usePhysRefs();
  const { files } = useArchiveFiles();
  if (!container) return null;

  const isBox = container.type === "box";
  const statusTone = (status: string) =>
    status === "Perlu Tindak Lanjut" ? "text-red-600" : status === "Inaktif" ? "text-orange-600" : "text-emerald-600";
  const fileCells = (file: ArchiveFile) => {
    const status = printStatusLabel(file, today);
    return (
      <>
        <td className={cell}>
          {archiveTitle(file)}
          <br />
          <span className="font-mono text-[10px] text-gray-500">{file.archiveRegId}</span>
        </td>
        <td className={cn(cell, "text-center")}>{idDate(file.date)}</td>
        <td className={cn(cell, "text-center")}>{idDate(file.retentionActiveDate)}</td>
        <td className={cn(cell, "text-center")}>{idDate(file.retentionInactiveDate)}</td>
        <td className={cn(cell, "text-center text-[10px] font-bold uppercase", statusTone(status))}>{status}</td>
      </>
    );
  };

  const rows: ReactNode[] = [];
  let no = 1;
  if (isBox) {
    for (const folder of refs.filter((r) => r.parentId === container.id)) {
      const inFolder = files.filter((f) => f.physFolderId === folder.id);
      if (inFolder.length === 0) {
        rows.push(
          <tr key={`empty-${folder.id}`}>
            <td className={cn(cell, "text-center")}>{no++}</td>
            <td className={cn(cell, "font-bold")}>
              {folder.name}
              <br />
              <span className="font-mono text-[10px] font-normal text-gray-500">{folder.code}</span>
            </td>
            {Array.from({ length: 5 }, (_, i) => (
              <td key={i} className={cn(cell, "text-center")}>
                -
              </td>
            ))}
          </tr>,
        );
      }
      for (const file of inFolder) {
        rows.push(
          <tr key={file.id}>
            <td className={cn(cell, "text-center")}>{no++}</td>
            <td className={cn(cell, "font-bold")}>{folder.name}</td>
            {fileCells(file)}
          </tr>,
        );
      }
    }
    for (const file of files.filter((f) => f.physBoxId === container.id && !f.physFolderId)) {
      rows.push(
        <tr key={file.id}>
          <td className={cn(cell, "text-center")}>{no++}</td>
          <td className={cn(cell, "text-gray-600 italic")}>- (Lepas)</td>
          {fileCells(file)}
        </tr>,
      );
    }
  } else {
    for (const file of files.filter((f) => f.physFolderId === container.id)) {
      rows.push(
        <tr key={file.id}>
          <td className={cn(cell, "text-center")}>{no++}</td>
          {fileCells(file)}
        </tr>,
      );
    }
  }

  return (
    <A4PreviewDialog open={!!containerProp} onClose={onClose} title={`Daftar Isi ${container.code}`}>
      <div className="mb-6 flex items-start justify-between border-b-4 border-black pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-widest uppercase">DAFTAR ISI ARSIP</h1>
          <h2 className="mt-1 text-lg font-bold uppercase">
            {container.type}: {container.name}
          </h2>
          <p className="mt-2 text-sm text-gray-800">
            KODE: <span className="font-mono font-bold">{container.code}</span>
          </p>
        </div>
        <div className="border-2 border-black p-1">
          <QrImage value={container.id} size={88} />
        </div>
      </div>
      <table className="mb-4 w-full border-collapse border border-black text-sm">
        <thead style={{ display: "table-header-group" }}>
          <tr className="bg-gray-100">
            <th className={cn(cell, "w-10 text-center")}>No</th>
            {isBox && <th className={cn(cell, "w-1/5")}>Folder</th>}
            <th className={cell}>Uraian Arsip</th>
            <th className={cn(cell, "w-20 text-center")}>Tanggal</th>
            <th className={cn(cell, "w-20 text-center")}>Ret. Aktif</th>
            <th className={cn(cell, "w-20 text-center")}>Ret. Inaktif</th>
            <th className={cn(cell, "w-24 text-center")}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows
          ) : (
            <tr>
              <td colSpan={isBox ? 7 : 6} className={cn(cell, "p-4 text-center text-gray-500 italic")}>
                Tidak ada rincian data arsip di dalam wadah ini.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="mt-12 flex justify-end text-sm" style={{ pageBreakInside: "avoid" }}>
        <div className="w-64 text-center">
          <p className="mb-20">
            ......................,{" "}
            {today.toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" })}
          </p>
          <p className="font-bold uppercase underline">{userName || "................................"}</p>
          <p className="text-xs">Pengelola Arsip</p>
          <p className="mt-4 text-[10px] text-gray-500">Dicetak pada: {today.toLocaleString("id-ID")}</p>
        </div>
      </div>
    </A4PreviewDialog>
  );
}

type BapDocument = ArchiveBorrowing | ArchiveDispositionLog;
const isBorrowing = (doc: BapDocument): doc is ArchiveBorrowing => "borrowerName" in doc && !!doc.borrowerName;

/** Berita acara peminjaman / penyusutan (cetak A4). */
export function BapPrintDialog({ doc: docProp, onClose }: { doc: BapDocument | null; onClose: () => void }) {
  const doc = useRetained(docProp);
  const userName = useAuthStore((s) => s.user?.name);
  if (!doc) return null;
  const borrowing = isBorrowing(doc) ? doc : null;
  const disposition = isBorrowing(doc) ? null : doc;
  const watermark =
    borrowing?.status === "cancelled" ? "DIBATALKAN" : borrowing?.status === "returned" ? "SUDAH DIKEMBALIKAN" : null;

  return (
    <A4PreviewDialog open={!!docProp} onClose={onClose} title={doc.id}>
      {watermark && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden select-none">
          <span
            className={cn(
              "-rotate-45 text-7xl font-black tracking-widest whitespace-nowrap uppercase opacity-10",
              borrowing?.status === "cancelled" ? "text-red-600" : "text-emerald-600",
            )}
          >
            {watermark}
          </span>
        </div>
      )}
      <div className="mb-8 border-b-4 border-black pb-4 text-center">
        <h1 className="text-2xl font-black tracking-widest uppercase">
          {borrowing ? "BERITA ACARA PEMINJAMAN ARSIP" : "BERITA ACARA PENYUSUTAN ARSIP"}
        </h1>
        <p className="mt-1 text-sm">Nomor: {doc.id}</p>
      </div>
      <p className="mb-4 text-justify">
        Pada hari ini, tanggal <strong>{idFullDate(borrowing ? borrowing.date : disposition?.executedAt)}</strong>,
        telah dilakukan{" "}
        {borrowing
          ? "penyerahan pinjaman"
          : `proses ${disposition?.type === "destroy" ? "pemusnahan" : "penyerahan statis"}`}{" "}
        arsip dengan rincian sebagai berikut:
      </p>
      {borrowing && (
        <table className="mb-6 w-full text-sm">
          <tbody>
            <tr>
              <td className="w-40 py-1 font-bold">Nama Peminjam</td>
              <td>: {borrowing.borrowerName}</td>
            </tr>
            <tr>
              <td className="py-1 font-bold">Unit Kerja</td>
              <td>: {borrowing.unit}</td>
            </tr>
            <tr>
              <td className="py-1 font-bold">Keperluan</td>
              <td>: {borrowing.purpose}</td>
            </tr>
            <tr>
              <td className="py-1 font-bold">Tgl Batas Kembali</td>
              <td>: {idFullDate(borrowing.returnDate)}</td>
            </tr>
          </tbody>
        </table>
      )}
      {disposition?.formData?.legalNumber && (
        <p className="mb-4 text-sm">
          Dasar pelaksanaan: <strong>{disposition.formData.legalNumber}</strong>
          {disposition.formData.description ? ` — ${disposition.formData.description}` : ""}
        </p>
      )}
      <p className="mb-2 text-sm font-bold">Daftar Arsip:</p>
      <table className="mb-8 w-full border-collapse border border-black text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className={cn(cell, "w-10")}>No</th>
            <th className={cell}>Kode / Nomor Arsip</th>
            <th className={cell}>Judul Arsip</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((it, idx) => (
            <tr key={`${it.id}-${idx}`}>
              <td className={cn(cell, "text-center")}>{idx + 1}</td>
              <td className={cn(cell, "font-mono text-xs")}>{it.archiveRegId || it.number || "-"}</td>
              <td className={cell}>{it.title}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mb-16 text-justify">
        Demikian berita acara ini dibuat untuk dapat dipergunakan sebagaimana mestinya.
      </p>
      <div className="flex justify-between text-center text-sm">
        <div className="w-48">
          <p className="mb-16">{borrowing ? "Pihak Peminjam," : "Mengetahui,"}</p>
          <p className="font-bold underline">{borrowing?.borrowerName || "................................"}</p>
        </div>
        <div className="w-48">
          <p className="mb-16">Pengelola Arsip,</p>
          <p className="font-bold underline">{userName || "Admin Arsip"}</p>
        </div>
      </div>
    </A4PreviewDialog>
  );
}
