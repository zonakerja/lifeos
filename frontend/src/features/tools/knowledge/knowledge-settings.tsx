import {
  BookOpenCheck,
  CircleAlert,
  DatabaseZap,
  FolderOpen,
  FolderPlus,
  FolderSync,
  Info,
  Network,
  RefreshCw,
  Save,
  Settings2,
  ShieldAlert,
  Trash2,
  Unplug,
  UserRoundCog,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAiProfile, useSaveAiProfile } from "@/data/use-ai-chat";
import {
  useKnowledgeExport,
  useKnowledgeExportMutations,
  useKnowledgeFolders,
  useKnowledgeMutations,
  useKnowledgeStatus,
} from "@/data/use-knowledge";
import { errorMessage } from "@/lib/api/client";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { KnowledgeExportKind, KnowledgeStatus } from "@/types/api";

const MAX_PROFILE = 6000;

/**
 * Tools → Basis Pengetahuan = **pengaturan** (sekali atur): profil kerja & instruksi tetap, vault Obsidian, cermin hasil
 * kerja LifeOS ke vault (80-LifeOS), dan cara memakai. Bekerja dengan isi vault (daftar catatan, sunting, graf,
 * kesehatan) ada di menu Pengetahuan. Rencana & keputusan: docs/AI-AGENT.md §10, §14, §25.
 */
export function KnowledgeSettings() {
  const { data: status, isLoading } = useKnowledgeStatus();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <ProfileCard />
      {isLoading || !status ? <Skeleton className="h-48 rounded-xl" /> : <VaultCard status={status} />}
      {status?.folder && <MirrorCard />}
      <GuideCard />
    </div>
  );
}

// ---------------------------------------------------------------- Profil kerja

function ProfileCard() {
  const { data, isLoading } = useAiProfile();
  return (
    <SectionCard
      icon={UserRoundCog}
      title="Profil kerja & instruksi tetap"
      description="Selalu ikut di setiap chat AI (chatbot LifeOS & My Notebook) — tulis sekali, tidak perlu diulang."
    >
      {isLoading || !data ? <Skeleton className="h-32 rounded-lg" /> : <ProfileForm initial={data.profile ?? ""} />}
    </SectionCard>
  );
}

function ProfileForm({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const save = useSaveAiProfile();
  const dirty = value.trim() !== initial.trim();
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, MAX_PROFILE))}
        rows={7}
        placeholder={
          "Contoh:\n- Jabatan: Analis Pengelolaan BMN, Bagian Perlengkapan, Biro Umum\n- Tugas: PSP, penghapusan, pemanfaatan BMN satker\n- Singkatan: PSP = Penetapan Status Penggunaan; KSP = Kerja Sama Pemanfaatan\n- Gaya: bahasa dinas, ringkas, selalu sebut dasar hukum"
        }
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {value.length.toLocaleString("id-ID")} / {MAX_PROFILE.toLocaleString("id-ID")}
        </span>
        <Button
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() =>
            save.mutate(value.trim() || null, {
              onSuccess: () => toast.success("Profil kerja disimpan."),
              onError: (error) => toast.error("Gagal menyimpan", { description: errorMessage(error) }),
            })
          }
        >
          <Save /> Simpan
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Vault Obsidian

