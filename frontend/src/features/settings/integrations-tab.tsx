import { Activity, Bot, Check, Copy, KeyRound, Plus, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { useAgentActivity, useApiTokenMutations, useApiTokens, useIntegrationScopes } from "@/data/use-integrations";
import { useOpenSession } from "@/hooks/use-retained";
import { errorMessage } from "@/lib/api/client";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ApiScope, ApiTokenInfo, CreatedApiToken } from "@/types/api";
import { describeInput, EXPIRY_OPTIONS, isPast, mcpConfigSnippets, mcpUrl, TOOL_LABELS } from "./integrations-utils";

const SCOPE_SHORT: Record<ApiScope, string> = {
  "knowledge:read": "Baca pengetahuan",
  "knowledge:write": "Tulis Inbox",
  "workspace:read": "Baca data kerja",
  "workspace:write": "Buat to-do",
  "ai:chat": "Tanya asisten",
  "requests:read": "Baca pengajuan",
  "requests:write": "Catat & analisis pengajuan",
  "ai:model": "Model AI agen",
};

/**
 * Pengaturan → Integrasi: token akses pribadi untuk agen AI (Hermes, Claude Desktop, n8n, …) yang memakai MCP server
 * LifeOS, beserta log aktivitas agen. Token bertindak atas nama Anda dengan cakupan terbatas (docs/AI-AGENT.md tahap 3).
 */
export function IntegrationsTab() {
  return (
    <div className="flex flex-col gap-5">
      <TokensCard />
      <ActivityCard />
    </div>
  );
}

