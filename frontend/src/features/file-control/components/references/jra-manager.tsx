import { PencilLine, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { type PageSize, PaginationControl, paginate } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useJraList } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import { useRetained } from "@/hooks/use-retained";
import { generateId } from "@/lib/ids";
import type { ArchiveJra } from "@/types/entities";
import { CsvImportButton } from "./csv-import-button";

const ALL = "__all";
const KETERANGAN = ["Musnah", "Permanen", "Dinilai Kembali"];
const emptyJra = (): Omit<ArchiveJra, "id"> => ({
  kategoriUtama: "",
  subKategori: "",
  jenisArsip: "",
  retensiAktif: "",
  retensiInaktif: "",
  keterangan: "Musnah",
});

/** Referensi Jadwal Retensi Arsip (JRA). */
export function JraManager() {
  const { items, setItems } = useJraList();
  const { canEdit } = usePermissions();
  const [search, setSearch] = useState("");
  const [kategori, setKategori] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [editing, setEditing] = useState<ArchiveJra | "new" | null>(null);
  const [deleting, setDeleting] = useState<ArchiveJra | null>(null);

  const uniqueKategori = [...new Set(items.map((j) => j.kategoriUtama ?? "").filter(Boolean))].sort();
  const q = search.toLowerCase();
  const filtered = items.filter(
    (j) =>
      ((j.jenisArsip ?? "").toLowerCase().includes(q) || (j.subKategori ?? "").toLowerCase().includes(q)) &&
      (!kategori || j.kategoriUtama === kategori) &&
      (!keterangan || j.keterangan === keterangan),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h3 className="text-lg font-bold">Referensi Jadwal Retensi Arsip (JRA)</h3>
          <p className="text-sm text-muted-foreground">Kelola masa simpan arsip aktif dan inaktif.</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <CsvImportButton
              entityLabel="JRA"
              parseRow={(cols) =>
                cols.length >= 6
                  ? {
                      id: generateId("jra"),
                      kategoriUtama: cols[0],
                      subKategori: cols[1],
                      jenisArsip: cols[2],
                      retensiAktif: Number.parseInt(cols[3]) || 0,
                      retensiInaktif: Number.parseInt(cols[4]) || 0,
                      keterangan: cols[5],
                    }
                  : null
              }
              onImport={(rows) => setItems((prev) => [...prev, ...rows])}
            />
            <Button onClick={() => setEditing("new")}>
              <Plus /> Tambah Manual
            </Button>
          </div>
        )}
      </div>

      <Card className="flex flex-col gap-3 p-4 md:flex-row">
        <SearchInput
          className="md:flex-1"
          placeholder="Cari Kode atau Nama Arsip..."
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
        <Select
          value={kategori || ALL}
          onValueChange={(v) => {
            setKategori(v === ALL ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="md:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>-- Semua Kategori --</SelectItem>
            {uniqueKategori.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={keterangan || ALL}
          onValueChange={(v) => {
            setKeterangan(v === ALL ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="md:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>-- Keterangan --</SelectItem>
            {KETERANGAN.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(kategori || keterangan || search) && (
          <Button
            variant="secondary"
            size="icon"
            aria-label="Reset filter"
            onClick={() => {
              setKategori("");
              setKeterangan("");
              setSearch("");
            }}
          >
            <RotateCcw />
          </Button>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-52">Kategori</TableHead>
              <TableHead>Jenis Arsip</TableHead>
              <TableHead className="w-20 text-center">Aktif</TableHead>
              <TableHead className="w-20 text-center">Inaktif</TableHead>
              <TableHead className="w-36">Keterangan</TableHead>
              {canEdit && <TableHead className="w-24 text-center">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground italic">
                  Data JRA tidak ditemukan.
                </TableCell>
              </TableRow>
            )}
            {paginate(filtered, page, pageSize).map((j) => (
              <TableRow key={j.id}>
                <TableCell className="whitespace-normal">
                  <span className="block font-bold text-module">{j.kategoriUtama}</span>
                  <span className="text-[11px] text-muted-foreground">{j.subKategori}</span>
                </TableCell>
                <TableCell className="font-medium whitespace-normal">{j.jenisArsip}</TableCell>
                <TableCell className="text-center font-bold">{j.retensiAktif} Thn</TableCell>
                <TableCell className="text-center font-bold">{j.retensiInaktif} Thn</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      j.keterangan === "Permanen"
                        ? "border-info/30 bg-info/10 text-info"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    }
                  >
                    {j.keterangan}
                  </Badge>
                </TableCell>
                {canEdit && (
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setEditing(j)}>
                        <PencilLine />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Hapus"
                        className="text-destructive"
                        onClick={() => setDeleting(j)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="text-right text-xs text-muted-foreground">Total JRA: {filtered.length}</p>
      <PaginationControl
        totalItems={filtered.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <JraFormDialog
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(data) => {
          if (editing && editing !== "new") {
            setItems((prev) => prev.map((j) => (j.id === editing.id ? { ...j, ...data } : j)));
          } else {
            setItems((prev) => [...prev, { ...data, id: generateId("jra") }]);
          }
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus JRA?"
        description="Data ini akan dihapus dari referensi."
        itemName={deleting?.jenisArsip}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting) setItems((prev) => prev.filter((j) => j.id !== deleting.id));
          setDeleting(null);
        }}
      />
    </div>
  );
}

function JraFormDialog({
  item: itemProp,
  onClose,
  onSave,
}: {
  item: ArchiveJra | "new" | null;
  onClose: () => void;
  onSave: (data: Omit<ArchiveJra, "id">) => void;
}) {
  const item = useRetained(itemProp);
  return (
    <Dialog open={itemProp !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item === "new" ? "Tambah Jadwal Retensi" : "Edit Jadwal Retensi"}</DialogTitle>
        </DialogHeader>
        {item !== null && (
          <JraForm
            key={item === "new" ? "new" : item.id}
            initial={item === "new" ? emptyJra() : item}
            onCancel={onClose}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function JraForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: Omit<ArchiveJra, "id">;
  onCancel: () => void;
  onSave: (data: Omit<ArchiveJra, "id">) => void;
}) {
  const [form, setForm] = useState(initial);
  const patch = (values: Partial<ArchiveJra>) => setForm((prev) => ({ ...prev, ...values }));
  const valid =
    form.kategoriUtama && form.subKategori && form.jenisArsip && form.retensiAktif !== "" && form.retensiInaktif !== "";

  return (
    <>
      <FieldGroup className="gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="jra-kat">Kategori Utama</FieldLabel>
            <Input
              id="jra-kat"
              placeholder="KEBIJAKAN"
              value={form.kategoriUtama ?? ""}
              onChange={(e) => patch({ kategoriUtama: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="jra-sub">Sub Kategori</FieldLabel>
            <Input
              id="jra-sub"
              placeholder="Umum"
              value={form.subKategori ?? ""}
              onChange={(e) => patch({ subKategori: e.target.value })}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="jra-jenis">Jenis Arsip / Uraian</FieldLabel>
          <Textarea
            id="jra-jenis"
            rows={2}
            placeholder="Pengkajian dan pengusulan kebijakan..."
            value={form.jenisArsip}
            onChange={(e) => patch({ jenisArsip: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field>
            <FieldLabel htmlFor="jra-aktif">Aktif (Thn)</FieldLabel>
            <Input
              id="jra-aktif"
              type="number"
              min={0}
              value={form.retensiAktif}
              onChange={(e) => patch({ retensiAktif: Number.parseInt(e.target.value) || 0 })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="jra-inaktif">Inaktif (Thn)</FieldLabel>
            <Input
              id="jra-inaktif"
              type="number"
              min={0}
              value={form.retensiInaktif}
              onChange={(e) => patch({ retensiInaktif: Number.parseInt(e.target.value) || 0 })}
            />
          </Field>
          <Field>
            <FieldLabel>Keterangan</FieldLabel>
            <Select value={form.keterangan} onValueChange={(v) => patch({ keterangan: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KETERANGAN.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Batal
        </Button>
        <Button disabled={!valid} onClick={() => onSave(form)}>
          Simpan
        </Button>
      </DialogFooter>
    </>
  );
}
