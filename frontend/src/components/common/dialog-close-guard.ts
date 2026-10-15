import { createContext, useContext, useEffect, useRef } from "react";

/**
 * Penjaga tutup dialog: komponen di dalam `<Dialog>` (`components/ui/dialog.tsx`) bisa menahan dialog induknya ditutup
 * lewat X / Esc / klik luar — mis. form lampiran yang berisi dokumen ONLYOFFICE yang sudah diisi meminta konfirmasi dulu.
 * Penjaga mengembalikan `false` untuk membatalkan penutupan. Penutupan lewat kode (mis. tombol Batal milik form induk)
 * tidak melewati penjaga.
 */
export type DialogCloseGuard = () => boolean | Promise<boolean>;

export const DialogCloseGuardContext = createContext<Set<{ current: DialogCloseGuard }> | null>(null);

/** Jalankan semua penjaga berurutan; `true` = boleh ditutup. */
export async function runDialogCloseGuards(guards: Set<{ current: DialogCloseGuard }>) {
  for (const guard of guards) if (!(await guard.current())) return false;
  return true;
}

/** Daftarkan penjaga ke dialog terdekat (versi terbaru fungsi selalu dipakai). */
export function useDialogCloseGuard(guard: DialogCloseGuard) {
  const guards = useContext(DialogCloseGuardContext);
  const ref = useRef(guard);
  useEffect(() => {
    ref.current = guard;
  });
  useEffect(() => {
    if (!guards) return;
    const entry = ref;
    guards.add(entry);
    return () => {
      guards.delete(entry);
    };
  }, [guards]);
}

/**
 * Untuk tombol Batal/Tutup milik isi dialog yang menutup lewat kode: `guardedClose(onCancel)` menjalankan penjaga dialog
 * terdekat dulu (sama seperti X / Esc).
 */
export function useGuardedClose() {
  const guards = useContext(DialogCloseGuardContext);
  return async (close: () => void) => {
    if (guards && guards.size > 0 && !(await runDialogCloseGuards(guards))) return;
    close();
  };
}
