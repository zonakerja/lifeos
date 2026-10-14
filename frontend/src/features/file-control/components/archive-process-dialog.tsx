import { CheckCircle2, Clock, FileBox, HardDrive, MapPin, Printer, Save, Shield } from "lucide-react";
import { useRef, useState } from "react";
import { SearchableSelect } from "@/components/common/searchable-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useClassifications, useJraList, usePhysRefs } from "@/data/collections";
import { useRetained } from "@/hooks/use-retained";
import { useToday } from "@/hooks/use-today";
import { parseLocalYMD, startOfDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ArchiveFields, PhysicalReference } from "@/types/entities";
import {
  type ArchiveFile,
  archiveTitle,
  classificationCode,
  EMPTY_LOCATION,
  generateArchiveRegId,
  retentionDatesFromJra,
} from "../lib/archive";
import { printElement } from "../lib/print";
import { useFileControlActions } from "../use-file-control";
import { ArchiveLabel } from "./archive-ui";

const NONE = "__none";

type ProcessForm = Required<
  Pick<
    ArchiveFields,
    | "archivalStatus"
    | "classificationId"
    | "jraId"
    | "retentionActiveDate"
    | "retentionInactiveDate"
    | "physLocationId"
    | "physRackId"
    | "physBoxId"
    | "physFolderId"
    | "digitalApp"
    | "digitalLink"
    | "notes"
    | "archiveRegId"
    | "isVital"
    | "isAutoDispose"
  >
>;

const initialForm = (r: ArchiveFile): ProcessForm => ({
  archivalStatus: r.archivalStatus && r.archivalStatus !== "pending" ? r.archivalStatus : "digital",
  classificationId: r.classificationId || "",
  jraId: r.jraId || "",
  retentionActiveDate: r.retentionActiveDate || "",
  retentionInactiveDate: r.retentionInactiveDate || "",
  physLocationId: r.physLocationId || "",
  physRackId: r.physRackId || "",
  physBoxId: r.physBoxId || "",
  physFolderId: r.physFolderId || "",
  digitalApp: r.digitalApp || "",
  digitalLink: r.digitalLink || "",
  notes: r.notes || "",
  archiveRegId: r.archiveRegId || generateArchiveRegId(r.date),
  isVital: r.isVital || false,
  isAutoDispose: r.isAutoDispose || false,
});

