import type { Html5Qrcode as Html5QrcodeType } from "html5-qrcode";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Pemindai QR kamera (html5-qrcode). Memilih kamera belakang bila ada, dengan
 * fallback `facingMode: environment`. Hasil scan dikunci 1,5 detik agar tidak dobel.
 */
export function CameraScanner({ onScan, className }: { onScan: (text: string) => void; className?: string }) {
  const elementId = `qr-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const lockRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const handleScan = useEffectEvent((text: string) => {
    if (lockRef.current) return;
    lockRef.current = true;
    onScan(text);
    setTimeout(() => {
      lockRef.current = false;
    }, 1500);
  });

  useEffect(() => {
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    const success = (text: string) => handleScan(text);
    let scanner: Html5QrcodeType | null = null;
    let cancelled = false;

    // html5-qrcode (±1 MB) hanya dimuat saat kamera benar-benar dipakai
    const timer = setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const instance = new Html5Qrcode(elementId);
        scanner = instance;
        const startWith = (camera: string | MediaTrackConstraints) =>
          instance.start(camera, config, success, () => undefined);
        const devices = await Html5Qrcode.getCameras().catch(() => []);
        if (cancelled) return;
        const back = devices.find((d) => /back|environment/i.test(d.label));
        const cameraId = back?.id ?? devices[0]?.id;
        await (cameraId ? startWith(cameraId) : Promise.reject(new Error("no-id"))).catch(() =>
          startWith({ facingMode: "environment" }),
        );
      } catch {
        if (!cancelled) setError("Kamera tidak dapat diakses. Pastikan izin kamera diberikan di browser.");
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      const instance = scanner;
      if (!instance) return;
      try {
        if (instance.isScanning)
          void instance
            .stop()
            .then(() => instance.clear())
            .catch(() => undefined);
        else instance.clear();
      } catch {
        // pembersihan scanner bersifat best-effort
      }
    };
  }, [elementId]);

  return (
    <div className={className}>
      <div
        id={elementId}
        className="flex min-h-72 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-module bg-black text-xs text-white/60"
      >
        Memuat Kamera...
      </div>
      {error && <p className="mt-3 text-center text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** Dialog Smart Scan QR (satu kali scan lalu tutup). */
export function CameraScanDialog({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (text: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Smart Scan QR</DialogTitle>
          <DialogDescription>Sorot QR Code arsip atau wadah ke dalam bingkai.</DialogDescription>
        </DialogHeader>
        {open && (
          <CameraScanner
            onScan={(text) => {
              onClose();
              onScan(text);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
