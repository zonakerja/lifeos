import { useState } from "react";

/**
 * Pertahankan nilai non-null terakhir. Dipakai dialog yang isinya bergantung pada
 * prop nullable (`item | null`) agar konten tetap tampil selama animasi menutup.
 * PENTING: `value` harus stabil (identitas sama antar render), mis. item dari koleksi/state.
 */
export function useRetained<T>(value: T | null): T | null {
  const [kept, setKept] = useState(value);
  if (value !== null && value !== kept) setKept(value);
  return value ?? kept;
}

/**
 * Selama `open` true kembalikan `value`; setelah ditutup kembalikan nilai terakhir saat masih
 * terbuka. Untuk dialog dengan prop `open` terpisah. `value` harus primitif/stabil.
 */
export function useLatchedWhileOpen<T>(open: boolean, value: T): T {
  const [kept, setKept] = useState(value);
  if (open && !Object.is(kept, value)) setKept(value);
  return open ? value : kept;
}
