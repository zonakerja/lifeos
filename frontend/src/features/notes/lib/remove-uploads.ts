import { uploadsApi } from "@/lib/api/endpoints";

/** Hapus berkas dari object storage tanpa mengganggu user bila gagal (mis. sudah terhapus). */
export const removeUploads = (ids: string[]) => {
  ids.forEach((id) => void uploadsApi.remove(id).catch(() => undefined));
};

/**
 * Hapus berkas dan kembalikan ID yang ditolak karena bukan hak user (403) — mis. kolaborator berizin Edit menghapus
 * gambar/dokumen yang diunggah pemilik. ID itu dicatat di catatan (`orphanUploadIds`) lalu dibersihkan saat pemilik
 * membuka Notes (`useOrphanUploadsJanitor`).
 */
export async function removeUploadsCollectForbidden(ids: string[]): Promise<string[]> {
  const results = await Promise.all(
    [...new Set(ids)].map((id) =>
      uploadsApi.remove(id).then(
        () => null,
        (error: unknown) => ((error as { status?: number })?.status === 403 ? id : null),
      ),
    ),
  );
  return results.filter((id): id is string => !!id);
}

/** Gabungkan daftar berkas yatim tanpa duplikat. */
export const mergeOrphanIds = (current: string[] | undefined, added: string[]) => [
  ...new Set([...(current ?? []), ...added]),
];
