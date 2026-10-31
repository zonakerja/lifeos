import { KeyRound, Loader2, MonitorPlay, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { type FormEvent, useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import { useRobotMutations } from "@/data/use-robot";
import { errorMessage } from "@/lib/api/client";
import { robotApi } from "@/lib/api/endpoints";
import type { RobotConnector, RobotLoginStep } from "@/types/api";

/**
 * Login otomatis (human-in-the-loop): robot mengisi nama pengguna & kata sandi dari brankas, lalu meminta Anda mengetik
 * CAPTCHA (gambar ditampilkan) dan/atau kode OTP Authenticator. Formulir yang tidak dikenali → lanjut di tayangan
 * browser jarak jauh dengan sesi yang sama.
 */
export function AutoLoginDialog({
  connector,
  onClose,
  onOpenRemote,
}: {
  connector: RobotConnector | null;
  onClose: () => void;
  /** Lanjutkan sesi login ini di browser jarak jauh */
  onOpenRemote: (sessionId: string) => void;
}) {
  return (
    <Dialog open={!!connector} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="grid-cols-1 sm:max-w-md">
        {connector && (
          <AutoLogin key={connector.system} connector={connector} onClose={onClose} onOpenRemote={onOpenRemote} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AutoLogin({
  connector,
  onClose,
  onOpenRemote,
}: {
  connector: RobotConnector;
  onClose: () => void;
  onOpenRemote: (sessionId: string) => void;
}) {
  const m = useRobotMutations();
  const [step, setStep] = useState<RobotLoginStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(true);
  const handedOver = useRef(false);
  const current = useRef<RobotLoginStep | null>(null);

  const apply = (next: RobotLoginStep) => {
    current.current = next;
    setStep(next);
    setValue("");
    if (next.stage === "done") {
      if (next.connector) m.applyConnector(next.connector);
      toast.success(`Login ${connector.label} berhasil, sesi disimpan.`);
      handedOver.current = true;
      onClose();
    }
  };

  const start = () => {
    setBusy(true);
    setError(null);
    const previous = current.current;
    if (previous && previous.stage !== "done") void robotApi.cancel(previous.sessionId).catch(() => undefined);
    current.current = null;
    robotApi
      .autoLogin(connector.system)
      .then(apply)
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  };

  // Mulai saat dialog dibuka; sesi yang belum selesai ditutup saat dialog ditutup (kecuali diserahkan ke tayangan)
  // Sekali per dialog (StrictMode dev menjalankan efek dua kali → tanpa penanda terbuka dua sesi robot)
  const started = useRef(false);
  const onOpen = useEffectEvent(() => {
    if (started.current) return;
    started.current = true;
    robotApi
      .autoLogin(connector.system)
      .then(apply)
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  });
  useEffect(() => {
    onOpen();
    return () => {
      const s = current.current;
      if (s && s.stage !== "done" && !handedOver.current) void robotApi.cancel(s.sessionId).catch(() => undefined);
    };
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!step || (step.stage !== "captcha" && step.stage !== "otp") || !value.trim()) return;
    setBusy(true);
    robotApi
      .answer(step.sessionId, step.stage, value.trim())
      .then(apply)
      .catch((err: unknown) => toast.error(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  const openRemote = () => {
    if (!step) return;
    handedOver.current = true;
    onOpenRemote(step.sessionId);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <KeyRound className="size-5 text-module" /> Login otomatis {connector.label}
        </DialogTitle>
        <DialogDescription>
          Robot mengisi nama pengguna & kata sandi dari brankas. CAPTCHA dan kode OTP tetap Anda ketik sendiri.
        </DialogDescription>
      </DialogHeader>

      {busy && !step ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Membuka halaman login & mengisi kredensial…
        </p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : step ? (
        <form onSubmit={submit} className="grid grid-cols-1 gap-3">
          {step.message && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
              Pesan dari {connector.label}: {step.message}
            </p>
          )}
          {step.stage === "captcha" && (
            <>
              {step.captchaImage ? (
                <img
                  src={`data:image/png;base64,${step.captchaImage}`}
                  alt="Gambar CAPTCHA"
                  className="max-h-28 w-full rounded-md border bg-white object-contain"
                />
              ) : (
                <p className="text-sm text-muted-foreground">Gambar CAPTCHA tidak terbaca — buka tayangan.</p>
              )}
              <div className="grid gap-1">
                <Label htmlFor="captcha-answer">Ketik teks pada gambar</Label>
                <Input
                  id="captcha-answer"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  maxLength={12}
                  className="font-mono text-lg tracking-widest"
                />
              </div>
            </>
          )}
          {step.stage === "otp" && (
            <div className="grid gap-1">
              <Label htmlFor="otp-answer" className="flex items-center gap-1.5">
                <Smartphone className="size-4" /> Kode dari aplikasi Authenticator
              </Label>
              <Input
                id="otp-answer"
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={8}
                className="font-mono text-2xl tracking-[0.4em]"
              />
              <p className="text-xs text-muted-foreground">
                Buka Google/Microsoft Authenticator di HP Anda, pilih akun {connector.label}, ketik kode 6 digit.
              </p>
            </div>
          )}
          {step.stage === "credentials" && (
            <p className="text-sm text-muted-foreground">
              Halaman login masih tampil — nama pengguna atau kata sandi mungkin ditolak. Periksa kredensial, atau
              lanjutkan di tayangan.
            </p>
          )}
          {step.stage === "unknown" && (
            <p className="text-sm text-muted-foreground">
              Formulir login tidak dikenali otomatis. Lanjutkan di tayangan browser jarak jauh.
            </p>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={openRemote}>
                <MonitorPlay /> Buka tayangan
              </Button>
              {step.stage === "captcha" && (
                <Button type="button" size="sm" variant="ghost" onClick={start} disabled={busy}>
                  <RefreshCw /> Ulangi
                </Button>
              )}
            </div>
            {(step.stage === "captcha" || step.stage === "otp") && (
              <Button type="submit" disabled={busy || !value.trim()}>
                {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Kirim
              </Button>
            )}
          </DialogFooter>
        </form>
      ) : null}
    </>
  );
}
