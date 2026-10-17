import { fileControlStatus, isInFileControl } from "./file-control-intake";
import { mergeAttachmentTags } from "./resource-tags";
import { toast } from "sonner";
import { previewFile } from "@/components/common/file-preview";
import { uploadsApi } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
import { links } from "@/lib/deep-links";
import { generateId } from "@/lib/ids";
import type { AttachedResource, Resource } from "@/types/entities";

export const emptyAttachment = (date = ""): AttachedResource => ({
  id: "",
  type: "link",
  number: "",
  name: "",
  description: "",
  date,
  url: "",
  existingId: "",
  noteId: "",
  addToGlobal: false,
});

/** ID Asset dari lampiran: field `uploadId` atau URL `.../uploads/<id>`. */
const getUploadId = (res: { uploadId?: string; url?: string }) =>
  res.uploadId ?? res.url?.match(/\/uploads\/([a-z0-9]+)(?:$|[/?#])/i)?.[1];

/**
 * Buka lampiran. File backend tampil di modal pratinjau bersama (PDF & gambar langsung; jenis lain bisa diunduh /
 * dibuka di tab baru dari modal), web link dibuka di tab baru.
 */
export async function openAttachment(res: {
  uploadId?: string;
  url?: string;
  name?: string;
  title?: string;
  fileName?: string;
  mimeType?: string;
}) {
  const uploadId = getUploadId(res);
  if (uploadId) {
    // Nama & jenis berkas dilengkapi modal dari metadata backend bila tidak dibawa lampiran
    previewFile({ uploadId, name: res.fileName || res.name || res.title, mimeType: res.mimeType });
    return;
  }
  // Buka tab dulu (sinkron dengan klik) agar tidak diblokir popup blocker
  const tab = window.open("about:blank", "_blank");
  try {
    if (res.url) {
      if (tab) tab.location.href = res.url;
      else window.open(res.url, "_blank");
      return;
    }
    tab?.close();
    toast.info("Tidak ada link/file yang bisa dibuka.");
  } catch (error) {
    tab?.close();
    toast.error("Gagal membuka file", { description: errorMessage(error) });
  }
}

/** Unduh isi file backend sebagai Blob (untuk dianalisis AI). */
export async function fetchAttachmentBlob(res: { uploadId?: string; url?: string }) {
  const uploadId = getUploadId(res);
  if (!uploadId) return null;
  const url = await uploadsApi.createLink(uploadId);
  const response = await fetch(url);
  return response.ok ? response.blob() : null;
}

/**
 * Sinkronkan lampiran yang ditandai `addToGlobal` ke daftar Resource global:
 * tambah resource baru atau tambahkan tag konteks.
 */
export function mergeIntoGlobalResources(
  prev: Resource[],
  attachments: AttachedResource[],
  contextTag: string,
): Resource[] {
  const next = [...prev];
  for (const att of attachments) {
    if (!att.addToGlobal) continue;
    const index = next.findIndex(
      (r) =>
        (att.existingId && r.id === att.existingId) ||
        (att.type === "link" && r.url && r.url === att.url) ||
        // Catatan yang sama (Notes AI / Catatan Bebas / List) tidak dibuat ganda
        (att.type === "note" && att.noteId && r.noteId === att.noteId) ||
        (att.type === "file" && r.title === att.name),
    );

    if (index >= 0) {
      const existing = next[index];
      const tags = Array.isArray(existing.tags) ? existing.tags : existing.sourceTag ? [existing.sourceTag] : [];
      if (!tags.includes(contextTag)) {
        next[index] = { ...existing, tags: [...tags, contextTag], aiSummary: att.aiSummary || existing.aiSummary };
      } else if (att.aiSummary && !existing.aiSummary) {
        next[index] = { ...existing, aiSummary: att.aiSummary };
      }
      // Tag bebas dari form lampiran ditambahkan tanpa duplikat (tag yang sengaja dihapus di form Resource dilewati)
      if (att.tags?.length) {
        const current = Array.isArray(next[index].tags) ? next[index].tags! : [];
        const merged = mergeAttachmentTags(current, att.tags, next[index].removedTags);
        if (merged !== current) next[index] = { ...next[index], tags: merged };
      }
      // Dicentang "Masukkan ke File Control": resource yang sudah ada ikut masuk Gantung (bila belum menjadi arsip)
      if (att.toFileControl && next[index].type === "file" && !isInFileControl(next[index])) {
        next[index] = { ...next[index], archivalStatus: fileControlStatus(next[index].archivalStatus, true) };
      }
    } else if (!att.existingId) {
      next.push({
        id: generateId("res"),
        number: att.number,
        title: att.name || att.title || "Untitled",
        content: att.description,
        type: att.type,
        url: att.url,
        uploadId: att.uploadId,
        mimeType: att.mimeType,
        // Resource catatan dibuka di Notes Space lewat noteId
        ...(att.type === "note" && att.noteId ? { noteId: att.noteId } : {}),
        date: att.date || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        tags: [contextTag, ...(att.tags ?? [])],
        aiSummary: att.aiSummary,
        ...(att.toFileControl && att.type === "file" ? { archivalStatus: "pending" as const } : {}),
      });
    }
  }
  return next;
}

/**
 * Path aplikasi untuk lampiran bertipe catatan (`noteId` = "free-<id>" | "ai-<id>" | "list-<id>"), atau null.
 * Catatan dibuka di dalam aplikasi, bukan tab baru.
 */
export const noteAttachmentPath = (noteId?: string) => {
  if (!noteId) return null;
  const [kind, ...rest] = noteId.split("-");
  const id = rest.join("-");
  if (!id) return null;
  if (kind === "free") return links.note("free", id);
  if (kind === "ai") return links.note("ai", id);
  if (kind === "list") return links.notes("lists");
  return null;
};

export const attachmentLabel = (res: AttachedResource) => String(res.name || res.title || "Untitled");
