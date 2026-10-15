import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/client";
import { officeApi } from "@/lib/api/endpoints";
import type { OfficeConfigResult } from "@/types/api";

/**
 * Editor ONLYOFFICE untuk satu berkas LifeOS. Config ditandatangani backend (`POST /office/config`) dan dipakai apa
 * adanya — hanya `events` yang ditambahkan (bukan bagian token). Komponen ini dimuat malas (chunk sendiri).
 * Perubahan disimpan ONLYOFFICE ke LifeOS lewat callback: tombol Simpan (Ctrl+S) langsung, sisanya saat editor ditutup.
 */

interface DocEditorInstance {
  destroyEditor: () => void;
}
declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (placeholderId: string, config: Record<string, unknown>) => DocEditorInstance };
  }
}

/** `api.js` dimuat sekali per server ONLYOFFICE. */
const scriptLoads = new Map<string, Promise<void>>();
function loadDocsApi(serverUrl: string) {
  const src = `${serverUrl.replace(/\/+$/, "")}/web-apps/apps/api/documents/api.js`;
  let load = scriptLoads.get(src);
  if (!load) {
    load = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptLoads.delete(src);
        script.remove();
        reject(new Error("Server ONLYOFFICE tidak dapat dihubungi. Pastikan container ONLYOFFICE menyala."));
      };
      document.head.appendChild(script);
    });
    scriptLoads.set(src, load);
  }
  return load;
}

const isDarkTheme = () => document.documentElement.classList.contains("dark");
const isSmallScreen = () => window.matchMedia("(max-width: 767px)").matches;

export interface OfficeEditorProps {
  uploadId: string;
  /** `view` = pratinjau baca saja walau user boleh mengedit */
  mode?: "edit" | "view";
  /** Config berhasil dibuat (hak akses efektif, versi, judul) */
  onLoaded?: (result: OfficeConfigResult) => void;
  /** Ada perubahan yang belum disimpan ke LifeOS (indikator "Menyimpan…") */
  onDirtyChange?: (dirty: boolean) => void;
  /** Dokumen selesai dimuat */
  onReady?: () => void;
}

export default function OfficeEditor({ uploadId, mode, onLoaded, onDirtyChange, onReady }: OfficeEditorProps) {
  const placeholderId = `office-editor-${useId().replace(/:/g, "")}`;
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  // Callback terbaru tanpa membuat ulang editor (editor dibuat sekali per berkas/mode)
  const callbacks = useRef({ onLoaded, onDirtyChange, onReady });
  useEffect(() => {
    callbacks.current = { onLoaded, onDirtyChange, onReady };
  });

  useEffect(() => {
    let cancelled = false;
    let editor: DocEditorInstance | null = null;
    (async () => {
      try {
        const result = await officeApi.config({
          uploadId,
          mode,
          mobile: isSmallScreen(),
          theme: isDarkTheme() ? "dark" : "light",
        });
        await loadDocsApi(result.documentServerUrl);
        if (cancelled || !hostRef.current) return;
        if (!window.DocsAPI) throw new Error("Editor ONLYOFFICE gagal dimuat.");
        // Placeholder dibuat di luar React: ONLYOFFICE menggantinya dengan iframe
        const placeholder = document.createElement("div");
        placeholder.id = placeholderId;
        hostRef.current.replaceChildren(placeholder);
        callbacks.current.onLoaded?.(result);
        editor = new window.DocsAPI.DocEditor(placeholderId, {
          ...result.config,
          events: {
            onDocumentReady: () => {
              setReady(true);
              callbacks.current.onReady?.();
            },
            onDocumentStateChange: (event: { data: boolean }) => callbacks.current.onDirtyChange?.(event.data),
            onError: (event: { data?: { errorDescription?: string } }) =>
              setError(event.data?.errorDescription || "Terjadi kesalahan di editor ONLYOFFICE."),
          },
        });
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
      // Menutup editor = ONLYOFFICE menyimpan perubahan ke LifeOS (callback) beberapa detik kemudian
      try {
        editor?.destroyEditor();
      } catch {
        // Editor belum selesai dibuat
      }
    };
  }, [uploadId, mode, placeholderId]);

  return (
    <div className="relative size-full">
      {/* Isi dikelola ONLYOFFICE (iframe), bukan React */}
      <div ref={hostRef} className="size-full" />
      {(error || !ready) && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/40">
          {error ? (
            <div className="flex max-w-sm flex-col items-center gap-2 p-6 text-center text-sm">
              <AlertTriangle className="size-8 text-destructive" />
              <p className="font-semibold">Dokumen tidak dapat dibuka</p>
              <p className="text-muted-foreground">{error}</p>
            </div>
          ) : (
            <Spinner className="size-6" />
          )}
        </div>
      )}
    </div>
  );
}
