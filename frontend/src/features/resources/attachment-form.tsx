import { formatLocalYMD } from "@/lib/dates";
import { Archive, CheckCircle2, FilePen, Paperclip, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type OptionGroup, SearchableSelect } from "@/components/common/searchable-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useAiNotes, useFreeNotes, useLists, useResources } from "@/data/collections";
import { errorMessage } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";
import { generateId } from "@/lib/ids";
import { trackPendingUpload, untrackPendingUpload } from "@/lib/pending-uploads";
import type { AttachedResource, AttachmentType } from "@/types/entities";
import { readAiSummaryPreference, writeAiSummaryPreference } from "./ai-summary-preference";
import { readFileControlPreference, writeFileControlPreference } from "./file-control-intake";
import { addFreeTag, collectFreeTags, MAX_TAG_LENGTH, resourceTags, splitTags } from "./resource-tags";
import { TagInput } from "@/components/common/tag-input";
import { emptyAttachment } from "./resource-utils";
import { SummaryStatusBadge } from "./summary-status-badge";
import { useFileSummarizer } from "./use-file-summarizer";
import { usePermissions } from "@/hooks/use-permissions";
import {
  NewOfficeDocumentPicker,
  OFFICE_ATTACHMENT_LABEL,
  OFFICE_ATTACHMENT_TYPE,
  useOfficeEnabled,
} from "@/features/tools/onlyoffice/new-office-document-button";
import { openOfficeEditor } from "@/features/tools/onlyoffice/office-editor-host";
import { isOfficeEditable } from "@/features/tools/onlyoffice/office-formats";
import { useOfficeDiscardConfirm } from "@/features/tools/onlyoffice/use-office-discard-confirm";
import { useDialogCloseGuard } from "@/components/common/dialog-close-guard";
import type { UploadedAsset } from "@/types/api";

const TYPE_LABELS: Record<AttachmentType, string> = {
  link: "Web Link",
  file: "Upload File",
  note: "Pilih Catatan / List",
  existing: "Resource Global",
};

const ALL_TYPES = Object.keys(TYPE_LABELS) as AttachmentType[];

interface AttachmentFormProps {
  /** Tanggal default lampiran (mis. due date task) */
  defaultDate?: string;
  /** Konteks upload untuk backend (mis. "task", "project") */
  uploadContext?: string;
  /**
   * Tawarkan ringkasan AI untuk file yang diunggah (PDF/gambar/teks) lewat centang "Ringkas dengan AI" — default mati,
   * pilihan terakhir diingat per browser (`ai-summary-preference.ts`). AI hanya dipanggil bila dicentang.
   */
  offerAiSummary?: boolean;
  /** Prefix ID lampiran (mis. "tr" task, "pr" project) */
  idPrefix?: string;
  /** Jenis lampiran yang boleh dipilih (default semua); jenis pertama menjadi pilihan awal */
  types?: AttachmentType[];
  /** Isian awal form (mis. Notes AI terhubung yang dimasukkan ke Hasil Agenda); default form kosong */
  initial?: Partial<AttachedResource>;
  onAdd: (attachment: AttachedResource) => void;
  onCancel: () => void;
}

