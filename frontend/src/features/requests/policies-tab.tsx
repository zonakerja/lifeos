import { OctagonPause, Pencil, Plus, ShieldCheck, ShieldAlert, Trash2, Workflow } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSrikandiOutgoings } from "@/data/collections";
import { useAgentPolicies, useAgentPolicyMutations, useAgentSkills, useAgentStatus } from "@/data/use-agent";
import { useOpenSession } from "@/hooks/use-retained";
import { errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { AgentPolicy, AgentPolicyInput, AgentPolicyMode, AssetField } from "@/types/api";
import {
  ASSET_FIELD_LABELS,
  defaultPolicyInput,
  KIND_LABELS,
  KIND_OPTIONS,
  parseGroupCodes,
  policyAgreement,
  policyToInput,
  POLICY_MODE_LABELS,
} from "./request-utils";

const MODE_TONE: Record<AgentPolicyMode, string> = {
  off: "bg-muted text-muted-foreground",
  shadow: "bg-info/15 text-info",
  auto: "bg-success/15 text-success",
};

/**
 * Approval → Kebijakan Otomatis (docs/AI-AGENT.md §24): aturan pemilik yang dijalankan **server** atas pengajuan baru —
 * agen (Hermes) mengerjakan skill dan menyerahkan data aset, server memverifikasi ke data master & memutuskan. Mode
 * shadow hanya mencatat; mode otomatis menyetujui lalu menyimpan konsep di SRIKANDI setelah masa tunda. Kirim Konsep &
 * tanda tangan tetap di tangan pemilik.
 */
export function PoliciesTab() {
  const { data: status } = useAgentStatus();
  const isOwner = !!status?.configured && !!status.owner;
  const { data, isLoading } = useAgentPolicies(isOwner);
  const m = useAgentPolicyMutations();
  const [editing, setEditing] = useState<AgentPolicy | "new" | null>(null);
  const [removing, setRemoving] = useState<AgentPolicy | null>(null);

  if (status && !isOwner) {
    return (
      <Card className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
        <Workflow className="size-8 text-module" />
        {status.configured
          ? "Kebijakan Otomatis hanya untuk pemilik agen (HERMES_OWNER_EMAIL)."
          : "Agen Hermes belum diatur di server ini. Lihat Asisten Agen → Status & Skill."}
      </Card>
    );
  }

  const paused = !!data?.paused;
  const anyAuto = data?.policies.some((p) => p.mode === "auto") ?? false;

  return (
    <div className="flex flex-col gap-3">
      <Card className="grid grid-cols-1 gap-3 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-module-soft text-module">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">Keputusan diambil server menurut aturan Anda — bukan oleh model AI</p>
            <p className="mt-1 text-muted-foreground">
              Pengajuan baru yang cocok dengan aturan dikerjakan agen (skill), lalu server mencocokkan daftar aset ke
              data master dan menghitung skor sendiri. Mulai dengan mode <b>Shadow</b> (hanya dicatat & dibandingkan
              dengan keputusan Anda), naikkan ke <b>Otomatis</b> bila sudah sesuai. Mode Otomatis menyimpan konsep di
              SRIKANDI setelah masa tunda — <b>Kirim Konsep & tanda tangan tetap Anda yang menekan</b>.
            </p>
          </div>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> Aturan baru
          </Button>
        </div>
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-lg border p-2.5 text-sm",
            paused ? "border-destructive/40 bg-destructive/10" : "bg-muted/30",
          )}
        >
          <OctagonPause className={cn("size-4", paused ? "text-destructive" : "text-muted-foreground")} />
          <span className="min-w-0 flex-1">
            <b>Sakelar darurat</b> —{" "}
            {paused
              ? "semua otomasi dihentikan: tidak ada tugas, keputusan, atau kiriman SRIKANDI baru."
              : "nyalakan untuk menghentikan seketika semua tugas, keputusan, dan kiriman otomatis."}
          </span>
          <Switch
            checked={paused}
            disabled={!data || m.pause.isPending}
            onCheckedChange={(v) =>
              m.pause.mutate(v, {
                onSuccess: () => toast.success(v ? "Semua otomasi dihentikan." : "Otomasi berjalan lagi."),
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
            aria-label="Sakelar darurat Kebijakan Otomatis"
          />
        </div>
        {anyAuto && (
          <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            Mode Otomatis aktif. Agen Hermes masih bisa memakai semua alat bawaannya (terminal, browser, eksekusi kode).
            Untuk kerja otomatis tanpa pengawasan, batasi alat Hermes ke MCP LifeOS saja.
          </p>
        )}
      </Card>

      {isLoading || !data ? (
        <Skeleton className="h-28 rounded-xl" />
      ) : data.policies.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <Workflow className="size-8 text-module" />
          Belum ada aturan. Contoh: “PSP dari grup SATKER-A → skill penetapan-psp, skor aset ≥ 75%”.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {data.policies.map((p) => (
            <PolicyCard key={p.id} policy={p} onEdit={() => setEditing(p)} onRemove={() => setRemoving(p)} />
          ))}
        </div>
      )}

      <PolicyDialog policy={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Hapus aturan?"
        itemName={removing?.name}
        description="Pengajuan yang sudah diputuskan aturan ini tidak berubah. Kiriman SRIKANDI yang masih menunggu tetap berjalan — batalkan dari detail pengajuan bila perlu."
        confirmLabel="Hapus"
        onConfirm={() =>
          removing &&
          m.remove.mutate(removing.id, {
            onSuccess: () => toast.success("Aturan dihapus."),
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </div>
  );
}

function PolicyCard({
  policy: p,
  onEdit,
  onRemove,
}: {
  policy: AgentPolicy;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const agreement = policyAgreement(p.stats);
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate font-semibold">{p.name}</span>
          <Badge className={MODE_TONE[p.mode]}>{POLICY_MODE_LABELS[p.mode]}</Badge>
          <Badge variant="outline">{KIND_LABELS[p.requestKind] ?? p.requestKind}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Skill <code>{p.skill}</code> · grup {p.groupCodes.length ? p.groupCodes.join(", ") : "semua"} · skor ≥{" "}
          {p.threshold}% · cocok wajib: {p.criticalFields.map((f) => ASSET_FIELD_LABELS[f]).join(", ")} · maks.{" "}
          {p.dailyLimit}/hari · tunda {p.holdMinutes} menit
          {!p.registerTemplate && " · tanpa templat Register (tidak dikirim ke SRIKANDI)"}
        </p>
        <p className="mt-1 text-xs">
          {p.stats.decisions} keputusan · {p.stats.applied} diterapkan
          {agreement
            ? ` · cocok dengan keputusan Anda ${agreement.agree}/${agreement.judged} (${agreement.percent}%)`
            : p.mode === "shadow"
              ? " · belum ada pembanding (putuskan pengajuannya seperti biasa)"
              : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil /> Ubah
        </Button>
        <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={onRemove} aria-label="Hapus">
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

function PolicyDialog({ policy, onClose }: { policy: AgentPolicy | "new" | null; onClose: () => void }) {
  const open = !!policy;
  const session = useOpenSession(open);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94svh] grid-cols-1 overflow-y-auto sm:max-w-2xl">
        {policy && <PolicyForm key={session} policy={policy === "new" ? null : policy} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function PolicyForm({ policy, onClose }: { policy: AgentPolicy | null; onClose: () => void }) {
  const [form, setForm] = useState<AgentPolicyInput>(() => (policy ? policyToInput(policy) : defaultPolicyInput()));
  const [groups, setGroups] = useState(() => form.groupCodes.join(", "));
  const { data: skills } = useAgentSkills(true);
  const { items: outgoings } = useSrikandiOutgoings();
  const m = useAgentPolicyMutations();
  const lifeos = (skills ?? []).filter((s) => s.lifeos);
  const set = <K extends keyof AgentPolicyInput>(key: K, value: AgentPolicyInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const toggleField = (field: AssetField, on: boolean) =>
    setForm((f) => ({
      ...f,
      criticalFields: on ? [...new Set([...f.criticalFields, field])] : f.criticalFields.filter((x) => x !== field),
    }));
  const num = (value: string, fallback: number) =>
    value === "" || Number.isNaN(Number(value)) ? fallback : Number(value);
  const valid = form.name.trim() && form.skill && form.criticalFields.length > 0;

  const save = () =>
    m.save.mutate(
      { id: policy?.id, input: { ...form, name: form.name.trim(), groupCodes: parseGroupCodes(groups) } },
      {
        onSuccess: () => {
          toast.success("Aturan disimpan.");
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{policy ? "Ubah aturan" : "Aturan baru"}</DialogTitle>
        <DialogDescription>
          Pengajuan baru yang cocok (jenis + grup) dikerjakan agen dengan skill ini, lalu diputuskan server.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="policy-name">Nama aturan</Label>
          <Input
            id="policy-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="PSP satker dengan aset tercatat"
            maxLength={120}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Jenis pengajuan</Label>
          <Select
            value={form.requestKind}
            onValueChange={(v) => set("requestKind", v as AgentPolicyInput["requestKind"])}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="policy-groups">Kode grup (kosong = semua)</Label>
          <Input
            id="policy-groups"
            value={groups}
            onChange={(e) => setGroups(e.target.value)}
            placeholder="SATKER-A, SATKER-B"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Skill agen</Label>
          {lifeos.length ? (
            <Select value={form.skill || undefined} onValueChange={(v) => set("skill", v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih skill" />
              </SelectTrigger>
              <SelectContent>
                {lifeos.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={form.skill}
              onChange={(e) => set("skill", e.target.value.toLowerCase())}
              placeholder="penetapan-psp"
            />
          )}
        </div>
        <div className="grid gap-1.5">
          <Label>Mode</Label>
          <Select value={form.mode} onValueChange={(v) => set("mode", v as AgentPolicyMode)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(POLICY_MODE_LABELS) as AgentPolicyMode[]).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {POLICY_MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="policy-threshold">Skor aset minimal (%)</Label>
          <Input
            id="policy-threshold"
            type="number"
            min={50}
            max={100}
            value={form.threshold}
            onChange={(e) => set("threshold", num(e.target.value, 75))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="policy-tolerance">Toleransi selisih nilai (%)</Label>
          <Input
            id="policy-tolerance"
            type="number"
            min={0}
            max={20}
            step={0.5}
            value={form.valueTolerance}
            onChange={(e) => set("valueTolerance", num(e.target.value, 0))}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Isian yang wajib sama dengan data master</Label>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(ASSET_FIELD_LABELS) as AssetField[]).map((field) => (
              <label key={field} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={form.criticalFields.includes(field)}
                  onCheckedChange={(v) => toggleField(field, v === true)}
                />
                {ASSET_FIELD_LABELS[field]}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="policy-limit">Batas keputusan otomatis per hari</Label>
          <Input
            id="policy-limit"
            type="number"
            min={1}
            max={100}
            value={form.dailyLimit}
            onChange={(e) => set("dailyLimit", num(e.target.value, 5))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="policy-hold">Masa tunda sebelum ke SRIKANDI (menit)</Label>
          <Input
            id="policy-hold"
            type="number"
            min={5}
            max={1440}
            value={form.holdMinutes}
            onChange={(e) => set("holdMinutes", num(e.target.value, 15))}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Templat Register Naskah Keluar</Label>
          <Select
            value={form.registerTemplate ?? "none"}
            onValueChange={(v) => set("registerTemplate", v === "none" ? null : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Tanpa templat — tidak dikirim ke SRIKANDI</SelectItem>
              {outgoings.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.subject || "(tanpa hal)"}
                  {o.docType ? ` · ${o.docType}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Isian SRIKANDI (jenis naskah, sifat, klasifikasi, penandatangan, tujuan, …) disalin dari entri ini; hal,
            berkas, dan nomor diisi dari pengajuan. Buat entrinya dulu di SRIKANDI → Register Naskah Keluar.
          </p>
        </div>
      </div>
      {form.mode === "auto" && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
          Mode Otomatis langsung menyetujui pengajuan yang lolos aturan. Pastikan mode Shadow sudah cukup lama sesuai
          dengan keputusan Anda, dan alat bawaan Hermes sudah dibatasi.
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Batal
        </Button>
        <Button onClick={save} disabled={!valid || m.save.isPending}>
          Simpan
        </Button>
      </DialogFooter>
    </>
  );
}
