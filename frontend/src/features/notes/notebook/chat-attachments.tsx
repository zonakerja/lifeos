import { FileText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { previewFile, previewKind } from "@/components/common/file-preview";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAssetUrl } from "@/data/use-asset-url";
import { errorMessage } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";
import { trackPendingUpload, untrackPendingUpload } from "@/lib/pending-uploads";
import { cn } from "@/lib/utils";
import type { NotebookAttachment } from "@/types/api";
import { waitForExtraction } from "../lib/read-file-text";

/** Batas lampiran per pesan (sama dengan backend). */
export const MAX_CHAT_FILES = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const isImage = (mime: string) => mime.startsWith("image/");

const UNREADABLE: Record<string, string> = {
  unsupported_type: "jenis berkas ini tidak bisa dibaca",
  too_large: "berkas lebih dari 20 MB",
  empty: "tidak ada teks yang terbaca",
  needs_gemini_key: "gambar/scan butuh OCR Gemini",
};

export interface PendingAttachment {
  key: string;
  name: string;
  mimeType: string;
  /** URL lokal untuk pratinjau gambar sebelum/ selama diunggah */
  previewUrl: string | null;
  uploadId?: string;
  /** uploading → (dokumen) reading = menunggu teks dibaca server → ready */
  status: "uploading" | "reading" | "ready";
}

let keySeq = 0;

/**
 * Lampiran (gambar & berkas) yang dikirim bersama pertanyaan. Diunggah segera setelah dipilih/ditempel (dicatat
 * sebagai upload yang belum tersimpan); dokumen ditunggu sampai teksnya dibaca server (PDF/DOCX/XLSX/teks) agar AI bisa
 * membacanya. Lampiran yang dihapus dari baki atau ditinggal saat chat ditutup ikut dihapus dari storage.
 */
export function useChatAttachments() {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  // Dibaca oleh callback unggahan & cleanup (setelah render), bukan saat render
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const discard = (item: PendingAttachment) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    if (item.uploadId) {
      untrackPendingUpload(item.uploadId);
      void uploadsApi.remove(item.uploadId).catch(() => undefined);
    }
  };

  // Chat ditutup sebelum dikirim → buang lampiran yang sudah terunggah
  useEffect(
    () => () => {
      for (const item of itemsRef.current) discard(item);
    },
    [],
  );

  const stillThere = (key: string) => itemsRef.current.some((i) => i.key === key);
  const patch = (key: string, values: Partial<PendingAttachment>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...values } : i)));
  const drop = (key: string) => {
    const item = itemsRef.current.find((i) => i.key === key);
    if (item) discard(item);
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  const addFiles = (files: File[]) => {
    if (!files.length) return;
    const room = MAX_CHAT_FILES - items.length;
    if (room <= 0) {
      toast.error(`Maksimal ${MAX_CHAT_FILES} lampiran per pesan.`);
      return;
    }
    if (files.length > room) toast.info(`Hanya ${room} berkas pertama yang dilampirkan (maks. ${MAX_CHAT_FILES}).`);

    for (const file of files.slice(0, room)) {
      const image = isImage(file.type);
      if (file.size > (image ? MAX_IMAGE_BYTES : MAX_FILE_BYTES)) {
        toast.error(`${file.name || "Berkas"} lebih dari ${image ? 10 : 20} MB.`);
        continue;
      }
      const key = `att-${++keySeq}`;
      // Gambar tempelan (clipboard) sering tanpa nama / bernama umum
      const name =
        file.name && file.name !== "image.png" ? file.name : `tempelan-${keySeq}.${file.type.split("/")[1] || "png"}`;
      const mimeType = file.type || "application/octet-stream";
      setItems((prev) => [
        ...prev,
        { key, name, mimeType, previewUrl: image ? URL.createObjectURL(file) : null, status: "uploading" },
      ]);

      void (async () => {
        let uploadId: string | undefined;
        try {
          const asset = await uploadsApi.upload(new File([file], name, { type: mimeType }), "notebook_chat");
          uploadId = asset.id;
          if (!stillThere(key)) {
            // Sudah dihapus dari baki sebelum unggahan selesai
            void uploadsApi.remove(asset.id).catch(() => undefined);
            return;
          }
          trackPendingUpload(asset.id);
          patch(key, { uploadId: asset.id, status: image ? "ready" : "reading" });
          if (image) return;

          // Dokumen: tunggu teks dibaca server; PDF tanpa teks (scan) tetap bisa dibaca AI langsung
          const extraction = await waitForExtraction(asset.id, () => !stillThere(key));
          if (!stillThere(key)) return;
          const readable =
            (extraction?.status === "completed" && !!extraction.extractedText?.trim()) ||
            (mimeType === "application/pdf" && !!extraction);
          if (readable) {
            patch(key, { status: "ready" });
            return;
          }
          const reason = extraction?.metadata?.reason;
          toast.error(`${name} tidak bisa dilampirkan`, {
            description: extraction
              ? `Isi berkas tidak terbaca (${(reason && UNREADABLE[reason]) || "format tidak didukung"}). Gunakan gambar, PDF, DOCX, XLSX, atau teks.`
              : "Server belum selesai membaca berkas. Coba lampirkan lagi nanti.",
          });
          drop(key);
        } catch (error) {
          toast.error(`${name} gagal diunggah`, { description: errorMessage(error) });
          if (uploadId) untrackPendingUpload(uploadId);
          drop(key);
        }
      })();
    }
  };

  /** Pesan terkirim: lampiran kini milik pesan chat (tidak dihapus), baki dikosongkan. */
  const commit = () => {
    for (const item of items) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      untrackPendingUpload(item.uploadId);
    }
    itemsRef.current = [];
    setItems([]);
  };

  const attachments: NotebookAttachment[] = items
    .filter((i): i is PendingAttachment & { uploadId: string } => !!i.uploadId && i.status === "ready")
    .map((i) => ({ uploadId: i.uploadId, name: i.name, mimeType: i.mimeType }));

  return {
    items,
    attachments,
    /** Masih ada lampiran yang diunggah / dibaca → tombol kirim menunggu */
    busy: items.some((i) => i.status !== "ready"),
    addFiles,
    remove: drop,
    commit,
  };
}

