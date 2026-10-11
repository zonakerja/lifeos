import { CheckCircle2, Paperclip, Plus, Upload } from "lucide-react";
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
import { emptyAttachment } from "./resource-utils";
import { SummaryStatusBadge } from "./summary-status-badge";
import { useFileSummarizer } from "./use-file-summarizer";
import { usePermissions } from "@/hooks/use-permissions";

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
  onAdd,
  onCancel,
}: AttachmentFormProps) {
  const initialDraft = () => ({ ...emptyAttachment(defaultDate), type: types[0] ?? "link" });
  const [draft, setDraft] = useState<AttachedResource>(initialDraft);
  const [uploading, setUploading] = useState(false);
  // Di dalam item bersama (izin edit), berkas disimpan atas nama pemilik item
  const { uploadOwnerId } = usePermissions();
  const summarizer = useFileSummarizer();
  const [aiSummary, setAiSummary] = useState(() => offerAiSummary && readAiSummaryPreference());
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

  const handleFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const asset = await uploadsApi.upload(file, uploadContext, uploadOwnerId);
      discardPending(); // berkas sebelumnya (Ganti File)
      pendingUploadRef.current = asset.id;
      // Dicatat agar tetap dibersihkan bila tab di-reload/ditutup sebelum "Tambahkan" (lihat lib/pending-uploads.ts)
      trackPendingUpload(asset.id);
      lastFileRef.current = file;
      patch({
        uploadId: asset.id,
        url: undefined,
        mimeType: asset.mimeType,
        size: asset.size,
        name: draft.name || asset.originalName,
      });
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
    } else if (lastFileRef.current && draft.uploadId && !draft.aiSummary && summarizer.status !== "processing") {
      void runSummary(lastFileRef.current);
    }
  };

  const submit = () => {
    if (!draft.name?.trim()) {
      toast.error("Nama resource wajib diisi.");
      return;
    }
    if (draft.type === "file" && !draft.uploadId) {
      toast.error("Pilih file terlebih dahulu.");
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
    onAdd({
      ...draft,
      ...(keepsUpload ? {} : { uploadId: undefined, mimeType: undefined, size: undefined }),
      id: generateId(idPrefix),
      date: draft.date || defaultDate || new Date().toISOString().slice(0, 10),
    });
    setDraft(initialDraft());
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-module/25 bg-card p-4 shadow-xs">
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
          <Select value={draft.type} onValueChange={(v) => patch({ type: v as AttachmentType })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t]}
                </SelectItem>
              ))}
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
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Spinner /> : <Upload />} {draft.uploadId ? "Ganti File" : "Pilih File"}
          </Button>
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
          {draft.uploadId && (
            <span className="flex items-center gap-1 text-xs font-medium text-success">
              <CheckCircle2 className="size-3.5" /> Terunggah: {draft.name}
            </span>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="att-global"
            checked={!!draft.addToGlobal}
            onCheckedChange={(checked) => patch({ addToGlobal: checked === true })}
          />
          <Label htmlFor="att-global" className="text-xs font-normal text-muted-foreground">
            Simpan/Tag ke Resource Global
          </Label>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              discardPending();
              onCancel();
            }}
          >
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
