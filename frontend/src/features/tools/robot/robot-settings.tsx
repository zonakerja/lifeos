import {
  Bot,
  CircleAlert,
  Copy,
  KeyRound,
  LockKeyhole,
  Wand2,
  History,
  ListChecks,
  Loader2,
  LogOut,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useRobotConnectors, useRobotMutations, useRobotRun, useRobotRuns, useRobotStatus } from "@/data/use-robot";
import { errorMessage } from "@/lib/api/client";
import { robotApi } from "@/lib/api/endpoints";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { RobotConnector } from "@/types/api";
import { AutomationJobs } from "../automation/automation-settings";
import { AutoLoginDialog } from "./auto-login-dialog";
import { CredentialsDialog } from "./credentials-dialog";
import { RemoteBrowserDialog } from "./remote-browser-dialog";
import { CONNECTOR_STATUS, parseHosts, RUN_KIND_LABELS } from "./robot-utils";

/**
 * Kartu konektor robot — tab Connector di menu Laporan Kinerja & SRIKANDI (tahap 6 docs/AI-AGENT.md §21): brankas kredensial + login otomatis (CAPTCHA & OTP Anda ketik),
 * atau login manual lewat browser jarak jauh; cek sesi. Halaman untuk memetakan alur direkam lewat "Rekam halaman ini" di tayangan browser
 * jarak jauh. Dipakai juga halaman SRIKANDI (grup AI Agent) dengan `systems`.
 */
export function RobotSettings({ systems }: { systems?: RobotConnector["system"][] } = {}) {
  const status = useRobotStatus();
  const { data: connectors, isLoading } = useRobotConnectors();
  const [remote, setRemote] = useState<{ connector: RobotConnector; sessionId: string | null } | null>(null);
  const [autoFor, setAutoFor] = useState<RobotConnector | null>(null);
  const ready = !!status.data?.reachable;
  const vault = !!status.data?.vault;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <ServiceCard status={status.data} loading={status.isLoading} />
      {isLoading || !connectors ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        connectors
          .filter((c) => !systems || systems.includes(c.system))
          .map((c) => (
            <ConnectorCard
              key={c.system}
              connector={c}
              ready={ready}
              vault={vault}
              onLogin={() => setRemote({ connector: c, sessionId: null })}
              onAutoLogin={() => setAutoFor(c)}
            />
          ))
      )}
      <AutomationJobs systems={systems} />
      <RemoteBrowserDialog
        connector={remote?.connector ?? null}
        sessionId={remote?.sessionId}
        onClose={() => setRemote(null)}
      />
      <AutoLoginDialog
        connector={autoFor}
        onClose={() => setAutoFor(null)}
        onOpenRemote={(sessionId) => {
          const c = autoFor;
          setAutoFor(null);
          if (c) setRemote({ connector: c, sessionId });
        }}
      />
    </div>
  );
}

function ServiceCard({ status, loading }: { status?: { configured: boolean; reachable: boolean }; loading: boolean }) {
  if (loading) return <Skeleton className="h-20 rounded-xl" />;
  const ok = !!status?.reachable;
  return (
    <SectionCard
      icon={ok ? ShieldCheck : CircleAlert}
      title={
        ok ? "Service robot aktif" : status?.configured ? "Service robot tidak menyala" : "Service robot belum diatur"
      }
      description={
        ok
          ? "Browser otomatis siap. Robot hanya membuka alamat sistem yang Anda atur di bawah; kredensial disimpan terenkripsi di brankas LifeOS, bukan di robot."
          : status?.configured
            ? "Nyalakan container robot lalu muat ulang halaman ini."
            : "Isi ROBOT_URL & ROBOT_TOKEN di server (docs/DEPLOYMENT.md §13)."
      }
    >
      {!ok && (
        <code className="block rounded-md bg-muted px-3 py-2 text-xs break-all">
          docker compose --profile robot up -d robot
        </code>
      )}
    </SectionCard>
  );
}

/** Blok berbingkai di dalam kartu konektor (jarak dalam seragam). */
const BLOCK = "grid grid-cols-1 gap-3 rounded-lg border p-3";

function BlockTitle({ icon: Icon, title }: { icon: typeof Bot; title: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm font-semibold">
      <Icon className="size-4 text-module" /> {title}
    </p>
  );
}

