import { useEffect } from "react";
import { ApiError, apiUrl } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";
import {
  HEARTBEAT_MS,
  PAGE_ID,
  abandonOwner,
  readPending,
  removePending,
  setPendingUploadsUser,
  sweepable,
  touchOwner,
  updatePending,
} from "@/lib/pending-uploads";
import { useAuthStore } from "@/stores/auth-store";

/** Hapus berkas catatan yang ditinggalkan; catatan dilepas bila berhasil / berkas sudah tidak ada / bukan hak kita. */
async function sweep() {
  for (const entry of sweepable(readPending(), PAGE_ID, Date.now())) {
    try {
      await uploadsApi.remove(entry.id);
    } catch (error) {
      const gone = error instanceof ApiError && [403, 404].includes(error.status);
      if (!gone) continue; // jaringan / server bermasalah → coba lagi pada sapuan berikutnya
    }
    updatePending((entries) => removePending(entries, entry.id));
  }
}

/**
 * Bersihkan berkas yang diunggah tetapi tidak pernah tersimpan (lihat `lib/pending-uploads.ts`). Dipasang sekali di
 * `AppShell` (hanya saat login).
 */
export function usePendingUploadsJanitor() {
  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    setPendingUploadsUser(userId);
    if (!userId) return;
    void sweep();
    const timer = window.setInterval(() => {
      updatePending((entries) => touchOwner(entries, PAGE_ID, Date.now()));
      void sweep();
    }, HEARTBEAT_MS);

    // Tab ditutup / di-reload: cleanup React tidak berjalan → tandai ditinggalkan dan hapus berkasnya sekarang
    // (keepalive agar request tetap terkirim saat halaman dibongkar). Bila gagal, sapuan berikutnya menuntaskannya.
    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return; // masuk back/forward cache → halaman bisa dipulihkan utuh
      const mine = readPending().filter((e) => e.owner === PAGE_ID);
      if (!mine.length) return;
      updatePending((entries) => abandonOwner(entries, PAGE_ID));
      const token = useAuthStore.getState().accessToken;
      for (const entry of mine) {
        void fetch(apiUrl(`/uploads/${entry.id}`), {
          method: "DELETE",
          keepalive: true,
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }).catch(() => undefined);
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [userId]);
}
