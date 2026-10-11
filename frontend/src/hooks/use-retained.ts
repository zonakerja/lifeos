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

/**
 * Nomor sesi buka dialog: bertambah setiap `open` berubah dari false → true. Dipakai sebagai `key` konten form agar
 * setiap kali dialog dibuka form mulai dari props (tidak memakai ulang state sesi sebelumnya yang belum sempat
 * di-unmount karena animasi tutup — mis. lampiran yang sudah dibuang saat Batal).
 */
export function useOpenSession(open: boolean) {
  const [state, setState] = useState({ open, session: 0 });
  // Derived state saat render (pola resmi React): render diulang langsung dengan state baru
  if (state.open !== open) setState({ open, session: open ? state.session + 1 : state.session });
  return state.session;
}