function ConnectorCard({
  connector: c,
  ready,
  vault,
  onLogin,
  onAutoLogin,
}: {
  connector: RobotConnector;
  ready: boolean;
  vault: boolean;
  onLogin: () => void;
  onAutoLogin: () => void;
}) {
  const m = useRobotMutations();
  const [baseUrl, setBaseUrl] = useState(c.baseUrl);
  const [hosts, setHosts] = useState(c.extraHosts.join(", "));
  const [markers, setMarkers] = useState(c.loginMarkers.join(", "));
  const [confirmForget, setConfirmForget] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [confirmDeleteCredentials, setConfirmDeleteCredentials] = useState(false);
  const status = CONNECTOR_STATUS[c.status];
  const dirty = baseUrl !== c.baseUrl || hosts !== c.extraHosts.join(", ") || markers !== c.loginMarkers.join(", ");

  const save = () =>
    m.update.mutate(
      { system: c.system, baseUrl, extraHosts: parseHosts(hosts), loginMarkers: parseHosts(markers) },
      { onSuccess: () => toast.success("Pengaturan konektor disimpan."), onError: (e) => toast.error(errorMessage(e)) },
    );

  return (
    <SectionCard
      icon={Bot}
      title={c.label}
      description={c.description}
      action={<Badge className={status.tone}>{status.label}</Badge>}
      contentClassName="flex flex-col gap-4"
    >
      {/* Sesi & login */}
      <section className={BLOCK}>
        <BlockTitle icon={KeyRound} title="Sesi & login" />
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
          <LockKeyhole className="size-4 shrink-0 text-module" />
          <span className="min-w-0 flex-1">
            {c.hasCredentials ? (
              <>
                Kredensial tersimpan: <code>{c.credentialHint}</code>
                {c.credentialsUpdatedAt && (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · diganti {formatDateTime(c.credentialsUpdatedAt)}
                  </span>
                )}
              </>
            ) : vault ? (
              <span className="text-muted-foreground">
                Belum ada kredensial. Simpan agar robot bisa login otomatis (CAPTCHA & OTP Anda ketik).
              </span>
            ) : (
              <span className="text-muted-foreground">Brankas kredensial belum diatur di server.</span>
            )}
          </span>
          <span className="flex gap-1">
            <Button size="sm" variant="outline" disabled={!vault} onClick={() => setCredentialsOpen(true)}>
              <LockKeyhole /> {c.hasCredentials ? "Ganti" : "Simpan kredensial"}
            </Button>
            {c.hasCredentials && (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteCredentials(true)}>
                <Trash2 /> Hapus
              </Button>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.hasCredentials && (
            <Button size="sm" disabled={!ready || !c.baseUrl || dirty} onClick={onAutoLogin}>
              <Wand2 /> Login otomatis
            </Button>
          )}
          <Button
            size="sm"
            variant={c.hasCredentials ? "outline" : "default"}
            disabled={!ready || !c.baseUrl || dirty}
            onClick={onLogin}
          >
            <KeyRound />{" "}
            {c.hasCredentials
              ? "Login manual (tayangan)"
              : c.hasSession
                ? "Perbarui login"
                : "Login (browser jarak jauh)"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!ready || !c.hasSession || m.check.isPending}
            onClick={() =>
              m.check.mutate(c.system, {
                onSuccess: (r) =>
                  r.status === "active"
                    ? toast.success("Sesi masih aktif.")
                    : toast.warning("Sesi kedaluwarsa — login ulang."),
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            {m.check.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Cek sesi
          </Button>
          {c.hasSession && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmForget(true)}>
              <LogOut /> Lupakan sesi
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {[
            c.lastLoginAt && `Login terakhir ${formatDateTime(c.lastLoginAt)}`,
            c.lastCheckAt && `dicek ${formatDateTime(c.lastCheckAt)}`,
            c.lastError && `Galat: ${c.lastError}`,
          ]
            .filter(Boolean)
            .join(" · ") || "Belum pernah login lewat LifeOS."}
        </p>
      </section>

      {/* Pengaturan alamat */}
      <section className={BLOCK}>
        <BlockTitle icon={Settings2} title="Pengaturan alamat" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="grid gap-1 md:col-span-2">
            <Label htmlFor={`url-${c.system}`}>Alamat sistem</Label>
            <Input
              id={`url-${c.system}`}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={c.defaultUrl || "https://… (alamat aplikasi di instansi Anda)"}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`hosts-${c.system}`}>Host tambahan (mis. server SSO)</Label>
            <Input
              id={`hosts-${c.system}`}
              value={hosts}
              onChange={(e) => setHosts(e.target.value)}
              placeholder="sso.contoh.go.id"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`markers-${c.system}`}>Penanda alamat halaman login</Label>
            <Input
              id={`markers-${c.system}`}
              value={markers}
              onChange={(e) => setMarkers(e.target.value)}
              placeholder="/auth/login"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" variant="outline" disabled={!dirty || m.update.isPending} onClick={save}>
            <Save /> Simpan pengaturan
          </Button>
        </div>
      </section>

      <section className={BLOCK}>
        <BlockTitle icon={ListChecks} title="Alur yang direncanakan (belum aktif)" />
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
          {c.plannedFlows.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          <strong>Batas:</strong> {c.limits}
        </p>
      </section>

      <RunList system={c.system} />
      <CredentialsDialog connector={credentialsOpen ? c : null} onClose={() => setCredentialsOpen(false)} />
      <ConfirmDialog
        open={confirmDeleteCredentials}
        onOpenChange={setConfirmDeleteCredentials}
        title="Hapus kredensial?"
        itemName={c.label}
        description="Nama pengguna & kata sandi dihapus dari brankas LifeOS. Sesi login yang tersimpan tidak terpengaruh."
        confirmLabel="Hapus"
        onConfirm={() =>
          m.deleteCredentials.mutate(c.system, {
            onSuccess: () => toast.success("Kredensial dihapus."),
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
      <ConfirmDialog
        open={confirmForget}
        onOpenChange={setConfirmForget}
        title="Lupakan sesi?"
        itemName={c.label}
        description="Sesi login tersimpan dihapus dari LifeOS. Anda perlu login lagi sebelum robot bisa bekerja."
        confirmLabel="Lupakan"
        onConfirm={() => m.forget.mutate(c.system, { onError: (e) => toast.error(errorMessage(e)) })}
      />
    </SectionCard>
  );
}

function RunList({ system }: { system: RobotConnector["system"] }) {
  const { data } = useRobotRuns(system);
  const m = useRobotMutations();
  const [openId, setOpenId] = useState<string | null>(null);
  if (!data?.length) return null;
  return (
    <section className={BLOCK}>
      <BlockTitle icon={History} title="Riwayat robot" />
      <ul className="grid max-h-60 grid-cols-1 gap-1 overflow-y-auto">
        {data.map((r) => (
          <li key={r.id} className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
            <Badge
              className={cn(
                "shrink-0",
                r.status === "ok" ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
              )}
            >
              {RUN_KIND_LABELS[r.kind]}
            </Badge>
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left hover:underline"
              onClick={() => setOpenId(r.id)}
              disabled={r.kind !== "capture"}
            >
              {r.error ?? r.note ?? r.title ?? r.url}
              {r.url && <span className="text-muted-foreground"> · {r.url}</span>}
            </button>
            <span className="shrink-0 text-muted-foreground tabular-nums">{formatDateTime(r.createdAt)}</span>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Hapus rekaman"
              onClick={() => m.removeRun.mutate(r.id, { onError: (e) => toast.error(errorMessage(e)) })}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <RunDialog id={openId} onClose={() => setOpenId(null)} />
    </section>
  );
}

/** Rekaman satu run robot (tangkapan layar + struktur halaman); dipakai juga hasil "Periksa di SRIKANDI". */
export function RunDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = useRobotRun(id);
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !data?.hasScreenshot) return;
    let url: string | null = null;
    let cancelled = false;
    robotApi
      .screenshot(id)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImage(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setImage(null);
    };
  }, [id, data?.hasScreenshot]);
  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94svh] grid-cols-1 overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{data?.title || "Rekaman halaman"}</DialogTitle>
          <DialogDescription className="break-all">{data?.url}</DialogDescription>
        </DialogHeader>
        {image && <img src={image} alt={data?.title ?? "Tangkapan layar"} className="w-full rounded-md border" />}
        {data?.aria && (
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold">Struktur halaman (snapshot aksesibilitas)</p>
              <Button
                size="xs"
                variant="outline"
                className="ml-auto"
                onClick={() =>
                  void navigator.clipboard.writeText(data.aria ?? "").then(() => toast.success("Struktur disalin."))
                }
              >
                <Copy /> Salin
              </Button>
            </div>
            <pre className="max-h-80 overflow-auto rounded-md bg-muted p-2 text-[11px] whitespace-pre-wrap">
              {data.aria}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
