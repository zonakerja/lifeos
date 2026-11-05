import { Ban, ExternalLink, ShieldCheck, Workflow } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgentPolicyMutations } from "@/data/use-agent";
import { useNow } from "@/hooks/use-now";
import { errorMessage } from "@/lib/api/client";
import { links } from "@/lib/deep-links";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { RequestAssetCheck, RequestDetail } from "@/types/api";
import { ASSET_FIELD_LABELS, AUTO_STATE_LABELS, AUTO_STATE_TONE, autoDecisionState } from "./request-utils";

const ITEM_TONE: Record<RequestAssetCheck["items"][number]["status"], string> = {
  cocok: "bg-success/15 text-success",
  berbeda: "bg-warning/15 text-warning",
  tidak_ditemukan: "bg-destructive/15 text-destructive",
};
const ITEM_LABEL: Record<RequestAssetCheck["items"][number]["status"], string> = {
  cocok: "Cocok",
  berbeda: "Berbeda",
  tidak_ditemukan: "Tidak ditemukan",
};

const money = (value: unknown) =>
  typeof value === "number" ? `Rp${value.toLocaleString("id-ID")}` : value == null ? "—" : String(value);

/**
 * Detail Approval: hasil verifikasi aset (dihitung server dari data master) + keputusan Kebijakan Otomatis, termasuk
 * tombol membatalkan kiriman konsep SRIKANDI selama masa tunda.
 */
export function AutoDecisionPanel({ request: r }: { request: RequestDetail }) {
  const d = r.autoDecision;
  const check = r.assetCheck;
  const m = useAgentPolicyMutations();
  const navigate = useNavigate();
  const now = useNow();
  if (!d && !check) return null;
  const state = d ? autoDecisionState(d) : null;
  const canCancel = !!d && state === "waiting" && !!d.sendAt && new Date(d.sendAt).getTime() > now.getTime();

  return (
    <section className="grid grid-cols-1 gap-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Workflow className="size-4 text-module" />
        <h3 className="text-sm font-bold">Kebijakan Otomatis</h3>
        {d && state && <Badge className={AUTO_STATE_TONE[state]}>{AUTO_STATE_LABELS[state]}</Badge>}
      </div>

      {d && (
        <div className="grid grid-cols-1 gap-1 text-sm">
          <p>
            Aturan <b>{d.policyName}</b> ({d.mode === "shadow" ? "shadow" : "otomatis"}) ·{" "}
            {d.outcome === "approve" ? "lolos aturan" : "perlu telaah Anda"}
            {d.score != null && ` · skor aset ${d.score}%`} · {formatDateTime(d.decidedAt)}
          </p>
          {d.reasons.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {d.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {d.sendAt && !d.sentAt && !d.cancelledAt && (
            <p className="text-xs">Konsep akan disimpan ke SRIKANDI pada {formatDateTime(d.sendAt)}.</p>
          )}
          {d.sentAt && (
            <p className="text-xs text-success">
              Konsep tersimpan di SRIKANDI {formatDateTime(d.sentAt)} — periksa lalu Kirim Konsep sendiri di SRIKANDI.
            </p>
          )}
          {d.cancelledAt && <p className="text-xs">Kiriman dibatalkan {formatDateTime(d.cancelledAt)}.</p>}
          {d.error && <p className="text-xs text-destructive">{d.error}</p>}
          <div className="flex flex-wrap gap-2">
            {canCancel && (
              <Button
                size="sm"
                variant="outline"
                disabled={m.cancelAuto.isPending}
                onClick={() =>
                  m.cancelAuto.mutate(r.id, {
                    onSuccess: () => toast.success("Kiriman dibatalkan — pengajuan kembali menunggu verifikasi Anda."),
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                <Ban /> Batalkan kiriman
              </Button>
            )}
            {d.registerId && (
              <Button size="sm" variant="ghost" onClick={() => navigate(links.srikandiRegister(d.registerId!))}>
                <ExternalLink /> Buka di Register
              </Button>
            )}
          </div>
        </div>
      )}

      {check && (
        <div className="grid grid-cols-1 gap-1.5">
          <p className="flex flex-wrap items-center gap-1.5 text-sm">
            <ShieldCheck className="size-4 text-module" />
            Verifikasi aset: {check.matched}/{check.total} cocok ({check.score}%, ambang {check.threshold}%) ·{" "}
            <span className="text-xs text-muted-foreground">
              {check.available ? `sumber ${check.source}` : "data master belum tersedia"} ·{" "}
              {formatDateTime(check.checkedAt)}
            </span>
          </p>
          {check.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2 font-medium">NUP</th>
                    <th className="py-1 pr-2 font-medium">Kode barang</th>
                    <th className="py-1 pr-2 font-medium">Nama (pengajuan)</th>
                    <th className="py-1 pr-2 font-medium">Nilai</th>
                    <th className="py-1 font-medium">Hasil</th>
                  </tr>
                </thead>
                <tbody>
                  {check.items.map((item, i) => (
                    <tr key={i} className="border-t align-top">
                      <td className="py-1 pr-2">{item.claimed.nup ?? "—"}</td>
                      <td className="py-1 pr-2">{item.claimed.kodeBarang ?? "—"}</td>
                      <td className="py-1 pr-2">{item.claimed.nama ?? "—"}</td>
                      <td className="py-1 pr-2">{money(item.claimed.nilai)}</td>
                      <td className="py-1">
                        <Badge className={cn("h-5", ITEM_TONE[item.status])}>{ITEM_LABEL[item.status]}</Badge>
                        {item.diffs.map((diff) => (
                          <span key={diff.field} className="block text-muted-foreground">
                            {ASSET_FIELD_LABELS[diff.field]}: master{" "}
                            {diff.field === "nilai" ? money(diff.master) : (diff.master ?? "—")}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
