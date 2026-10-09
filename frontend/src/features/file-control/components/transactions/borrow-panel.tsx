import { Briefcase, CheckCircle2, Handshake, Plus, Printer, Search, Send, User, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { type PageSize, PaginationControl, paginate } from "@/components/common/pagination-control";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { useBorrowings } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import { useToday } from "@/hooks/use-today";
import { formatLocalYMD, formatNumericDate, parseLocalYMD } from "@/lib/dates";
import type { ArchiveBorrowing, ArchiveItemRef } from "@/types/entities";
import { archiveTitle, isFinalStatus, isManagedArchive, toItemRef } from "../../lib/archive";
import { useArchiveFiles, useFileControlActions } from "../../use-file-control";
import { BapPrintDialog } from "../print-documents";

const dateText = (value: string) => {
  const d = parseLocalYMD(value) ?? new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : formatNumericDate(d);
};

/** Sirkulasi peminjaman arsip. */
export function BorrowPanel() {
  const { items: borrowings } = useBorrowings();
  const { canEdit } = usePermissions();
  const actions = useFileControlActions();
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [printing, setPrinting] = useState<ArchiveBorrowing | null>(null);
  const [confirm, setConfirm] = useState<{ action: "return" | "cancel"; id: string } | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Daftar Peminjaman</h3>
        {canEdit && (
          <Button variant={showForm ? "outline" : "default"} onClick={() => setShowForm((v) => !v)}>
            {showForm ? <X /> : <Plus />} {showForm ? "Batal" : "Buat Peminjaman"}
          </Button>
        )}
      </div>

      {showForm && <BorrowForm onDone={() => setShowForm(false)} />}

      {borrowings.length === 0 ? (
        <Empty className="border-2 border-dashed">
          <EmptyHeader>
            <EmptyTitle>Belum ada riwayat peminjaman.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {paginate(borrowings, page, pageSize).map((b) => (
            <div
              key={b.id}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-bold">
                  {b.borrowerName} <span className="text-xs font-normal text-muted-foreground">({b.unit || "-"})</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Tgl Kembali: {dateText(b.returnDate)} • {b.items.length} item
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon-sm" aria-label="Cetak BAP" onClick={() => setPrinting(b)}>
                  <Printer />
                </Button>
                {b.status === "active" ? (
                  canEdit ? (
                    <>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setConfirm({ action: "cancel", id: b.id })}
                      >
                        Batalkan
                      </Button>
                      <Button
                        size="sm"
                        className="bg-warning text-warning-foreground hover:bg-warning/90"
                        onClick={() => setConfirm({ action: "return", id: b.id })}
                      >
                        Kembalikan
                      </Button>
                    </>
                  ) : (
                    <Badge variant="outline" className="border-warning/40 bg-warning/15">
                      Dipinjam
                    </Badge>
                  )
                ) : b.status === "cancelled" ? (
                  <Badge variant="secondary">
                    <X /> Dibatalkan
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                    <CheckCircle2 /> Dikembalikan
                  </Badge>
                )}
              </div>
            </div>
          ))}
          <PaginationControl
            totalItems={borrowings.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            sizes={[5, 10, 25]}
          />
        </div>
      )}

      <BapPrintDialog doc={printing} onClose={() => setPrinting(null)} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.action === "cancel" ? "Batalkan Pinjaman" : "Konfirmasi Pengembalian"}
        description={
          confirm?.action === "cancel"
            ? "Apakah Anda yakin ingin membatalkan transaksi peminjaman ini?"
            : "Apakah Anda yakin seluruh arsip dalam peminjaman ini telah dikembalikan?"
        }
        destructive={confirm?.action === "cancel"}
        confirmLabel="Ya, Lanjutkan"
        cancelLabel="Kembali"
        onConfirm={() => {
          if (confirm?.action === "return") {
            actions.returnBorrowing(confirm.id);
            toast.success("Status arsip berhasil diubah menjadi dikembalikan.");
          } else if (confirm) {
            actions.cancelBorrowing(confirm.id);
            toast.success("Transaksi peminjaman berhasil dibatalkan.");
          }
          setConfirm(null);
        }}
      />
    </div>
  );
}

