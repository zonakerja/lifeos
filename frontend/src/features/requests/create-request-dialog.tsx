import { Loader2, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRequestMutations } from "@/data/use-requests";
import { useOpenSession } from "@/hooks/use-retained";
import { errorMessage } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";
import type { RequestKind } from "@/types/api";
import { KIND_OPTIONS } from "./request-utils";

/** Berkas pemohon dibuat sebagai context `request` → ikut terhapus bersama pengajuan. */
const UPLOAD_CONTEXT = "request";
const MAX_FILES = 20;

export function CreateRequestDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const session = useOpenSession(open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-1 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pengajuan Baru</DialogTitle>
          <DialogDescription>
            Catat surat/pengajuan (dari satker, instansi, atau masyarakat) beserta berkasnya. Setelah tersimpan, AI bisa
            memeriksa kelengkapan, menelaah, dan menyusun konsep jawaban untuk Anda verifikasi.
          </DialogDescription>
        </DialogHeader>
        <CreateRequestForm key={session} onCancel={() => onOpenChange(false)} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}

function CreateRequestForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const { create } = useRequestMutations();
  const [kind, setKind] = useState<RequestKind>("psp");
  const [form, setForm] = useState({
    title: "",
    applicant: "",
    letterNumber: "",
    letterDate: "",
    subject: "",
    message: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  // Berkas diunggah saat disimpan (bukan saat dipilih) agar membatalkan formulir tidak meninggalkan berkas yatim
  const submit = async () => {
    if (!form.title.trim()) return toast.error("Judul wajib diisi.");
    setSaving(true);
    const uploaded: string[] = [];
    try {
      for (const file of files) uploaded.push((await uploadsApi.upload(file, UPLOAD_CONTEXT)).id);
      const request = await create.mutateAsync({
        kind,
        title: form.title.trim(),
        applicant: form.applicant.trim() || undefined,
        letterNumber: form.letterNumber.trim() || undefined,
        letterDate: form.letterDate || undefined,
        subject: form.subject.trim() || undefined,
        message: form.message.trim() || undefined,
        uploadIds: uploaded,
      });
      toast.success("Pengajuan dicatat.");
      onCreated(request.id);
    } catch (error) {
      await Promise.allSettled(uploaded.map((id) => uploadsApi.remove(id)));
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Jenis</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as RequestKind)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="req-applicant">Pemohon</Label>
          <Input
            id="req-applicant"
            value={form.applicant}
            onChange={set("applicant")}
            placeholder="Satker / instansi / nama pemohon"
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="req-title">Judul *</Label>
          <Input
            id="req-title"
            value={form.title}
            onChange={set("title")}
            placeholder="mis. Permohonan PSP 3 unit laptop"
            autoFocus
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="req-number">Nomor surat</Label>
          <Input id="req-number" value={form.letterNumber} onChange={set("letterNumber")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="req-date">Tanggal surat</Label>
          <Input id="req-date" type="date" value={form.letterDate} onChange={set("letterDate")} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="req-subject">Perihal</Label>
          <Input id="req-subject" value={form.subject} onChange={set("subject")} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="req-message">Isi / permintaan (opsional)</Label>
          <Textarea
            id="req-message"
            rows={3}
            value={form.message}
            onChange={set("message")}
            placeholder="Ringkas isi surat atau tempel teks pesan pemohon"
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Berkas pemohon</Label>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              setFiles((prev) => [...prev, ...picked].slice(0, MAX_FILES));
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {files.map((file, i) => (
              <span
                key={`${file.name}-${i}`}
                className="inline-flex max-w-64 items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs"
              >
                <Paperclip className="size-3 shrink-0" />
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  aria-label={`Lepas ${file.name}`}
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <Paperclip /> Pilih berkas
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Surat, KIB, foto, dsb. (PDF, DOCX, XLSX, gambar). Isinya dibaca server untuk analisis AI.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Batal
        </Button>
        <Button onClick={() => void submit()} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} Simpan
        </Button>
      </DialogFooter>
    </>
  );
}
