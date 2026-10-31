import { ArrowLeft, Camera, CheckCircle2, Globe, KeyRound, Loader2, RotateCw, ShieldAlert } from "lucide-react";
import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRobotMutations } from "@/data/use-robot";
import { errorMessage } from "@/lib/api/client";
import { robotApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import type { RobotConnector, RobotInput, RobotPageInfo } from "@/types/api";
import { keyToInput, ROBOT_VIEWPORT, toViewportPoint } from "./robot-utils";

/** Jeda antar-pembaruan tayangan (ms). */
const FRAME_INTERVAL = 900;

/**
 * Browser jarak jauh: tayangan browser robot tempat Anda login sendiri ke SRIKANDI / e-Kinerja (nama pengguna, kata
 * sandi, CAPTCHA, kode OTP). Klik & ketikan diteruskan ke robot; LifeOS hanya menyimpan sesi (cookie) terenkripsi
 * setelah Anda menekan "Selesai & simpan sesi".
 */
export function RemoteBrowserDialog({
  connector,
  sessionId,
  onClose,
}: {
  connector: RobotConnector | null;
  /** Lanjutkan sesi login yang sudah dibuka (mis. dari Login otomatis) alih-alih membuka baru */
  sessionId?: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!connector} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[96svh] grid-cols-1 overflow-y-auto sm:max-w-[min(96vw,1360px)]">
        {connector && (
          <RemoteBrowser
            key={`${connector.system}-${sessionId ?? "baru"}`}
            connector={connector}
            existing={sessionId ?? null}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RemoteBrowser({
  connector,
  existing,
  onClose,
}: {
  connector: RobotConnector;
  existing: string | null;
  onClose: () => void;
}) {
  const m = useRobotMutations();
  const [sessionId, setSessionId] = useState<string | null>(existing);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [page, setPage] = useState<RobotPageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const finished = useRef(false);
  const pendingCancel = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const imgRef = useRef<HTMLImageElement>(null);
  const refreshNow = useRef<() => void>(() => undefined);

  // Buka sesi login saat dialog muncul; tutup sesi di robot bila dialog ditutup tanpa "Selesai"
  useEffect(() => {
    let cancelled = false;
    let opened: string | null = existing;
    if (existing) {
      // Sesi diserahkan dari Login otomatis. Pembatalan ditunda sedikit: StrictMode (dev) menjalankan cleanup lalu efek
      // lagi segera — penundaan itu dibatalkan oleh pemasangan ulang sehingga sesi tidak tertutup.
      clearTimeout(pendingCancel.current);
      return () => {
        pendingCancel.current = setTimeout(() => {
          if (!finished.current) void robotApi.cancel(existing).catch(() => undefined);
        }, 300);
      };
    }
    robotApi
      .startLogin(connector.system)
      .then((s) => {
        opened = s.sessionId;
        if (cancelled) return void robotApi.cancel(s.sessionId).catch(() => undefined);
        setSessionId(s.sessionId);
        setPage(s);
      })
      .catch((e: unknown) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
      if (opened && !finished.current) void robotApi.cancel(opened).catch(() => undefined);
    };
  }, [connector.system, existing]);

  // Tayangan: ambil gambar berkala (satu permintaan pada satu waktu)
  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: string | null = null;
    const tick = async () => {
      if (stopped) return;
      clearTimeout(timer);
      try {
        const frame = await robotApi.frame(sessionId);
        if (stopped) return;
        const next = URL.createObjectURL(frame.blob);
        if (current) URL.revokeObjectURL(current);
        current = next;
        setFrameUrl(next);
        setPage({ url: frame.url, title: frame.title, loggedIn: frame.loggedIn });
        setError(null);
      } catch (e) {
        if (!stopped) setError(errorMessage(e));
      }
      if (!stopped) timer = setTimeout(() => void tick(), FRAME_INTERVAL);
    };
    refreshNow.current = () => void tick();
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (current) URL.revokeObjectURL(current);
    };
  }, [sessionId]);

  // Masukan dikirim berurutan (ketikan cepat tidak boleh tertukar/hilang)
  const queue = useRef<Promise<void>>(Promise.resolve());
  const send = (input: RobotInput) => {
    if (!sessionId) return Promise.resolve();
    queue.current = queue.current.then(async () => {
      try {
        setPage(await robotApi.input(sessionId, input));
        refreshNow.current();
      } catch (e) {
        toast.error(errorMessage(e));
      }
    });
    return queue.current;
  };

  const onClick = (e: MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current;
    if (!img) return;
    const point = toViewportPoint(e.nativeEvent.offsetX, e.nativeEvent.offsetY, img.clientWidth, img.clientHeight);
    if (point) void send({ type: "click", ...point });
    img.parentElement?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const input = keyToInput(e);
    if (!input) return;
    e.preventDefault();
    void send(input);
  };

  const finish = () => {
    if (!sessionId) return;
    setBusy(true);
    finished.current = true;
    m.finish.mutate(sessionId, {
      onSuccess: (c) => {
        if (c.status === "active") toast.success(`Sesi ${connector.label} tersimpan.`);
        else toast.warning("Masih di halaman login — sesi belum aktif. Coba login lagi.");
        onClose();
      },
      onError: (e) => {
        finished.current = false;
        setBusy(false);
        toast.error(errorMessage(e));
      },
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <KeyRound className="size-5 text-module" /> Login {connector.label} lewat browser jarak jauh
        </DialogTitle>
        <DialogDescription>
          Klik pada tayangan lalu ketik seperti biasa (nama pengguna, kata sandi, CAPTCHA, kode OTP). Ketikan diteruskan
          langsung ke {connector.label} lewat robot — LifeOS tidak menyimpan kata sandi atau kode OTP; yang disimpan
          hanya sesi login (terenkripsi) setelah Anda menekan <strong>Selesai &amp; simpan sesi</strong>.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="outline" aria-label="Kembali" onClick={() => void send({ type: "back" })}>
          <ArrowLeft />
        </Button>
        <Button size="icon-sm" variant="outline" aria-label="Muat ulang" onClick={() => void send({ type: "reload" })}>
          <RotateCw />
        </Button>
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (address.trim()) void send({ type: "goto", url: address.trim() });
          }}
        >
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={page?.url ?? connector.baseUrl}
            aria-label="Alamat"
            className="h-8 min-w-0 flex-1 text-xs"
          />
          <Button size="sm" variant="outline" type="submit" disabled={!address.trim()}>
            <Globe /> Buka
          </Button>
        </form>
        {page && (
          <Badge className={cn(page.loggedIn ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
            {page.loggedIn ? "Sudah masuk" : "Halaman login"}
          </Badge>
        )}
      </div>

      <div
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (text) {
            e.preventDefault();
            void send({ type: "type", text: text.slice(0, 500) });
          }
        }}
        onWheel={(e) => {
          const img = imgRef.current;
          if (!img) return;
          const point = toViewportPoint(
            e.nativeEvent.offsetX,
            e.nativeEvent.offsetY,
            img.clientWidth,
            img.clientHeight,
          );
          if (point) void send({ type: "scroll", ...point, dy: Math.max(-1200, Math.min(1200, e.deltaY)) });
        }}
        className="relative overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-module"
        style={{ aspectRatio: `${ROBOT_VIEWPORT.width} / ${ROBOT_VIEWPORT.height}` }}
      >
        {frameUrl ? (
          <img
            ref={imgRef}
            src={frameUrl}
            alt={page?.title || "Tayangan browser robot"}
            onClick={onClick}
            draggable={false}
            className="block size-full cursor-pointer select-none"
          />
        ) : (
          <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
            {error ? (
              <>
                <ShieldAlert className="size-4 text-destructive" /> {error}
              </>
            ) : (
              <>
                <Loader2 className="size-4 animate-spin" /> Membuka {connector.baseUrl}…
              </>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {page?.title ? `${page.title} · ` : ""}
        {page?.url ?? ""}
        {error && frameUrl ? ` · ${error}` : ""}
      </p>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Batal
        </Button>
        <Button
          variant="outline"
          disabled={!sessionId || busy || m.captureSession.isPending}
          title="Simpan tangkapan layar + struktur halaman yang sedang tampil (untuk memetakan alur robot)"
          onClick={() =>
            sessionId &&
            m.captureSession.mutate(sessionId, {
              onSuccess: () => toast.success("Halaman direkam — lihat di Riwayat robot."),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          {m.captureSession.isPending ? <Loader2 className="animate-spin" /> : <Camera />} Rekam halaman ini
        </Button>
        <Button onClick={finish} disabled={!sessionId || busy}>
          {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Selesai &amp; simpan sesi
        </Button>
      </DialogFooter>
    </>
  );
}
