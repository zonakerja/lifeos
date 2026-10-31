import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CloudDownload,
  ExternalLink,
  Loader2,
  PencilLine,
  Lock,
  Plus,
  RefreshCw,
  ScanSearch,
  Send,
  Target,
  Trash2,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { RenameDialog } from "@/components/common/rename-dialog";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { useActionPlanEntries, useActionPlanMonths, useActivities, useSkps, useSkpTargets } from "@/data/collections";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/lib/api/client";
import { robotApi, vaultsApi } from "@/lib/api/endpoints";
import { VaultButton } from "@/features/vault/vault-dialog";
import { useNavigate } from "react-router";
import { links } from "@/lib/deep-links";
import { useToday } from "@/hooks/use-today";
import { formatDateTime, formatLocalYMD, formatShortDate, parseLocalYMD } from "@/lib/dates";
import { generateId } from "@/lib/ids";
import { toExternalHref } from "@/lib/urls";
import type { ActionPlanEntry, ActionPlanMonth, Skp, SkpTarget } from "@/types/entities";
import {
  DISPLAY_LABELS,
  type DisplayStatus,
  displayStatus,
  entryIndicators,
  groupByTarget,
  isLockedMonth,
  isPending,
  MONTH_STATUS_LABELS,
  monthOf,
  indicatorRealization,
  isPeriod,
  missingFields,
  periodLabel,
  periodYear,
  shiftPeriod,
  skpPeriodLabel,
  skpsForPeriod,
  skpsForYear,
  targetsForSkp,
  targetsForYear,
} from "@/features/productivity/lib/action-plan";
import { ActionPlanDialog } from "@/features/productivity/components/action-plan-dialog";

const DISPLAY_STYLE: Record<DisplayStatus, string> = {
  draft: "bg-warning/15 text-warning",
  ready: "bg-info/15 text-info",
  filled: "bg-success/15 text-success",
  changed: "bg-warning/15 text-warning",
  deleted: "bg-destructive/10 text-destructive",
  missing: "bg-destructive/10 text-destructive",
  locked: "bg-muted text-muted-foreground",
};
const MONTH_STYLE: Record<ActionPlanMonth["status"], string> = {
  empty: "bg-muted text-muted-foreground",
  unavailable: "bg-muted text-muted-foreground",
  draft: "bg-info/15 text-info",
  submitted: "bg-warning/15 text-warning",
  rated: "bg-success/15 text-success",
};
const COUNT_ORDER: DisplayStatus[] = ["ready", "changed", "deleted", "missing", "draft", "filled", "locked"];

const SOURCE_LABELS = { task: "Action/Task", activity: "Kegiatan", schedule: "Agenda", ekinerja: "e-Kinerja" } as const;

/**
 * Tab Laporan Kinerja: rencana aksi bulanan e-Kinerja yang dipilih user dari Productivity (tombol Renaksi di Action/Task,
 * Kegiatan, Agenda). Setiap entri = SKP bulan itu + RHK & indikator + renaksi + realisasi + bukti; yang lengkap diisikan
 * robot lewat "Isi ke e-Kinerja" (draf — robot tidak pernah mengirim penilaian ke atasan).
 * SKP & RHK diambil robot dari e-Kinerja (satu tahun bisa beberapa SKP).
 */
