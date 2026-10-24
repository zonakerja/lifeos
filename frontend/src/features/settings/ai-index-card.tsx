import { AlertTriangle, DatabaseZap, FileSearch, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useAiIndexStatus, useRebuildAiIndex, useSearchAiIndex, useUpdateAiSettings } from "@/data/use-ai-settings";
import { errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { AiSettings } from "@/types/api";

/** Label sumber hasil pencarian (record type backend atau "asset" = isi berkas). */
const SOURCE_LABELS: Record<string, string> = {
  asset: "Berkas",
  obsidian: "Pengetahuan (Obsidian)",
  schedule: "Agenda",
  routine: "Rutinitas",
  todo: "To-do",
  free_note: "Catatan",
  ai_note: "Notes AI",
  list: "Daftar",
  para_area: "Area",
  para_project: "Project",
  para_activity: "Kegiatan",
  para_task: "Task",
  para_resource: "Resource",
  para_archive: "Arsip PARA",
  archive_classification: "Klasifikasi",
  archive_jra: "JRA",
  archive_physical_reference: "Lokasi arsip",
  archive_borrowing: "Peminjaman",
  archive_disposition: "Berita acara",
};

const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "belum pernah";

/**
 * Indeks pengetahuan (RAG): data & isi berkas user di-embed dengan Gemini agar AI bisa menjawab dari seluruh data,
 * bukan hanya potongan daftar. Bisa dimatikan (indeks dihapus, tidak ada data dikirim untuk embedding).
 */
export function AiIndexCard({ settings }: { settings: AiSettings }) {
  const { data: status } = useAiIndexStatus();
  const update = useUpdateAiSettings();
  const rebuild = useRebuildAiIndex();
  const search = useSearchAiIndex();
  const [query, setQuery] = useState("");

  const toggle = async (indexEnabled: boolean) => {
    try {
      await update.mutateAsync({ indexEnabled });
      toast.success(
        indexEnabled ? "Indeks pengetahuan dinyalakan dan sedang dibangun." : "Indeks pengetahuan dihapus.",
      );
    } catch (error) {
      toast.error("Gagal mengubah indeks pengetahuan", { description: errorMessage(error) });
    }
  };

  const handleRebuild = async () => {
    try {
      await rebuild.mutateAsync();
      toast.success("Indeks sedang dibangun ulang di latar belakang.");
    } catch (error) {
      toast.error("Gagal membangun ulang indeks", { description: errorMessage(error) });
    }
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) search.mutate(query.trim());
  };

  const gemini = settings.providers.find((p) => p.id === "gemini");
  const busy = !!status?.pendingJobs;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="ai-index" className="flex items-center gap-2 font-semibold">
            <DatabaseZap className="size-4" /> Indeks pengetahuan (RAG)
          </label>
          <p className="text-xs text-muted-foreground">
            Catatan, agenda, task, project, resource, arsip, catatan vault Obsidian (Tools → Basis Pengetahuan), dan isi
            berkas (PDF, DOCX, XLSX; gambar & PDF hasil scan dibaca Gemini) dipotong dan di-embed dengan{" "}
            <b>Google Gemini</b> ({status?.model ?? "gemini-embedding-2"}) memakai API key Gemini Anda, agar AI bisa
            mencari di seluruh data Anda. Matikan bila data tidak boleh dikirim ke Google — indeks langsung dihapus.
          </p>
        </div>
        <Switch
          id="ai-index"
          checked={settings.indexEnabled}
          disabled={update.isPending}
          onCheckedChange={(checked) => void toggle(checked)}
        />
      </div>

      {settings.indexEnabled && status && (
        <>
          {status.embeddingAvailable && (
            <div className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                Untuk data kantor, pakai API key Gemini <b>berbayar</b> (billing Google Cloud aktif di project key ini).
                Pada kuota <b>gratis</b>, Google boleh memakai isi yang dikirim untuk meningkatkan produknya dan
                reviewer manusia dapat membacanya.
              </p>
            </div>
          )}
          {!status.embeddingAvailable && (
            <div className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                Tanpa API key <b>{gemini?.label ?? "Google Gemini"}</b>, indeks hanya mendukung pencarian kata persis
                (data tidak dikirim ke mana pun). Simpan key Gemini di atas agar AI juga bisa mencari berdasarkan makna
                — embedding dilengkapi otomatis.
              </p>
            </div>
          )}
          {status.lastError && (
            <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p className="break-all">
                Error terakhir ({formatTime(status.lastErrorAt)}): {status.lastError}
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <dl className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Sumber</dt>
                <dd className="font-semibold">{status.sources.toLocaleString("id-ID")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Potongan (ber-embedding)</dt>
                <dd className="font-semibold">
                  {status.chunks.toLocaleString("id-ID")} ({status.embeddedChunks.toLocaleString("id-ID")})
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Terakhir</dt>
                <dd className="font-semibold">{formatTime(status.lastIndexedAt)}</dd>
              </div>
            </dl>
            <div className="flex items-center gap-2">
              {busy && (
                <Badge variant="outline">
                  <Spinner /> {status.pendingJobs} antrian
                </Badge>
              )}
              <Button size="sm" variant="outline" onClick={handleRebuild} disabled={rebuild.isPending}>
                {rebuild.isPending ? <Spinner /> : <RefreshCw />} Indeks ulang
              </Button>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              placeholder="Uji pencarian, mis. nomor arsip atau topik rapat"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button type="submit" size="sm" variant="secondary" disabled={!query.trim() || search.isPending}>
              {search.isPending ? <Spinner /> : <Search />} Cari
            </Button>
          </form>
          {search.isError && <p className="text-xs text-destructive">{errorMessage(search.error)}</p>}
          {search.data && (
            <ul className="flex flex-col gap-2">
              {search.data.length === 0 && (
                <li className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileSearch className="size-4" /> Tidak ada hasil.
                </li>
              )}
              {search.data.map((hit, i) => (
                <li key={hit.id} className={cn("rounded-xl border p-3 text-xs", i === 0 && "border-module")}>
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="outline">{SOURCE_LABELS[hit.sourceType] ?? hit.sourceType}</Badge>
                    <span className="truncate font-semibold">{hit.title}</span>
                  </div>
                  <p className="line-clamp-3 text-muted-foreground">{hit.content}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