/** Baki lampiran di atas kotak input chat. */
export function AttachmentTray({ items, onRemove }: { items: PendingAttachment[]; onRemove: (key: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
      {items.map((item) => (
        <div
          key={item.key}
          className={cn(
            "relative shrink-0 overflow-hidden rounded-lg border bg-muted",
            item.previewUrl ? "size-16" : "flex h-16 w-44 items-center gap-2 px-2.5",
          )}
          title={item.name}
        >
          {item.previewUrl ? (
            <img src={item.previewUrl} alt={item.name} className="size-full object-cover" />
          ) : (
            <>
              <FileText className="size-5 shrink-0 text-module" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{item.name}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {item.status === "uploading" ? "Mengunggah…" : item.status === "reading" ? "Dibaca server…" : "Siap"}
                </span>
              </span>
            </>
          )}
          {item.status !== "ready" && item.previewUrl && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Spinner className="size-4" />
            </span>
          )}
          <button
            type="button"
            aria-label={`Hapus ${item.name}`}
            onClick={() => onRemove(item.key)}
            className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:text-destructive"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ImageThumb({ attachment }: { attachment: NotebookAttachment }) {
  const url = useAssetUrl(attachment.uploadId);
  return (
    <button
      type="button"
      title={attachment.name}
      onClick={() => previewFile(attachment)}
      className="size-20 shrink-0 overflow-hidden rounded-lg border border-module-foreground/30 bg-background/40"
    >
      {url ? (
        <img src={url} alt={attachment.name} className="size-full object-cover" />
      ) : (
        <Skeleton className="size-full" />
      )}
    </button>
  );
}

/** Lampiran pada pesan pengguna (klik → modal pratinjau). */
export function MessageAttachments({
  attachments,
  className,
}: {
  attachments?: NotebookAttachment[] | null;
  className?: string;
}) {
  if (!attachments?.length) return null;
  return (
    <div className={cn("flex flex-wrap justify-end gap-1.5", className)}>
      {attachments.map((a) =>
        previewKind(a.mimeType, a.name) === "image" ? (
          <ImageThumb key={a.uploadId} attachment={a} />
        ) : (
          <button
            key={a.uploadId}
            type="button"
            title={a.name}
            onClick={() => previewFile(a)}
            className="flex h-10 max-w-56 items-center gap-2 rounded-lg border bg-card px-2.5 text-left text-xs transition-colors hover:border-module"
          >
            <FileText className="size-4 shrink-0 text-module" />
            <span className="truncate font-semibold">{a.name}</span>
          </button>
        ),
      )}
    </div>
  );
}