/** Form menambah lampiran (link, upload file, catatan, resource global). */
export function AttachmentForm({
  defaultDate = "",
  uploadContext,
  offerAiSummary = false,
  idPrefix = "tr",
  types = ALL_TYPES,
  initial,
  onAdd,
  onCancel,
}: AttachmentFormProps) {
  const initialDraft = (): AttachedResource => ({
    ...emptyAttachment(defaultDate),
    type: types[0] ?? "link",
    ...initial,
  });
  const [draft, setDraft] = useState<AttachedResource>(initialDraft);
  const [uploading, setUploading] = useState(false);
  // Di dalam item bersama (izin edit), berkas disimpan atas nama pemilik item
  const { uploadOwnerId } = usePermissions();
  const summarizer = useFileSummarizer();
  const [aiSummary, setAiSummary] = useState(() => offerAiSummary && readAiSummaryPreference());
  // Dipakai callback editor ONLYOFFICE (ditutup setelah state berubah)
  const aiSummaryRef = useRef(aiSummary);
  useEffect(() => {
    aiSummaryRef.current = aiSummary;
  }, [aiSummary]);
  // Tipe "Buat Dokumen (ONLYOFFICE)" = berkas (tipe `file`) yang dibuat dari templat, bukan diunggah
  const [fileSource, setFileSource] = useState<"upload" | "office">("upload");
  const officeEnabled = useOfficeEnabled();
  // "Masukkan ke File Control" (khusus berkas): default mati, pilihan terakhir diingat per browser
  const [toFileControl, setToFileControl] = useState(readFileControlPreference);
  const toggleFileControl = (enabled: boolean) => {
    setToFileControl(enabled);
    writeFileControlPreference(enabled);
  };
  // File terakhir yang diunggah (untuk meringkas bila centang AI baru dinyalakan) + penanda permintaan terbaru
  const lastFileRef = useRef<File | null>(null);
  const summaryRunRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  // Berkas yang sudah diunggah tetapi belum "Tambahkan" — dihapus dari storage bila diganti, dibatalkan, atau form
  // ditutup, agar tidak menjadi berkas sampah
  const pendingUploadRef = useRef<string | null>(null);
  const discardPending = () => {
    const id = pendingUploadRef.current;
    pendingUploadRef.current = null;
    if (id) {
      untrackPendingUpload(id);
      void uploadsApi.remove(id).catch(() => undefined);
    }
  };
  useEffect(() => () => discardPending(), []);
  const { items: freeNotes } = useFreeNotes();
  const { items: aiNotes } = useAiNotes();
  const { items: lists } = useLists();
  const { items: resources } = useResources();

  const patch = (values: Partial<AttachedResource>) => setDraft((prev) => ({ ...prev, ...values }));
  // Tag selalu tersimpan di lampiran; ikut ke Resource Global bila lampiran disimpan ke sana (centang, File Control,
  // atau merujuk resource global)
  const toGlobal = !!draft.addToGlobal || (draft.type === "file" && toFileControl) || draft.type === "existing";
  const tagSuggestions = collectFreeTags(resources);

  const noteGroups: OptionGroup[] = [
    { heading: "Free Notes", options: freeNotes.map((n) => ({ label: n.title, value: `free-${n.id}` })) },
    { heading: "AI Notes", options: aiNotes.map((n) => ({ label: n.title, value: `ai-${n.id}` })) },
    { heading: "List Bebas", options: lists.map((l) => ({ label: l.title, value: `list-${l.id}` })) },
  ];

  const selectNote = (value: string) => {
    let title: string | undefined;
    let aiSummary = "";
    if (value.startsWith("free-")) title = freeNotes.find((n) => `free-${n.id}` === value)?.title;
    else if (value.startsWith("ai-")) {
      const note = aiNotes.find((n) => `ai-${n.id}` === value);
      title = note?.title;
      aiSummary = note?.aiSummary ?? "";
    } else if (value.startsWith("list-")) title = lists.find((l) => `list-${l.id}` === value)?.title;
    if (title) patch({ noteId: value, name: draft.name || title, description: "Linked Note / List", aiSummary });
  };

  const selectExisting = (value: string) => {
    const res = resources.find((r) => r.id === value);
    if (!res) return;
    patch({
      // Tag bebas resource yang dipilih tampil & bisa ditambah (ditulis kembali ke resource itu)
      tags: splitTags(resourceTags(res)).free,
      existingId: value,
      name: draft.name || res.title,
      description: res.content,
      number: res.number,
      aiSummary: res.aiSummary,
      url: res.url,
      uploadId: res.uploadId,
      addToGlobal: true,
    });
  };

  /** Berkas baru (upload atau dokumen ONLYOFFICE baru) menjadi berkas lampiran yang belum disimpan. */
  const acceptAsset = (asset: UploadedAsset, name: string) => {
    discardPending(); // berkas sebelumnya (Ganti File)
    pendingUploadRef.current = asset.id;
    // Dicatat agar tetap dibersihkan bila tab di-reload/ditutup sebelum "Tambahkan" (lihat lib/pending-uploads.ts)
    trackPendingUpload(asset.id);
    patch({ uploadId: asset.id, url: undefined, mimeType: asset.mimeType, size: asset.size, name });
  };
  const officeSource = draft.type === "file" && fileSource === "office";
  // Konfirmasi sebelum dokumen ONLYOFFICE yang dibuat di form ini dibuang (batal / ganti tipe / hapus)
  const officeDiscard = useOfficeDiscardConfirm();
  // Dialog induk (Project, Action/Task, Tandai Selesai, Agenda, …) ditutup lewat X/Esc saat form ini masih memegang
  // dokumen ONLYOFFICE yang belum ditambahkan → dokumen berisi dikonfirmasi dulu (lalu dibuang saat form dilepas)
  useDialogCloseGuard(() => (officeSource && draft.uploadId ? officeDiscard.confirm(draft.uploadId) : true));

  /** Buang berkas sesi ini dari form (dan storage); ringkasan AI yang sedang berjalan diabaikan. */
  const dropUpload = () => {
    discardPending();
    summaryRunRef.current++;
    summarizer.setStatus("idle");
    lastFileRef.current = null;
    patch({ uploadId: undefined, mimeType: undefined, size: undefined, aiSummary: undefined });
  };

  /** Tombol "Hapus dokumen": selalu dikonfirmasi; setelahnya jenis dokumen lain bisa dipilih. */
  const deleteOfficeDoc = async () => {
    if (!draft.uploadId || !(await officeDiscard.confirm(draft.uploadId, { explicit: true }))) return;
    dropUpload();
  };

  /** Batal: dokumen ONLYOFFICE yang sudah berisi dikonfirmasi dulu sebelum dibuang. */
  const cancel = async () => {
    if (officeSource && draft.uploadId && !(await officeDiscard.confirm(draft.uploadId))) return;
    discardPending();
    onCancel();
  };

  /** Buka berkas di ONLYOFFICE; setelah ditutup (tersimpan) ringkas ulang isinya bila "Ringkas dengan AI" dicentang. */
  const editInOffice = (uploadId: string) =>
    openOfficeEditor({
      uploadId,
      name: draft.name,
      onClosed: () => {
        if (aiSummaryRef.current) void runSummaryUpload(uploadId);
      },
    });

  /** Ringkas berkas yang sudah di server (dokumen ONLYOFFICE) dari teks ekstraksi backend. */
  const runSummaryUpload = async (uploadId: string) => {
    const run = ++summaryRunRef.current;
    const summary = await summarizer.summarizeUpload(uploadId);
    if (summary && run === summaryRunRef.current) patch({ aiSummary: summary });
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const asset = await uploadsApi.upload(file, uploadContext, uploadOwnerId);
      acceptAsset(asset, draft.name || asset.originalName);
      lastFileRef.current = file;
    } catch (error) {
      toast.error("Upload file gagal", { description: errorMessage(error) });
      setUploading(false);
      return;
    }
    setUploading(false);
    patch({ aiSummary: undefined });
    if (aiSummary) void runSummary(file);
    else summaryRunRef.current++; // abaikan hasil ringkasan berkas sebelumnya
  };

  /** Ringkas `file` dengan AI; hasil diabaikan bila berkas diganti / centang dimatikan / sudah ditambahkan. */
  const runSummary = async (file: File) => {
    const run = ++summaryRunRef.current;
    const summary = await summarizer.summarize(file);
    if (summary && run === summaryRunRef.current) patch({ aiSummary: summary });
  };

  const toggleAiSummary = (enabled: boolean) => {
    setAiSummary(enabled);
    writeAiSummaryPreference(enabled);
    if (!enabled) {
      summaryRunRef.current++;
      summarizer.setStatus("idle");
    } else if (draft.uploadId && !draft.aiSummary && summarizer.status !== "processing") {
      if (lastFileRef.current) void runSummary(lastFileRef.current);
      else if (officeSource) void runSummaryUpload(draft.uploadId);
    }
  };

  const submit = () => {
    if (!draft.name?.trim()) {
      toast.error("Nama resource wajib diisi.");
      return;
    }
    if (draft.type === "file" && !draft.uploadId) {
      toast.error(officeSource ? "Pilih jenis dokumen yang dibuat terlebih dahulu." : "Pilih file terlebih dahulu.");
      return;
    }
    if (summarizer.status === "processing") {
      // Tidak menunggu AI: lampiran ditambahkan tanpa ringkasan (bisa dibuat nanti lewat ikon robot)
      summaryRunRef.current++;
      summarizer.setStatus("idle");
      toast.info("Ringkasan AI dilewati", { description: "Buat nanti lewat ikon robot di tabel lampiran." });
    }
    // Berkas yang diunggah lalu jenisnya diganti (mis. ke Web Link) tidak ikut dilampirkan
    const keepsUpload = draft.type === "file" || !!draft.existingId;
    if (keepsUpload) {
      // Diserahkan ke form pemakai (yang bertanggung jawab atas berkas sampai disimpan)
      untrackPendingUpload(pendingUploadRef.current ?? undefined);
      pendingUploadRef.current = null;
    } else discardPending();
    lastFileRef.current = null;
    // Arsip File Control dikelola lewat Resource Global → berkas yang dimasukkan otomatis menjadi Resource Global
    const archive = draft.type === "file" && toFileControl;
    onAdd({
      ...draft,
      ...(keepsUpload ? {} : { uploadId: undefined, mimeType: undefined, size: undefined }),
      ...(archive ? { toFileControl: true, addToGlobal: true } : { toFileControl: undefined }),
      ...(draft.tags?.length ? {} : { tags: undefined }),
      id: generateId(idPrefix),
      date: draft.date || defaultDate || formatLocalYMD(new Date()),
    });
    setDraft(initialDraft());
    setFileSource("upload");
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-module/25 bg-card p-4 shadow-xs">
      {officeDiscard.dialog}
      <div className="grid gap-3 md:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="att-number">Nomor</FieldLabel>
          <Input
            id="att-number"
            placeholder="No."
            value={draft.number ?? ""}
            onChange={(e) => patch({ number: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel>Tipe</FieldLabel>
          <Select
            value={officeSource ? OFFICE_ATTACHMENT_TYPE : draft.type}
            onValueChange={async (v) => {
              const office = v === OFFICE_ATTACHMENT_TYPE;
              // Berkas dari sumber lain (upload ↔ dokumen baru) tidak dibawa; dokumen berisi dikonfirmasi dulu
              if (draft.uploadId && office !== officeSource) {
                if (officeSource && !(await officeDiscard.confirm(draft.uploadId))) return;
                dropUpload();
              }
              setFileSource(office ? "office" : "upload");
              patch({ type: office ? "file" : (v as AttachmentType) });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {types.flatMap((t) => [
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t]}
                </SelectItem>,
                ...(t === "file" && officeEnabled
                  ? [
                      <SelectItem key={OFFICE_ATTACHMENT_TYPE} value={OFFICE_ATTACHMENT_TYPE}>
                        {OFFICE_ATTACHMENT_LABEL}
                      </SelectItem>,
                    ]
                  : []),
              ])}
            </SelectContent>
          </Select>
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="att-name">Nama Resource</FieldLabel>
          <Input
            id="att-name"
            placeholder="Judul dokumen..."
            value={draft.name ?? ""}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>
      </div>

      {draft.type === "link" && (
        <Input
          type="url"
          placeholder="https://..."
          value={draft.url ?? ""}
          onChange={(e) => patch({ url: e.target.value })}
        />
      )}

      {draft.type === "file" && (
        <div className="flex flex-wrap items-center gap-3">
          {!officeSource ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Spinner /> : <Upload />} {draft.uploadId ? "Ganti File" : "Pilih File"}
            </Button>
          ) : (
            !draft.uploadId && (
              <NewOfficeDocumentPicker
                title={draft.name}
                context={uploadContext}
                ownerId={uploadOwnerId}
                onCreated={(asset) => {
                  lastFileRef.current = null;
                  const name = draft.name?.trim() || asset.originalName.replace(/\.[a-z0-9]+$/i, "");
                  acceptAsset(asset, name);
                  editInOffice(asset.id);
                }}
              />
            )
          )}
          {offerAiSummary && (
            <span className="flex items-center gap-2">
              <Checkbox
                id="att-ai-summary"
                checked={aiSummary}
                onCheckedChange={(checked) => toggleAiSummary(checked === true)}
              />
              <Label htmlFor="att-ai-summary" className="text-xs font-normal text-muted-foreground">
                Ringkas dengan AI
              </Label>
              {aiSummary && <SummaryStatusBadge status={summarizer.status} />}
            </span>
          )}
          <span className="flex items-center gap-2">
            <Checkbox
              id="att-file-control"
              checked={toFileControl}
              onCheckedChange={(checked) => toggleFileControl(checked === true)}
            />
            <Label htmlFor="att-file-control" className="text-xs font-normal text-muted-foreground">
              <Archive className="size-3.5" /> Masukkan ke File Control
            </Label>
          </span>
          {draft.uploadId && (
            <span className="flex items-center gap-1 text-xs font-medium text-success">
              <CheckCircle2 className="size-3.5" /> {officeSource ? "Dokumen dibuat" : "Terunggah"}: {draft.name}
            </span>
          )}
          {draft.uploadId && officeEnabled && isOfficeEditable(draft.name, draft.mimeType) && (
            <Button type="button" variant="ghost" size="xs" onClick={() => editInOffice(draft.uploadId!)}>
              <FilePen /> Edit di ONLYOFFICE
            </Button>
          )}
          {draft.uploadId && officeSource && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-destructive"
              onClick={() => void deleteOfficeDoc()}
            >
              <Trash2 /> Hapus dokumen
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {draft.type === "note" && (
        <SearchableSelect
          groups={noteGroups}
          value={draft.noteId}
          onChange={selectNote}
          placeholder="Cari & pilih catatan/list..."
        />
      )}

      {draft.type === "existing" && (
        <SearchableSelect
          options={resources.map((r) => ({ label: r.title, value: r.id, hint: r.number }))}
          value={draft.existingId}
          onChange={selectExisting}
          placeholder="Cari resource global..."
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="att-date">Tanggal</FieldLabel>
          <Input id="att-date" type="date" value={draft.date ?? ""} onChange={(e) => patch({ date: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="att-desc">Deskripsi</FieldLabel>
          <Input
            id="att-desc"
            placeholder="Keterangan..."
            value={draft.description ?? ""}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </Field>
      </div>

      {/* Tag selalu tersedia (Dasar Pelaksanaan, Hasil, lampiran Project/Action/Task) */}
      <Field>
        <FieldLabel htmlFor="att-tags">
          Tag
          <span className="text-xs font-normal text-muted-foreground">
            {toGlobal ? "· ikut ke Resource Global" : "· tersimpan di lampiran ini"}
          </span>
        </FieldLabel>
        <TagInput
          id="att-tags"
          value={draft.tags ?? []}
          suggestions={tagSuggestions}
          maxLength={MAX_TAG_LENGTH}
          placeholder="Tambah tag, mis. Regulasi, SOP..."
          // Pembaruan fungsional: menempel "a, b" memanggil onAdd beberapa kali dalam satu event
          onAdd={(input) => setDraft((prev) => ({ ...prev, tags: addFreeTag(prev.tags ?? [], input, tagSuggestions) }))}
          onRemove={(tag) => setDraft((prev) => ({ ...prev, tags: (prev.tags ?? []).filter((t) => t !== tag) }))}
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Berkas yang masuk File Control selalu menjadi Resource Global (sumber data File Control) */}
          <Checkbox
            id="att-global"
            checked={!!draft.addToGlobal || (draft.type === "file" && toFileControl)}
            disabled={draft.type === "file" && toFileControl}
            onCheckedChange={(checked) => patch({ addToGlobal: checked === true })}
          />
          <Label htmlFor="att-global" className="text-xs font-normal text-muted-foreground">
            Simpan/Tag ke Resource Global
            {draft.type === "file" && toFileControl && " (wajib untuk File Control)"}
          </Label>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => void cancel()}>
            Batal
          </Button>
          <Button type="button" size="sm" onClick={submit} disabled={uploading}>
            <Plus /> Tambahkan
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Tombol pemicu kecil untuk membuka form lampiran. */
export function AddAttachmentButton({ onClick, label = "Tambah Resource" }: { onClick: () => void; label?: string }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Paperclip /> {label}
    </Button>
  );
}
