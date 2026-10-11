import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ownedFiles } from "@/features/resources/attachment-cleanup";
import { DeleteWithFilesDialog } from "@/features/resources/delete-with-files-dialog";
import { useAttachmentCleanup } from "@/features/resources/use-attachment-cleanup";
import type { AttachedResource } from "@/types/entities";

/**
 * Pola lampiran di form Productivity yang disimpan eksplisit (Project, Action/Task) — aturan seragam dengan Planner
 * (CLAUDE.md §8b "Hapus item / lampiran berkas", contoh asal: `planner/components/schedule-form.tsx`):
 * - Berkas yang diunggah di sesi form dibuang bila form ditutup tanpa disimpan (Batal / X / Esc, unmount = cadangan).
 * - Melepas lampiran berkas → konfirmasi `DeleteWithFilesDialog` (hapus / pertahankan sebagai Resource Global);
 *   keputusan dicatat dan dieksekusi **setelah** form disimpan (`commit`). Batal = tidak ada yang terhapus.
 */

type Register = (discard: () => void) => () => void;

/** Lingkup dialog: semua form lampiran di dalamnya dibuang (`discardAll`) saat dialog ditutup. */
const DiscardScopeContext = createContext<Register | null>(null);

export function DiscardScope({ register, children }: { register: Register; children: ReactNode }) {
  return <DiscardScopeContext.Provider value={register}>{children}</DiscardScopeContext.Provider>;
}

/** Dipakai dialog induk: `<DiscardScope register={register}>…</DiscardScope>` lalu `discardAll()` saat ditutup. */
export function useDiscardScope() {
  const discards = useRef(new Set<() => void>());
  const register = useCallback<Register>((discard) => {
    discards.current.add(discard);
    return () => discards.current.delete(discard);
  }, []);
  const discardAll = useCallback(() => {
    for (const discard of [...discards.current]) discard();
  }, []);
  return { register, discardAll };
}

/**
 * Daftarkan `discard` ke lingkup dialog terdekat (dipanggil saat dialog ditutup) dan jalankan juga saat unmount
 * (cadangan, mis. navigasi yang menutup dialog). `discard` harus aman dipanggil berulang.
 */
export function useDiscardOnClose(discard: () => void) {
  const register = useContext(DiscardScopeContext);
  // Selalu memanggil versi terbaru
  const discardRef = useRef(discard);
  useEffect(() => {
    discardRef.current = discard;
  });
  useEffect(() => {
    const run = () => discardRef.current();
    const unregister = register?.(run);
    return () => {
      unregister?.();
      run();
    };
  }, [register]);
}

interface Released {
  files: AttachedResource[];
  keepIds: string[];
}

export function useAttachmentEdits({ contextTag, ownerId }: { contextTag: string; ownerId?: string }) {
  const cleanup = useAttachmentCleanup();
  const sessionUploads = useRef(new Set<string>());
  const savedRef = useRef(false);
  const [released, setReleased] = useState<Released[]>([]);
  const [removing, setRemoving] = useState<{ att: AttachedResource; drop: () => void } | null>(null);

  const discard = useCallback(() => {
    if (savedRef.current || sessionUploads.current.size === 0) return;
    cleanup.discardUploads([...sessionUploads.current]);
    sessionUploads.current.clear();
  }, [cleanup]);
  useDiscardOnClose(discard);

  /** Catat lampiran baru (berkas yang diunggah di sesi ini dibuang bila form tidak disimpan). */
  const trackAdded = (att: AttachedResource) => {
    if (att.uploadId && !att.existingId && att.type !== "existing") sessionUploads.current.add(att.uploadId);
  };

  /** Lepas lampiran: `drop` = hapus lampiran dari state form. */
  const requestRemove = (att: AttachedResource, drop: () => void) => {
    if (att.uploadId && sessionUploads.current.has(att.uploadId)) {
      // Baru diunggah di form ini (belum pernah tersimpan) → langsung dibuang
      sessionUploads.current.delete(att.uploadId);
      cleanup.discardUploads([att.uploadId]);
      drop();
    } else if (ownedFiles([att]).length) {
      setRemoving({ att, drop }); // tanya: hapus berkas atau pertahankan sebagai Resource Global
    } else {
      drop();
    }
  };

  /** Panggil tepat setelah form disimpan: eksekusi keputusan lepas lampiran. */
  const commit = () => {
    savedRef.current = true;
    for (const r of released) cleanup.release(r.files, r.keepIds, { contextTag, exclude: r.files, ownerId });
    setReleased([]);
  };

  const dialog = (
    <DeleteWithFilesDialog
      open={!!removing}
      onOpenChange={(open) => !open && setRemoving(null)}
      title="Lepas Lampiran?"
      description="Lampiran dilepas saat perubahan disimpan. Berkas:"
      itemName={removing ? removing.att.name || removing.att.title : undefined}
      files={removing ? ownedFiles([removing.att]) : []}
      shared={removing ? cleanup.referenced([removing.att]) : undefined}
      confirmLabel="Lepas"
      onConfirm={(keepIds) => {
        if (!removing) return;
        setReleased((prev) => [...prev, { files: [removing.att], keepIds }]);
        removing.drop();
        setRemoving(null);
      }}
    />
  );

  return { trackAdded, requestRemove, commit, discard, dialog };
}
