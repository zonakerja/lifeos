import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { officeApi } from "@/lib/api/endpoints";

/** Dokumen sudah berisi = sudah pernah disimpan dari editor (versi > 1). Gagal mengecek → anggap berisi (lebih aman). */
async function hasSavedContent(uploadId: string) {
  try {
    const { versions } = await officeApi.versions(uploadId);
    return versions.length > 1 || (versions[0]?.version ?? 1) > 1;
  } catch {
    return true;
  }
}

interface PendingConfirm {
  /** Hapus atas permintaan user (tombol "Hapus dokumen"), bukan karena batal */
  explicit: boolean;
  resolve: (ok: boolean) => void;
}

/**
 * Konfirmasi sebelum membuang dokumen ONLYOFFICE yang dibuat di form tambah lampiran/resource tetapi belum disimpan:
 * - batal / ganti tipe / tutup form → konfirmasi hanya bila dokumen sudah berisi (dokumen kosong dibuang tanpa tanya);
 * - tombol "Hapus dokumen" (`explicit`) → selalu konfirmasi.
 * `confirm()` mengembalikan `true` bila boleh dibuang. Render `dialog` di dalam form.
 */
export function useOfficeDiscardConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolvedRef = useRef(false);

  const confirm = async (uploadId: string, options: { explicit?: boolean } = {}) => {
    const explicit = !!options.explicit;
    if (!explicit && !(await hasSavedContent(uploadId))) return true;
    return new Promise<boolean>((resolve) => {
      resolvedRef.current = false;
      setPending({ explicit, resolve });
    });
  };

  const finish = (ok: boolean) => {
    if (!pending || resolvedRef.current) return;
    resolvedRef.current = true;
    pending.resolve(ok);
    setPending(null);
  };

  const dialog = (
    <ConfirmDialog
      open={!!pending}
      onOpenChange={(open) => !open && finish(false)}
      title={pending?.explicit ? "Hapus dokumen ini?" : "Buang dokumen yang sudah berisi?"}
      description={
        pending?.explicit
          ? "Dokumen yang dibuat di ONLYOFFICE akan dihapus permanen, termasuk isinya. Anda bisa memilih jenis dokumen lain setelahnya."
          : "Dokumen ONLYOFFICE ini sudah Anda isi tetapi belum ditambahkan. Bila dibuang, dokumen beserta isinya dihapus permanen."
      }
      confirmLabel={pending?.explicit ? "Hapus dokumen" : "Buang dokumen"}
      cancelLabel="Kembali"
      onConfirm={() => finish(true)}
    />
  );

  return { confirm, dialog };
}
