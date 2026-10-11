import { uploadsApi } from "@/lib/api/endpoints";

/** Hapus berkas dari object storage tanpa mengganggu user bila gagal (mis. sudah terhapus). */
export const removeUploads = (ids: string[]) => {
  ids.forEach((id) => void uploadsApi.remove(id).catch(() => undefined));
};
