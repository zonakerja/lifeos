import {
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Eye,
  FileText,
  Link2,
  Mic,
  Paperclip,
  PencilLine,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Markdown } from "@/components/common/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAiNotes, useSchedules } from "@/data/collections";
import { useAssetUrl } from "@/data/use-asset-url";
import { scheduleStart } from "@/features/planner/lib/planner-logic";
import { openAttachment } from "@/features/resources/resource-utils";
import { usePermissions } from "@/hooks/use-permissions";
import { useSearchParam } from "@/hooks/use-search-param";
import { AI_NOT_CONFIGURED, useAi } from "@/lib/ai/use-ai";
import { ApiError, errorMessage } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";
import { formatDayMonth, todayYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AiNote, NoteFileAttachment } from "@/types/entities";
import { STYLE_PROMPTS, type SummaryStyle, SummaryStyleDialog } from "./summary-style-dialog";

type ProcessStatus = "idle" | "processing" | "done" | "error";

const NO_SCHEDULE = "__none__";
const AI_FILE = (mime: string) => mime === "application/pdf" || mime.startsWith("image/") || mime === "text/plain";
/** Kuota/limit provider AI habis (backend mengembalikan 429). */
const isQuotaError = (error: unknown) => error instanceof ApiError && error.status === 429;
const fileOf = (note: AiNote): NoteFileAttachment | null =>
  note.fileAttachment && "name" in note.fileAttachment ? (note.fileAttachment as NoteFileAttachment) : null;

const emptyNote = (): AiNote => ({
  id: "",
  title: "",
  date: todayYMD(),
  linkedScheduleId: "",
  content: "",
  aiSummary: "",
  audioTranscript: "",
  fileContext: "",
  hasAudio: false,
  fileAttachment: null,
});