function TokensCard() {
  const { data: tokens, isLoading } = useApiTokens();
  const { revoke } = useApiTokenMutations();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiTokenInfo | null>(null);

  return (
    <SectionCard
      icon={KeyRound}
      title="Token akses agen AI (MCP)"
      description="Hubungkan agen AI ke LifeOS lewat Model Context Protocol. Agen hanya bisa melakukan yang diizinkan token."
      action={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> Buat token
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="flex items-start gap-2 rounded-xl bg-info/10 p-3 text-xs text-info">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>
            Alamat MCP: <code className="font-mono">{mcpUrl(window.location.origin)}</code>. Token disimpan sebagai hash
            dan hanya ditampilkan sekali. Agen bertindak atas nama Anda — data milik pengguna lain tetap tidak terlihat.
            Cabut token yang tidak dipakai.
          </span>
        </p>
        {isLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : !tokens?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Belum ada token.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {tokens.map((t) => {
              const expired = isPast(t.expiresAt);
              return (
                <li key={t.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <Bot className="size-4 text-module" /> {t.name}
                      {expired && <Badge className="bg-destructive/15 text-destructive">Kedaluwarsa</Badge>}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">{t.prefix}…</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {t.scopes.map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px]">
                          {SCOPE_SHORT[s]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground sm:text-right">
                    <p>Berlaku s.d.: {t.expiresAt ? formatDateTime(t.expiresAt) : "tanpa batas"}</p>
                    <p>Terakhir dipakai: {t.lastUsedAt ? formatDateTime(t.lastUsedAt) : "belum pernah"}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start text-destructive"
                    onClick={() => setRevoking(t)}
                  >
                    <Trash2 /> Cabut
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <CreateTokenDialog open={creating} onOpenChange={setCreating} />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Cabut token?"
        itemName={revoking?.name}
        description="Agen yang memakai token ini langsung tidak bisa mengakses LifeOS lagi. Log aktivitasnya tetap tersimpan."
        confirmLabel="Cabut token"
        destructive
        onConfirm={() =>
          revoking &&
          revoke.mutate(revoking.id, {
            onSuccess: () => toast.success("Token dicabut."),
            onError: (error) => toast.error("Gagal mencabut token", { description: errorMessage(error) }),
          })
        }
      />
    </SectionCard>
  );
}

function CreateTokenDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const session = useOpenSession(open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <CreateTokenForm key={session} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CreateTokenForm({ onDone }: { onDone: () => void }) {
  const { data: scopes = [] } = useIntegrationScopes();
  const { create } = useApiTokenMutations();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ApiScope[]>(["knowledge:read"]);
  const [expiry, setExpiry] = useState("90");
  const [created, setCreated] = useState<CreatedApiToken | null>(null);

  if (created) return <CreatedToken token={created} onDone={onDone} />;

  const toggle = (scope: ApiScope, checked: boolean) =>
    setSelected((prev) => (checked ? [...prev, scope] : prev.filter((s) => s !== scope)));

  const submit = () =>
    create.mutate(
      {
        name: name.trim(),
        scopes: selected,
        expiresInDays: EXPIRY_OPTIONS.find((o) => o.value === expiry)?.days ?? null,
      },
      {
        onSuccess: setCreated,
        onError: (error) => toast.error("Gagal membuat token", { description: errorMessage(error) }),
      },
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Buat token akses agen</DialogTitle>
        <DialogDescription>Beri izin secukupnya — agen hanya melihat tool yang sesuai izin token.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="token-name">Nama token</Label>
          <Input
            id="token-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="mis. Hermes pribadi, Claude Desktop laptop"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Izin</Label>
          {scopes.map((s) => (
            <label key={s.id} className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={selected.includes(s.id)}
                onCheckedChange={(checked) => toggle(s.id, checked === true)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{SCOPE_SHORT[s.id]}</span>
                <span className="block text-xs text-muted-foreground">{s.label}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Masa berlaku</Label>
          <Select value={expiry} onValueChange={setExpiry}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button disabled={!name.trim() || !selected.length || create.isPending} onClick={submit}>
          Buat token
        </Button>
      </DialogFooter>
    </>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="xs"
      variant="outline"
      onClick={() =>
        void navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => toast.error("Gagal menyalin."),
        )
      }
    >
      {copied ? <Check /> : <Copy />} {copied ? "Disalin" : label}
    </Button>
  );
}

function CreatedToken({ token, onDone }: { token: CreatedApiToken; onDone: () => void }) {
  const url = mcpUrl(window.location.origin);
  const snippets = mcpConfigSnippets(url, token.token);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Token "{token.name}" dibuat</DialogTitle>
        <DialogDescription className="flex items-start gap-1.5 text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> Salin sekarang — token tidak akan ditampilkan lagi.
        </DialogDescription>
      </DialogHeader>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input readOnly value={token.token} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <CopyButton value={token.token} label="Salin" />
        </div>
        <Snippet title="Hermes Agent (config.yaml)" value={snippets.hermes} />
        <Snippet title="Claude Desktop / klien MCP lain (JSON)" value={snippets.json} />
      </div>
      <DialogFooter>
        <Button onClick={onDone}>Selesai</Button>
      </DialogFooter>
    </>
  );
}

function Snippet({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{title}</span>
        <CopyButton value={value} label="Salin" />
      </div>
      <Textarea readOnly value={value} rows={value.split("\n").length} className="resize-none font-mono text-[11px]" />
    </div>
  );
}

function ActivityCard() {
  const { data: activity, isLoading } = useAgentActivity();
  return (
    <SectionCard
      icon={Activity}
      title="Aktivitas agen"
      description="50 pemanggilan tool terakhir oleh agen yang memakai token Anda."
    >
      {isLoading ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : !activity?.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Belum ada aktivitas agen.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {activity.map((a) => (
            <li key={a.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn("size-2 shrink-0 rounded-full", a.status === "ok" ? "bg-success" : "bg-destructive")}
                />
                <span className="font-medium">{TOOL_LABELS[a.tool] ?? a.tool}</span>
                <Badge variant="outline" className="text-[10px]">
                  {a.tokenName}
                </Badge>
                <span className="ml-auto text-[11px] text-muted-foreground">{formatDateTime(a.createdAt)}</span>
              </div>
              <p className="truncate pl-4 text-xs text-muted-foreground">
                {a.status === "error" && a.message ? a.message : describeInput(a.input)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
