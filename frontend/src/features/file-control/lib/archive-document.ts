import { openAttachment } from "@/features/resources/resource-utils";
import { toExternalHref } from "@/lib/urls";
import type { ArchiveResource } from "@/types/entities";

/**
 * Dokumen sebuah arsip, dipakai seragam oleh semua tab File Control: berkas upload (dipratinjau di modal), lalu URL
 * resource, lalu tautan dokumen digital (SRIKANDI, Google Drive, …) yang diisi saat pemberkasan.
 */
const documentUrl = (r: Pick<ArchiveResource, "url" | "digitalLink">) =>
  r.url || toExternalHref(r.digitalLink) || undefined;

/** Arsip punya dokumen yang bisa dilihat? */
export const hasArchiveDocument = (r: Pick<ArchiveResource, "uploadId" | "url" | "digitalLink">) =>
  !!(r.uploadId || documentUrl(r));

/** Buka dokumen arsip (modal pratinjau untuk berkas, tab baru untuk tautan). */
export const openArchiveDocument = (r: ArchiveResource) => openAttachment({ ...r, url: documentUrl(r) });
