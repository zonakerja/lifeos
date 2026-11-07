import { CalendarClock, CircleAlert, History, Loader2, Pencil, Play, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { SectionCard } from "@/components/common/section-card";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAutomationJobs, useAutomationMutations, useAutomationRuns } from "@/data/use-automation";
import { useRobotConnectors, useRobotStatus } from "@/data/use-robot";
import { errorMessage } from "@/lib/api/client";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AutomationJob, AutomationSchedule, AutomationTimezone, RobotSystem } from "@/types/api";
import {
  DAY_LABELS,
  DAY_ORDER,
  describeSchedule,
  KIND_INFO,
  needsLogin,
  RUN_STATUS,
  runDuration,
  scheduleForMode,
  TIMEZONES,
  TRIGGER_LABELS,
} from "./automation-utils";
import { BrowserNotificationButton } from "./robot-alerts";

const SYSTEM_LABELS: Record<RobotSystem, string> = { ekinerja: "e-Kinerja", srikandi: "SRIKANDI" };
const CONNECTOR_PATHS: Record<RobotSystem, string> = {
  ekinerja: "/kinerja/connector",
  srikandi: "/srikandi/connector",
};

/** Cara kerja + jadwal otomatis per sistem — bagian bawah tab Connector Laporan Kinerja & SRIKANDI. */
export function AutomationJobs({ systems }: { systems?: RobotSystem[] } = {}) {
  const { data: jobs, isLoading } = useAutomationJobs();
  const robot = useRobotStatus();
  const { data: connectors } = useRobotConnectors();
  const [editing, setEditing] = useState<AutomationJob | null>(null);
  const [history, setHistory] = useState<AutomationJob | null>(null);
  const groups = (["ekinerja", "srikandi"] as const).filter((s) => !systems || systems.includes(s));

  if (isLoading || !jobs) return <Skeleton className="h-64 rounded-xl" />;
  return (
    <>
      <SectionCard
        icon={ShieldCheck}
        title="Cara kerja otomasi"
        description="Robot menjalankan tugas sinkron sesuai jadwal memakai sesi login dari sub-tab Pengaturan koneksi. Semua tugas terjadwal hanya membaca sistem asal — pengisian Rencana Aksi dan pendaftaran naskah tetap lewat tombol Anda."
        contentClassName="flex flex-col gap-3"
      >
        <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
          <li>
            Tugas dijalankan berurutan, paling sering sekali per jam. Tombol sinkron di menu asal tetap bisa dipakai
            kapan saja.
          </li>
          <li>
            Sesi login bisa kedaluwarsa. Bila tugas gagal karena sesi, login ulang di Pengaturan koneksi (CAPTCHA/OTP
            tetap Anda ketik) — jadwal berikutnya berjalan lagi.
          </li>
          <li>Laptop/server harus menyala beserta service robot pada jam jadwal.</li>
          <li>
            Sesi login tersimpan terenkripsi dan diperbarui setiap kali robot berjalan. Aktifkan <b>Jaga sesi login</b>{" "}
            agar cookie diperbarui tiap jam kerja dan sesi yang habis langsung diketahui — Anda mendapat notifikasi
            (lonceng & toast) dan jadwal sistem itu dijeda sampai Anda login ulang.
          </li>
        </ul>
        <BrowserNotificationButton />
      </SectionCard>
      {groups.map((system) => {
        const connector = connectors?.find((c) => c.system === system);
        const list = jobs.filter((j) => j.system === system);
        return (
          <SectionCard
            key={system}
            icon={CalendarClock}
            title={`Jadwal otomatis ${SYSTEM_LABELS[system]}`}
            description="Aktifkan sakelar agar tugas berjalan sesuai jadwal. Jalankan sekarang = sekali jalan tanpa menunggu jadwal."
            contentClassName="flex flex-col gap-3"
          >
            {robot.data && !robot.data.reachable ? (
              <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                Service robot tidak menyala — tugas terjadwal akan gagal sampai robot dinyalakan.
              </p>
            ) : connector && (!connector.hasSession || connector.status === "expired") ? (
              <p
                className={cn(
                  "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
                  connector.hasSession ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning",
                )}
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  {connector.hasSession
                    ? `Sesi ${SYSTEM_LABELS[system]} kedaluwarsa — semua jadwal ${SYSTEM_LABELS[system]} dijeda sampai Anda login ulang di `
                    : `Belum ada sesi ${SYSTEM_LABELS[system]} — jadwal dilewati sampai Anda login di `}
                  <Link className="font-medium underline" to={CONNECTOR_PATHS[system]}>
                    Pengaturan koneksi
                  </Link>
                  .
                </span>
              </p>
            ) : null}
            {list.map((job) => (
              <JobRow key={job.kind} job={job} onEdit={() => setEditing(job)} onHistory={() => setHistory(job)} />
            ))}
          </SectionCard>
        );
      })}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && <ScheduleDialogContent key={editing.kind} job={editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={!!history} onOpenChange={(open) => !open && setHistory(null)}>
        {history && <HistoryDialogContent job={history} />}
      </Dialog>
    </>
  );
}

function JobRow({ job, onEdit, onHistory }: { job: AutomationJob; onEdit: () => void; onHistory: () => void }) {
  const m = useAutomationMutations();
  const info = KIND_INFO[job.kind];
  const active = job.activeRun;
  const last = job.lastStatus ? RUN_STATUS[job.lastStatus] : null;

  const toggle = (enabled: boolean) =>
    m.update.mutate(
      { kind: job.kind, enabled },
      {
        onSuccess: (j) => toast.success(enabled ? `Jadwal "${j.label}" aktif` : `Jadwal "${j.label}" dimatikan`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  const runNow = () =>
    m.run.mutate(job.kind, {
      onSuccess: () => toast.success(`"${job.label}" masuk antrian`, { description: "Hasilnya tampil di baris ini." }),
      onError: (error) => toast.error(errorMessage(error)),
    });

  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border p-3" data-kind={job.kind}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{job.label}</p>
          <p className="text-xs text-muted-foreground">{info.description}</p>
        </div>
        <Switch
          checked={job.enabled}
          onCheckedChange={toggle}
          disabled={m.update.isPending}
          aria-label={`Aktifkan jadwal ${job.label}`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className={cn("flex items-center gap-1.5", !job.enabled && "text-muted-foreground")}>
          <CalendarClock className="size-4 text-module" />
          {describeSchedule(job.schedule)}
        </span>
        {job.enabled && job.nextRunAt && (
          <span className="text-xs text-muted-foreground">Berikutnya {formatDateTime(job.nextRunAt)}</span>
        )}
        {!job.enabled && <span className="text-xs text-muted-foreground">(jadwal nonaktif)</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {active ? (
          <Badge className={RUN_STATUS[active.status].tone}>
            <Loader2 className="size-3 animate-spin" /> {RUN_STATUS[active.status].label}
          </Badge>
        ) : last ? (
          <Badge className={last.tone}>{last.label}</Badge>
        ) : (
          <span className="text-muted-foreground">Belum pernah dijalankan</span>
        )}
        {job.lastRunAt && !active && <span className="text-muted-foreground">{formatDateTime(job.lastRunAt)}</span>}
        {job.lastMessage && !active && (
          <span className="min-w-0 break-words text-muted-foreground">· {job.lastMessage}</span>
        )}
        {job.lastStatus === "failed" && needsLogin(job.lastMessage) && !active && (
          <Link className="font-medium text-module underline" to={CONNECTOR_PATHS[job.system]}>
            Login ulang
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil /> Ubah jadwal
        </Button>
        <Button size="sm" variant="outline" onClick={runNow} disabled={!!active || m.run.isPending}>
          <Play /> Jalankan sekarang
        </Button>
        <Button size="sm" variant="ghost" onClick={onHistory}>
          <History /> Riwayat
        </Button>
        <span className="text-xs text-muted-foreground">Manual juga lewat {info.where}</span>
      </div>
    </div>
  );
}

const MODES: { value: AutomationSchedule["mode"]; label: string }[] = [
  { value: "daily", label: "Harian / mingguan" },
  { value: "hourly", label: "Tiap jam" },
  { value: "cron", label: "Kustom (cron)" },
];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const pad = (n: number) => String(n).padStart(2, "0");

/** Isi dialog ubah jadwal — di-mount saat dialog dibuka (state awal dari props). */
function ScheduleDialogContent({ job, onDone }: { job: AutomationJob; onDone: () => void }) {
  const m = useAutomationMutations();
  const [schedule, setSchedule] = useState<AutomationSchedule>(job.schedule);
  const [enable, setEnable] = useState(true);
  const days = schedule.mode === "cron" ? [] : schedule.days;

  const toggleDay = (day: number) =>
    setSchedule((s) =>
      s.mode === "cron" ? s : { ...s, days: s.days.includes(day) ? s.days.filter((d) => d !== day) : [...s.days, day] },
    );
  const setPreset = (preset: number[]) => setSchedule((s) => (s.mode === "cron" ? s : { ...s, days: preset }));

  const save = () =>
    m.update.mutate(
      { kind: job.kind, schedule, ...(enable && !job.enabled ? { enabled: true } : {}) },
      {
        onSuccess: (j) => {
          toast.success(`Jadwal "${j.label}" disimpan`, { description: describeSchedule(j.schedule) });
          onDone();
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  return (
    <DialogContent className="grid-cols-1 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Jadwal: {job.label}</DialogTitle>
        <DialogDescription>{KIND_INFO[job.kind].description}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-4">
        <div className="flex flex-wrap gap-2">
          {MODES.map((mode) => (
            <Button
              key={mode.value}
              size="sm"
              type="button"
              variant={schedule.mode === mode.value ? "default" : "outline"}
              onClick={() => setSchedule((s) => scheduleForMode(mode.value, s))}
            >
              {mode.label}
            </Button>
          ))}
        </div>

        {schedule.mode === "daily" && (
          <div className="grid gap-1.5">
            <Label htmlFor="auto-time">Jam</Label>
            <Input
              id="auto-time"
              type="time"
              className="w-36"
              value={schedule.time}
              onChange={(e) => setSchedule({ ...schedule, time: e.target.value || schedule.time })}
            />
          </div>
        )}

        {schedule.mode === "hourly" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <HourSelect
              label="Mulai jam"
              value={schedule.from}
              onChange={(from) => setSchedule({ ...schedule, from, to: Math.max(from, schedule.to) })}
            />
            <HourSelect
              label="Sampai jam"
              value={schedule.to}
              onChange={(to) => setSchedule({ ...schedule, to, from: Math.min(to, schedule.from) })}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="auto-minute">Menit ke-</Label>
              <Input
                id="auto-minute"
                type="number"
                min={0}
                max={59}
                value={schedule.minute}
                onChange={(e) =>
                  setSchedule({
                    ...schedule,
                    minute: Math.min(59, Math.max(0, Math.trunc(Number(e.target.value) || 0))),
                  })
                }
              />
            </div>
          </div>
        )}

        {schedule.mode !== "cron" && (
          <div className="grid gap-1.5">
            <Label>Hari</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_ORDER.map((day) => (
                <Button
                  key={day}
                  size="sm"
                  type="button"
                  className="w-12"
                  variant={days.includes(day) ? "default" : "outline"}
                  aria-pressed={days.includes(day)}
                  onClick={() => toggleDay(day)}
                >
                  {DAY_LABELS[day]}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Button size="xs" type="button" variant="ghost" onClick={() => setPreset([0, 1, 2, 3, 4, 5, 6])}>
                Setiap hari
              </Button>
              <Button size="xs" type="button" variant="ghost" onClick={() => setPreset([1, 2, 3, 4, 5])}>
                Hari kerja
              </Button>
              <Button size="xs" type="button" variant="ghost" onClick={() => setPreset([1])}>
                Mingguan (Senin)
              </Button>
            </div>
          </div>
        )}

        {schedule.mode === "cron" && (
          <div className="grid gap-1.5">
            <Label htmlFor="auto-cron">Pola cron (menit jam tanggal bulan hari)</Label>
            <Input
              id="auto-cron"
              className="font-mono"
              value={schedule.pattern}
              onChange={(e) => setSchedule({ ...schedule, pattern: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Contoh: <code>0 7 1 * *</code> = tiap tanggal 1 pukul 07.00. Kolom menit harus satu angka (paling sering
              sekali per jam).
            </p>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label>Zona waktu</Label>
          <Select
            value={schedule.timezone}
            onValueChange={(timezone) => setSchedule({ ...schedule, timezone: timezone as AutomationTimezone })}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="rounded-lg bg-module-soft px-3 py-2 text-sm">
          <CalendarClock className="mr-1.5 inline size-4 text-module" />
          {schedule.mode !== "cron" && !days.length ? "Pilih minimal satu hari." : describeSchedule(schedule)}
        </p>
        {!job.enabled && (
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={enable} onCheckedChange={setEnable} /> Aktifkan jadwal ini setelah disimpan
          </label>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button onClick={save} disabled={m.update.isPending || (schedule.mode !== "cron" && !days.length)}>
          {m.update.isPending && <Loader2 className="animate-spin" />} Simpan
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function HourSelect({ label, value, onChange }: { label: string; value: number; onChange: (hour: number) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={String(h)}>
              {pad(h)}.00
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function HistoryDialogContent({ job }: { job: AutomationJob }) {
  const { data: runs, isLoading } = useAutomationRuns(job.kind);
  return (
    <DialogContent className="grid-cols-1 sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Riwayat: {job.label}</DialogTitle>
        <DialogDescription>50 run terakhir — terjadwal, Jalankan sekarang, dan tombol di menu asal.</DialogDescription>
      </DialogHeader>
      <div className="max-h-[60svh] min-h-0 overflow-y-auto">
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : !runs?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Belum ada riwayat.</p>
        ) : (
          <ul className="grid grid-cols-1 divide-y">
            {runs.map((run) => {
              const status = RUN_STATUS[run.status];
              const duration = runDuration(run);
              return (
                <li key={run.id} className="grid grid-cols-1 gap-1 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={status.tone}>{status.label}</Badge>
                    <span>{formatDateTime(run.startedAt ?? run.createdAt)}</span>
                    <span className="text-xs text-muted-foreground">
                      {TRIGGER_LABELS[run.trigger]}
                      {duration && ` · ${duration}`}
                    </span>
                  </div>
                  {run.message && <p className="text-xs break-words text-muted-foreground">{run.message}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </DialogContent>
  );
}