/** Proses pemberkasan / edit data kearsipan. */
export function ArchiveProcessDialog({ file: fileProp, onClose }: { file: ArchiveFile | null; onClose: () => void }) {
  const file = useRetained(fileProp);
  return (
    <Dialog open={!!fileProp} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {file && <ProcessForm key={file.id} file={file} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ProcessForm({ file, onDone }: { file: ArchiveFile; onDone: () => void }) {
  const today = useToday();
  const actions = useFileControlActions();
  const { items: classifications } = useClassifications();
  const { items: jraList } = useJraList();
  const { items: physRefs } = usePhysRefs();
  const [form, setForm] = useState(() => {
    // Tanggal retensi non-vital selalu dihitung ulang dari JRA saat dibuka
    const init = initialForm(file);
    const jra = jraList.find((j) => j.id === init.jraId);
    const dates = !init.isVital && jra && file.date ? retentionDatesFromJra(file.date, jra) : null;
    return dates ? { ...init, ...dates } : init;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const labelRef = useRef<HTMLDivElement>(null);

  const patch = (values: Partial<ProcessForm>) => setForm((prev) => ({ ...prev, ...values }));

  /** Tanggal retensi otomatis dari JRA (non-vital). */
  const withRetention = (next: ProcessForm): ProcessForm => {
    if (next.isVital || !next.jraId || !file.date) return next;
    const jra = jraList.find((j) => j.id === next.jraId);
    const dates = jra ? retentionDatesFromJra(file.date, jra) : null;
    return dates ? { ...next, ...dates } : next;
  };

  const activeDate = parseLocalYMD(form.retentionActiveDate);
  const status: "active" | "inactive" = !activeDate || startOfDay(today) <= activeDate ? "active" : "inactive";

  const childrenOf = (type: PhysicalReference["type"], parentId: string) =>
    physRefs.filter((r) => r.type === type && r.parentId === parentId);
  const locations = physRefs.filter((r) => r.type === "location");
  const racks = childrenOf("rack", form.physLocationId);
  const boxes = childrenOf("box", form.physRackId || form.physLocationId);
  const folders = childrenOf("folder", form.physBoxId || form.physRackId || form.physLocationId);
  const cls = classifications.find((c) => c.id === form.classificationId);

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.classificationId) nextErrors.classificationId = "Wajib dipilih";
    if (form.isVital) {
      if (!form.retentionActiveDate) nextErrors.retentionActiveDate = "Wajib diisi";
      if (!form.retentionInactiveDate) nextErrors.retentionInactiveDate = "Wajib diisi";
    } else if (!form.jraId) nextErrors.jraId = "Wajib dipilih";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    // Isian media lain tidak disimpan: arsip digital tanpa lokasi fisik, arsip fisik tanpa data sistem digital
    const media =
      form.archivalStatus === "digital" ? EMPTY_LOCATION : { digitalApp: "", digitalLink: "", isAutoDispose: false };
    actions.saveArchive({ ...file, ...form, ...media, jraId: form.isVital ? "" : form.jraId, status });
    onDone();
  };

  const locationSelect = (
    id: string,
    label: string,
    value: string,
    options: PhysicalReference[],
    emptyLabel: string,
    onChange: (value: string) => void,
    disabled?: boolean,
  ) => (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{emptyLabel}</SelectItem>
          {options.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <DialogHeader className="border-b p-6">
          <DialogTitle className="text-xl">Proses Arsip</DialogTitle>
          <DialogDescription className="font-mono">ID Registrasi: {form.archiveRegId}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6">
          <FieldGroup className="gap-5">
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { id: "physical", label: "Fisik (Hardcopy)", icon: FileBox },
                  { id: "digital", label: "Digital (Softcopy)", icon: HardDrive },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => patch({ archivalStatus: t.id })}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-2xl border p-4 text-xs font-bold transition-all",
                    form.archivalStatus === t.id
                      ? "border-module bg-module text-module-foreground shadow-md ring-2 ring-module/30"
                      : "bg-card text-muted-foreground hover:bg-module-soft hover:text-module",
                  )}
                >
                  <t.icon className="size-5" />
                  {t.label}
                </button>
              ))}
            </div>

            <div className="space-y-4 rounded-2xl border bg-muted/40 p-4">
              <Field data-invalid={!!errors.classificationId}>
                <FieldLabel>
                  Klasifikasi Arsip <span className="text-destructive">*</span>
                </FieldLabel>
                <SearchableSelect
                  value={form.classificationId}
                  placeholder="Cari Kode / Nama Klasifikasi..."
                  options={classifications.map((c) => ({
                    value: c.id,
                    label: `${classificationCode(c)} - ${c.namaItem}`,
                  }))}
                  onChange={(v) => {
                    patch({ classificationId: v });
                    setErrors((e) => ({ ...e, classificationId: "" }));
                  }}
                />
                {errors.classificationId && <FieldError>{errors.classificationId}</FieldError>}
              </Field>

              <Field
                orientation="horizontal"
                className={cn(
                  "rounded-xl border bg-card p-3",
                  form.isVital && "border-destructive/40 bg-destructive/5",
                )}
              >
                <FieldContent>
                  <FieldLabel htmlFor="proc-vital" className={cn(form.isVital && "text-destructive")}>
                    <Shield className="size-4" /> Tandai sebagai Arsip Vital
                  </FieldLabel>
                  <FieldDescription>Tanggal retensi arsip vital diisi manual.</FieldDescription>
                </FieldContent>
                <Switch
                  id="proc-vital"
                  checked={form.isVital}
                  onCheckedChange={(checked) => setForm((prev) => withRetention({ ...prev, isVital: checked }))}
                />
              </Field>

              {!form.isVital && (
                <Field data-invalid={!!errors.jraId}>
                  <FieldLabel>
                    Jadwal Retensi (JRA) <span className="text-destructive">*</span>
                  </FieldLabel>
                  <SearchableSelect
                    value={form.jraId}
                    placeholder="Cari Jenis Arsip di JRA..."
                    options={jraList.map((j) => ({
                      value: j.id,
                      label: `${j.jenisArsip} (Aktif: ${j.retensiAktif} Thn / Inaktif: ${j.retensiInaktif} Thn)`,
                    }))}
                    onChange={(v) => {
                      setForm((prev) => withRetention({ ...prev, jraId: v }));
                      setErrors((e) => ({ ...e, jraId: "" }));
                    }}
                  />
                  {errors.jraId && <FieldError>{errors.jraId}</FieldError>}
                  {!file.date && (
                    <FieldDescription>Dokumen belum bertanggal — tanggal retensi tidak bisa dihitung.</FieldDescription>
                  )}
                </Field>
              )}

              <div className="grid grid-cols-2 gap-4">
                {(
                  [
                    ["retentionActiveDate", "Exp. Aktif"],
                    ["retentionInactiveDate", "Exp. Inaktif"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} data-invalid={!!errors[key]}>
                    <FieldLabel htmlFor={`proc-${key}`}>
                      {label} {form.isVital ? "(Manual *)" : "(Auto)"}
                    </FieldLabel>
                    <Input
                      id={`proc-${key}`}
                      type="date"
                      disabled={!form.isVital}
                      value={form[key]}
                      onChange={(e) => {
                        patch({ [key]: e.target.value });
                        setErrors((prev) => ({ ...prev, [key]: "" }));
                      }}
                    />
                    {errors[key] && <FieldError>{errors[key]}</FieldError>}
                  </Field>
                ))}
              </div>

              <div
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl p-3 text-xs font-bold",
                  status === "active"
                    ? "bg-success/15 text-success"
                    : "bg-warning/20 text-warning-foreground dark:text-warning",
                )}
              >
                {status === "active" ? <CheckCircle2 className="size-4" /> : <Clock className="size-4" />}
                Status Saat Ini: {status === "active" ? "AKTIF (Central File)" : "INAKTIF (Record Center)"}
              </div>
            </div>

            {form.archivalStatus === "digital" && (
              <div className="space-y-4 rounded-2xl border p-4">
                <h4 className="flex items-center gap-2 text-xs font-bold text-success uppercase">
                  <HardDrive className="size-4" /> Lokasi Digital / Sistem
                </h4>
                <Field>
                  <FieldLabel htmlFor="proc-app">Aplikasi / Sistem Pembuat</FieldLabel>
                  <Input
                    id="proc-app"
                    placeholder="Cth: SRIKANDI, Google Drive, SAP..."
                    value={form.digitalApp}
                    onChange={(e) => patch({ digitalApp: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="proc-link">Link Dokumen (Opsional)</FieldLabel>
                  <Input
                    id="proc-link"
                    type="url"
                    placeholder="https://..."
                    value={form.digitalLink}
                    onChange={(e) => patch({ digitalLink: e.target.value })}
                  />
                </Field>
                <Field
                  orientation="horizontal"
                  className={cn("rounded-xl border p-3", form.isAutoDispose && "border-success/40 bg-success/10")}
                >
                  <Checkbox
                    id="proc-auto"
                    checked={form.isAutoDispose}
                    onCheckedChange={(checked) => patch({ isAutoDispose: checked === true })}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="proc-auto">Eksekusi Disposisi Otomatis (Auto-Dispose)</FieldLabel>
                    <FieldDescription>
                      Jika dicentang, sistem akan mengeksekusi arsip ini secara otomatis menjadi Statis atau Musnah dan
                      membuat Berita Acara seketika setelah tanggal inaktif berakhir. Cocok untuk arsip terintegrasi
                      ANRI/SRIKANDI.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </div>
            )}

            {form.archivalStatus === "physical" && (
              <div className="space-y-4 rounded-2xl border p-4">
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-module uppercase">
                    <MapPin className="size-4" /> Lokasi Simpan Fisik
                  </h4>
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="text-destructive"
                    onClick={() => patch({ physLocationId: "", physRackId: "", physBoxId: "", physFolderId: "" })}
                  >
                    Reset Lokasi
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {locationSelect(
                    "proc-loc",
                    "Gedung / Ruang",
                    form.physLocationId,
                    locations,
                    "-- Tanpa Lokasi --",
                    (v) => patch({ physLocationId: v, physRackId: "", physBoxId: "", physFolderId: "" }),
                  )}
                  {locationSelect(
                    "proc-rack",
                    "Rak / Lemari",
                    form.physRackId,
                    racks,
                    "-- Lepas / Tanpa Rak --",
                    (v) => patch({ physRackId: v, physBoxId: "", physFolderId: "" }),
                    !form.physLocationId,
                  )}
                  {locationSelect(
                    "proc-box",
                    "Boks Arsip",
                    form.physBoxId,
                    boxes,
                    "-- Lepas / Tanpa Box --",
                    (v) => patch({ physBoxId: v, physFolderId: "" }),
                    !form.physLocationId,
                  )}
                  {locationSelect(
                    "proc-folder",
                    "Folder",
                    form.physFolderId,
                    folders,
                    "-- Lepas / Tanpa Folder --",
                    (v) => patch({ physFolderId: v }),
                    !form.physLocationId,
                  )}
                </div>
              </div>
            )}

            <Field>
              <FieldLabel htmlFor="proc-notes">Catatan Kondisi / Kearsipan</FieldLabel>
              <Textarea
                id="proc-notes"
                rows={2}
                placeholder={
                  form.archivalStatus === "physical"
                    ? "Cth: Tumpukan di atas meja..."
                    : "Cth: Versi final, ditandatangani elektronik..."
                }
                value={form.notes}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </Field>
          </FieldGroup>
        </div>
        <DialogFooter className="border-t p-4">
          <Button variant="outline" onClick={onDone}>
            Batal
          </Button>
          <Button onClick={submit}>
            <Save /> Simpan &amp; Terapkan
          </Button>
        </DialogFooter>
      </div>

      <aside className="flex flex-col items-center justify-center gap-6 border-t bg-muted/40 p-6 md:w-96 md:border-t-0 md:border-l">
        <h4 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Preview Label Cetak</h4>
        <div className="w-full overflow-x-auto">
          <ArchiveLabel
            ref={labelRef}
            regId={form.archiveRegId}
            code={classificationCode(cls)}
            title={archiveTitle(file)}
            isVital={form.isVital}
          />
        </div>
        <Button variant="outline" onClick={() => printElement(labelRef.current, "Print Label")}>
          <Printer /> Cetak Sticker
        </Button>
      </aside>
    </div>
  );
}
