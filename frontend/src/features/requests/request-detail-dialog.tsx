import {
  Bot,
  Check,
  CheckCheck,
  ClipboardCheck,
  Copy,
  FilePen,
  FilePlus2,
  FileText,
  History,
  Loader2,
  Paperclip,
  Pencil,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { previewFile } from "@/components/common/file-preview";
import { Markdown } from "@/components/common/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useRequest, useRequestMutations } from "@/data/use-requests";
import { CitationChip } from "@/features/assistant/floating-chatbot";
import { stripCitations } from "@/features/notes/notebook/notebook-utils";
import { openOfficeEditor } from "@/features/tools/onlyoffice/office-editor-host";
import { useRetained } from "@/hooks/use-retained";
import { errorMessage } from "@/lib/api/client";
import { formatDateTime, formatShortDate, parseLocalYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { RequestDetail, RequestStatus, RequestUpdate } from "@/types/api";
import { CHECK_LABELS, CHECK_TONE, KIND_LABELS, STATUS_LABELS, STATUS_TONE } from "./request-utils";
import { TemplateFillDialog } from "./template-fill-dialog";

const EXTRACTION_LABEL: Record<string, string> = {
  pending: "Sedang dibaca",
  extracting: "Sedang dibaca",
  completed: "Terbaca",
  unsupported: "Tidak terbaca",
  failed: "Gagal dibaca",
};

/** Detail pengajuan: data surat, berkas, analisis AI, telaah + konsep jawaban, dokumen dari templat, keputusan. */
export function RequestDetailDialog({ requestId, onClose }: { requestId: string | null; onClose: () => void }) {
  const id = useRetained(requestId);
  const { data, isLoading, error } = useRequest(id);
  return (
    <Dialog open={!!requestId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94svh] grid-cols-1 overflow-y-auto sm:max-w-4xl">
        {isLoading || !data ? (
          error ? (
            <DialogHeader>
              <DialogTitle>Pengajuan tidak ditemukan</DialogTitle>
              <DialogDescription>{errorMessage(error)}</DialogDescription>
            </DialogHeader>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Memuat pengajuan…</DialogTitle>
              </DialogHeader>
              <Skeleton className="h-64 rounded-xl" />
            </>
          )
        ) : (
          <RequestDetailBody key={data.id} request={data} onDeleted={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RequestDetailBody({ request: r, onDeleted }: { request: RequestDetail; onDeleted: () => void }) {
  const m = useRequestMutations();
  const aiReady = !!useAuthStore((s) => s.user?.aiProvider);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const filesPending = r.files.some((f) => f.extraction === "pending" || f.extraction === "extracting");

  const update = (input: RequestUpdate, success?: string) =>
    m.update.mutate(
      { id: r.id, input },
      { onSuccess: () => success && toast.success(success), onError: (e) => toast.error(errorMessage(e)) },
    );
  const setStatus = (status: RequestStatus, statusNote?: string) =>
    update({ status, statusNote }, `Status: ${STATUS_LABELS[status]}.`);

  const runAi = (kind: "analyze" | "review") =>
    m[kind].mutate(r.id, {
      onSuccess: () =>
        toast.success(kind === "analyze" ? "Analisis selesai." : "Telaah & konsep jawaban siap diperiksa."),
      onError: (e) => toast.error(errorMessage(e)),
    });

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-1.5 pr-8">
          <Badge className={STATUS_TONE[r.status]}>{STATUS_LABELS[r.status]}</Badge>
          <Badge variant="outline">{KIND_LABELS[r.kind]}</Badge>
          {r.source !== "manual" && (
            <Badge variant="outline" className="gap-1">
              <Bot className="size-3" /> Dicatat {r.source === "mcp" ? "agen" : "lewat WhatsApp"}
            </Badge>
          )}
        </div>
        <DialogTitle className="text-lg">{r.title}</DialogTitle>
        <DialogDescription>
          Keluaran AI adalah konsep — periksa isi, kelengkapan, dan dasar hukumnya sebelum memutuskan.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap gap-2 rounded-xl border bg-muted/30 p-2">
        {r.status !== "disetujui" && r.status !== "dikirim" && (
          <Button size="sm" onClick={() => setStatus("disetujui")} disabled={m.update.isPending}>
            <Check /> Setujui
          </Button>
        )}
        {r.status === "disetujui" && (
          <Button size="sm" onClick={() => setStatus("dikirim")} disabled={m.update.isPending}>
            <Send /> Tandai sudah dikirim
          </Button>
        )}
        {r.status !== "ditolak" && r.status !== "dikirim" && (
          <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
            <X /> Tolak / kembalikan
          </Button>
        )}
        {["disetujui", "dikirim", "ditolak"].includes(r.status) && (
          <Button size="sm" variant="outline" onClick={() => setStatus("diproses", "Dibuka kembali")}>
            <RotateCcw /> Buka kembali
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-destructive hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 /> Hapus
        </Button>
      </div>
      {rejecting && (
        <RejectForm
          onCancel={() => setRejecting(false)}
          onSubmit={(note) => {
            setRejecting(false);
            setStatus("ditolak", note);
          }}
        />
      )}

      <LetterSection request={r} onSave={(input) => update(input, "Data pengajuan disimpan.")} />

      <Section icon={Paperclip} title="Berkas pemohon">
        {r.files.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada berkas. Analisis memakai data & isi pesan saja.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1">
            {r.files.map((f) => (
              <li key={f.uploadId} className="flex items-center gap-2 text-sm">
                <FileText className="size-4 shrink-0 text-module" />
                <button
                  type="button"
                  className="min-w-0 truncate text-left hover:underline"
                  onClick={() => previewFile({ uploadId: f.uploadId, name: f.name, mimeType: f.mimeType })}
                >
                  {f.name}
                </button>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {f.extraction ? (EXTRACTION_LABEL[f.extraction] ?? f.extraction) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {!aiReady && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          AI belum diatur. Simpan API key di Pengaturan → AI untuk memakai analisis, telaah, dan isi templat otomatis.
        </p>
      )}

      <Section
        icon={ClipboardCheck}
        title="Analisis & kelengkapan"
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={!aiReady || filesPending || m.analyze.isPending}
            onClick={() => runAi("analyze")}
          >
            {m.analyze.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {r.analysis ? "Analisis ulang" : "Analisis dengan AI"}
          </Button>
        }
      >
        {filesPending && <p className="text-xs text-muted-foreground">Menunggu berkas selesai dibaca server…</p>}
        {r.analysis ? (
          <AnalysisView analysis={r.analysis} />
        ) : (
          <p className="text-sm text-muted-foreground">
            AI meringkas surat, mengambil data penting, dan mencocokkan kelengkapan dengan persyaratan di Basis
            Pengetahuan (mis. folder <code>50-Persyaratan</code> vault Obsidian).
          </p>
        )}
      </Section>

      <Section
        icon={FilePen}
        title="Telaah & konsep jawaban"
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={!aiReady || filesPending || m.review.isPending}
            onClick={() => runAi("review")}
          >
            {m.review.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {r.review ? "Susun ulang" : "Telaah dengan AI"}
          </Button>
        }
      >
        <EditableMarkdown
          label="Telaah"
          value={r.review}
          empty="Belum ada telaah. AI menelaah pengajuan terhadap ketentuan di Basis Pengetahuan (bersitasi)."
          onSave={(review) => update({ review }, "Telaah disimpan.")}
          footer={
            r.reviewCitations && r.reviewCitations.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {r.reviewCitations.map((c) => (
                  <CitationChip key={c.n} citation={c} />
                ))}
              </div>
            ) : null
          }
        />
        <EditableMarkdown
          label="Konsep jawaban"
          value={r.draftReply}
          empty="Konsep isi surat jawaban muncul di sini setelah telaah."
          onSave={(draftReply) => update({ draftReply }, "Konsep jawaban disimpan.")}
        />
      </Section>

      <Section
        icon={FilePlus2}
        title="Dokumen dari templat"
        action={
          <Button size="sm" variant="outline" onClick={() => setTemplateOpen(true)}>
            <FilePlus2 /> Buat dari templat
          </Button>
        }
      >
        {r.documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Isi templat DOCX instansi (Tools → ONLYOFFICE → Templat) dengan data pengajuan. Penanda SRIKANDI (nomor,
            tanggal, tanda tangan) dibiarkan untuk diisi SRIKANDI.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-1">
            {r.documents.map((d) => (
              <li key={d.uploadId} className="flex items-center gap-2 text-sm">
                <FileText className="size-4 shrink-0 text-module" />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {formatDateTime(d.createdAt)}
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => openOfficeEditor({ uploadId: d.uploadId, name: d.name })}
                >
                  <Pencil /> Buka
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Hapus ${d.name}`}
                  onClick={() =>
                    m.removeDocument.mutate(
                      { id: r.id, uploadId: d.uploadId },
                      { onError: (e) => toast.error(errorMessage(e)) },
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={History} title="Riwayat">
        <ol className="grid grid-cols-1 gap-1 text-xs">
          {[...r.history].reverse().map((h, i) => (
            <li key={`${h.at}-${i}`} className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground tabular-nums">{formatDateTime(h.at)}</span>
              <Badge className={cn("h-5", STATUS_TONE[h.status])}>{STATUS_LABELS[h.status]}</Badge>
              <span className="text-muted-foreground">oleh {h.by === "agen" ? "agen AI" : "Anda"}</span>
              {h.note && <span>— {h.note}</span>}
            </li>
          ))}
        </ol>
      </Section>

      <TemplateFillDialog open={templateOpen} onOpenChange={setTemplateOpen} request={r} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Hapus pengajuan?"
        itemName={r.title}
        description="Berkas pemohon dan dokumen yang dibuat dari templat ikut terhapus."
        confirmLabel="Hapus"
        onConfirm={() =>
          m.remove.mutate(r.id, {
            onSuccess: () => {
              toast.success("Pengajuan dihapus.");
              onDeleted();
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </>
  );
}

function Section({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof FileText;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="size-4 text-module" />
        <h3 className="text-sm font-bold">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function LetterSection({ request: r, onSave }: { request: RequestDetail; onSave: (input: RequestUpdate) => void }) {
  const [editing, setEditing] = useState(false);
  const rows: [string, ReactNode][] = [
    ["Pemohon", r.applicant],
    ["Kode grup", r.groupCode],
    ["Nomor surat", r.letterNumber],
    ["Tanggal surat", r.letterDate && formatShortDate(parseLocalYMD(r.letterDate))],
    ["Perihal", r.subject],
  ];
  return (
    <Section
      icon={FileText}
      title="Data surat"
      action={
        !editing && (
          <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil /> Ubah
          </Button>
        )
      }
    >
      {editing ? (
        <LetterForm
          request={r}
          onCancel={() => setEditing(false)}
          onSave={(input) => {
            onSave(input);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words">{value || "—"}</dd>
              </div>
            ))}
          </dl>
          {r.message && <p className="text-sm whitespace-pre-wrap">{r.message}</p>}
          {r.notes && (
            <p className="rounded-lg bg-muted/40 p-2 text-xs whitespace-pre-wrap">
              <span className="font-semibold">Catatan: </span>
              {r.notes}
            </p>
          )}
        </>
      )}
    </Section>
  );
}

function LetterForm({
  request: r,
  onCancel,
  onSave,
}: {
  request: RequestDetail;
  onCancel: () => void;
  onSave: (input: RequestUpdate) => void;
}) {
  const [form, setForm] = useState(() => ({
    title: r.title,
    applicant: r.applicant ?? "",
    letterNumber: r.letterNumber ?? "",
    letterDate: r.letterDate ?? "",
    subject: r.subject ?? "",
    message: r.message ?? "",
    notes: r.notes ?? "",
  }));
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="edit-title">Judul</Label>
        <Input id="edit-title" value={form.title} onChange={set("title")} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="edit-applicant">Pemohon</Label>
        <Input id="edit-applicant" value={form.applicant} onChange={set("applicant")} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="edit-number">Nomor surat</Label>
        <Input id="edit-number" value={form.letterNumber} onChange={set("letterNumber")} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="edit-date">Tanggal surat</Label>
        <Input id="edit-date" type="date" value={form.letterDate} onChange={set("letterDate")} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="edit-subject">Perihal</Label>
        <Input id="edit-subject" value={form.subject} onChange={set("subject")} />
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="edit-message">Isi / permintaan</Label>
        <Textarea id="edit-message" rows={3} value={form.message} onChange={set("message")} />
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="edit-notes">Catatan Anda (ikut dibaca AI)</Label>
        <Textarea id="edit-notes" rows={2} value={form.notes} onChange={set("notes")} />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button size="sm" variant="outline" onClick={onCancel}>
          Batal
        </Button>
        <Button
          size="sm"
          disabled={!form.title.trim()}
          onClick={() =>
            onSave({
              title: form.title,
              applicant: form.applicant,
              letterNumber: form.letterNumber,
              letterDate: form.letterDate,
              subject: form.subject,
              message: form.message,
              notes: form.notes,
            })
          }
        >
          Simpan
        </Button>
      </div>
    </div>
  );
}

function AnalysisView({ analysis: a }: { analysis: NonNullable<RequestDetail["analysis"]> }) {
  return (
    <div className="grid grid-cols-1 gap-2 text-sm">
      {a.summary && <p>{a.summary}</p>}
      {a.checklist.length > 0 && (
        <ul className="grid grid-cols-1 gap-1">
          {a.checklist.map((c, i) => (
            <li key={`${c.dokumen}-${i}`} className="flex flex-wrap items-start gap-2">
              <Badge className={cn("shrink-0", CHECK_TONE[c.status])}>{CHECK_LABELS[c.status]}</Badge>
              <span className="min-w-0 flex-1">
                {c.dokumen}
                {c.catatan && <span className="text-xs text-muted-foreground"> — {c.catatan}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {a.missing.length > 0 && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs">
          <span className="font-semibold">Kekurangan: </span>
          {a.missing.join("; ")}
        </p>
      )}
      {a.suggestion && (
        <p className="text-xs">
          <span className="font-semibold">Saran: </span>
          {a.suggestion}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {a.sources.length > 0
          ? `Persyaratan dari: ${a.sources.map((s) => `[${s.n}] ${s.title}`).join(", ")}`
          : "Tidak ada persyaratan di Basis Pengetahuan — kelengkapan dinilai dari pengetahuan umum AI (periksa ulang)."}
        {" · "}
        {formatDateTime(a.analyzedAt)}
      </p>
    </div>
  );
}

function EditableMarkdown({
  label,
  value,
  empty,
  onSave,
  footer,
}: {
  label: string;
  value: string | null;
  empty: string;
  onSave: (value: string) => void;
  footer?: ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const copy = async () => {
    await navigator.clipboard.writeText(stripCitations(value ?? ""));
    toast.success(`${label} disalin.`);
  };
  return (
    <div className="grid grid-cols-1 gap-1.5 rounded-lg bg-muted/30 p-2">
      <div className="flex items-center gap-1">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        {value && draft === null && (
          <span className="ml-auto flex gap-1">
            <Button size="icon-xs" variant="ghost" aria-label={`Salin ${label}`} onClick={() => void copy()}>
              <Copy />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label={`Ubah ${label}`} onClick={() => setDraft(value)}>
              <Pencil />
            </Button>
          </span>
        )}
      </div>
      {draft !== null ? (
        <>
          <Textarea rows={12} value={draft} onChange={(e) => setDraft(e.target.value)} className="font-mono text-xs" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setDraft(null)}>
              Batal
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onSave(draft);
                setDraft(null);
              }}
            >
              <CheckCheck /> Simpan
            </Button>
          </div>
        </>
      ) : value ? (
        <>
          <Markdown content={value} className="text-sm" />
          {footer}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function RejectForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="grid gap-2 rounded-xl border border-destructive/30 p-3">
      <Label htmlFor="reject-note">Alasan ditolak / dikembalikan (tercatat di riwayat)</Label>
      <Textarea id="reject-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>
          Batal
        </Button>
        <Button size="sm" variant="destructive" onClick={() => onSubmit(note.trim())}>
          Tolak
        </Button>
      </div>
    </div>
  );
}
