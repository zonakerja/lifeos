import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, KeyRound, Loader2, Settings2, Wrench } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { SectionCard } from "@/components/common/section-card";
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
import { Label } from "@/components/ui/label";
import { useAiIndexStatus, useAiSettings } from "@/data/use-ai-settings";
import { useIntegrationScopes } from "@/data/use-integrations";
import { useKnowledgeStatus } from "@/data/use-knowledge";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/lib/api/client";
import { type AgentStatus, agentApi } from "@/lib/api/endpoints";
import { formatDateTime } from "@/lib/dates";
import type { ApiScope } from "@/types/api";

const UP_COMMAND = "wsl -e sh /mnt/d/Development/Application/LifeOS/infra/hermes/up.sh";

/**
 * Siapkan agen tanpa terminal (docs/AI-AGENT.md §23): Hermes memakai model lewat LifeOS (provider & API key dari
 * Pengaturan → Model AI, tidak disimpan di Hermes) dan izin agen = token akses "Agen Hermes" yang dibuat tombol di sini.
 */
export function AgentSetupCard({ status }: { status: AgentStatus }) {
  const setup = status.setup;
  const { data: ai } = useAiSettings();
  const { data: vault } = useKnowledgeStatus();
  const { data: index } = useAiIndexStatus();
  // Error indeks berawalan jenis kesalahan provider; isi mentahnya ada di Tools → Indeks Pengetahuan
  const indexError = !index?.lastError
    ? null
    : index.lastError.startsWith("auth")
      ? "API key embedding ditolak provider"
      : index.lastError.startsWith("quota")
        ? "kuota embedding habis"
        : "provider embedding sedang bermasalah";
  const [open, setOpen] = useState(false);
  const providerLabel = (id: string) => ai?.providers.find((p) => p.id === id)?.label ?? id;
  const ready = status.reachable && !!setup?.token?.scopes.includes("ai:model") && !!setup.model;

  return (
    <SectionCard
      icon={Wrench}
      title="Siapkan agen"
      description="Empat langkah, tanpa terminal: Hermes menyala, model AI dari Pengaturan → Model AI, izinkan agen, lalu sambungkan vault Obsidian."
      className="lg:col-span-2"
      action={
        <Button size="sm" variant={setup?.token ? "outline" : "default"} onClick={() => setOpen(true)}>
          <KeyRound /> {setup?.token ? "Ubah izin" : "Siapkan agen"}
        </Button>
      }
      contentClassName="grid grid-cols-1 gap-3 text-sm"
    >
      <Step ok={status.reachable} title="1. Hermes menyala">
        {status.reachable ? (
          "Container lifeos-hermes aktif."
        ) : (
          <>
            Nyalakan sekali dari PowerShell: <code className="break-all">{UP_COMMAND}</code>
          </>
        )}
      </Step>

      <Step ok={!!setup?.model} title="2. Model AI">
        {setup?.model ? (
          <>
            {providerLabel(setup.model.provider)} · <code>{setup.model.model}</code> — API key dipakai lewat LifeOS dan
            tidak disimpan di Hermes.{" "}
          </>
        ) : (
          "Belum ada API key. Simpan key provider (mis. Google Gemini) dulu. "
        )}
        <Link className="font-medium text-module hover:underline" to="/settings/api">
          Pengaturan → Model AI
        </Link>{" "}
        (baris <b>Agen (Hermes)</b> di Pembagian tugas AI untuk memilih provider khusus agen).
      </Step>

      <Step ok={!!setup?.token} title="3. Izin agen">
        {!setup?.keyValid ? (
          <span className="text-warning">
            HERMES_API_KEY di server tidak valid (24–128 huruf/angka/_/-). Buat ulang dengan{" "}
            <code>openssl rand -hex 32</code>.
          </span>
        ) : setup?.token ? (
          <>
            Aktif · {setup.token.scopes.length} izin
            {setup.token.lastUsedAt
              ? ` · terakhir dipakai ${formatDateTime(setup.token.lastUsedAt)}`
              : " · belum dipakai"}
            . Dicabut kapan saja di{" "}
            <Link className="font-medium text-module hover:underline" to="/settings/integrations">
              Pengaturan → Integrasi
            </Link>
            .
          </>
        ) : (
          "Belum disiapkan — tekan Siapkan agen. Agen bekerja atas nama akun ini sesuai izin yang dipilih."
        )}
      </Step>

      <Step ok={!!vault?.folder && vault.folderExists && !indexError} title="4. Basis pengetahuan (Obsidian)">
        {!vault?.configured ? (
          "Folder vault belum diatur di server (KNOWLEDGE_VAULTS_DIR)."
        ) : !vault.folder ? (
          "Belum ada vault tersambung, jadi agen belum punya pengetahuan Anda. "
        ) : !vault.folderExists ? (
          <span className="text-warning">Folder vault {vault.folder} tidak ditemukan. </span>
        ) : (
          <>
            Vault <code>{vault.folder}</code> · {vault.notes} catatan
            {vault.lastScanAt ? ` · dibaca ${formatDateTime(vault.lastScanAt)}` : ""}.{" "}
          </>
        )}
        {indexError && (
          <span className="text-warning">
            Pencarian makna terganggu, agen sementara mencari per kata: {indexError}.{" "}
          </span>
        )}
        <Link className="font-medium text-module hover:underline" to="/tools/knowledge">
          Tools → Basis Pengetahuan
        </Link>
      </Step>

      {setup?.lastModelCall && (
        <p
          className={
            setup.lastModelCall.ok
              ? "text-xs text-muted-foreground"
              : "rounded-md bg-warning/10 p-2 text-xs text-warning"
          }
        >
          Panggilan model terakhir {formatDateTime(setup.lastModelCall.at)} (
          {providerLabel(setup.lastModelCall.provider)}
          ): {setup.lastModelCall.ok ? "berhasil" : setup.lastModelCall.error}
          {setup.lastModelCall.usage && (
            <span className="mt-1 block">
              Token: masuk {setup.lastModelCall.usage.input.toLocaleString("id-ID")} · dari cache{" "}
              {setup.lastModelCall.usage.cacheRead.toLocaleString("id-ID")} · tulis cache{" "}
              {setup.lastModelCall.usage.cacheWrite.toLocaleString("id-ID")} · keluar{" "}
              {setup.lastModelCall.usage.output.toLocaleString("id-ID")}
            </span>
          )}
          {!setup.lastModelCall.ok && (
            <span className="mt-1 block text-muted-foreground">
              401 = API key ditolak, buat key baru; 429 = kuota/batas API key habis (key gratis cepat habis karena agen
              boros token); 503 = provider sedang sibuk, coba lagi nanti. Ganti key/model di Pengaturan → Model AI.
            </span>
          )}
        </p>
      )}
      {ready && setup?.lastModelCall?.ok !== false && (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <CircleCheck className="size-3.5" /> Agen siap. Coba di tab Chat atau tombol Kerjakan dengan agen di Approval.
        </p>
      )}

      {open && setup && <ScopesDialog setup={setup} onClose={() => setOpen(false)} />}
    </SectionCard>
  );
}

