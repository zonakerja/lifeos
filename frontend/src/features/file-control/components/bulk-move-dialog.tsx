import { ArrowDownToLine, Camera, FileText, Folder, Info, ScanLine, Search, UploadCloud, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBorrowings, usePhysRefs } from "@/data/collections";
import { useLatchedWhileOpen } from "@/hooks/use-retained";
import type { PhysicalReference } from "@/types/entities";
import {
  type ArchiveFile,
  archiveTitle,
  borrowedArchiveIds,
  deepestContainerId,
  findBySmartCode,
  isFinalStatus,
  isPhysicalArchive,
  isValidHierarchy,
} from "../lib/archive";
import { useArchiveFiles } from "../use-file-control";
import { CameraScanner } from "./camera-scanner";

type MoveItem = ArchiveFile | PhysicalReference;
/** Tujuan pemindahan: wadah, atau "root" (tanpa wadah). */
export type MoveTarget = PhysicalReference | "root";

const itemName = (item: MoveItem) => ("title" in item && item.title) || ("name" in item && item.name) || "Tanpa Nama";
const itemCode = (item: MoveItem) =>
  ("archiveRegId" in item && item.archiveRegId) || ("code" in item && item.code) || "";
const isFile = (item: MoveItem): item is ArchiveFile => item.type === "file";
/** Arsip yang sudah statis/musnah (fisik maupun digital) tidak boleh ditata lagi. */
const isEndLife = (item: MoveItem) => isFile(item) && isFinalStatus(item);