export function AiNotesTab() {
  const { items: notes, setItems } = useAiNotes();
  const { canEdit } = usePermissions();
  const [noteParam, setNoteParam] = useSearchParam("note");
  const [deleting, setDeleting] = useState<AiNote | null>(null);

  const editing = noteParam === "new" ? emptyNote() : (notes.find((n) => String(n.id) === noteParam) ?? null);

  if (editing) {
    return (
      <AiNoteEditor
        key={noteParam}
        note={editing}
        readOnly={!canEdit}
        onBack={() => setNoteParam(null)}
        onSave={(note) => {
          const data = { ...note, id: note.id || Date.now(), updatedAt: new Date().toISOString() };
          setItems((prev) => (note.id ? prev.map((n) => (n.id === note.id ? data : n)) : [...prev, data]));
          setNoteParam(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <button
          type="button"
          onClick={() => setNoteParam("new")}
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-4 font-bold text-muted-foreground transition-colors hover:border-module hover:bg-module-soft hover:text-module"
        >
          <Plus className="size-5" /> Buat Notes AI Baru
        </button>
      )}
      {notes.length === 0 && !canEdit && (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Belum ada Notes AI</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      {notes.map((n) => (
        <div
          key={n.id}
          role="button"
          tabIndex={0}
          onClick={() => setNoteParam(String(n.id))}
          onKeyDown={(e) => e.key === "Enter" && setNoteParam(String(n.id))}
          className="group relative cursor-pointer rounded-2xl border bg-card p-5 transition-all hover:border-module/40 hover:shadow-md"
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="truncate text-lg font-bold">{n.title}</h4>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {n.date && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3" /> {n.date}
                  </span>
                )}
                {n.linkedScheduleId && (
                  <Badge className="bg-mod-planner/15 text-mod-planner">
                    <Link2 /> Linked
                  </Badge>
                )}
              </div>
            </div>
            {n.aiSummary && (
              <Badge className="bg-module-soft text-module">
                <Sparkles /> AI Ready
              </Badge>
            )}
          </div>
          <div className="my-2 flex flex-wrap gap-2">
            {n.hasAudio && (
              <Badge variant="outline" className="border-destructive/30 text-destructive">
                <Mic /> Audio
              </Badge>
            )}
            {fileOf(n) && (
              <Badge variant="outline" className="border-mod-notes/40 text-mod-notes">
                <Paperclip /> File
              </Badge>
            )}
            {n.content && (
              <Badge variant="outline">
                <FileText /> Notes
              </Badge>
            )}
          </div>
          <p className="line-clamp-2 pr-8 text-sm text-muted-foreground">
            {n.aiSummary ? n.aiSummary.replace(/[*#$]/g, "") : n.content || "Tidak ada preview konten."}
          </p>
          {canEdit && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Hapus"
              className="absolute right-4 bottom-4 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setDeleting(n);
              }}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      ))}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Catatan?"
        description="Catatan ini akan dihapus permanen."
        itemName={deleting?.title || "Tanpa Judul"}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting) setItems((prev) => prev.filter((n) => n.id !== deleting.id));
          setDeleting(null);
        }}
      />
    </div>
  );
}

function StatusBadge({ status, processingLabel }: { status: ProcessStatus; processingLabel: string }) {
  if (status === "processing")
    return (
      <Badge className="bg-warning/20 text-warning-foreground dark:text-warning">
        <Spinner className="size-3" /> {processingLabel}
      </Badge>
    );
  if (status === "error") return <Badge className="bg-destructive/12 text-destructive">Error</Badge>;
  if (status === "done")
    return (
      <Badge className="bg-success/15 text-success">
        <CheckCircle2 /> Ready
      </Badge>
    );
  return null;
}

function AiNoteEditor({
  note,
  readOnly,
  onBack,
  onSave,
}: {
  note: AiNote;
  readOnly: boolean;
  onBack: () => void;
  onSave: (note: AiNote) => void;
}) {
  const ai = useAi();
  const { items: schedules } = useSchedules();
  const [draft, setDraft] = useState<AiNote>(note);
  const [audioStatus, setAudioStatus] = useState<ProcessStatus>(note.audioTranscript ? "done" : "idle");
  const [fileStatus, setFileStatus] = useState<ProcessStatus>(note.fileContext ? "done" : "idle");
  const [recording, setRecording] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(null);
  // Jumlah upload yang masih berjalan; Simpan dinonaktifkan agar uploadId tidak hilang
  const [pendingUploads, setPendingUploads] = useState(0);
  const trackUpload = <T,>(promise: Promise<T>) => {
    setPendingUploads((n) => n + 1);
    return promise.finally(() => setPendingUploads((n) => n - 1));
  };
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const remoteAudioUrl = useAssetUrl(localAudioUrl ? null : draft.audioUploadId);
  const audioUrl = localAudioUrl ?? remoteAudioUrl;
  const attachedFile = fileOf(draft);

  const patch = (values: Partial<AiNote>) => setDraft((prev) => ({ ...prev, ...values }));

  const reportAiError = (title: string, error: unknown, quotaHint: string) => {
    const msg = errorMessage(error);
    if (isQuotaError(error)) toast.error("Limit API Tercapai ⚠️", { description: `${msg} ${quotaHint}` });
    else toast.error(title, { description: msg });
  };

  const requireAi = () => {
    if (ai.isConfigured) return true;
    toast.error("AI belum diatur", { description: AI_NOT_CONFIGURED });
    return false;
  };

  // ---------------------------------------------------------------- Audio
  const processAudio = async (blob: Blob, fileName: string) => {
    setLocalAudioUrl(URL.createObjectURL(blob));
    patch({ hasAudio: true });
    // Simpan audio ke object storage agar tetap ada setelah reload
    trackUpload(uploadsApi.upload(new File([blob], fileName, { type: blob.type || "audio/webm" }), "ai_note_audio"))
      .then((asset) => patch({ audioUploadId: asset.id }))
      .catch((error: unknown) => toast.error("Audio gagal diunggah", { description: errorMessage(error) }));

    if (!requireAi()) {
      setAudioStatus("error");
      return;
    }
    setAudioStatus("processing");
    try {
      const transcript = await ai.generate(
        "Transkripkan audio ini secara verbatim dan rapi. Jika ada beberapa pembicara, pisahkan. Output HANYA transkrip teks tanpa komentar lain.",
        [blob],
      );
      patch({ audioTranscript: transcript });
      setAudioStatus("done");
    } catch (error) {
      setAudioStatus("error");
      reportAiError("Gagal transkrip audio", error, "Audio tetap terlampir; hapus dan unggah ulang nanti.");
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void processAudio(new Blob(chunksRef.current, { type: "audio/webm" }), `rekaman-${Date.now()}.webm`);
      };
      recorder.start();
      setRecording(true);
    } catch (error) {
      toast.error("Gagal mengakses mikrofon", { description: errorMessage(error) });
      setRecording(false);
    }
  };

  const removeAudio = () => {
    patch({ hasAudio: false, audioTranscript: "", audioUploadId: undefined });
    setLocalAudioUrl(null);
    setAudioStatus("idle");
  };

  // ---------------------------------------------------------------- File
  const handleFile = async (file?: File) => {
    if (!file) return;
    patch({ fileAttachment: { name: file.name, mimeType: file.type } });
    trackUpload(uploadsApi.upload(file, "ai_note_file"))
      .then((asset) => patch({ fileAttachment: { name: file.name, mimeType: file.type, uploadId: asset.id } }))
      .catch((error: unknown) => toast.error("File gagal diunggah", { description: errorMessage(error) }));

    if (!requireAi()) {
      setFileStatus("error");
      return;
    }
    if (!AI_FILE(file.type)) {
      setFileStatus("error");
      toast.error("Format tidak didukung", { description: "Ekstraksi AI hanya untuk PDF, gambar, atau teks." });
      return;
    }
    setFileStatus("processing");
    try {
      const text = await ai.generate(
        "Ekstrak seluruh teks/informasi penting dari dokumen ini. JANGAN diringkas, cukup salin isi mentahnya untuk referensi utama.",
        [file],
      );
      patch({ fileContext: text });
      setFileStatus("done");
    } catch (error) {
      setFileStatus("error");
      reportAiError("Ekstraksi gagal", error, "File tetap terlampir; hapus dan unggah ulang nanti.");
    }
  };

  // ---------------------------------------------------------------- Ringkasan
  const startGenerate = () => {
    if (!draft.content?.trim() && !draft.audioTranscript?.trim() && !draft.fileContext?.trim()) {
      toast.error("Data kurang", {
        description: "Isi minimal Catatan Kasar, atau sediakan audio/file berstatus Ready terlebih dahulu.",
      });
      return;
    }
    if (audioStatus === "processing" || fileStatus === "processing") {
      toast.error("Proses masih berjalan", { description: "Tunggu transkrip/ekstraksi selesai (status Ready)." });
      return;
    }
    if (requireAi()) setStyleOpen(true);
  };

  const generate = async (style: SummaryStyle) => {
    setStyleOpen(false);
    setGenerating(true);
    setMode("preview");
    let prompt = `Buatlah ringkasan komprehensif dari materi berikut dengan gaya bahasa: ${STYLE_PROMPTS[style]}.\n\n`;
    if (draft.content) prompt += `--- CATATAN KASAR USER ---\n${draft.content}\n\n`;
    if (draft.audioTranscript) prompt += `--- TRANSKRIP AUDIO (SUMBER UTAMA) ---\n${draft.audioTranscript}\n\n`;
    if (draft.fileContext) prompt += `--- ISI DOKUMEN TAMBAHAN (REFERENSI) ---\n${draft.fileContext}\n\n`;
    prompt +=
      "Instruksi Formatting (Wajib):\n1. Gunakan Markdown standard.\n2. Gunakan '#' untuk Judul Besar, '##' untuk Sub-judul.\n3. Gunakan bullet points '-' untuk list.\n4. Jika ada rumus matematika, Wajib gunakan format blok dengan delimiter '$$' untuk dipisah per baris, dan '$' untuk inline.\n5. Gunakan '**teks**' untuk bold pada poin penting.\n6. Prioritaskan dan kombinasikan informasi dari semua sumber yang diberikan di atas.";
    try {
      patch({ aiSummary: await ai.generate(prompt) });
    } catch (error) {
      reportAiError("Gagal membuat ringkasan", error, "Silakan coba Generate AI lagi setelah beberapa saat.");
    } finally {
      setGenerating(false);
    }
  };

  const save = () => {
    if (!draft.title.trim()) {
      toast.error("Judul notes wajib diisi.");
      return;
    }
    onSave(draft);
  };

  return (
    <Card className="animate-in fade-in slide-in-from-right-4">
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Kembali" onClick={onBack}>
              <ChevronLeft />
            </Button>
            <h3 className="text-xl font-bold">Detail Notes AI</h3>
          </div>
          {!readOnly && (
            <Button onClick={save} disabled={pendingUploads > 0}>
              {pendingUploads > 0 ? (
                <>
                  <Spinner /> Mengunggah...
                </>
              ) : (
                "Simpan"
              )}
            </Button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ainote-title">Judul / Topik</FieldLabel>
            <Input id="ainote-title" value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ainote-date">Tanggal</FieldLabel>
            <Input
              id="ainote-date"
              type="date"
              value={draft.date ?? ""}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel>Link Agenda (Opsional)</FieldLabel>
            <Select
              value={draft.linkedScheduleId || NO_SCHEDULE}
              onValueChange={(v) => {
                const id = v === NO_SCHEDULE ? "" : v;
                const selected = schedules.find((s) => s.id === id);
                patch({ linkedScheduleId: id, title: draft.title || selected?.title || "" });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SCHEDULE}>-- Pilih Agenda Planner --</SelectItem>
                {schedules.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} ({formatDayMonth(scheduleStart(s))})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            {/* Audio sumber */}
            <section
              className={cn(
                "flex flex-col gap-3 rounded-2xl border p-4 transition-colors",
                recording ? "border-destructive/40 bg-destructive/6" : "bg-muted/40",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase">
                  <Mic className="size-3.5" /> Audio Sumber
                </span>
                <StatusBadge status={audioStatus} processingLabel="Transcribing..." />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  size="icon-lg"
                  disabled={readOnly}
                  variant={recording ? "destructive" : "outline"}
                  className={cn("shrink-0 rounded-full", recording && "animate-pulse bg-destructive text-white")}
                  title="Rekam suara"
                  onClick={() => void toggleRecording()}
                >
                  {recording ? <Square /> : <Mic />}
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="icon-lg"
                  className="shrink-0 rounded-full"
                  title="Upload file audio"
                >
                  <label className={cn(readOnly && "pointer-events-none opacity-50")}>
                    <Upload />
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void processAudio(file, file.name);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </Button>
                {draft.hasAudio && !recording && (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {audioUrl ? (
                      <audio controls src={audioUrl} className="h-10 w-full" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Audio terlampir</span>
                    )}
                    {!readOnly && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Hapus audio"
                        className="hover:text-destructive"
                        onClick={removeAudio}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {draft.audioTranscript && (
                <div className="max-h-28 overflow-y-auto rounded-lg bg-background/70 p-3 text-xs leading-relaxed text-muted-foreground">
                  <span className="mb-1 block font-bold text-foreground">Transkrip:</span>
                  {draft.audioTranscript}
                </div>
              )}
            </section>

            {/* Dokumen tambahan */}
            <section className="flex flex-col gap-3 rounded-2xl border bg-muted/40 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase">
                  <Paperclip className="size-3.5" /> Upload Dokumen Tambahan
                </span>
                <StatusBadge status={fileStatus} processingLabel="Extracting..." />
              </div>
              <label
                className={cn(
                  "flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed bg-background/60 text-xs text-muted-foreground transition-colors hover:border-module hover:text-module",
                  readOnly && "pointer-events-none opacity-60",
                )}
              >
                {attachedFile ? (
                  <span className="flex items-center gap-2 text-sm font-medium text-module">
                    <FileText className="size-4" /> {attachedFile.name}
                  </span>
                ) : (
                  <>
                    <Upload className="size-5" /> Klik upload dokumen (PDF/Gambar/Teks)
                  </>
                )}
                <input
                  type="file"
                  accept=".pdf,.txt,image/*"
                  className="hidden"
                  onChange={(e) => {
                    void handleFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {attachedFile && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-module/25 bg-module-soft px-3 py-2">
                  <span className="truncate text-xs">{attachedFile.name}</span>
                  <div className="flex items-center gap-1">
                    {attachedFile.uploadId && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => void openAttachment({ uploadId: attachedFile.uploadId })}
                      >
                        <Eye /> Buka
                      </Button>
                    )}
                    {!readOnly && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Hapus file"
                        className="hover:text-destructive"
                        onClick={() => {
                          patch({ fileAttachment: null, fileContext: "" });
                          setFileStatus("idle");
                        }}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </section>

            <Field className="flex-1">
              <FieldLabel htmlFor="ainote-content" className="flex w-full justify-between">
                <span>Catatan Kasar</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  (Syarat utama AI jika tanpa audio)
                </span>
              </FieldLabel>
              <Textarea
                id="ainote-content"
                rows={8}
                readOnly={readOnly}
                placeholder="Ketik ide, coretan rapat, atau ringkasan manual di sini..."
                value={draft.content ?? ""}
                onChange={(e) => patch({ content: e.target.value })}
              />
            </Field>
          </div>

          {/* Ringkasan AI */}
          <section className="flex min-h-96 flex-col overflow-hidden rounded-2xl border border-module/25">
            <div className="flex items-center justify-between gap-2 border-b bg-module-soft px-3 py-2">
              <span className="flex items-center gap-2 text-xs font-bold text-module uppercase">
                <Bot className="size-3.5" /> AI Summary
              </span>
              <div className="flex items-center gap-2">
                {draft.aiSummary && (
                  <ToggleGroup
                    type="single"
                    size="sm"
                    variant="outline"
                    value={mode}
                    onValueChange={(v) => v && setMode(v as "preview" | "edit")}
                  >
                    <ToggleGroupItem value="preview">
                      <Eye /> View
                    </ToggleGroupItem>
                    <ToggleGroupItem value="edit" disabled={readOnly}>
                      <PencilLine /> Edit
                    </ToggleGroupItem>
                  </ToggleGroup>
                )}
                {!readOnly && (
                  <Button size="sm" onClick={startGenerate} disabled={generating}>
                    {generating ? <Spinner /> : <Sparkles />} {generating ? "Memproses AI..." : "Generate AI"}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {draft.aiSummary ? (
                mode === "preview" ? (
                  <Markdown content={draft.aiSummary} />
                ) : (
                  <Textarea
                    className="min-h-80 resize-none border-none bg-transparent font-mono text-sm shadow-none focus-visible:ring-0"
                    value={draft.aiSummary}
                    onChange={(e) => patch({ aiSummary: e.target.value })}
                  />
                )
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon" className="bg-module-soft text-module">
                      <Sparkles />
                    </EmptyMedia>
                    <EmptyDescription>
                      Isi catatan kasar ATAU unggah/rekam audio (tunggu "Ready"), lalu klik "Generate AI".
                    </EmptyDescription>
                    {!ai.isConfigured && (
                      <p className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive">
                        AI belum diatur. Atur di Pengaturan → AI.
                      </p>
                    )}
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          </section>
        </div>
      </CardContent>
      <SummaryStyleDialog open={styleOpen} onOpenChange={setStyleOpen} onConfirm={(s) => void generate(s)} />
    </Card>
  );
}
