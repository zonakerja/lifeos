import { PencilLine, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { type PageSize, PaginationControl, paginate } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClassifications } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import { useRetained } from "@/hooks/use-retained";
import { generateId } from "@/lib/ids";
import type { ArchiveClassification } from "@/types/entities";
import { classificationCode, classificationKey, countArchivesUsing } from "../../lib/archive";
import { useArchiveFiles } from "../../use-file-control";
import { CsvImportButton } from "./csv-import-button";

const ALL = "__all";
const emptyClassification = (): Omit<ArchiveClassification, "id"> => ({
  jenis: "Fasilitatif",
  kodePokok: "",
  namaPokok: "",
  kodeSub: "",
  namaSub: "",
  kodeItem: "",
  namaItem: "",
});

/** Referensi kode klasifikasi arsip. */
export function ClassificationManager() {
  const { items, setItems } = useClassifications();
  const { files } = useArchiveFiles();
  const { canEdit } = usePermissions();
  const [search, setSearch] = useState("");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [editing, setEditing] = useState<ArchiveClassification | "new" | null>(null);
  const [deleting, setDeleting] = useState<ArchiveClassification | null>(null);

  const primaryKey = (c: ArchiveClassification) => `${c.kodePokok} - ${c.namaPokok ?? ""}`;
  const secondaryKey = (c: ArchiveClassification) => `${c.kodeSub} - ${c.namaSub ?? ""}`;
  const uniquePrimary = [...new Set(items.map(primaryKey))].sort();
  const uniqueSecondary = [
    ...new Set(items.filter((c) => !primary || primaryKey(c) === primary).map(secondaryKey)),
  ].sort();

  const q = search.toLowerCase();
  const filtered = items.filter(
    (c) =>
      ((c.namaItem ?? "").toLowerCase().includes(q) ||
        (c.namaSub ?? "").toLowerCase().includes(q) ||
        `${c.kodePokok}${c.kodeSub}${c.kodeItem}`.includes(search)) &&
      (!primary || primaryKey(c) === primary) &&
      (!secondary || secondaryKey(c) === secondary),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h3 className="text-lg font-bold">Referensi Klasifikasi Arsip</h3>
          <p className="text-sm text-muted-foreground">Kelola Kode Klasifikasi (Primer, Sekunder, Tersier).</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <CsvImportButton
              entityLabel="klasifikasi"
              parseRow={(cols) =>
                cols.length >= 7
                  ? {
                      id: generateId("cls"),
                      jenis: cols[0],
                      kodePokok: cols[1].toUpperCase(),
                      namaPokok: cols[2],
                      kodeSub: cols[3].padStart(2, "0"),
                      namaSub: cols[4],
                      kodeItem: cols[5].padStart(3, "0"),
                      namaItem: cols[6],
                    }
                  : null
              }
              keyOf={classificationKey}
              existingKeys={items.map(classificationKey)}
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
          value={primary || ALL}
          onValueChange={(v) => {
            setPrimary(v === ALL ? "" : v);
            setSecondary("");
            setPage(1);
          }}
        >
          <SelectTrigger className="md:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>-- Semua Kode Primer --</SelectItem>
            {uniquePrimary.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={secondary || ALL}
          disabled={!primary}
          onValueChange={(v) => {
            setSecondary(v === ALL ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="md:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>-- Semua Kode Sekunder --</SelectItem>
            {uniqueSecondary.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(primary || search) && (
          <Button
            variant="secondary"
            size="icon"
            aria-label="Reset filter"
            onClick={() => {
              setPrimary("");
              setSecondary("");
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
              <TableHead className="w-32">Kode</TableHead>
              <TableHead className="w-24">Primer</TableHead>
              <TableHead className="w-48">Sekunder</TableHead>
              <TableHead>Jenis Arsip (Tersier)</TableHead>
              {canEdit && <TableHead className="w-24 text-center">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground italic">
                  Data tidak ditemukan.
                </TableCell>
              </TableRow>
            )}
            {paginate(filtered, page, pageSize).map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono font-bold text-module">{classificationCode(c)}</TableCell>
                <TableCell className="font-bold">{c.kodePokok}</TableCell>
                <TableCell>
                  <span className="block font-bold">{c.kodeSub}</span>
                  <span className="line-clamp-1 text-[11px] text-muted-foreground">{c.namaSub}</span>
                </TableCell>
                <TableCell className="font-semibold whitespace-normal">{c.namaItem}</TableCell>
                {canEdit && (
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setEditing(c)}>
                        <PencilLine />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Hapus"
                        className="text-destructive"
                        onClick={() => {
                          const used = countArchivesUsing(files, "classificationId", c.id);
                          if (used > 0) {
                            toast.error(
                              `Klasifikasi ${classificationCode(c)} tidak dapat dihapus karena dipakai ${used} arsip. Ubah klasifikasi arsip tersebut terlebih dahulu.`,
                            );
                            return;
                          }
                          setDeleting(c);
                        }}
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
      <p className="text-right text-xs text-muted-foreground">Total Referensi: {filtered.length}</p>
      <PaginationControl
        totalItems={filtered.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <ClassificationFormDialog
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(data) => {
          const editingId = editing && editing !== "new" ? editing.id : null;
          const key = classificationKey(data);
          if (items.some((c) => c.id !== editingId && classificationKey(c) === key)) {
            toast.error(`Kode klasifikasi ${key} sudah ada. Gunakan kode lain atau ubah data yang sudah ada.`);
            return;
          }
          if (editing && editing !== "new") {
            setItems((prev) => prev.map((c) => (c.id === editing.id ? { ...c, ...data } : c)));
          } else {
            setItems((prev) => [...prev, { ...data, id: generateId("cls") }]);
          }
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Klasifikasi?"
        description="Data ini akan dihapus dari referensi."
        itemName={deleting?.namaItem}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting) setItems((prev) => prev.filter((c) => c.id !== deleting.id));
          setDeleting(null);
        }}
      />
    </div>
  );
}

function ClassificationFormDialog({
  item: itemProp,
  onClose,
  onSave,
}: {
  item: ArchiveClassification | "new" | null;
  onClose: () => void;
  onSave: (data: Omit<ArchiveClassification, "id">) => void;
}) {
  const item = useRetained(itemProp);
  return (
    <Dialog open={itemProp !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item === "new" ? "Tambah Klasifikasi Baru" : "Edit Klasifikasi"}</DialogTitle>
        </DialogHeader>
        {item !== null && (
          <ClassificationForm
            key={item === "new" ? "new" : item.id}
            initial={item === "new" ? emptyClassification() : item}
            onCancel={onClose}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ClassificationForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: Omit<ArchiveClassification, "id">;
  onCancel: () => void;
  onSave: (data: Omit<ArchiveClassification, "id">) => void;
}) {
  const [form, setForm] = useState(initial);
  const patch = (values: Partial<ArchiveClassification>) => setForm((prev) => ({ ...prev, ...values }));
  const valid = form.kodePokok && form.namaPokok && form.kodeSub && form.namaSub && form.kodeItem && form.namaItem;

  const pair = (
    codeKey: "kodePokok" | "kodeSub" | "kodeItem",
    nameKey: "namaPokok" | "namaSub" | "namaItem",
    codeLabel: string,
    nameLabel: string,
    maxLength: number,
    placeholders: [string, string],
  ) => (
    <div className="grid grid-cols-3 gap-3">
      <Field>
        <FieldLabel htmlFor={`cls-${codeKey}`}>{codeLabel}</FieldLabel>
        <Input
          id={`cls-${codeKey}`}
          maxLength={maxLength}
          placeholder={placeholders[0]}
          className="font-mono uppercase"
          value={form[codeKey]}
          onChange={(e) =>
            patch({ [codeKey]: codeKey === "kodePokok" ? e.target.value.toUpperCase() : e.target.value })
          }
        />
      </Field>
      <Field className="col-span-2">
        <FieldLabel htmlFor={`cls-${nameKey}`}>{nameLabel}</FieldLabel>
        <Input
          id={`cls-${nameKey}`}
          placeholder={placeholders[1]}
          value={form[nameKey] ?? ""}
          onChange={(e) => patch({ [nameKey]: e.target.value })}
        />
      </Field>
    </div>
  );

  return (
    <>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel>Jenis Klasifikasi</FieldLabel>
          <Select value={form.jenis ?? "Fasilitatif"} onValueChange={(v) => patch({ jenis: v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Fasilitatif">Fasilitatif</SelectItem>
              <SelectItem value="Substantif">Substantif</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {pair("kodePokok", "namaPokok", "Kode Pokok", "Nama Pokok", 2, ["HK", "HUKUM"])}
        {pair("kodeSub", "namaSub", "Kode Sub", "Nama Sub", 2, ["01", "Perundang-undangan"])}
        {pair("kodeItem", "namaItem", "Kode Item", "Nama Item / Jenis Arsip", 4, ["001", "UU / Perpu"])}
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