export function ActionPlanBoard() {
  const today = useToday();
  const [period, setPeriod] = useState(() => formatLocalYMD(today).slice(0, 7));
  const { items: entries, remove, upsert } = useActionPlanEntries();
  const { items: months } = useActionPlanMonths();
  const { items: targets } = useSkpTargets();
  const { items: skps } = useSkps();
  const [editing, setEditing] = useState<ActionPlanEntry | null>(null);
  const [deleting, setDeleting] = useState<ActionPlanEntry | null>(null);

  const monthEntries = entries
    .filter((e) => e.period === period)
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const year = periodYear(period);
  const monthSkps = skpsForPeriod(skps, period);
  const groups = groupByTarget(monthEntries, [
    ...monthSkps.flatMap((s) => targetsForSkp(targets, s.id)),
    ...targetsForYear(targets, year),
  ]);
  const targetOf = (e: ActionPlanEntry) => targets.find((t) => t.id === e.targetId);
  // Potret bulan e-Kinerja (dibaca robot) → status gabungan entri: terisi / berubah / akan dihapus / terkunci, dll.
  const month = monthOf(months, period, monthSkps[0]?.id);
  const locked = isLockedMonth(month);
  const monthOfEntry = (e: ActionPlanEntry) => monthOf(months, e.period, e.skpId ?? targetOf(e)?.skpId);
  const statusOf = (e: ActionPlanEntry) => displayStatus(e, targetOf(e), monthOfEntry(e));
  const counts = Object.fromEntries(COUNT_ORDER.map((s) => [s, 0])) as Record<DisplayStatus, number>;
  for (const e of monthEntries) counts[statusOf(e)] += 1;
  const pending = monthEntries.filter((e) => isPending(statusOf(e))).length;
  const [confirmFill, setConfirmFill] = useState(false);
  const [filling, setFilling] = useState<"push" | "check" | "sync" | null>(null);
  const client = useQueryClient();
  const refresh = () =>
    Promise.all(
      (["action_plan_entry", "action_plan_month"] as const).map((t) =>
        client.invalidateQueries({ queryKey: queryKeys.records(t) }),
      ),
    );

  // Kirim perubahan: backend membaca e-Kinerja dulu (impor), lalu robot menyamakan bulan dengan LifeOS (draf)
  const fill = async (dryRun = false) => {
    setConfirmFill(false);
    setFilling(dryRun ? "check" : "push");
    try {
      const r = await robotApi.fillRenaksi(period, dryRun);
      await refresh();
      const submitted = r.results.some((x) => x.status === "submitted");
      const missing = r.results.reduce((n, x) => n + x.missing.length, 0);
      const rewritten = r.results.reduce((n, x) => n + x.rewritten, 0);
      const notes = [
        submitted ? "Bulan ini sudah dikirim ke atasan — tidak diubah." : "",
        missing ? `${missing} indikator tidak ditemukan di e-Kinerja.` : "",
        r.imported ? `${r.imported} isian dari e-Kinerja dimasukkan ke LifeOS.` : "",
      ].filter(Boolean);
      if (dryRun) {
        const planned = r.results.reduce((n, x) => n + (x.planned ?? 0), 0);
        toast.info(`Periksa: ${planned} butir akan ditambahkan, ${rewritten} baris indikator akan ditulis ulang.`, {
          description: notes.join(" ") || "Belum ada yang diubah di e-Kinerja.",
        });
      } else {
        toast.success(
          `Robot selesai: ${r.added} butir ditambahkan, ${rewritten} baris ditulis ulang, ${r.filled} entri terisi (draf).`,
          {
            description:
              notes.join(" ") || "Periksa di e-Kinerja lalu tekan Kirim Penilaian sendiri bila sudah sesuai.",
          },
        );
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setFilling(null);
    }
  };

  // Pantau: baca semua bulan tahun ini dari e-Kinerja (status, isi, feedback) — hanya membaca
  const syncMonths = async () => {
    setFilling("sync");
    try {
      const r = await robotApi.syncRenaksi(year);
      await refresh();
      toast.success(`Rencana Aksi ${year} dibaca dari e-Kinerja (${r.months.length} bulan).`, {
        description: r.imported ? `${r.imported} isian yang hanya ada di e-Kinerja dimasukkan ke LifeOS.` : undefined,
      });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setFilling(null);
    }
  };

  // Entri yang pernah terkirim dihapus bertahap: ditandai dulu, butirnya dihapus dari e-Kinerja saat Kirim perubahan
  const removeEntry = (entry: ActionPlanEntry) => {
    if (entry.pushedSignature && monthOfEntry(entry)?.status === "draft") upsert({ ...entry, deleted: true });
    else {
      remove(entry.id);
      // Brankas buktinya ikut dihapus (tautannya tidak berlaku lagi); entri yang menunggu hapus di e-Kinerja dihapus server
      if (entry.vaultId) void vaultsApi.remove(entry.vaultId).catch(() => undefined);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <SectionCard
        icon={ClipboardList}
        title="Rencana Aksi bulanan"
        description="Pilih item di Productivity lewat ikon papan klip pada Action/Task, Kegiatan, atau Agenda. Hanya entri yang Anda masukkan di sini yang diisikan robot e-Kinerja."
        contentClassName="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Bulan sebelumnya"
            onClick={() => setPeriod(shiftPeriod(period, -1))}
          >
            <ChevronLeft />
          </Button>
          <Input
            type="month"
            className="w-44"
            value={period}
            onChange={(e) => isPeriod(e.target.value) && setPeriod(e.target.value)}
            aria-label="Bulan"
          />
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Bulan berikutnya"
            onClick={() => setPeriod(shiftPeriod(period, 1))}
          >
            <ChevronRight />
          </Button>
          <span className="font-semibold">{periodLabel(period)}</span>
          {monthSkps.map((s) => (
            <Badge key={s.id} variant="secondary" title={`SKP ${s.externalId}`}>
              SKP {skpPeriodLabel(s)} · {s.status}
            </Badge>
          ))}
          <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
            {COUNT_ORDER.map((s) =>
              counts[s] ? (
                <Badge key={s} className={DISPLAY_STYLE[s]}>
                  {counts[s]} {DISPLAY_LABELS[s].toLowerCase()}
                </Badge>
              ) : null,
            )}
            <Button size="sm" variant="outline" onClick={() => void syncMonths()} disabled={!!filling}>
              {filling === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Pantau e-Kinerja
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void fill(true)}
              disabled={!!filling || locked || !pending}
              title="Lihat rencana robot tanpa mengubah e-Kinerja"
            >
              {filling === "check" ? <Loader2 className="animate-spin" /> : <ScanSearch />} Periksa
            </Button>
            <Button size="sm" onClick={() => setConfirmFill(true)} disabled={!!filling || locked || !pending}>
              {filling === "push" ? <Loader2 className="animate-spin" /> : <Send />}{" "}
              {filling === "push" ? "Robot mengisi…" : `Kirim perubahan${pending ? ` (${pending})` : ""}`}
            </Button>
          </span>
        </div>

        <MonthStatusCard month={month} />

        {monthEntries.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardList />
              </EmptyMedia>
              <EmptyTitle>Belum ada rencana aksi {periodLabel(period)}</EmptyTitle>
              <EmptyDescription>
                Buka Project atau Area, lalu klik ikon <ClipboardList className="inline size-3.5" /> pada Action/Task,
                Agenda, atau Kegiatan yang ingin dimasukkan.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          groups.map((group) => (
            <section key={group.target?.id ?? "none"} className="grid grid-cols-1 gap-2 rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Target className="size-4 shrink-0 text-module" />
                <span className="min-w-0">{group.target?.name ?? "Belum dipetakan ke RHK"}</span>
                <span className="text-xs font-normal text-muted-foreground">· {group.entries.length}</span>
              </p>
              <ul className="grid grid-cols-1 gap-2">
                {group.entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    target={targetOf(entry)}
                    status={statusOf(entry)}
                    onEdit={() => setEditing(entry)}
                    onDelete={() => setDeleting(entry)}
                    onRestore={() => upsert({ ...entry, deleted: undefined })}
                    onRotated={(url) => upsert({ ...entry, documentUrl: url })}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </SectionCard>

      <div className="grid grid-cols-1 content-start gap-4">
        <SkpCard year={year} skps={skps} targets={targets} />
        {(skpsForYear(skps, year).length === 0 || targetsForYear(targets, year).length > 0) && (
          <TargetsCard year={year} entries={entries} />
        )}
      </div>

      <ActionPlanDialog open={!!editing} onClose={() => setEditing(null)} entry={editing ?? undefined} />
      <ConfirmDialog
        open={confirmFill}
        onOpenChange={setConfirmFill}
        title={`Kirim perubahan Rencana Aksi ${periodLabel(period)} ke e-Kinerja?`}
        description={`Robot membaca e-Kinerja dulu (isian yang hanya ada di sana dimasukkan ke LifeOS), lalu menyamakan bulan ini dengan LifeOS: ${counts.ready} entri baru ditambahkan, ${counts.changed} entri berubah dan ${counts.deleted} entri dihapus ditulis ulang (e-Kinerja tidak punya ubah per butir: baris indikatornya dilepas, dicentang lagi, lalu diisi ulang dari LifeOS). Robot TIDAK menekan Kirim Penilaian Ke Atasan.`}
        confirmLabel="Kirim perubahan"
        destructive={false}
        onConfirm={() => void fill()}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus dari renaksi?"
        itemName={deleting?.description}
        description={
          deleting?.pushedSignature
            ? "Entri ini sudah terkirim ke e-Kinerja: ditandai Akan dihapus, lalu butirnya dihapus dari e-Kinerja saat Kirim perubahan. Item asal di Productivity tidak ikut terhapus."
            : "Item asal di Productivity tidak ikut terhapus."
        }
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting) removeEntry(deleting);
          setDeleting(null);
        }}
      />
    </div>
  );
}

function EntryRow({
  entry,
  target,
  status,
  onEdit,
  onDelete,
  onRestore,
  onRotated,
}: {
  entry: ActionPlanEntry;
  target?: SkpTarget;
  status: DisplayStatus;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onRotated: (url: string) => void;
}) {
  const navigate = useNavigate();
  const { items: activities } = useActivities();
  const href = toExternalHref(entry.documentUrl);
  const missing = missingFields(entry, target);
  const indicators = entryIndicators(entry, target);

  const openSource = () => {
    if (!entry.sourceId) return;
    // Item asal dibuka di menunya (Productivity / Planner)
    if (entry.sourceType === "task") navigate(links.task(entry.sourceId));
    else if (entry.sourceType === "schedule") navigate(links.schedule(entry.sourceId));
    else {
      const activity = activities.find((a) => a.id === entry.sourceId);
      if (activity?.areaId) navigate(links.area(activity.areaId));
      else toast.error("Kegiatan asal sudah tidak ada.");
    }
  };

  return (
    <li
      className={
        status === "deleted"
          ? "group flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2 opacity-60 [&_p]:line-through"
          : "group flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2"
      }
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm whitespace-pre-line">
          <span className="text-xs font-semibold text-muted-foreground">Renaksi: </span>
          {entry.description || <em>(kosong)</em>}
        </p>
        {indicators.length > 0 ? (
          <ul className="mt-1 grid grid-cols-1 gap-0.5 text-xs">
            {indicators.map((i) => (
              <li key={i.indicator} className="min-w-0">
                <span className="text-muted-foreground">{i.indicator} → </span>
                {indicatorRealization(entry, i) || <em className="text-warning">realisasi belum diisi</em>}
              </li>
            ))}
          </ul>
        ) : (
          entry.realization && (
            <p className="mt-0.5 text-xs">
              <span className="text-muted-foreground">Realisasi: </span>
              {entry.realization}
            </p>
          )
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Badge className={DISPLAY_STYLE[status]}>
            {status === "locked" && <Lock className="size-3" />} {DISPLAY_LABELS[status]}
          </Badge>
          {missing.length > 0 && (status === "draft" || status === "changed") && (
            <span className="text-warning">Kurang: {missing.join(", ")}</span>
          )}
          {entry.vaultId ? (
            <VaultButton vaultId={entry.vaultId} url={entry.documentUrl} onRotated={onRotated} />
          ) : (
            href && (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-1 text-module hover:underline"
              >
                <ExternalLink className="size-3 shrink-0" /> <span className="truncate">Bukti data dukung</span>
              </a>
            )
          )}
          {entry.sourceTitle && (
            <button type="button" className="min-w-0 truncate text-left hover:underline" onClick={openSource}>
              {entry.sourceType ? `${SOURCE_LABELS[entry.sourceType]}: ` : ""}
              {entry.sourceTitle}
            </button>
          )}
        </div>
      </div>
      {status === "deleted" ? (
        <Button variant="ghost" size="sm" className="shrink-0" onClick={onRestore}>
          <Undo2 /> Batalkan hapus
        </Button>
      ) : status !== "locked" ? (
        <div className="flex shrink-0 gap-0.5 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100">
          <Button variant="ghost" size="icon-sm" title="Ubah" onClick={onEdit}>
            <PencilLine />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Hapus" className="hover:text-destructive" onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/** Keadaan bulan di e-Kinerja (potret terakhir dibaca robot) + isinya per indikator & feedback atasan. */
function MonthStatusCard({ month }: { month: ActionPlanMonth | null }) {
  const [open, setOpen] = useState(false);
  if (!month) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        Keadaan bulan ini di e-Kinerja belum dibaca — klik <b>Pantau e-Kinerja</b>.
      </p>
    );
  }
  const rows = month.rows ?? [];
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge className={MONTH_STYLE[month.status]}>{MONTH_STATUS_LABELS[month.status]}</Badge>
        {month.submittedAt && (
          <span className="text-muted-foreground">
            Diajukan {formatShortDate(parseLocalYMD(month.submittedAt))}
            {month.workday ? ` (hari kerja ke-${month.workday})` : ""}
          </span>
        )}
        {month.ratings?.predikat && (
          <span className="text-muted-foreground">
            Predikat <b className="text-foreground">{month.ratings.predikat}</b> · Hasil kerja{" "}
            {month.ratings.hasilKerja} · Perilaku {month.ratings.perilaku} · Tunkin {month.ratings.tunkin}%
          </span>
        )}
        {month.syncedAt && (
          <span className="ml-auto text-xs text-muted-foreground">Dibaca {formatDateTime(month.syncedAt)}</span>
        )}
        {rows.length > 0 && (
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setOpen((v) => !v)}>
            {open ? "Sembunyikan" : "Lihat"} isi e-Kinerja ({rows.length} indikator)
          </Button>
        )}
      </div>
      {open && (
        <ul className="grid grid-cols-1 gap-1.5">
          {rows.map((row) => (
            <li key={row.key} className="rounded-md bg-muted/40 px-3 py-2 text-xs">
              <p className="font-medium">{row.text}</p>
              {(["renaksi", "realisasi", "bukti"] as const).map((kind) => (
                <p key={kind} className="mt-0.5 break-words">
                  <span className="text-muted-foreground">
                    {kind === "renaksi" ? "Renaksi" : kind === "realisasi" ? "Realisasi" : "Bukti"}:{" "}
                  </span>
                  {row[kind].length ? row[kind].join(" · ") : <em>belum diisi</em>}
                </p>
              ))}
              {row.feedback && <p className="mt-0.5 text-muted-foreground">Feedback: {row.feedback}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** SKP tahun itu beserta RHK-nya, diambil robot dari e-Kinerja (daftar SKP + Detail SKP; hanya membaca). */
function SkpCard({ year, skps, targets }: { year: number; skps: Skp[]; targets: SkpTarget[] }) {
  const client = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const list = skpsForYear(skps, year);
  const lastSync = list
    .map((s) => s.syncedAt ?? "")
    .sort()
    .at(-1);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await robotApi.syncSkp(year);
      await Promise.all(
        (["skp", "skp_target"] as const).map((t) => client.invalidateQueries({ queryKey: queryKeys.records(t) })),
      );
      toast.success(`${r.detailed} SKP ${year} dengan ${r.rhk} RHK diambil dari e-Kinerja.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <SectionCard
      icon={Target}
      title={`SKP & RHK ${year}`}
      description={
        lastSync ? `Diambil dari e-Kinerja ${formatDateTime(lastSync)}.` : "Ambil SKP & RHK dari e-Kinerja lewat robot."
      }
      contentClassName="flex flex-col gap-3"
    >
      <Button size="sm" variant="outline" className="w-full" onClick={() => void sync()} disabled={syncing}>
        {syncing ? <Loader2 className="animate-spin" /> : <CloudDownload />} Ambil dari e-Kinerja
      </Button>
      {list.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Belum ada SKP {year}. Pastikan sesi e-Kinerja aktif (tab Connector), lalu klik Ambil dari e-Kinerja.
        </p>
      )}
      {list.map((skp) => {
        const rhk = targetsForSkp(targets, skp.id);
        return (
          <section key={skp.id} className="grid grid-cols-1 gap-2 rounded-lg border p-3">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
              {skpPeriodLabel(skp)}
              <Badge variant="secondary">{skp.status}</Badge>
            </p>
            {rhk.length === 0 ? (
              <p className="text-xs text-muted-foreground">RHK belum diambil.</p>
            ) : (
              <ol className="grid grid-cols-1 gap-1.5">
                {rhk.map((t, i) => (
                  <li key={t.id} className="rounded-md bg-muted/40 px-2.5 py-1.5 text-sm">
                    <span className="mr-1 text-xs font-bold text-muted-foreground">{i + 1}.</span>
                    {t.section === "TAMBAHAN" && (
                      <Badge variant="outline" className="mr-1">
                        Tambahan
                      </Badge>
                    )}
                    {t.name}
                    {t.stale && <span className="text-xs text-warning"> (tidak ada lagi di SKP)</span>}
                    {!!t.indicators?.length && (
                      <span className="block text-xs text-muted-foreground">
                        {t.indicators.map((x) => `${x.aspect.toLowerCase()}: ${x.target}`).join(" · ")}
                      </span>
                    )}
                    {t.leader && (
                      <span className="mt-1 block border-l-2 border-module/40 pl-2 text-xs text-muted-foreground">
                        <span className="font-semibold">RHK pimpinan yang diintervensi:</span> {t.leader}
                        {t.leaderIndicator && <span className="block italic">Indikator: {t.leaderIndicator}</span>}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </SectionCard>
  );
}

/** RHK manual satu tahun — dipakai bila SKP tahun itu belum bisa diambil robot. */
function TargetsCard({ year, entries }: { year: number; entries: ActionPlanEntry[] }) {
  const { items: targets, upsert, remove } = useSkpTargets();
  const list = targetsForYear(targets, year);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<SkpTarget | null>(null);
  const [deleting, setDeleting] = useState<SkpTarget | null>(null);
  const used = (t: SkpTarget) => entries.filter((e) => e.targetId === t.id).length;

  const add = () => {
    const value = name.trim();
    if (!value) return;
    if (list.some((t) => t.name.toLowerCase() === value.toLowerCase())) return toast.error("RHK itu sudah ada.");
    upsert({ id: generateId("rhk"), year, name: value, order: list.length + 1 });
    setName("");
  };

  return (
    <SectionCard
      icon={Target}
      title={`RHK manual ${year}`}
      description="Cadangan bila SKP belum bisa diambil dari e-Kinerja — tulis sama persis dengan SKP."
      contentClassName="flex flex-col gap-3"
    >
      {list.length === 0 && <p className="text-sm text-muted-foreground">Belum ada RHK {year}.</p>}
      <ol className="grid grid-cols-1 gap-1.5">
        {list.map((t, i) => (
          <li key={t.id} className="group flex items-start gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm">
            <span className="text-xs font-bold text-muted-foreground">{i + 1}.</span>
            <span className="min-w-0 flex-1">{t.name}</span>
            <span className="flex shrink-0 gap-0.5 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100">
              <Button variant="ghost" size="icon-xs" title="Ubah" onClick={() => setRenaming(t)}>
                <PencilLine />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                title="Hapus"
                className="hover:text-destructive"
                onClick={() =>
                  used(t)
                    ? toast.error(`RHK masih dipakai ${used(t)} rencana aksi — ubah pemetaannya dulu.`)
                    : setDeleting(t)
                }
              >
                <Trash2 />
              </Button>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Input
          placeholder={`RHK ${year} baru`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
        />
        <Button size="sm" onClick={add} disabled={!name.trim()}>
          <Plus /> Tambah
        </Button>
      </div>
      <RenameDialog
        open={!!renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
        title="Ubah RHK"
        label="Nama RHK"
        initialValue={renaming?.name ?? ""}
        onSave={(value) => renaming && upsert({ ...renaming, name: value.trim() || renaming.name })}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus RHK?"
        itemName={deleting?.name}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting) remove(deleting.id);
          setDeleting(null);
        }}
      />
    </SectionCard>
  );
}