function Step({ ok, title, children }: { ok: boolean; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      {ok ? (
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
      )}
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

/** Pilih izin agen. Bawaan = semua; "Model AI agen" wajib agar Hermes bisa berpikir lewat LifeOS. */
function ScopesDialog({ setup, onClose }: { setup: NonNullable<AgentStatus["setup"]>; onClose: () => void }) {
  const { data: scopes } = useIntegrationScopes();
  const client = useQueryClient();
  const [chosen, setChosen] = useState<ApiScope[]>(() => setup.token?.scopes ?? (scopes ?? []).map((s) => s.id));
  const [saving, setSaving] = useState(false);
  // Daftar cakupan bisa datang setelah dialog dibuka: pilihan awal "semua" diterapkan saat render pertama yang memilikinya
  const [seeded, setSeeded] = useState(!!setup.token || !!scopes);
  if (!seeded && scopes) {
    setSeeded(true);
    setChosen(scopes.map((s) => s.id));
  }

  const toggle = (id: ApiScope, on: boolean) =>
    setChosen((prev) => (on ? [...new Set([...prev, id])] : prev.filter((s) => s !== id)));

  const save = async () => {
    setSaving(true);
    try {
      const status = await agentApi.setup(chosen);
      client.setQueryData(queryKeys.agentStatus, status);
      void client.invalidateQueries({ queryKey: queryKeys.integrationTokens });
      toast.success("Agen disiapkan", { description: "Hermes kini bisa memakai model & data LifeOS sesuai izin." });
      onClose();
    } catch (error) {
      toast.error("Gagal menyiapkan agen", { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="grid-cols-1 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-4" /> Izin agen Hermes
          </DialogTitle>
          <DialogDescription>
            Agen bekerja atas nama akun Anda. Persetujuan & pengiriman tetap hanya oleh Anda di Approval.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[55svh] flex-col gap-2 overflow-y-auto">
          {(scopes ?? []).map((s) => (
            <Label key={s.id} className="flex items-start gap-2 rounded-md border p-2 font-normal">
              <Checkbox
                checked={chosen.includes(s.id)}
                onCheckedChange={(v) => toggle(s.id, v === true)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm">{s.label}</span>
                <code className="text-[11px] text-muted-foreground">{s.id}</code>
              </span>
            </Label>
          ))}
        </div>
        {!chosen.includes("ai:model") && (
          <p className="text-xs text-warning">
            Tanpa izin Model AI agen, Hermes tidak bisa berpikir lewat LifeOS (perlu API key sendiri di Hermes).
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={() => void save()} disabled={saving || chosen.length === 0}>
            {saving && <Loader2 className="animate-spin" />} Simpan izin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
