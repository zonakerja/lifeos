import type { JSONContent } from "@tiptap/core";
import { Check, ChevronLeft, Copy, ScanText } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FreeNote, NoteInk } from "@/types/entities";
import { RichTextEditor } from "../editor/rich-text-editor";
import { InkCanvas } from "../ink/ink-canvas";
import { type InkData, normalizeInk, PAGE_HEIGHT } from "../ink/ink-logic";
import { useHandwritingRecognition } from "../ink/use-handwriting-recognition";
import { docUploadIds, isFreeNoteEmpty, isHandwritingNote, plainTextToDoc } from "../lib/notes-logic";
import { removeUploads } from "../lib/remove-uploads";
import { NOTE_COLORS } from "../note-colors";

/** Jeda sebelum perubahan dikirim ke koleksi (dokumen berisi coretan bisa besar; jangan diproses tiap ketukan). */
const PERSIST_DELAY_MS = 400;

// Dipanggil hanya dari event handler (waktu simpan & ID catatan baru)
const nowIso = () => new Date().toISOString();
const newNoteId = () => Date.now();

/**
 * Editor catatan dengan simpan otomatis: perubahan dikirim ke koleksi (penulisan ke server di-debounce oleh
 * useCollection dan tetap terkirim walau editor ditutup / pindah menu). Catatan ketik memakai editor teks kaya;
 * catatan tulis tangan memakai kanvas stylus satu halaman penuh.
 */
export default function FreeNoteEditor({
  note,
  readOnly,
  onChange,
  onClose,
}: {
  note: FreeNote;
  readOnly: boolean;
  onChange: (note: FreeNote) => void;
  /** Dipanggil saat menutup editor dengan versi terakhir catatan */
  onClose: (last: FreeNote | null) => void;
}) {
  const handwriting = isHandwritingNote(note);
  const [draft, setDraft] = useState<FreeNote>(note);
  const [initialDoc] = useState<JSONContent>(
    () => (note.doc as JSONContent | undefined) ?? plainTextToDoc(note.content),
  );
  const [copied, setCopied] = useState(false);
  const { recognize, recognizing } = useHandwritingRecognition();
  const draftRef = useRef(draft);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  /** Gambar yang diunggah selama editor terbuka (dihapus saat ditutup bila tidak lagi dipakai). */
  const sessionUploadsRef = useRef(new Set<string>());

  const closedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  /** Kirim perubahan yang masih menunggu jeda. Hanya membaca ref, aman dipanggil dari timer. */
  const flush = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (dirtyRef.current) {
      dirtyRef.current = false;
      onChangeRef.current(draftRef.current);
    }
  };

  /** Bersihkan gambar yang tidak lagi ada di dokumen (dihapus user, atau diunggah lalu dibatalkan). */
  const cleanupImages = () => {
    if (readOnly || handwriting) return;
    const kept = new Set(docUploadIds(draftRef.current.doc ?? initialDoc));
    removeUploads([...docUploadIds(initialDoc), ...sessionUploadsRef.current].filter((id) => !kept.has(id)));
  };

  // Editor ditutup lewat navigasi lain (pindah menu/tab) → tetap simpan & bersihkan
  const onUnmount = useEffectEvent(() => {
    if (closedRef.current) return;
    flush();
    cleanupImages();
  });
  useEffect(() => () => onUnmount(), []);

  const update = (values: Partial<FreeNote>) => {
    if (readOnly) return;
    const prev = draftRef.current;
    const next = { ...prev, ...values, updatedAt: nowIso() };
    // Catatan baru baru disimpan (dan mendapat ID) setelah ada isinya
    const saved = !prev.id && isFreeNoteEmpty(next) ? next : { ...next, id: prev.id || newNoteId() };
    draftRef.current = saved;
    setDraft(saved);
    if (!saved.id) return;
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, PERSIST_DELAY_MS);
  };

  const close = () => {
    closedRef.current = true;
    flush();
    cleanupImages();
    onClose(readOnly ? null : draftRef.current);
  };

  const ink = normalizeInk(draft.ink, PAGE_HEIGHT);

  const recognizeInk = async () => {
    const text = await recognize(ink);
    if (text) {
      update({ content: text });
      toast.success("Tulisan tangan dibaca", { description: "Teksnya dipakai untuk pencarian & asisten AI." });
    }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(draft.content ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Gagal menyalin teks.");
    }
  };

  return (
    <Card className="min-h-[70svh] animate-in fade-in zoom-in-95">
      <CardContent className="flex flex-1 flex-col gap-4 px-3 sm:px-6">
        <div className="flex items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Kembali" onClick={close}>
              <ChevronLeft />
            </Button>
            {!readOnly && (
              <div className="flex gap-1.5 border-l pl-3">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    aria-label={`Warna ${c.label}`}
                    onClick={() => update({ color: c.id })}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-white shadow-sm transition-transform",
                      c.swatch,
                      draft.color === c.id && "scale-110 ring-2 ring-ring ring-offset-2 ring-offset-card",
                    )}
                  >
                    {draft.color === c.id && <Check className="size-3.5" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!readOnly && (
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline">Tersimpan otomatis</span>
              <Button onClick={close}>Selesai</Button>
            </div>
          )}
        </div>
        <input
          placeholder="Judul Catatan..."
          aria-label="Judul catatan"
          readOnly={readOnly}
          className="w-full bg-transparent text-2xl font-extrabold outline-none placeholder:text-muted-foreground/50 sm:text-3xl"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
        />

        {handwriting ? (
          <>
            <div className="overflow-hidden rounded-xl border bg-card">
              <InkCanvas
                variant="page"
                value={ink}
                readOnly={readOnly}
                onChange={(next: InkData) => update({ ink: next as NoteInk })}
                actions={
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={recognizing || !ink.strokes.length}
                    onClick={() => void recognizeInk()}
                    title="Baca tulisan tangan menjadi teks dengan AI"
                  >
                    {recognizing ? <Spinner /> : <ScanText />} <span className="hidden sm:inline">Ubah ke teks</span>
                  </Button>
                }
              />
            </div>
            {(draft.content || recognizing) && (
              <section className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase">
                    <ScanText className="size-3.5" /> Teks dari tulisan tangan
                  </span>
                  {draft.content && (
                    <Button type="button" variant="ghost" size="xs" onClick={() => void copyText()}>
                      {copied ? <Check /> : <Copy />} {copied ? "Disalin" : "Salin"}
                    </Button>
                  )}
                </div>
                {recognizing && !draft.content ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner /> Membaca tulisan tangan...
                  </p>
                ) : (
                  <Textarea
                    rows={6}
                    readOnly={readOnly}
                    aria-label="Teks dari tulisan tangan"
                    className="bg-background/70"
                    value={draft.content ?? ""}
                    onChange={(e) => update({ content: e.target.value })}
                  />
                )}
                <p className="text-[11px] text-muted-foreground">
                  Teks ini dipakai untuk pencarian dan asisten AI. Perbaiki bila ada kata yang salah terbaca.
                </p>
              </section>
            )}
          </>
        ) : (
          <RichTextEditor
            initialContent={initialDoc}
            readOnly={readOnly}
            onChange={({ doc, text }) => update({ doc, content: text })}
            onUploaded={(id) => sessionUploadsRef.current.add(id)}
          />
        )}
      </CardContent>
    </Card>
  );
}
