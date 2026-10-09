import { Search, Trash2, Truck, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useLatchedWhileOpen } from "@/hooks/use-retained";
import { useToday } from "@/hooks/use-today";
import { errorMessage } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";
import { formatLocalYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { DispositionData, DispositionType } from "@/types/entities";
import { type ArchiveFile, archiveTitle, isAwaitingDisposition } from "../lib/archive";

interface DispositionFormDialogProps {
  /** null = tertutup */
  type: DispositionType | null;
  onClose: () => void;
  /** Jumlah arsip terpilih (mode biasa) */
  count?: number;
  /** Mode manual (tab Transaksi): pilih arsip "Perlu Tindak Lanjut" lewat scan/cari */
  manualCandidates?: ArchiveFile[];
  onConfirm: (formData: DispositionData, selected: ArchiveFile[]) => void;
}

/** Form berita acara pemusnahan / penyerahan statis. */
export function DispositionFormDialog({ type: typeProp, onClose, ...props }: DispositionFormDialogProps) {
  const type = useLatchedWhileOpen(!!typeProp, typeProp);
  return (
    <Dialog open={!!typeProp} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-lg">
        {type && <DispositionForm type={type} onClose={onClose} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function DispositionForm({
  type,
  onClose,
  count = 1,
  manualCandidates,
  onConfirm,
}: Omit<DispositionFormDialogProps, "type"> & { type: DispositionType }) {
  const today = useToday();
  const isManual = !!manualCandidates;
  const isDestroy = type === "destroy";
  const Icon = isDestroy ? Trash2 : Truck;
  const [form, setForm] = useState<DispositionData>(() => ({
    legalNumber: "",
    date: formatLocalYMD(today),
    description: "",
    userNote: "",
  }));
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ArchiveFile[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const patch = (values: Partial<DispositionData>) => setForm((prev) => ({ ...prev, ...values }));

  const eligible = useMemo(
    () => (manualCandidates ?? []).filter((r) => isAwaitingDisposition(r, today)),
    [manualCandidates, today],
  );
  const matches = query
    ? eligible.filter(
        (r) =>
          !selected.some((s) => s.id === r.id) &&
          ((r.title ?? "").toLowerCase().includes(query.toLowerCase()) ||
            (r.archiveRegId ?? "").toLowerCase().includes(query.toLowerCase())),
      )
    : [];

  const addItem = (item: ArchiveFile) => {
    setSelected((prev) => (prev.some((x) => x.id === item.id) ? prev : [...prev, item]));
    setQuery("");
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  /** Enter pada kolom scan: cocokkan persis ID registrasi / ID arsip. */
  const handleScan = () => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const found = eligible.find((r) => (r.archiveRegId ?? "").toLowerCase() === q || r.id.toLowerCase() === q);
    if (found) addItem(found);
    else {
      toast.error(`Gagal: Arsip "${q}" tidak ditemukan atau masa retensi inaktifnya belum selesai.`);
      setQuery("");
    }
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const asset = await uploadsApi.upload(file, "archive-disposition");
      patch({ uploadId: asset.id, fileName: asset.originalName ?? file.name });
    } catch (error) {
      toast.error(`Upload berkas gagal: ${errorMessage(error)}`);
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    if (isManual && selected.length === 0) {
      toast.error("Pilih minimal 1 arsip untuk diproses.");
      return;
    }
    if (!form.legalNumber?.trim() || !form.date || !form.description?.trim()) {
      toast.error("Nomor dasar pelaksanaan, tanggal, dan keterangan wajib diisi.");
      return;
    }
    onConfirm(form, selected);
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-11 items-center justify-center rounded-xl",
              isDestroy ? "bg-destructive/10 text-destructive" : "bg-info/15 text-info",
            )}
          >
            <Icon className="size-5" />
          </span>
          <div>
            <DialogTitle>{isDestroy ? "Pemusnahan Arsip" : "Penyerahan Arsip Statis (ANRI)"}</DialogTitle>
            <DialogDescription>Memproses {isManual ? selected.length : count} berkas terpilih.</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="-mx-1 flex-1 overflow-y-auto px-1">
        <FieldGroup className="gap-4">
          {isManual && (
            <Field>
              <FieldLabel htmlFor="disp-scan">Scan / Cari Arsip (Hanya status Perlu Tindak Lanjut)</FieldLabel>
              <div className="relative">
                <InputGroup>
                  <InputGroupAddon>
                    <Search />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="disp-scan"
                    ref={searchRef}
                    autoFocus
                    placeholder="Scan Barcode atau ketik ID/Judul..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleScan();
                      }
                    }}
                  />
                </InputGroup>
                {matches.length > 0 && (
                  <div className="absolute z-50 mt-1 max-h-48 w-full space-y-1 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
                    {matches.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => addItem(r)}
                        className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm hover:bg-muted"
                      >
                        <Badge variant="secondary" className="font-mono">
                          {r.archiveRegId}
                        </Badge>
                        <span className="line-clamp-1">{r.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex min-h-11 flex-wrap gap-2 rounded-xl border bg-muted/40 p-2">
                {selected.length === 0 ? (
                  <span className="w-full py-1 text-center text-xs text-muted-foreground italic">
                    Belum ada arsip yang di-scan.
                  </span>
                ) : (
                  selected.map((it) => (
                    <span
                      key={it.id}
                      className={cn(
                        "flex items-center gap-1 rounded-lg py-1 pr-1 pl-3 text-xs text-white",
                        isDestroy ? "bg-destructive" : "bg-info",
                      )}
                    >
                      <span className="max-w-40 truncate">{archiveTitle(it)}</span>
                      <button
                        type="button"
                        aria-label="Hapus"
                        className="rounded-md p-1 hover:bg-black/20"
                        onClick={() => setSelected((prev) => prev.filter((x) => x.id !== it.id))}
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="disp-legal">Nomor Dasar Pelaksanaan (SK/BA)</FieldLabel>
            <Input
              id="disp-legal"
              autoFocus={!isManual}
              placeholder="Nomor SK / Berita Acara..."
              value={form.legalNumber}
              onChange={(e) => patch({ legalNumber: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="disp-date">Tanggal Eksekusi</FieldLabel>
            <Input id="disp-date" type="date" value={form.date} onChange={(e) => patch({ date: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="disp-desc">Keterangan / Ringkasan</FieldLabel>
            <Textarea
              id="disp-desc"
              rows={2}
              placeholder="Keterangan pelaksanaan..."
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="disp-note">Catatan Tambahan (Pesan User)</FieldLabel>
            <Textarea
              id="disp-note"
              rows={2}
              placeholder="Catatan internal..."
              value={form.userNote}
              onChange={(e) => patch({ userNote: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="disp-file">Upload Berkas (SK/BA) - Opsional</FieldLabel>
            <Input
              id="disp-file"
              type="file"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(f);
              }}
            />
            {(uploading || form.fileName) && (
              <FieldDescription className="flex items-center gap-2">
                {uploading ? (
                  <>
                    <Spinner /> Mengunggah...
                  </>
                ) : (
                  <>Terunggah: {form.fileName}</>
                )}
              </FieldDescription>
            )}
          </Field>
        </FieldGroup>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Batal
        </Button>
        <Button
          disabled={uploading}
          className={cn(
            isDestroy
              ? "bg-destructive text-white hover:bg-destructive/90"
              : "bg-info text-info-foreground hover:bg-info/90",
          )}
          onClick={submit}
        >
          Eksekusi
        </Button>
      </DialogFooter>
    </>
  );
}
