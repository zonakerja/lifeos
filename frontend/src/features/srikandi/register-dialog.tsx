import { AlertTriangle, Eye, FilePlus2, FileText, Paperclip, RefreshCw, X } from "lucide-react";
import { useRef, useState } from "react";
import { previewFile } from "@/components/common/file-preview";
import { SearchableSelect } from "@/components/common/searchable-select";
import { Badge } from "@/components/ui/badge";
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
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSrikandiOutgoings, useSrikandiReferences } from "@/data/collections";
import { useOpenSession } from "@/hooks/use-retained";
import { uploadsApi } from "@/lib/api/endpoints";
import { untrackPendingUpload } from "@/lib/pending-uploads";
import type {
  SrikandiOutgoing,
  SrikandiOutgoingFile,
  SrikandiPick,
  SrikandiReference,
  SrikandiReferenceCategory,
} from "@/types/entities";
import { type PickedFile, RegisterFilePicker } from "./register-file-picker";
import {
  attachmentError,
  attachmentsTotal,
  classificationChoices,
  cleanAttachmentName,
  DOC_TYPE_SUGGESTIONS,
  FORM_TYPE_LABELS,
  formatSize,
  MAX_ATTACHMENTS_TOTAL_BYTES,
  NATURE_SUGGESTIONS,
  ownedUploadIds,
  referenceChoices,
  referenceHint,
  registerIssues,
} from "./register-logic";

interface RegisterDialogProps {
  open: boolean;
  /** Entri yang diubah, atau isian awal entri baru */
  entry: SrikandiOutgoing | null;
  isNew: boolean;
  onClose: () => void;
}

/**
 * Formulir Register Naskah Keluar — urutan & isian sama dengan formulir Registrasi Naskah Keluar SRIKANDI. Berkas yang
 * diunggah dalam satu sesi buka dibuang bila dialog ditutup tanpa disimpan.
 */
