import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { useState } from "react";
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
import { useOpenSession } from "@/hooks/use-retained";
import { errorMessage } from "@/lib/api/client";
import type { RobotConnector } from "@/types/api";

/**
 * Simpan / ganti kredensial sistem ke brankas LifeOS (AES-256-GCM, kunci khusus server). Wajib kata sandi akun LifeOS
 * sebagai konfirmasi. Nilai yang tersimpan tidak pernah bisa dilihat lagi dari aplikasi — hanya diganti atau dihapus.
 */
export function CredentialsDialog({ connector, onClose }: { connector: RobotConnector | null; onClose: () => void }) {
  const session = useOpenSession(!!connector);
  return (
    <Dialog open={!!connector} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="grid-cols-1 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockKeyhole className="size-5 text-module" /> Kredensial {connector?.label}
          </DialogTitle>
          <DialogDescription>
            Disimpan terenkripsi di server LifeOS dan hanya dipakai robot untuk mengisi formulir login. Tidak bisa
            dilihat lagi setelah disimpan. CAPTCHA & kode OTP tidak disimpan — selalu Anda ketik saat diminta.
          </DialogDescription>
        </DialogHeader>
        {connector && <CredentialsForm key={session} connector={connector} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function CredentialsForm({ connector, onDone }: { connector: RobotConnector; onDone: () => void }) {
  const m = useRobotMutations();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [show, setShow] = useState(false);
  const save = () =>
    m.setCredentials.mutate(
      { system: connector.system, username: username.trim(), password, accountPassword },
      {
        onSuccess: () => {
          toast.success("Kredensial disimpan di brankas.");
          onDone();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  return (
    <form
      className="grid grid-cols-1 gap-3"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-1">
        <Label htmlFor="cred-username">Nama pengguna {connector.label}</Label>
        <Input
          id="cred-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={connector.system === "ekinerja" ? "mis. NIP" : "Nama pengguna"}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="cred-password">Kata sandi {connector.label}</Label>
        <div className="flex gap-2">
          <Input
            id="cred-password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label={show ? "Sembunyikan" : "Tampilkan"}
            onClick={() => setShow((v) => !v)}
          >
            {show ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      </div>
      <div className="grid gap-1 rounded-lg bg-muted/40 p-2">
        <Label htmlFor="cred-account">Kata sandi akun LifeOS Anda (konfirmasi)</Label>
        <Input
          id="cred-account"
          type="password"
          value={accountPassword}
          onChange={(e) => setAccountPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button
          type="submit"
          disabled={!username.trim() || !password || !accountPassword || m.setCredentials.isPending}
        >
          {m.setCredentials.isPending && <Loader2 className="animate-spin" />} Simpan ke brankas
        </Button>
      </DialogFooter>
    </form>
  );
}
