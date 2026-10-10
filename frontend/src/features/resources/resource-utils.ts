import { toast } from "sonner";
import { uploadsApi } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
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

/** Buka lampiran di tab baru. File backend dibuka lewat link sementara bertanda tangan. */
export async function openAttachment(res: { uploadId?: string; url?: string }) {
  const uploadId = getUploadId(res);
  // Buka tab dulu (sinkron dengan klik) agar tidak diblokir popup blocker
  const tab = window.open("about:blank", "_blank");
  try {
    if (uploadId) {
      const url = await uploadsApi.createLink(uploadId);
      if (tab) tab.location.href = url;
      else window.open(url, "_blank");
      return;
    }
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
        date: att.date || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        tags: [contextTag],
        aiSummary: att.aiSummary,
      });
    }
  }
  return next;
}

export const attachmentLabel = (res: AttachedResource) => String(res.name || res.title || "Untitled");