export function RegisterDialog({ open, entry, isNew, onClose }: RegisterDialogProps) {
  const session = useOpenSession(open);
  const { upsert } = useSrikandiOutgoings();
  // Unggahan baru sesi ini (milik register) — dibuang bila tidak jadi disimpan
  const sessionUploads = useRef(new Set<string>());

  const discardSession = () => {
    for (const id of sessionUploads.current) {
      untrackPendingUpload(id);
      void uploadsApi.remove(id).catch(() => undefined);
    }
    sessionUploads.current.clear();
  };

  const close = () => {
    discardSession();
    onClose();
  };

  const save = (next: SrikandiOutgoing) => {
    const kept = new Set([next.file?.uploadId, ...(next.attachments ?? []).map((a) => a.uploadId)]);
    // Berkas milik register yang dilepas (lama maupun sesi ini) dihapus setelah disimpan
    const dropped = [...(entry && !isNew ? ownedUploadIds(entry) : []), ...sessionUploads.current].filter(
      (id) => !kept.has(id),
    );
    upsert(next);
    for (const id of sessionUploads.current) untrackPendingUpload(id);
    sessionUploads.current.clear();
    for (const id of dropped) void uploadsApi.remove(id).catch(() => undefined);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="grid-cols-1 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2 className="size-5 text-module" /> {isNew ? "Register naskah keluar" : "Ubah register naskah"}
          </DialogTitle>
          <DialogDescription>
            Isian mengikuti formulir Registrasi Naskah Keluar SRIKANDI. Setelah lengkap, entri didaftarkan ke SRIKANDI —
            Kirim Konsep, tanda tangan, dan pengiriman tetap Anda yang memutuskan.
          </DialogDescription>
        </DialogHeader>
        {open && entry && (
          <RegisterForm
            key={session}
            initial={entry}
            onUploaded={(id) => sessionUploads.current.add(id)}
            onCancel={close}
            onSave={save}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface FormProps {
  initial: SrikandiOutgoing;
  onUploaded: (uploadId: string) => void;
  onCancel: () => void;
  onSave: (entry: SrikandiOutgoing) => void;
}

const toPick = (ref: SrikandiReference): SrikandiPick => ({ id: ref.id, label: ref.label });

function RegisterForm({ initial, onUploaded, onCancel, onSave }: FormProps) {
  const { items: refs } = useSrikandiReferences();
  const { items: entries } = useSrikandiOutgoings();
  const [draft, setDraft] = useState<SrikandiOutgoing>(initial);
  const [picker, setPicker] = useState<"main" | "attachment" | null>(null);
  const set = <K extends keyof SrikandiOutgoing>(key: K, value: SrikandiOutgoing[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  // Saran isian dari entri sebelumnya (pilihan sebenarnya diatur instansi di SRIKANDI)
  const used = (key: "unit" | "docType" | "nature" | "classification") => [
    ...new Set(entries.map((e) => e[key]?.trim()).filter((v): v is string => !!v)),
  ];
  const suggestions = {
    unit: used("unit"),
    docType: [...new Set([...used("docType"), ...DOC_TYPE_SUGGESTIONS])],
    nature: [...new Set([...used("nature"), ...NATURE_SUGGESTIONS])],
    classification: used("classification"),
  };

  const issues = registerIssues(draft);
  const attachments = draft.attachments ?? [];
  const total = attachmentsTotal(attachments);
  const exclude = [draft.file?.uploadId, ...attachments.map((a) => a.uploadId)].filter((v): v is string => !!v);
  const noRefs = refs.length === 0;
  const classificationOptions = classificationChoices(refs).map((r) => ({ value: r.label, label: r.label }));

  const onPick = ({ file, request }: PickedFile) => {
    if (file.owned) onUploaded(file.uploadId);
    if (picker === "attachment") {
      setDraft((prev) => ({ ...prev, attachments: [...(prev.attachments ?? []), file] }));
      return;
    }
    setDraft((prev) => ({
      ...prev,
      file,
      uploadId: file.uploadId,
      sourceType: request ? "request" : file.owned ? "upload" : "file",
      sourceId: request?.id,
      sourceTitle: request?.title ?? file.name,
      subject: prev.subject || request?.subject || request?.title || "",
    }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave({ ...draft, subject: draft.subject.trim() });
  };

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
      <div className="-mx-1 flex max-h-[min(68svh,52rem)] min-w-0 flex-col gap-5 overflow-y-auto px-1">
        <Field>
          <FieldLabel>Tipe form</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            value={draft.formType}
            onValueChange={(v) => v && set("formType", v as SrikandiOutgoing["formType"])}
            className="justify-start"
          >
            {(["keluar", "final"] as const).map((t) => (
              <ToggleGroupItem key={t} value={t}>
                {FORM_TYPE_LABELS[t]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription>
            {draft.formType === "keluar"
              ? "Konsep diverifikasi & ditandatangani elektronik (TTE) di SRIKANDI, lalu dikirim."
              : "Naskah sudah bernomor & ditandatangani di luar SRIKANDI (PDF) — langsung dikirim tanpa verifikasi."}
          </FieldDescription>
        </Field>

        <FieldSet className="min-w-0">
          <FieldLegend>Detil isi naskah</FieldLegend>
          <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SuggestInput
              id="reg-unit"
              label="Dikirimkan melalui"
              placeholder="Unit kerja pengirim"
              value={draft.unit}
              options={suggestions.unit}
              onChange={(v) => set("unit", v)}
            />
            <SuggestInput
              id="reg-type"
              label="Jenis naskah"
              placeholder="mis. Nota Dinas"
              value={draft.docType}
              options={suggestions.docType}
              onChange={(v) => set("docType", v)}
            />
            <SuggestInput
              id="reg-nature"
              label="Sifat naskah"
              placeholder="mis. Biasa"
              value={draft.nature}
              options={suggestions.nature}
              onChange={(v) => set("nature", v)}
            />
            {classificationOptions.length ? (
              <Field>
                <FieldLabel>Klasifikasi</FieldLabel>
                <SearchableSelect
                  value={draft.classification}
                  onChange={(v) => set("classification", v)}
                  options={classificationOptions}
                  placeholder={draft.classification || "Pilih klasifikasi…"}
                  searchPlaceholder="Cari kode / nama klasifikasi…"
                />
              </Field>
            ) : (
              <SuggestInput
                id="reg-class"
                label="Klasifikasi"
                placeholder="Kode klasifikasi arsip, mis. KU.204 - Laporan Keuangan"
                value={draft.classification}
                options={suggestions.classification}
                onChange={(v) => set("classification", v)}
              />
            )}
            <Field>
              <FieldLabel htmlFor="reg-number">Nomor naskah</FieldLabel>
              <Input
                id="reg-number"
                value={draft.number ?? ""}
                disabled={draft.autoNumber}
                placeholder={draft.autoNumber ? "Diambil di SRIKANDI" : "Nomor sementara"}
                onChange={(e) => set("number", e.target.value)}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={!!draft.autoNumber}
                  onCheckedChange={(c) =>
                    setDraft((prev) => ({ ...prev, autoNumber: !!c, number: c ? "" : prev.number }))
                  }
                />
                Pakai tombol Ambil Nomor (penomoran otomatis SRIKANDI)
              </label>
            </Field>
            <Field>
              <FieldLabel htmlFor="reg-ref">Nomor referensi (opsional)</FieldLabel>
              <Input
                id="reg-ref"
                value={draft.reference ?? ""}
                placeholder="Nomor naskah yang dirujuk"
                onChange={(e) => set("reference", e.target.value)}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="reg-subject">Hal</FieldLabel>
              <Textarea
                id="reg-subject"
                rows={2}
                value={draft.subject}
                onChange={(e) => set("subject", e.target.value)}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="reg-summary">Isi ringkas</FieldLabel>
              <Textarea
                id="reg-summary"
                rows={3}
                value={draft.summary ?? ""}
                onChange={(e) => set("summary", e.target.value)}
              />
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet className="min-w-0">
          <FieldLegend>File naskah</FieldLegend>
          {draft.file ? (
            <FileRow
              file={draft.file}
              hint={draft.sourceType === "request" ? `Approval · ${draft.sourceTitle ?? ""}` : undefined}
              action={
                <Button type="button" size="sm" variant="outline" onClick={() => setPicker("main")}>
                  <RefreshCw /> Ganti
                </Button>
              }
            />
          ) : (
            <Button type="button" variant="outline" className="justify-start" onClick={() => setPicker("main")}>
              <FileText /> <span className="truncate">Pilih file naskah</span>
            </Button>
          )}
          <FieldDescription>
            DOCX atau PDF. Beri 3 spasi sebelum & sesudah area tanda tangan elektronik; penanda nomor & tanggal SRIKANDI
            dari templat dibiarkan.
          </FieldDescription>
        </FieldSet>

        <FieldSet className="min-w-0">
          <FieldLegend className="flex w-full items-center justify-between gap-2">
            <span>Lampiran naskah</span>
            <span
              className={
                total > MAX_ATTACHMENTS_TOTAL_BYTES ? "text-xs text-destructive" : "text-xs text-muted-foreground"
              }
            >
              {formatSize(total) || "0 KB"} / 20 MB
            </span>
          </FieldLegend>
          {attachments.map((file) => {
            const error = attachmentError(file);
            return (
              <FileRow
                key={file.uploadId}
                file={file}
                hint={
                  error
                    ? `${error}${error.startsWith("Nama ") ? ` (${cleanAttachmentName(file.name)})` : ""}`
                    : undefined
                }
                warn={!!error}
                action={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    title="Lepas lampiran"
                    onClick={() =>
                      set(
                        "attachments",
                        attachments.filter((a) => a.uploadId !== file.uploadId),
                      )
                    }
                  >
                    <X />
                  </Button>
                }
              />
            );
          })}
          <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setPicker("attachment")}>
            <Paperclip /> Tambah lampiran
          </Button>
        </FieldSet>

        {noRefs && (
          <p className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Daftar tujuan, verifikator, dan penandatangan diambil dari SRIKANDI: buka tab Referensi → Ambil referensi.
          </p>
        )}

        <FieldSet className="min-w-0">
          <FieldLegend>Tujuan utama</FieldLegend>
          <FieldGroup className="grid grid-cols-1 gap-4">
            <RefPicker
              label="Grup tujuan"
              refs={refs}
              category="recipient_group"
              value={draft.recipientGroups}
              onChange={(v) => set("recipientGroups", v)}
            />
            <RefPicker
              label="Utama (Internal / Eksternal SRIKANDI)"
              refs={refs}
              category="recipient"
              nonSrikandi={false}
              value={draft.recipients}
              onChange={(v) => set("recipients", v)}
            />
            <RefPicker
              label="Utama Eksternal Non SRIKANDI"
              refs={refs}
              category="recipient"
              nonSrikandi
              value={draft.recipientsExternal}
              onChange={(v) => set("recipientsExternal", v)}
            />
          </FieldGroup>
        </FieldSet>

        <FieldSet className="min-w-0">
          <FieldLegend>Tujuan tembusan</FieldLegend>
          <FieldGroup className="grid grid-cols-1 gap-4">
            <RefPicker
              label="Grup tembusan"
              refs={refs}
              category="cc_group"
              value={draft.ccGroups}
              onChange={(v) => set("ccGroups", v)}
            />
            <RefPicker
              label="Tembusan (Internal / Eksternal SRIKANDI)"
              refs={refs}
              category="cc"
              nonSrikandi={false}
              value={draft.cc}
              onChange={(v) => set("cc", v)}
            />
            <RefPicker
              label="Tembusan Eksternal Non SRIKANDI"
              refs={refs}
              category="cc"
              nonSrikandi
              value={draft.ccExternal}
              onChange={(v) => set("ccExternal", v)}
            />
          </FieldGroup>
        </FieldSet>

        {draft.formType === "keluar" && (
          <FieldSet className="min-w-0">
            <FieldLegend>Verifikator & penandatangan</FieldLegend>
            <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <RefPicker
                label="Verifikator"
                refs={refs}
                category="verifier"
                value={draft.verifiers}
                onChange={(v) => set("verifiers", v)}
              />
              <Field>
                <FieldLabel>Penandatangan</FieldLabel>
                <SearchableSelect
                  value={draft.signer?.id}
                  onChange={(id) => {
                    const ref = refs.find((r) => r.id === id);
                    if (ref) set("signer", toPick(ref));
                  }}
                  options={referenceChoices(refs, "signer").map((r) => ({
                    value: r.id,
                    label: r.label,
                    hint: referenceHint(r),
                  }))}
                  placeholder={draft.signer?.label ?? "Pilih penandatangan…"}
                  searchPlaceholder="Cari nama / jabatan…"
                />
              </Field>
              <Field>
                <FieldLabel>Tipe tanda tangan</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={draft.signatureType ?? "elektronik"}
                  onValueChange={(v) => v && set("signatureType", v as SrikandiOutgoing["signatureType"])}
                  className="justify-start"
                >
                  <ToggleGroupItem value="elektronik">Elektronik</ToggleGroupItem>
                  <ToggleGroupItem value="konvensional">Konvensional</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Field>
                <FieldLabel>Visual TTE</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={draft.visualTte ?? "qr"}
                  onValueChange={(v) => v && set("visualTte", v as SrikandiOutgoing["visualTte"])}
                  className="justify-start"
                >
                  <ToggleGroupItem value="qr">QR Code</ToggleGroupItem>
                  <ToggleGroupItem value="spesimen">Spesimen gambar</ToggleGroupItem>
                </ToggleGroup>
              </Field>
            </FieldGroup>
          </FieldSet>
        )}

        <Field>
          <FieldLabel htmlFor="reg-notes">Catatan (hanya di LifeOS)</FieldLabel>
          <Textarea id="reg-notes" rows={2} value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>

      {issues.length > 0 && (
        <p className="text-xs text-warning">
          Belum lengkap: {issues.join(", ")}. Entri tetap bisa disimpan sebagai draf.
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" disabled={!draft.subject.trim() && !draft.file}>
          Simpan
        </Button>
      </DialogFooter>

      <RegisterFilePicker
        open={picker !== null}
        onOpenChange={(o) => !o && setPicker(null)}
        mode={picker ?? "main"}
        exclude={exclude}
        onPick={onPick}
      />
    </form>
  );
}

function SuggestInput(props: {
  id: string;
  label: string;
  placeholder: string;
  value?: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <Input
        id={props.id}
        list={`${props.id}-list`}
        value={props.value ?? ""}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <datalist id={`${props.id}-list`}>
        {props.options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </Field>
  );
}

function RefPicker(props: {
  label: string;
  refs: SrikandiReference[];
  category: SrikandiReferenceCategory;
  nonSrikandi?: boolean;
  value?: SrikandiPick[];
  onChange: (value: SrikandiPick[]) => void;
}) {
  const value = props.value ?? [];
  const chosen = new Set(value.map((v) => v.id));
  const options = referenceChoices(props.refs, props.category, props.nonSrikandi)
    .filter((r) => !chosen.has(r.id))
    .map((r) => ({ value: r.id, label: r.label, hint: referenceHint(r) }));
  const known = new Set(props.refs.map((r) => r.id));
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <Badge
              key={v.id}
              variant="secondary"
              className={known.has(v.id) ? "max-w-full gap-1" : "max-w-full gap-1 bg-warning/15 text-warning"}
              title={known.has(v.id) ? v.label : `${v.label} — tidak ada lagi di referensi SRIKANDI`}
            >
              <span className="truncate">{v.label}</span>
              <button
                type="button"
                aria-label={`Lepas ${v.label}`}
                onClick={() => props.onChange(value.filter((x) => x.id !== v.id))}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <SearchableSelect
        value={undefined}
        onChange={(id) => {
          const ref = props.refs.find((r) => r.id === id);
          if (ref) props.onChange([...value, toPick(ref)]);
        }}
        options={options}
        placeholder={options.length ? "Tambah…" : "Tidak ada pilihan"}
        searchPlaceholder="Cari nama / jabatan / instansi…"
        disabled={!options.length}
      />
    </Field>
  );
}

function FileRow(props: { file: SrikandiOutgoingFile; hint?: string; warn?: boolean; action: React.ReactNode }) {
  const { file } = props;
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border p-2">
      <FileText className="size-4 shrink-0 text-module" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        {(props.hint || file.size !== undefined) && (
          <p className={props.warn ? "truncate text-xs text-warning" : "truncate text-xs text-muted-foreground"}>
            {[formatSize(file.size), props.hint].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        title="Pratinjau"
        onClick={() => previewFile({ uploadId: file.uploadId, name: file.name, mimeType: file.mimeType })}
      >
        <Eye />
      </Button>
      {props.action}
    </div>
  );
}
