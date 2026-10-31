import { Copy, Link2, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePublicLinkMutations, usePublicLinks } from "@/data/use-robot";
import { useOpenSession } from "@/hooks/use-retained";
import { errorMessage } from "@/lib/api/client";
import { formatDateTime } from "@/lib/dates";

const DURATIONS = [
  { value: "30", label: "30 hari" },
  { value: "90", label: "90 hari" },
  { value: "365", label: "1 tahun" },
  { value: "none", label: "Tanpa batas" },
];

/**
 * Tautan publik baca-saja ke satu berkas — mis. "link dokumen" bukti kinerja di e-Kinerja yang dibuka atasan tanpa akun
 * LifeOS. Alamat lengkap hanya tampil sekali saat dibuat; tautan bisa dicabut kapan saja. Hanya pemilik berkas.
 */
export function PublicLinkButton({ uploadId, name }: { uploadId: string; name?: string }) {
  const [open, setOpen] = useState(false);
  const session = useOpenSession(open);
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)} aria-label="Tautan publik">
        <Link2 /> <span className="hidden sm:inline">Tautan publik</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="grid-cols-1 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tautan publik</DialogTitle>
            <DialogDescription>
              Siapa pun yang memegang tautan bisa membuka {name ? <strong>{name}</strong> : "berkas ini"} tanpa login
              (baca saja). Cocok untuk link dokumen bukti di e-Kinerja. Cabut bila tidak diperlukan lagi.
            </DialogDescription>
          </DialogHeader>
          {open && <PublicLinkPanel key={session} uploadId={uploadId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PublicLinkPanel({ uploadId }: { uploadId: string }) {
  const { data, error, isLoading } = usePublicLinks(uploadId);
  const m = usePublicLinkMutations(uploadId);
  const [duration, setDuration] = useState("90");
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<string | null>(null);

  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast.success("Tautan disalin."));

  if (error) return <p className="text-sm text-destructive">{errorMessage(error)}</p>;
  return (
    <div className="grid grid-cols-1 gap-3">
      {created && (
        <div className="grid gap-1 rounded-lg border border-success/40 bg-success/10 p-2">
          <p className="text-xs font-semibold text-success">Tautan dibuat — salin sekarang (tidak ditampilkan lagi)</p>
          <div className="flex gap-2">
            <Input readOnly value={created} className="h-8 min-w-0 flex-1 text-xs" onFocus={(e) => e.target.select()} />
            <Button size="sm" onClick={() => copy(created)}>
              <Copy /> Salin
            </Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div className="grid gap-1">
          <Label>Berlaku</Label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="public-link-label">Keterangan</Label>
          <Input
            id="public-link-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="mis. e-Kinerja Okt 2026"
          />
        </div>
      </div>
      <Button
        disabled={m.create.isPending}
        onClick={() =>
          m.create.mutate(
            { days: duration === "none" ? null : Number(duration), label: label.trim() || undefined },
            {
              onSuccess: (link) => {
                setCreated(`${window.location.origin}${link.path}`);
                setLabel("");
              },
              onError: (e) => toast.error(errorMessage(e)),
            },
          )
        }
      >
        {m.create.isPending ? <Loader2 className="animate-spin" /> : <Link2 />} Buat tautan publik
      </Button>
      <div className="grid gap-1">
        <p className="text-xs font-semibold text-muted-foreground">Tautan aktif</p>
        {isLoading ? null : !data?.length ? (
          <p className="text-xs text-muted-foreground">Belum ada.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1">
            {data.map((l) => (
              <li key={l.id} className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  <code>{l.prefix}…</code> {l.label && `· ${l.label}`}
                  <span className="block text-muted-foreground">
                    {l.expiresAt ? `s.d. ${formatDateTime(l.expiresAt)}` : "Tanpa batas"} · dibuka {l.accessCount}×
                  </span>
                </span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Cabut tautan"
                  onClick={() =>
                    m.revoke.mutate(l.id, {
                      onSuccess: () => toast.success("Tautan dicabut."),
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