function VaultCard({ status }: { status: KnowledgeStatus }) {
  const { setVault, scan } = useKnowledgeMutations();
  const [confirmRelease, setConfirmRelease] = useState(false);
  const onError = (error: unknown) => toast.error("Gagal", { description: errorMessage(error) });

  if (!status.configured) {
    return (
      <SectionCard
        icon={Network}
        title="Vault Obsidian"
        description="Sumber basis pengetahuan yang Anda tulis di Obsidian."
      >
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          Konektor Obsidian belum diatur di server (variabel <code>KNOWLEDGE_VAULTS_DIR</code>). Hubungi admin aplikasi.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={Network}
      title="Vault Obsidian"
      description="Catatan Markdown (+ PDF/DOCX di dalamnya) dibaca otomatis setiap berubah, lalu diindeks sebagai pengetahuan."
      action={
        status.folder && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={scan.isPending || status.scanning}
              onClick={() => scan.mutate(undefined, { onSuccess: () => toast.success("Vault dipindai."), onError })}
            >
              <RefreshCw className={cn((scan.isPending || status.scanning) && "animate-spin")} /> Pindai
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmRelease(true)}>
              <Unplug /> Lepas
            </Button>
          </div>
        )
      }
    >
      {status.folder ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Folder vault" value={status.folder} mono />
            <Stat label="Catatan" value={status.notes.toLocaleString("id-ID")} />
            <Stat label="Berkas" value={status.files.toLocaleString("id-ID")} />
            <Stat label="Tautan" value={status.links.toLocaleString("id-ID")} />
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className={cn("size-2 rounded-full", status.watching ? "bg-success" : "bg-muted-foreground")} />
              {status.scanning ? "Sedang memindai…" : status.watching ? "Dipantau otomatis" : "Tidak dipantau"}
            </span>
            {status.lastScanAt && <span>Pindai terakhir: {formatDateTime(status.lastScanAt)}</span>}
            {!status.folderExists && <span className="text-destructive">Folder tidak ditemukan di server</span>}
          </p>
          {status.lastError && (
            <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {status.lastError}
            </p>
          )}
          <WorkspaceLinks status={status} />
        </div>
      ) : (
        <VaultPicker />
      )}
      <ConfirmDialog
        open={confirmRelease}
        onOpenChange={setConfirmRelease}
        title="Lepas vault Obsidian?"
        description="Catatan & indeks pengetahuan dari vault ini dihapus dari LifeOS. Berkas di folder vault (dan di Obsidian) tidak disentuh — bisa dipilih lagi kapan saja."
        confirmLabel="Lepas vault"
        onConfirm={() => setVault.mutate(null, { onSuccess: () => toast.success("Vault dilepas."), onError })}
      />
    </SectionCard>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border bg-muted/30 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("truncate text-sm font-semibold", mono && "font-mono")} title={value}>
        {value}
      </p>
    </div>
  );
}