function BorrowForm({ onDone }: { onDone: () => void }) {
  const today = useToday();
  const { files } = useArchiveFiles();
  const { items: borrowings } = useBorrowings();
  const actions = useFileControlActions();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ArchiveItemRef[]>([]);
  const [form, setForm] = useState({
    borrowerName: "",
    unit: "",
    purpose: "",
    borrowDate: formatLocalYMD(today),
    returnDate: "",
  });

  const borrowable = files.filter((r) => isManagedArchive(r) && !isFinalStatus(r));
  const q = search.toLowerCase();
  const matches = search
    ? borrowable.filter(
        (r) =>
          ((r.title ?? "").toLowerCase().includes(q) || (r.archiveRegId ?? "").toLowerCase().includes(q)) &&
          !borrowings.some((b) => b.status === "active" && b.items?.some((i) => i.id === r.id)),
      )
    : [];

  const addItem = (ref: ArchiveItemRef) => {
    setItems((prev) => (prev.some((x) => x.id === ref.id) ? prev : [...prev, ref]));
    setSearch("");
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const handleScan = () => {
    const code = search.trim().toLowerCase();
    if (!code) return;
    const found = borrowable.find((r) => (r.archiveRegId ?? "").toLowerCase() === code || r.id.toLowerCase() === code);
    if (found) addItem(toItemRef(found));
    else {
      toast.error(`Arsip dengan Barcode "${code}" tidak ditemukan, atau berstatus Statis/Musnah.`);
      setSearch("");
    }
  };

  const submit = () => {
    if (items.length === 0) {
      toast.error("Pilih minimal 1 arsip untuk dipinjam.");
      return;
    }
    if (!form.borrowerName.trim() || !form.returnDate || !form.borrowDate) {
      toast.error("Mohon lengkapi semua field wajib (Peminjam, Tanggal Pinjam, Target Kembali).");
      return;
    }
    actions.createBorrowing({
      date: form.borrowDate,
      returnDate: form.returnDate,
      borrowerName: form.borrowerName.trim(),
      unit: form.unit,
      purpose: form.purpose,
      items,
    });
    toast.success("Sirkulasi peminjaman berhasil dicatat!");
    onDone();
  };

  return (
    <SectionCard
      icon={Handshake}
      title="Formulir Peminjaman"
      description="Catat sirkulasi keluar arsip fisik ke pihak terkait."
    >
      <FieldGroup className="gap-5">
        <Field className="rounded-2xl border bg-muted/40 p-4">
          <FieldLabel htmlFor="borrow-search">
            Cari &amp; Pilih Arsip Fisik <span className="text-destructive">*</span>
          </FieldLabel>
          <div className="relative">
            <InputGroup className="bg-card">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                id="borrow-search"
                ref={searchRef}
                placeholder="Scan Barcode atau ketik kode/judul arsip..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleScan();
                  }
                }}
              />
            </InputGroup>
            {search && (
              <div className="absolute z-20 mt-1 max-h-48 w-full space-y-1 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
                {matches.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => addItem(toItemRef(r))}
                    className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm hover:bg-module-soft"
                  >
                    <Badge variant="secondary" className="font-mono">
                      {r.archiveRegId || "NO-ID"}
                    </Badge>
                    <span className="line-clamp-1">{archiveTitle(r)}</span>
                  </button>
                ))}
                {matches.length === 0 && (
                  <p className="p-3 text-center text-xs text-muted-foreground italic">
                    Arsip tidak ditemukan, berstatus Statis/Musnah, atau sedang dipinjam.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex min-h-11 flex-wrap gap-2 rounded-xl border bg-card p-2">
            {items.length === 0 ? (
              <span className="w-full py-1 text-center text-xs text-muted-foreground italic">
                Belum ada arsip yang dipilih.
              </span>
            ) : (
              items.map((it) => (
                <span
                  key={it.id}
                  className="flex items-center gap-1 rounded-lg bg-module py-1 pr-1 pl-3 text-xs text-module-foreground"
                >
                  <span className="max-w-52 truncate">{it.title}</span>
                  <button
                    type="button"
                    aria-label="Hapus"
                    className="rounded-md p-1 hover:bg-black/15"
                    onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))
            )}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="borrow-name">
              Nama Peminjam <span className="text-destructive">*</span>
            </FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <User />
              </InputGroupAddon>
              <InputGroupInput
                id="borrow-name"
                placeholder="Contoh: Budi Santoso"
                value={form.borrowerName}
                onChange={(e) => setForm((f) => ({ ...f, borrowerName: e.target.value }))}
              />
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="borrow-unit">Unit / Instansi</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <Briefcase />
              </InputGroupAddon>
              <InputGroupInput
                id="borrow-unit"
                placeholder="Contoh: Divisi Keuangan"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              />
            </InputGroup>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 rounded-2xl border bg-module-soft/50 p-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="borrow-date">
              Tanggal Pinjam <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="borrow-date"
              type="date"
              className="bg-card"
              value={form.borrowDate}
              onChange={(e) => setForm((f) => ({ ...f, borrowDate: e.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="borrow-return">
              Target Kembali <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="borrow-return"
              type="date"
              className="bg-card"
              value={form.returnDate}
              onChange={(e) => setForm((f) => ({ ...f, returnDate: e.target.value }))}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="borrow-purpose">Keperluan / Keterangan</FieldLabel>
          <Textarea
            id="borrow-purpose"
            rows={2}
            placeholder="Tuliskan tujuan peminjaman secara singkat..."
            value={form.purpose}
            onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
          />
        </Field>

        <Button size="lg" onClick={submit}>
          <Send /> Proses Peminjaman Arsip
        </Button>
      </FieldGroup>
    </SectionCard>
  );
}
