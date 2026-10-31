import { ClipboardList, Link2, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useActionPlanEntries, useActionPlanMonths, useResources, useSkps, useSkpTargets } from "@/data/collections";
import { useOpenSession } from "@/hooks/use-retained";
import { useToday } from "@/hooks/use-today";
import { errorMessage } from "@/lib/api/client";
import { publicLinksApi, uploadsApi, vaultsApi } from "@/lib/api/endpoints";
import { untrackPendingUpload } from "@/lib/pending-uploads";
import { useVault } from "@/data/use-vaults";
import { type VaultChoice, VaultFilePicker } from "@/features/vault/vault-file-picker";
import { vaultUrl } from "@/features/vault/vault-utils";
import { generateId } from "@/lib/ids";
import { toExternalHref } from "@/lib/urls";
import type { ActionPlanEntry, ActionPlanSourceType, AttachedResource } from "@/types/entities";
import {
  DEFAULT_TIME_REALIZATION,
  defaultDescription,
  defaultPeriod,
  documentOptions,
  entriesOfSource,
  entryIndicators,
  entryStatus,
  isLockedMonth,
  isTimeIndicator,
  monthOf,
  isPeriod,
  missingFields,
  periodLabel,
  periodYear,
  skpPeriodLabel,
  STATUS_LABELS,
  targetOptions,
} from "../lib/action-plan";

/** Item Productivity yang dikirim ke renaksi (Action/Task, Kegiatan, Agenda). */
export interface ActionPlanSource {
  type: ActionPlanSourceType;
  id: string;
  title: string;
  description?: string;
  /** Tanggal kandidat bulan, urut prioritas (mis. tanggal selesai, tenggat) */
  dates: (string | undefined)[];
  resources?: AttachedResource[];
}

const MANUAL = "__manual";
/** Brankas digital: beberapa berkas di balik satu tautan publik untuk satu poin renaksi */
const VAULT = "__vault";
const nowIso = () => new Date().toISOString();

export const STATUS_STYLE: Record<ActionPlanEntry["status"], string> = {
  draft: "bg-warning/15 text-warning",
  ready: "bg-info/15 text-info",
  filled: "bg-success/15 text-success",
};

