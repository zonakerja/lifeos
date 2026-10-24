import {
  BookOpenCheck,
  CircleAlert,
  FolderOpen,
  FolderPlus,
  Info,
  Link2Off,
  Network,
  RefreshCw,
  Save,
  ShieldAlert,
  Unplug,
  UserRoundCog,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PaginationControl } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAiProfile, useSaveAiProfile } from "@/data/use-ai-chat";
import {
  useKnowledgeFolders,
  useKnowledgeMutations,
  useKnowledgeNotes,
  useKnowledgeStatus,
} from "@/data/use-knowledge";
import { openKnowledgeNote } from "@/features/knowledge/knowledge-note-dialog";
import { filterKnowledgeNotes, STATUS_LABEL, STATUS_TONE } from "@/features/knowledge/knowledge-utils";
import { usePagination } from "@/hooks/use-pagination";
import { errorMessage } from "@/lib/api/client";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { KnowledgeNoteStatus, KnowledgeStatus } from "@/types/api";

const MAX_PROFILE = 6000;

/**
 * Tools → Basis Pengetahuan: profil kerja & instruksi tetap, vault Obsidian (sumber pengetahuan yang ditulis user),
 * daftar catatan yang sudah dibaca server, dan cara memakai. Rencana & keputusan: docs/AI-AGENT.md §10, §14.
 */
export function KnowledgeSettings() {
  const { data: status, isLoading } = useKnowledgeStatus();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <ProfileCard />
      {isLoading || !status ? <Skeleton className="h-48 rounded-xl" /> : <VaultCard status={status} />}
      {status?.folder && <NotesCard />}
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
          <IssueList
            icon={CircleAlert}
            title="Catatan perlu dirapikan"
            hint="Isi properti jenis & status agar AI tahu cara memakai catatan ini."
            items={status.problems.map((p) => ({ id: p.noteId, label: p.path, detail: p.issues.join(" · ") }))}
          />
          <IssueList
            icon={Link2Off}
            title="Tautan ke catatan yang belum ada"
            hint="Buat catatannya di Obsidian, atau perbaiki nama tautannya."
            items={status.unresolvedLinks.map((l, i) => ({
              id: l.noteId,
              key: `${l.noteId}-${i}`,
              label: `[[${l.target}]]`,
              detail: l.path,
            }))}
          />
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

function IssueList({
  icon: Icon,
  title,
  hint,
  items,
}: {
  icon: typeof CircleAlert;
  title: string;
  hint: string;
  items: { id: string; key?: string; label: string; detail: string }[];
}) {
  const [showAll, setShowAll] = useState(false);
  if (!items.length) return null;
  const visible = showAll ? items : items.slice(0, 5);
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
        <Icon className="size-3.5" /> {title} ({items.length})
      </p>
      <p className="mb-1.5 text-[11px] text-muted-foreground">{hint}</p>
      <ul className="flex flex-col gap-0.5">
        {visible.map((item) => (
          <li key={item.key ?? item.id}>
            <button
              type="button"
              className="flex w-full min-w-0 items-baseline gap-2 rounded px-1 text-left text-xs hover:bg-muted"
              onClick={() => openKnowledgeNote(item.id)}
            >
              <span className="truncate font-mono">{item.label}</span>
              <span className="shrink-0 truncate text-muted-foreground">{item.detail}</span>
            </button>
          </li>
        ))}
      </ul>
      {items.length > 5 && (
        <Button variant="link" size="xs" className="h-auto px-1" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Ringkas" : `Lihat semua (${items.length})`}
        </Button>
      )}
    </div>
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

// ---------------------------------------------------------------- Daftar catatan

const STATUS_FILTERS: { value: "all" | KnowledgeNoteStatus | "none"; label: string }[] = [
  { value: "all", label: "Semua status" },
  { value: "berlaku", label: "Berlaku" },
  { value: "draf", label: "Draf / Inbox" },
  { value: "dicabut", label: "Dicabut" },
  { value: "templat", label: "Templat" },
  { value: "none", label: "Tanpa status" },
];

function NotesCard() {
  const { data: notes = [], isLoading } = useKnowledgeNotes(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["value"]>("all");
  const filtered = filterKnowledgeNotes(notes, query, status);
  const { pageItems, setPage, controlProps } = usePagination(filtered, 20);

  return (
    <SectionCard
      icon={BookOpenCheck}
      title="Catatan pengetahuan"
      description="Isi vault yang sudah dibaca server. Klik untuk melihat isi & tautannya; sunting tetap di Obsidian."
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            placeholder="Cari judul, folder, jenis…"
            className="flex-1"
          />
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as typeof status);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isLoading ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : !filtered.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {notes.length ? "Tidak ada catatan yang cocok." : "Vault masih kosong — mulai menulis di Obsidian."}
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {pageItems.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => openKnowledgeNote(note.id)}
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{note.title}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{note.path}</p>
                  </div>
                  {note.kind === "file" && <Badge variant="outline">Berkas</Badge>}
                  {note.jenis && (
                    <Badge variant="secondary" className="hidden sm:inline-flex">
                      {note.jenis}
                    </Badge>
                  )}
                  {note.status && <Badge className={STATUS_TONE[note.status]}>{STATUS_LABEL[note.status]}</Badge>}
                  <span className="hidden w-14 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums sm:block">
                    ↗{note.links} ↙{note.backlinks}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <PaginationControl {...controlProps} />
      </div>
    </SectionCard>
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
        Isi pengetahuan & data kerja dikirim ke penyedia AI (embedding Gemini & provider aktif). Untuk data kantor pakai
        API key berbayar (billing Google Cloud aktif): pada kuota gratis Gemini, Google boleh memakai data untuk
        meningkatkan produk dan reviewer manusia dapat membacanya.
      </p>
    </SectionCard>
  );
}