/** Pemindahan banyak item ke satu wadah dengan pencarian, scanner USB, dan kamera. */
export function BulkMoveDialog({
  target: targetProp,
  onClose,
  onExecute,
}: {
  target: MoveTarget | null;
  onClose: () => void;
  onExecute: (items: MoveItem[]) => void;
}) {
  const target = useLatchedWhileOpen(!!targetProp, targetProp);
  return (
    <Dialog open={!!targetProp} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[88svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl [&>[data-slot=dialog-close]]:text-white">
        {target && <BulkMove target={target} onExecute={onExecute} />}
      </DialogContent>
    </Dialog>
  );
}

function BulkMove({ target, onExecute }: { target: MoveTarget; onExecute: (items: MoveItem[]) => void }) {
  const { items: refs } = usePhysRefs();
  const { files } = useArchiveFiles();
  const { items: borrowings } = useBorrowings();
  const borrowed = borrowedArchiveIds(borrowings);
  const isRoot = target === "root";
  const targetId = isRoot ? "root" : target.id;
  const targetType = isRoot ? "root" : target.type;

  const [tab, setTab] = useState("search");
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [staging, setStaging] = useState<MoveItem[]>([]);
  const [validation, setValidation] = useState({ status: "all" });
  const [confirmReset, setConfirmReset] = useState(false);

  const childType = { box: "folder", rack: "box", location: "rack" } as const;
  const containerCandidates =
    targetType === "box" || targetType === "rack" || targetType === "location"
      ? refs.filter((r) => r.type === childType[targetType] && r.id !== targetId && r.parentId !== targetId)
      : [];
  const fileCandidates = files.filter((r) => {
    if (!isPhysicalArchive(r) || isEndLife(r) || borrowed.has(r.id)) return false;
    const parent = deepestContainerId(r);
    return isRoot ? !!parent : parent !== targetId;
  });
  const q = query.toLowerCase();
  const dropdown = [...containerCandidates, ...fileCandidates]
    .filter(
      (item) =>
        (itemName(item).toLowerCase().includes(q) || itemCode(item).toLowerCase().includes(q)) &&
        !staging.some((s) => s.id === item.id),
    )
    .slice(0, 20);

  const reject = (message: string, silent: boolean) => {
    if (!silent) toast.error(message);
    return false;
  };

  const addToStaging = (item: MoveItem, scanner: boolean) => {
    if (staging.some((s) => s.id === item.id)) return reject(`"${itemName(item)}" sudah ada di antrean.`, scanner);
    const val = validation;
    if (isFile(item)) {
      if (val.status === "active" && item.status !== "active")
        return reject(`Filter Status Aktif menyala, namun arsip berstatus ${item.status}.`, scanner);
      if (val.status === "inactive" && item.status !== "inactive")
        return reject(`Filter Status Inaktif menyala, namun arsip berstatus ${item.status}.`, scanner);
    }
    setStaging((prev) => (prev.some((s) => s.id === item.id) ? prev : [...prev, item]));
    setQuery("");
    return true;
  };

  /** Validasi status, hierarki, dan lokasi sebelum masuk antrean. */
  const processItem = (item: MoveItem, scanner = false) => {
    if (isFile(item)) {
      if (item.archivalStatus === "digital")
        return reject(
          `Ditolak: Arsip "${itemName(item)}" adalah arsip digital dan tidak ditata di wadah fisik.`,
          false,
        );
      if (!isPhysicalArchive(item))
        return reject(`Ditolak: Arsip "${itemName(item)}" belum diberkaskan sebagai arsip fisik.`, scanner);
      if (isEndLife(item))
        return reject(
          `Ditolak: Arsip "${itemName(item)}" sudah berstatus ${item.status === "destroyed" ? "Musnah" : "Statis"} sehingga tidak dapat ditata kembali.`,
          false,
        );
      if (borrowed.has(item.id))
        return reject(
          `Ditolak: Arsip "${itemName(item)}" sedang dipinjam. Selesaikan peminjamannya sebelum memindahkan.`,
          false,
        );
    } else if (isRoot) {
      return reject('Hierarki Ditolak: Hanya "Arsip" yang dapat dipindahkan ke ROOT (Tanpa Wadah).', scanner);
    } else if (!isValidHierarchy(item.type, targetType)) {
      return reject(
        `Hierarki Ditolak: Anda tidak dapat memasukkan tipe [${item.type.toUpperCase()}] ke dalam wadah [${targetType.toUpperCase()}].`,
        false,
      );
    }
    const existing = isFile(item)
      ? isRoot
        ? !deepestContainerId(item)
        : deepestContainerId(item) === targetId
      : isRoot
        ? !item.parentId
        : item.parentId === targetId;
    if (existing) return reject(`Duplikasi Ditolak: "${itemName(item)}" saat ini sudah berada di lokasi ini.`, scanner);
    return addToStaging(item, scanner);
  };

  const scanCode = (code: string, scanner: boolean) => {
    const found = findBySmartCode(code.trim(), refs, files);
    if (found) processItem(found, scanner);
    else if (!scanner) toast.error(`Pencarian Gagal: Barcode atau ID "${code}" tidak ditemukan di database.`);
  };

  const locked = staging.length > 0;

  return (
    <>
      <DialogHeader className="bg-module-gradient p-6 text-white">
        <DialogTitle className="flex items-center gap-2 text-2xl">
          <ArrowDownToLine /> Pindahkan Item ke Sini
        </DialogTitle>
        <DialogDescription className="text-white/85">
          Target: {isRoot ? "ROOT (Tanpa Wadah)" : `${target.name} (${target.code})`}
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex flex-col gap-4 border-b bg-muted/40 p-4 md:w-80 md:border-r md:border-b-0">
          <div className="space-y-3 rounded-xl border bg-card p-3">
            <p className="text-xs font-bold text-module uppercase">
              Filter Validasi{" "}
              <span className="text-[10px] font-normal text-muted-foreground normal-case">(Khusus Arsip)</span>
            </p>
            <Field>
              <FieldLabel className="text-[10px] uppercase">Status</FieldLabel>
              <Select value={validation.status} disabled={locked} onValueChange={(status) => setValidation({ status })}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Inaktif</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => (locked ? setConfirmReset(true) : setValidation({ status: "all" }))}
            >
              Reset Filter
            </Button>
          </div>

          <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1">
            <TabsList className="w-full">
              <TabsTrigger value="search">
                <Search /> Cari
              </TabsTrigger>
              <TabsTrigger value="barcode">
                <ScanLine /> Scan
              </TabsTrigger>
              <TabsTrigger value="camera">
                <Camera /> Cam
              </TabsTrigger>
            </TabsList>
            <TabsContent value="search" className="space-y-3">
              <Input placeholder="Ketik Kode / Nama..." value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {dropdown.length > 0 ? (
                  dropdown.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => processItem(item)}
                      className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-module-soft"
                    >
                      <span className="rounded-lg bg-muted p-2">
                        {isFile(item) ? <FileText className="size-4" /> : <Folder className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold">{itemName(item)}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{itemCode(item)}</span>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="p-6 text-center text-xs text-muted-foreground">
                    {query ? "Item tidak ditemukan" : "Tidak ada kandidat"}
                  </p>
                )}
              </div>
              <p className="flex gap-2 rounded-lg border border-info/30 bg-info/10 p-3 text-[11px] text-info">
                <Info className="size-4 shrink-0" />
                Mode Cari Manual menampilkan item global yang belum ada di sini dan cocok secara hierarki.
              </p>
            </TabsContent>
            <TabsContent value="barcode" className="space-y-3">
              <div className="flex flex-col items-center rounded-xl border-2 border-dashed p-6 text-center text-muted-foreground">
                <ScanLine className="mb-2 size-10" />
                <p className="text-xs">Gunakan Barcode Scanner USB</p>
              </div>
              <Input
                autoFocus
                className="h-12 border-2 border-module text-center font-mono text-lg"
                placeholder="Klik di sini & Scan..."
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (barcode.trim()) scanCode(barcode, false);
                  setBarcode("");
                }}
              />
            </TabsContent>
            <TabsContent value="camera">
              {tab === "camera" && <CameraScanner onScan={(text) => scanCode(text, true)} />}
              <p className="mt-3 text-center text-xs font-bold text-muted-foreground">
                Arahkan kamera ke QR Code Arsip atau Wadah.
              </p>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold">Daftar Item ({staging.length})</h3>
            {staging.length > 0 && (
              <Button variant="link" size="sm" className="text-destructive" onClick={() => setStaging([])}>
                Hapus Semua
              </Button>
            )}
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto rounded-xl border bg-muted/40 p-2">
            {staging.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-10 text-muted-foreground">
                <UploadCloud className="mb-2 size-10" />
                <p className="text-sm">Belum ada item ditambahkan</p>
              </div>
            ) : (
              staging.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                  <Badge className="size-6 justify-center rounded-full bg-success/15 p-0 text-success">{idx + 1}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{isFile(item) ? archiveTitle(item) : item.name}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">{itemCode(item)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Keluarkan"
                    onClick={() => setStaging((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <X />
                  </Button>
                </div>
              ))
            )}
          </div>
          <Button size="lg" className="mt-4" disabled={staging.length === 0} onClick={() => onExecute(staging)}>
            <ArrowDownToLine /> Proses Pindahkan {staging.length} Item
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset Filter?"
        description={`Mereset filter akan menghapus semua ${staging.length} item antrean. Lanjutkan?`}
        confirmLabel="Ya, Reset"
        onConfirm={() => {
          setValidation({ status: "all" });
          setStaging([]);
          setConfirmReset(false);
        }}
      />
    </>
  );
}