/** Pintasan ke menu Pengetahuan (tempat bekerja dengan isi vault) + ringkasan hal yang perlu dirapikan. */
function WorkspaceLinks({ status }: { status: KnowledgeStatus }) {
  const issues = status.problems.length + status.unresolvedLinks.length;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2">
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        Jelajahi, sunting, cari, dan lihat graf catatan di menu <strong>Pengetahuan</strong>.
        {issues > 0 && (
          <span className="ml-1 text-warning">
            {status.problems.length > 0 && `${status.problems.length} catatan perlu dirapikan`}
            {status.problems.length > 0 && status.unresolvedLinks.length > 0 && " · "}
            {status.unresolvedLinks.length > 0 && `${status.unresolvedLinks.length} tautan rusak`}
          </span>
        )}
      </p>
      <Button asChild size="sm" variant="outline">
        <Link to="/knowledge/notes">
          <BookOpenCheck /> Buka Pengetahuan
        </Link>
      </Button>
      {issues > 0 && (
        <Button asChild size="sm" variant="ghost">
          <Link to="/knowledge/health">
            <CircleAlert /> Kesehatan
          </Link>
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Cermin LifeOS → Obsidian

const EXPORT_KIND_INFO: { kind: KnowledgeExportKind; label: string; detail: string }[] = [
  { kind: "notes", label: "Catatan Bebas", detail: "Teks catatan (tulisan tangan: hasil Ubah ke teks)" },
  { kind: "lists", label: "List Bebas", detail: "Checklist beserta progres" },
  { kind: "aiNotes", label: "Notes AI", detail: "Ringkasan AI, catatan kasar, transkrip" },
  { kind: "notebooks", label: "My Notebook", detail: "Ringkasan, sumber, catatan Studio, riwayat chat" },
  {
    kind: "productivity",
    label: "Productivity",
    detail: "Project + Action, Area + strukturnya, Agenda yang punya hasil, Resource Global",
  },
];

function MirrorCard() {
  const { data, isLoading } = useKnowledgeExport(true);
  const { update, run, clear } = useKnowledgeExportMutations();
  const [confirmClear, setConfirmClear] = useState(false);
  const onError = (error: unknown) => toast.error("Gagal", { description: errorMessage(error) });
  const busy = !!data?.running || run.isPending;

  return (
    <SectionCard
      icon={FolderSync}
      title="Cermin hasil kerja ke Obsidian"
      description="Salinan otomatis satu arah (LifeOS → vault) di folder 80-LifeOS: catatan, My Notebook, dan hasil Productivity tampil di Obsidian & graf, saling bertaut."
      action={
        data && (
          <Switch
            checked={data.enabled}
            disabled={update.isPending}
            aria-label="Nyalakan cermin"
            onCheckedChange={(enabled) =>
              update.mutate(
                { enabled },
                {
                  onSuccess: () =>
                    toast.success(enabled ? "Cermin dinyalakan — menyalin data ke vault…" : "Cermin dimatikan."),
                  onError,
                },
              )
            }
          />
        )
      }
    >
      {isLoading || !data ? (
        <Skeleton className="h-32 rounded-lg" />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {EXPORT_KIND_INFO.map((info) => (
              <label
                key={info.kind}
                className={cn(
                  "flex min-w-0 cursor-pointer items-start gap-2 rounded-xl border p-2.5",
                  !data.enabled && "opacity-60",
                )}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={data.kinds[info.kind]}
                  disabled={!data.enabled || update.isPending}
                  onCheckedChange={(checked) =>
                    update.mutate({ kinds: { [info.kind]: checked === true } }, { onError })
                  }
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{info.label}</span>
                  <span className="block text-xs text-muted-foreground">{info.detail}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!data.enabled || busy}
              onClick={() =>
                run.mutate(undefined, {
                  onSuccess: (result) =>
                    toast.success("Cermin diperbarui.", {
                      description: `${result.files ?? 0} berkas · ${result.written ?? 0} ditulis · ${result.removed ?? 0} dihapus`,
                    }),
                  onError,
                })
              }
            >
              <RefreshCw className={cn(busy && "animate-spin")} /> Sinkronkan sekarang
            </Button>
            <Button size="sm" variant="ghost" disabled={busy || clear.isPending} onClick={() => setConfirmClear(true)}>
              <Trash2 /> Hapus berkas cermin
            </Button>
            <span className="text-xs text-muted-foreground">
              {busy
                ? "Sedang menyalin…"
                : data.lastRunAt
                  ? `Terakhir: ${formatDateTime(data.lastRunAt)} · ${data.files ?? 0} berkas`
                  : data.enabled
                    ? "Belum pernah disinkronkan."
                    : "Nonaktif."}
            </span>
          </div>
          {data.lastError && (
            <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {data.lastError}
            </p>
          )}
          <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
            <li>
              Diperbarui otomatis ± 1 menit setelah data berubah. Berkas di <code>80-LifeOS</code>{" "}
              <strong>ditimpa</strong> setiap sinkron — sunting di LifeOS; tulis catatan Anda sendiri di folder lain
              lalu tautkan ke sini dengan <code>[[…]]</code>.
            </li>
            <li>
              Hanya data milik Anda (bukan item yang dibagikan orang lain). Berkas lampiran tidak disalin — cukup nama
              dan tautan “Buka di LifeOS”.
            </li>
            <li>
              Folder ini tidak diindeks ulang sebagai pengetahuan (datanya sudah diindeks sebagai data kerja), jadi
              jawaban AI tidak ganda.
            </li>
          </ul>
        </div>
      )}
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Hapus berkas cermin?"
        description="Semua berkas buatan LifeOS di folder 80-LifeOS dihapus dari vault (catatan Anda sendiri di folder itu tidak disentuh). Data di LifeOS tetap utuh; bila cermin masih menyala, berkas dibuat lagi saat data berubah."
        confirmLabel="Hapus berkas"
        onConfirm={() => clear.mutate(undefined, { onSuccess: () => toast.success("Berkas cermin dihapus."), onError })}
      />
    </SectionCard>
  );
}

function VaultPicker() {
  const { data: folders = [], isLoading } = useKnowledgeFolders(true);
  const { setVault, createVault } = useKnowledgeMutations();
  const [selected, setSelected] = useState("");
  const [newName, setNewName] = useState("Pengetahuan-BMN");
  const onError = (error: unknown) => toast.error("Gagal", { description: errorMessage(error) });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2 rounded-xl border p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <FolderOpen className="size-4 text-module" /> Pakai folder yang sudah ada
        </p>
        <p className="text-xs text-muted-foreground">
          Folder vault yang sudah ada di server (mis. hasil sinkron Syncthing).
        </p>
        {isLoading ? (
          <Skeleton className="h-9" />
        ) : folders.length ? (
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih folder vault" />
            </SelectTrigger>
            <SelectContent>
              {folders.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-xs text-muted-foreground italic">Belum ada folder di server.</p>
        )}
        <Button
          size="sm"
          className="self-start"
          disabled={!selected || setVault.isPending}
          onClick={() => setVault.mutate(selected, { onSuccess: () => toast.success("Vault dipakai."), onError })}
        >
          Pakai folder ini
        </Button>
      </div>
      <div className="flex flex-col gap-2 rounded-xl border p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <FolderPlus className="size-4 text-module" /> Buat vault baru dari templat
        </p>
        <p className="text-xs text-muted-foreground">
          Berisi struktur folder (Peraturan, Topik, Praktik, FAQ, Persyaratan, Gaya Surat) dan templat catatan.
        </p>
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nama folder vault" />
        <Button
          size="sm"
          className="self-start"
          disabled={!newName.trim() || createVault.isPending}
          onClick={() =>
            createVault.mutate(newName.trim(), {
              onSuccess: () => toast.success("Vault dibuat dari templat."),
              onError,
            })
          }
        >
          Buat vault
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Cara memakai

function GuideCard() {
  return (
    <SectionCard
      icon={Info}
      title="Cara memakai"
      description="Langkah singkat membangun basis pengetahuan dengan Obsidian."
    >
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
        <li>
          Pasang <strong>Obsidian</strong> (gratis, juga untuk kerja) di laptop/HP, lalu <em>Open folder as vault</em> →
          folder vault Anda. Di server produksi, folder vault disinkronkan dengan <strong>Syncthing</strong>.
        </li>
        <li>
          Tulis satu catatan per hal (peraturan, pasal, topik, FAQ, kasus lapangan). Pakai templat di folder{" "}
          <code>90-Templat</code> agar properti <code>jenis</code>, <code>status</code>, <code>publik</code> terisi.
        </li>
        <li>
          Hubungkan catatan dengan <code>[[Nama Catatan]]</code> — saat menjawab, AI ikut membaca catatan yang tertaut.
        </li>
        <li>
          Peraturan yang dicabut: ubah <code>status: dicabut</code> (jangan dihapus) — AI tidak lagi memakainya.
        </li>
        <li>
          Tanyakan di chatbot LifeOS (tombol robot kanan bawah). Jawaban bagus bisa disimpan ke <code>00-Inbox</code>{" "}
          untuk Anda kurasi menjadi catatan tetap.
        </li>
      </ol>
      <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        Isi pengetahuan & data kerja dikirim ke penyedia AI (embedding Gemini/OpenAI & provider chat). Untuk data kantor
        bila memakai Gemini, pakai API key berbayar (billing Google Cloud aktif): pada kuota gratis Gemini, Google boleh
        memakai data untuk meningkatkan produk dan reviewer manusia dapat membacanya.
      </p>
      <Link
        to="/tools/index"
        className="mt-2 flex w-fit items-center gap-1 text-xs font-medium text-info underline-offset-2 hover:underline"
      >
        <DatabaseZap className="size-3.5" /> Mesin indeks (nyala/mati, indeks ulang, uji pencarian): Tools → Indeks
        Pengetahuan
      </Link>
      <Link
        to="/settings/api"
        className="mt-1 flex w-fit items-center gap-1 text-xs font-medium text-info underline-offset-2 hover:underline"
      >
        <Settings2 className="size-3.5" /> API key, provider embedding & pembagian tugas AI: Pengaturan → Model AI
      </Link>
    </SectionCard>
  );
}