/** Tombol "Renaksi" di baris item: membuka dialog + penanda berapa bulan item ini sudah masuk renaksi. */
export function ActionPlanButton({ source }: { source: ActionPlanSource }) {
  const [open, setOpen] = useState(false);
  const { items } = useActionPlanEntries();
  const count = entriesOfSource(items, source.id).length;
  return (
    <>
      <Button
        variant="ghost"
        size={count ? "sm" : "icon-sm"}
        title={count ? `Sudah di renaksi (${count} bulan) — tambah/ubah` : "Kirim ke Renaksi e-Kinerja"}
        className={count ? "h-7 gap-1 px-1.5 text-success" : undefined}
        onClick={() => setOpen(true)}
      >
        <ClipboardList />
        {count > 0 && <span className="text-xs font-bold">{count}</span>}
      </Button>
      <ActionPlanDialog open={open} onClose={() => setOpen(false)} source={source} />
    </>
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Entri baru dari item Productivity */
  source?: ActionPlanSource;
  /** Ubah entri yang sudah ada */
  entry?: ActionPlanEntry;
}

export function ActionPlanDialog({ open, onClose, source, entry }: DialogProps) {
  const session = useOpenSession(open);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="grid-cols-1 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="size-5 text-module" /> {entry ? "Ubah rencana aksi" : "Kirim ke Renaksi"}
          </DialogTitle>
          <DialogDescription>
            Anda yang menentukan isi renaksi bulanan e-Kinerja: bulan, RHK & indikator, rencana aksi, realisasi, dan
            bukti data dukung. Robot hanya mengisikan entri yang sudah lengkap — sebagai draf, tanpa mengirim.
          </DialogDescription>
        </DialogHeader>
        {open && <ActionPlanForm key={session} source={source} entry={entry} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ActionPlanForm({
  source,
  entry,
  onDone,
}: {
  source?: ActionPlanSource;
  entry?: ActionPlanEntry;
  onDone: () => void;
}) {
  const today = useToday();
  const { items: entries, upsert } = useActionPlanEntries();
  const { items: targets, upsert: upsertTarget } = useSkpTargets();
  const { items: skps } = useSkps();
  const { items: resources } = useResources();
  const options = documentOptions(source?.resources, resources);

  const [period, setPeriod] = useState(() => entry?.period ?? defaultPeriod(source?.dates ?? [], today));
  const [skpId, setSkpId] = useState(entry?.skpId ?? "");
  const [targetId, setTargetId] = useState(entry?.targetId ?? "");
  const [description, setDescription] = useState(
    () => entry?.description ?? defaultDescription(source?.title ?? "", source?.description),
  );
  const [realization, setRealization] = useState(entry?.realization ?? "");
  const [timeRealization, setTimeRealization] = useState(entry?.timeRealization ?? DEFAULT_TIME_REALIZATION);
  const [indicators, setIndicators] = useState<string[] | undefined>(entry?.indicators);
  const fileOptions = options.filter((o) => o.kind === "file" && o.uploadId);
  const [docChoice, setDocChoice] = useState(() =>
    entry?.vaultId
      ? VAULT
      : entry
        ? MANUAL
        : fileOptions.length
          ? VAULT
          : (options.find((o) => o.kind === "url")?.id ?? MANUAL),
  );
  const vault = useVault(entry?.vaultId);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [uploaded, setUploaded] = useState<VaultChoice[]>([]);
  const vaultChoices = [
    ...fileOptions.map((o) => ({ id: o.uploadId!, name: o.label })),
    ...(vault.data?.files ?? []),
    ...uploaded,
  ].filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i);
  // Bawaan: isi brankas yang sudah ada, atau semua lampiran berkas item
  const vaultSelected =
    picked ?? (entry?.vaultId ? (vault.data?.files.map((f) => f.id) ?? []) : fileOptions.map((o) => o.uploadId!));
  const toggleVaultFile = (id: string, on: boolean) =>
    setPicked(on ? [...new Set([...vaultSelected, id])] : vaultSelected.filter((x) => x !== id));
  const [manualUrl, setManualUrl] = useState(entry?.documentUrl ?? "");
  const [newTarget, setNewTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { items: months } = useActionPlanMonths();
  // Bulan yang sudah diajukan / dinilai di e-Kinerja: entri yang ada tidak boleh diubah (data harus sama dengan e-Kinerja)
  const locked = !!entry && isLockedMonth(monthOf(months, entry.period, entry.skpId));

  const year = isPeriod(period) ? periodYear(period) : today.getFullYear();
  // Bulan → SKP yang berlaku (bisa dua bila SKP dipecah di tengah bulan) → RHK-nya; tanpa SKP tersinkron → RHK manual
  const plan = targetOptions(skps, targets, period, skpId);
  const yearTargets = plan.targets;
  const validTarget = yearTargets.some((t) => t.id === targetId) ? targetId : "";
  const previous = source ? entriesOfSource(entries, source.id).filter((e) => e.id !== entry?.id) : [];
  const sameMonth = previous.find((e) => e.period === period);
  const chosenTarget = yearTargets.find((t) => t.id === validTarget);
  const allIndicators = chosenTarget?.indicators ?? [];
  const selected = entryIndicators({ indicators }, chosenTarget);
  const showRealization = !allIndicators.length || selected.some((i) => !isTimeIndicator(i));
  const showTime = selected.some(isTimeIndicator);
  const toggleIndicator = (name: string, on: boolean) => {
    const current = selected.map((i) => i.indicator);
    const next = on ? [...new Set([...current, name])] : current.filter((n) => n !== name);
    if (!next.length) return toast.error("Pilih minimal satu indikator.");
    // Semua dicentang = disimpan kosong (ikut indikator RHK bila SKP diperbarui)
    setIndicators(next.length === allIndicators.length ? undefined : next);
  };

  const addTarget = () => {
    const name = newTarget?.trim();
    if (!name) return;
    const target = { id: generateId("rhk"), year, name, order: yearTargets.length + 1 };
    upsertTarget(target);
    setTargetId(target.id);
    setNewTarget(null);
  };

  /** Bukti data dukung → { tautan, brankas }. Brankas yang sudah ada diperbarui isinya; tautannya tetap. */
  const resolveDocument = async (entryId: string): Promise<{ url: string; vaultId?: string }> => {
    if (docChoice === VAULT) {
      if (!vaultSelected.length) throw new Error("Pilih minimal satu berkas untuk brankas digital.");
      const title = `Renaksi ${periodLabel(period)} — ${description.trim().slice(0, 200) || source?.title || "Bukti data dukung"}`;
      if (entry?.vaultId && entry.documentUrl) {
        await vaultsApi.update(entry.vaultId, { title, assetIds: vaultSelected });
        return { url: entry.documentUrl, vaultId: entry.vaultId };
      }
      const created = await vaultsApi.create({ title, entryId, assetIds: vaultSelected });
      return { url: vaultUrl(created.path!), vaultId: created.id };
    }
    if (docChoice === MANUAL) return { url: toExternalHref(manualUrl) ?? "" };
    const option = options.find((o) => o.id === docChoice);
    if (!option) return { url: "" };
    if (option.kind === "url") return { url: option.url ?? "" };
    // Berkas LifeOS → tautan publik baca-saja tanpa kedaluwarsa (bisa dicabut dari pratinjau berkas)
    const link = await publicLinksApi.create(option.uploadId!, { days: null, label: `Renaksi ${periodLabel(period)}` });
    return { url: `${window.location.origin}${link.path}` };
  };

  /** Batal: berkas yang baru diunggah ke brankas tetapi tidak jadi disimpan dibuang. */
  const cancel = () => {
    for (const file of uploaded) {
      untrackPendingUpload(file.id);
      void uploadsApi.remove(file.id).catch(() => undefined);
    }
    onDone();
  };

  const save = async () => {
    if (!isPeriod(period)) return toast.error("Pilih bulan rencana aksi.");
    if (manualUrl.trim() && docChoice === MANUAL && !toExternalHref(manualUrl.trim())) {
      return toast.error("Bukti data dukung harus alamat http/https.");
    }
    setSaving(true);
    try {
      const id = entry?.id ?? generateId("renaksi");
      const resolved = await resolveDocument(id);
      const documentUrl = resolved.url;
      for (const file of uploaded) untrackPendingUpload(file.id);
      // Brankas lama yang tidak dipakai lagi (bukti diganti ke link lain) dihapus agar tautannya tidak lagi berlaku
      if (entry?.vaultId && resolved.vaultId !== entry.vaultId)
        void vaultsApi.remove(entry.vaultId).catch(() => undefined);
      const next: ActionPlanEntry = {
        ...(entry ?? {
          id,
          sourceType: source?.type,
          sourceId: source?.id,
          sourceTitle: source?.title,
          createdAt: nowIso(),
        }),
        period,
        skpId: plan.skp?.id,
        targetId: validTarget || undefined,
        description: description.trim(),
        realization: realization.trim() || undefined,
        timeRealization: showTime ? timeRealization.trim() || DEFAULT_TIME_REALIZATION : undefined,
        indicators: chosenTarget && indicators?.length ? indicators : undefined,
        documentUrl: documentUrl || undefined,
        vaultId: resolved.vaultId,
        status: "draft",
      };
      // Entri yang pernah terkirim (punya pengenal perubahan) tetap "terisi"; perubahan isinya dikenali dari tanda tangan
      // (status tampilan "Berubah") lalu dikirim ulang lewat "Kirim perubahan ke e-Kinerja"
      if (entry?.pushedSignature) {
        next.status = "filled";
        upsert(next);
        toast.success("Perubahan tersimpan — kirim ulang ke e-Kinerja dari Laporan Kinerja.");
        onDone();
        return;
      }
      // Entri lama yang terisi tanpa pengenal tetap "terisi" selama isinya sama
      const same =
        entry?.status === "filled" &&
        (["period", "targetId", "description", "realization", "timeRealization", "documentUrl"] as const).every(
          (k) => (entry[k] ?? "") === (next[k] ?? ""),
        ) &&
        (entry.indicators ?? []).join("|") === (next.indicators ?? []).join("|");
      next.status = same ? "filled" : entryStatus({ ...next, status: "draft" }, chosenTarget);
      upsert(next);
      const missing = missingFields(next, chosenTarget);
      if (missing.length) toast.warning(`Tersimpan, tetapi belum lengkap: ${missing.join(", ")}.`);
      else toast.success(`Masuk renaksi ${periodLabel(period)}.`);
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
      setSaving(false);
    }
  };

  return (
    <>
      <FieldGroup className="grid grid-cols-1 gap-4">
        {entry?.status === "filled" && (
          <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
            Sudah terisi di e-Kinerja. Butir di e-Kinerja tidak bisa diubah: bila isi entri ini diubah lalu diisikan
            lagi, robot menambah butir baru (butir lama dihapus lewat Edit Rencana Aksi Kerja di e-Kinerja).
          </p>
        )}
        {source && (
          <p className="truncate rounded-md bg-muted/50 px-3 py-2 text-sm">
            Dari: <strong>{source.title}</strong>
          </p>
        )}
        {previous.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Sudah masuk renaksi: {previous.map((e) => periodLabel(e.period)).join(", ")}
          </p>
        )}
        <Field>
          <FieldLabel htmlFor="renaksi-period">Bulan</FieldLabel>
          <Input
            id="renaksi-period"
            type="month"
            value={period}
            disabled={!!entry?.pushedSignature}
            onChange={(e) => setPeriod(e.target.value)}
          />
          {entry?.pushedSignature && (
            <FieldDescription>
              Sudah terkirim ke e-Kinerja — bulan tidak bisa dipindah (hapus lalu buat entri baru).
            </FieldDescription>
          )}
          {sameMonth && (
            <FieldDescription className="text-warning">
              Item ini sudah ada di renaksi {periodLabel(period)} — entri baru akan menjadi baris tambahan.
            </FieldDescription>
          )}
        </Field>
        {plan.candidates.length > 1 && (
          <Field>
            <FieldLabel>SKP</FieldLabel>
            <Select value={plan.skp?.id ?? ""} onValueChange={setSkpId}>
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder="Bulan ini mencakup dua SKP — pilih salah satu" />
              </SelectTrigger>
              <SelectContent>
                {plan.candidates.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {skpPeriodLabel(s)} · {s.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field>
          <FieldLabel>RHK (Rencana Hasil Kerja) {plan.skp ? `· SKP ${skpPeriodLabel(plan.skp)}` : year}</FieldLabel>
          {plan.skp && yearTargets.length === 0 && (
            <FieldDescription className="text-warning">
              RHK SKP ini belum diambil — buka tab Laporan Kinerja → Ambil dari e-Kinerja.
            </FieldDescription>
          )}
          {yearTargets.length > 0 && (
            <Select
              value={validTarget}
              onValueChange={(v) => {
                setTargetId(v);
                setIndicators(undefined);
              }}
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder="Pilih RHK" />
              </SelectTrigger>
              <SelectContent>
                {yearTargets.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.section === "TAMBAHAN" ? "[Tambahan] " : ""}
                    {t.name}
                    {t.stale ? " (tidak ada lagi di SKP)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {chosenTarget?.leader && (
            <FieldDescription>RHK pimpinan yang diintervensi: {chosenTarget.leader}</FieldDescription>
          )}
          {plan.candidates.length > 0 ? null : newTarget === null ? (
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setNewTarget("")}>
              <Plus /> {yearTargets.length ? "RHK baru" : `Tambah RHK ${year}`}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input
                autoFocus
                placeholder="Tulis RHK persis seperti di SKP e-Kinerja"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTarget())}
              />
              <Button type="button" size="sm" onClick={addTarget} disabled={!newTarget.trim()}>
                Tambah
              </Button>
            </div>
          )}
        </Field>
        {allIndicators.length > 0 && (
          <Field>
            <FieldLabel>Indikator yang dicentang di e-Kinerja</FieldLabel>
            <div className="grid grid-cols-1 gap-1.5">
              {allIndicators.map((i) => (
                <label
                  key={i.indicator}
                  className="flex items-start gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.some((x) => x.indicator === i.indicator)}
                    onCheckedChange={(v) => toggleIndicator(i.indicator, v === true)}
                  />
                  <span className="min-w-0">
                    {i.indicator}
                    <span className="block text-xs text-muted-foreground">
                      {i.aspect} · Target {i.target}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="renaksi-desc">Rencana aksi</FieldLabel>
          <Textarea
            id="renaksi-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Rencana aksi yang akan dilakukan (butir Renaksi di e-Kinerja)"
          />
        </Field>
        {showRealization && (
          <Field>
            <FieldLabel htmlFor="renaksi-real">Realisasi</FieldLabel>
            <Textarea
              id="renaksi-real"
              rows={2}
              value={realization}
              onChange={(e) => setRealization(e.target.value)}
              placeholder="Hasil yang dicapai, mis. Laporan hasil rapat BMN bulan Oktober 2026"
            />
          </Field>
        )}
        {showTime && (
          <Field>
            <FieldLabel htmlFor="renaksi-time">Realisasi indikator waktu</FieldLabel>
            <Input id="renaksi-time" value={timeRealization} onChange={(e) => setTimeRealization(e.target.value)} />
          </Field>
        )}
        <Field>
          <FieldLabel>Bukti data dukung</FieldLabel>
          <Select value={docChoice} onValueChange={setDocChoice}>
            <SelectTrigger className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={VAULT}>Brankas digital (beberapa berkas, satu tautan)</SelectItem>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.kind === "file" ? "Berkas: " : "Link: "}
                  {o.label}
                </SelectItem>
              ))}
              <SelectItem value={MANUAL}>Ketik link sendiri</SelectItem>
            </SelectContent>
          </Select>
          {docChoice === VAULT ? (
            <VaultFilePicker
              choices={vaultChoices}
              selected={vaultSelected}
              onToggle={toggleVaultFile}
              onUploaded={(file) => {
                setUploaded((prev) => [...prev, file]);
                setPicked((prev) => [...(prev ?? vaultSelected), file.id]);
              }}
            />
          ) : docChoice === MANUAL ? (
            <Input
              placeholder="https://…"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              aria-label="Bukti data dukung"
            />
          ) : (
            options.find((o) => o.id === docChoice)?.kind === "file" && (
              <FieldDescription className="flex items-center gap-1">
                <Link2 className="size-3.5" /> Saat disimpan dibuatkan tautan publik baca-saja untuk berkas ini (bisa
                dicabut dari pratinjau berkas).
              </FieldDescription>
            )
          )}
        </Field>
      </FieldGroup>
      {locked && (
        <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">
          Bulan ini sudah dikirim ke atasan di e-Kinerja — isian terkunci agar sama dengan e-Kinerja.
        </p>
      )}
      <DialogFooter>
        {entry && <Badge className={STATUS_STYLE[entry.status]}>{STATUS_LABELS[entry.status]}</Badge>}
        <Button variant="outline" onClick={cancel} disabled={saving}>
          Batal
        </Button>
        <Button onClick={() => void save()} disabled={saving || locked}>
          {saving ? <Loader2 className="animate-spin" /> : <ClipboardList />} Simpan ke renaksi
        </Button>
      </DialogFooter>
    </>
  );
}
