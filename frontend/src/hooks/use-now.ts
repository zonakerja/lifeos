import { useEffect, useState } from "react";

/** Waktu sekarang yang diperbarui setiap `intervalMs` (default 1 menit) — untuk status yang bergantung jam. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
