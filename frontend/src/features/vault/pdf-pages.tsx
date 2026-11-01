import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

GlobalWorkerOptions.workerSrc = workerUrl;

/** Batas halaman yang digambar (dokumen sangat panjang tetap bisa diunduh utuh). */
const MAX_PAGES = 60;

/**
 * Penampil PDF berbasis pdf.js (dimuat malas): setiap halaman digambar ke kanvas selebar wadah. Dipakai halaman publik
 * brankas karena penampil PDF bawaan browser tidak tersedia di iframe pada HP (Chrome Android) dan respons berkas
 * ber-CSP sandbox tidak bisa dibuka penampil bawaan di tab. pdf.js 6 tidak memakai eval (sesuai CSP `script-src 'self'`).
 */
export default function PdfPages({ data, name }: { data: ArrayBuffer; name: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ pages: number; error: string | null; done: boolean }>({
    pages: 0,
    error: null,
    done: false,
  });

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    let cancelled = false;
    // Salinan: pdf.js memindahkan buffer ke worker (buffer asli dipakai lagi oleh tombol unduh)
    const task = getDocument({ data: data.slice(0) });
    (async () => {
      try {
        const doc = await task.promise;
        const total = Math.min(doc.numPages, MAX_PAGES);
        if (!cancelled) setState({ pages: doc.numPages, error: null, done: false });
        const width = Math.max(host.clientWidth - 16, 280);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= total && !cancelled; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
          canvas.className = "mx-auto block max-w-full rounded-sm bg-white shadow-sm";
          canvas.setAttribute("aria-label", `${name} — halaman ${n}`);
          host.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
        }
        if (!cancelled) setState((s) => ({ ...s, done: true }));
      } catch (error) {
        if (!cancelled) {
          setState((s) => ({ ...s, error: error instanceof Error ? error.message : String(error), done: true }));
        }
      }
    })();
    return () => {
      cancelled = true;
      void task.destroy();
      host.replaceChildren();
    };
  }, [data, name]);

  return (
    <div className="flex size-full flex-col overflow-y-auto">
      <div ref={container} className="flex flex-col gap-2 p-2" />
      {!state.done && (
        <div className="flex justify-center p-4">
          <Spinner className="size-6" />
        </div>
      )}
      {state.error && (
        <p className="p-4 text-center text-sm text-destructive">PDF tidak dapat ditampilkan: {state.error}</p>
      )}
      {state.done && state.pages > MAX_PAGES && (
        <p className="p-3 text-center text-xs text-muted-foreground">
          Ditampilkan {MAX_PAGES} dari {state.pages} halaman — unduh berkas untuk melihat seluruhnya.
        </p>
      )}
    </div>
  );
}
