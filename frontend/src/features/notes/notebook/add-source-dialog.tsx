import { Check, FileUp, Globe, NotebookPen, Type, Upload } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { SearchInput } from "@/components/common/search-input";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAiNotes, useFreeNotes, useLists, useResources } from "@/data/collections";
import { queryKeys } from "@/data/query-keys";
import { useNotebookSources } from "@/data/use-notebooks";
import { errorMessage } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";
import { formatShortDate } from "@/lib/dates";
import { trackPendingUpload, untrackPendingUpload } from "@/lib/pending-uploads";
import { cn } from "@/lib/utils";
import type { NotebookRecordType, NotebookSource } from "@/types/api";
import { DOCUMENT_ACCEPT } from "../lib/read-file-text";
import { MAX_TEXT_SOURCE_CHARS, RECORD_TYPE_LABEL } from "./notebook-utils";

type SourceTab = "upload" | "record" | "text" | "web";

/** Tambah sumber notebook: unggah berkas, pilih item LifeOS, tempel teks, atau ambil halaman web. */
export function AddSourceDialog({
  notebookId,
  sources,
  open,
  onOpenChange,
}: {
  notebookId: string;
  sources: NotebookSource[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tambah Sumber</DialogTitle>
          <DialogDescription>
            AI notebook hanya menjawab dari sumber yang Anda tambahkan, lengkap dengan rujukan ke sumbernya.
          </DialogDescription>
        </DialogHeader>
        {/* Di-mount ulang setiap dibuka → form mulai kosong */}
        {open && <AddSourceBody notebookId={notebookId} sources={sources} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AddSourceBody({
  notebookId,
  sources,
  onDone,
}: {
  notebookId: string;
  sources: NotebookSource[];
  onDone: () => void;
}) {
  const [tab, setTab] = useState<SourceTab>("upload");
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as SourceTab)} className="min-h-0 flex-1">
      <TabsList className="w-full">
        <TabsTrigger value="upload">
          <Upload /> <span className="hidden sm:inline">Berkas</span>
        </TabsTrigger>
        <TabsTrigger value="record">
          <NotebookPen /> <span className="hidden sm:inline">Item LifeOS</span>
        </TabsTrigger>
        <TabsTrigger value="text">
          <Type /> <span className="hidden sm:inline">Teks</span>
        </TabsTrigger>
        <TabsTrigger value="web">
          <Globe /> <span className="hidden sm:inline">Link web</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="upload">
        <UploadSource notebookId={notebookId} onDone={onDone} />
      </TabsContent>
      <TabsContent value="record" className="min-h-0">
        <RecordSource notebookId={notebookId} sources={sources} onDone={onDone} />
      </TabsContent>
      <TabsContent value="text">
        <TextSource notebookId={notebookId} onDone={onDone} />
      </TabsContent>
      <TabsContent value="web">
        <WebSource notebookId={notebookId} onDone={onDone} />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------- Berkas

function UploadSource({ notebookId, onDone }: { notebookId: string; onDone: () => void }) {
  const { add } = useNotebookSources(notebookId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const uploadAll = async (files: FileList | null) => {
    if (!files?.length) return;
    let added = 0;
    for (const file of Array.from(files)) {
      setBusy(file.name);
      let assetId: string | undefined;
      try {
        const asset = await uploadsApi.upload(file, "notebook");
        assetId = asset.id;
        // Dicatat sampai menjadi sumber, agar dibersihkan bila tab ditutup di tengah proses
        trackPendingUpload(assetId);
        await add.mutateAsync({ kind: "upload", assetId });
        untrackPendingUpload(assetId);
        added++;
      } catch (error) {
        if (assetId) {
          untrackPendingUpload(assetId);
          void uploadsApi.remove(assetId).catch(() => undefined);
        }
        toast.error(`${file.name} gagal ditambahkan`, { description: errorMessage(error) });
      }
    }
    setBusy(null);
    if (added) {
      toast.success(`${added} berkas ditambahkan`, { description: "Isi berkas sedang dibaca server…" });
      onDone();
    }
  };

  return (
    <div className="flex flex-col gap-3 pt-2">
      <button
        type="button"
        disabled={!!busy}
        onClick={() => inputRef.current?.click()}
        className="flex h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-module hover:bg-module-soft hover:text-module disabled:opacity-60"
      >
        {busy ? (
          <>
            <Spinner className="size-6" /> Mengunggah {busy}…
          </>
        ) : (
          <>
            <FileUp className="size-8" />
            <span className="font-semibold">Pilih berkas (boleh lebih dari satu)</span>
            <span className="text-xs">PDF, DOCX, XLSX, teks, atau gambar · maks. 20 MB per berkas dibaca</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        aria-label="Pilih berkas sumber"
        onChange={(e) => {
          void uploadAll(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="text-xs text-muted-foreground">
        Gambar dan PDF hasil scan dibaca dengan OCR Gemini (butuh API key Gemini di Pengaturan → AI).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------- Item LifeOS

type Candidate = {
  key: string;
  title: string;
  hint: string;
  /** Label jenis di kanan baris */
  label: string;
} & ({ kind: "record"; recordType: NotebookRecordType; recordId: string } | { kind: "file"; assetId: string });

/** Upload milik notebook sendiri (bukan berkas LifeOS lain) — tidak ditawarkan di daftar berkas. */
const NOTEBOOK_CONTEXTS = new Set(["notebook", "notebook_chat"]);
/** Jenis berkas yang isinya bisa dibaca notebook (teks diekstrak server; gambar/scan lewat OCR). */
const readableFile = (mime: string, name: string) =>
  mime === "application/pdf" ||
  mime.startsWith("text/") ||
  mime.startsWith("image/") ||
  /\.(pdf|docx|xlsx|txt|md|csv|json)$/i.test(name) ||
  mime.includes("wordprocessingml") ||
  mime.includes("spreadsheetml");

const fileLabel = (mime: string, name: string) => {
  const ext = name.split(".").pop()?.toUpperCase();
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "Gambar";
  return ext && ext.length <= 5 ? ext : "Berkas";
};

function RecordSource({
  notebookId,
  sources,
  onDone,
}: {
  notebookId: string;
  sources: NotebookSource[];
  onDone: () => void;
}) {
  const { add } = useNotebookSources(notebookId);
  const { items: freeNotes } = useFreeNotes();
  const { items: aiNotes } = useAiNotes();
  const { items: lists } = useLists();
  const { items: resources } = useResources();
  // Berkas yang sudah ada di LifeOS (lampiran project/agenda/Notes AI, dsb.) — dipakai sebagai rujukan, tidak dihapus
  const { data: uploads = [] } = useQuery({ queryKey: queryKeys.uploads, queryFn: () => uploadsApi.list(100) });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const existing = new Set(sources.filter((s) => s.kind === "record").map((s) => `${s.recordType}:${s.recordId}`));
  const existingAssets = new Set(sources.map((s) => s.assetId).filter(Boolean));
  // Berkas milik resource sudah terwakili oleh resource-nya (menghindari dobel)
  const resourceUploads = new Set(resources.map((r) => r.uploadId).filter(Boolean));
  // Hanya item milik sendiri (item yang dibagikan orang lain tidak bisa dibaca notebook)
  const candidates: Candidate[] = [
    ...freeNotes
      .filter((n) => !n.share)
      .map((n) => ({
        kind: "record" as const,
        label: RECORD_TYPE_LABEL.free_note,
        recordType: "free_note" as const,
        recordId: String(n.id),
        title: n.title || "Tanpa Judul",
        hint: n.kind === "handwriting" ? "Tulis tangan" : (n.content ?? "").slice(0, 80),
      })),
    ...lists
      .filter((l) => !l.share)
      .map((l) => ({
        kind: "record" as const,
        label: RECORD_TYPE_LABEL.list,
        recordType: "list" as const,
        recordId: String(l.id),
        title: l.title,
        hint: `${l.items.length} item`,
      })),
    ...aiNotes
      .filter((n) => !n.share)
      .map((n) => ({
        kind: "record" as const,
        label: RECORD_TYPE_LABEL.ai_note,
        recordType: "ai_note" as const,
        recordId: String(n.id),
        title: n.title || "Tanpa Judul",
        hint: n.aiSummary ? "Ada ringkasan AI" : (n.content ?? "").slice(0, 80),
      })),
    ...resources
      .filter((r) => !r.share)
      .map((r) => ({
        kind: "record" as const,
        label: RECORD_TYPE_LABEL.para_resource,
        recordType: "para_resource" as const,
        recordId: String(r.id),
        title: r.title || "Tanpa Judul",
        hint: r.type === "file" ? "Berkas + isinya" : r.type === "link" ? (r.url ?? "Link") : "Catatan",
      })),
  ]
    .map((c): Candidate => ({ ...c, key: `${c.recordType}:${c.recordId}` }))
    .concat(
      uploads
        .filter(
          (u) =>
            !NOTEBOOK_CONTEXTS.has(u.context ?? "") &&
            !resourceUploads.has(u.id) &&
            !existingAssets.has(u.id) &&
            readableFile(u.mimeType, u.originalName),
        )
        .map((u) => ({
          kind: "file" as const,
          key: `file:${u.id}`,
          assetId: u.id,
          title: u.originalName,
          hint: `Berkas di LifeOS · ${formatShortDate(u.createdAt)}`,
          label: fileLabel(u.mimeType, u.originalName),
        })),
    )
    .filter((c) => c.kind === "file" || !existing.has(c.key))
    .filter((c) => !query.trim() || `${c.title} ${c.hint}`.toLowerCase().includes(query.trim().toLowerCase()));

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const submit = async () => {
    setBusy(true);
    let added = 0;
    for (const c of candidates.filter((c) => selected.has(c.key))) {
      try {
        await add.mutateAsync(
          c.kind === "file"
            ? { kind: "upload", assetId: c.assetId }
            : { kind: "record", recordType: c.recordType, recordId: c.recordId },
        );
        added++;
      } catch (error) {
        toast.error(`${c.title} gagal ditambahkan`, { description: errorMessage(error) });
      }
    }
    setBusy(false);
    if (added) {
      toast.success(`${added} item ditambahkan sebagai sumber.`);
      onDone();
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 pt-2">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Cari catatan, list, Notes AI, resource, berkas (PDF, DOCX, …)"
        className="md:w-full"
      />
      <div className="max-h-[45svh] min-h-40 overflow-y-auto rounded-xl border">
        {candidates.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Tidak ada item yang bisa ditambahkan.</p>
        ) : (
          candidates.map((c) => (
            <label
              key={c.key}
              className={cn(
                "flex cursor-pointer items-start gap-3 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/50",
                selected.has(c.key) && "bg-module-soft",
              )}
            >
              <Checkbox checked={selected.has(c.key)} onCheckedChange={() => toggle(c.key)} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{c.title}</span>
                {c.hint && <span className="block truncate text-xs text-muted-foreground">{c.hint}</span>}
              </span>
              <Badge variant="outline" className="shrink-0">
                {c.label}
              </Badge>
            </label>
          ))
        )}
      </div>
      <DialogFooter>
        <Button disabled={!selected.size || busy} onClick={() => void submit()}>
          {busy ? <Spinner /> : <Check />} Tambahkan {selected.size || ""}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ---------------------------------------------------------------------------- Teks

function TextSource({ notebookId, onDone }: { notebookId: string; onDone: () => void }) {
  const { add } = useNotebookSources(notebookId);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const tooShort = content.trim().length < 20;

  const submit = () =>
    add.mutate(
      { kind: "text", content: content.trim(), title: title.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Teks ditambahkan sebagai sumber.");
          onDone();
        },
        onError: (error) => toast.error("Teks gagal ditambahkan", { description: errorMessage(error) }),
      },
    );

  return (
    <div className="flex flex-col gap-3 pt-2">
      <Field>
        <FieldLabel htmlFor="nb-text-title">Judul (opsional)</FieldLabel>
        <Input
          id="nb-text-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="mis. Transkrip rapat 14 Okt"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="nb-text-content" className="flex w-full justify-between">
          <span>Isi teks</span>
          <span className="text-[11px] font-normal text-muted-foreground">
            {content.length.toLocaleString("id-ID")} / {MAX_TEXT_SOURCE_CHARS.toLocaleString("id-ID")}
          </span>
        </FieldLabel>
        <Textarea
          id="nb-text-content"
          rows={10}
          maxLength={MAX_TEXT_SOURCE_CHARS}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Tempel teks di sini (isi email, transkrip, artikel, catatan rapat…)"
        />
      </Field>
      <DialogFooter>
        <Button disabled={tooShort || add.isPending} onClick={submit}>
          {add.isPending ? <Spinner /> : <Check />} Tambahkan
        </Button>
      </DialogFooter>
    </div>
  );
}

// ---------------------------------------------------------------------------- Link web

function WebSource({ notebookId, onDone }: { notebookId: string; onDone: () => void }) {
  const { add } = useNotebookSources(notebookId);
  const [url, setUrl] = useState("");

  const submit = () =>
    add.mutate(
      { kind: "web", url: url.trim() },
      {
        onSuccess: (source) => {
          toast.success("Halaman web ditambahkan", { description: source.title });
          onDone();
        },
        onError: (error) => toast.error("Halaman web gagal diambil", { description: errorMessage(error) }),
      },
    );

  return (
    <form
      className="flex flex-col gap-3 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim()) submit();
      }}
    >
      <Field>
        <FieldLabel htmlFor="nb-web-url">Alamat halaman</FieldLabel>
        <Input
          id="nb-web-url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://contoh.go.id/berita/…"
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Server mengambil teks utama halaman (artikel, berita, dokumentasi, atau PDF). Halaman yang butuh login, video,
        dan alamat jaringan lokal tidak bisa diambil. Isi disimpan saat ditambahkan — gunakan "Muat ulang" untuk
        memperbarui.
      </p>
      <DialogFooter>
        <Button type="submit" disabled={!url.trim() || add.isPending}>
          {add.isPending ? (
            <>
              <Spinner /> Mengambil halaman…
            </>
          ) : (
            <>
              <Check /> Tambahkan
            </>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
