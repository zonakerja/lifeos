import {
  CheckCircle2,
  FilePen,
  FilePlus2,
  History,
  Info,
  RefreshCw,
  Save,
  Server,
  Share2,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOfficeDiagnostics } from "@/data/use-office";
import { isAdminRole, useAuthStore } from "@/stores/auth-store";
import { errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { officeFormatsByMode } from "./office-formats";
import { OfficeAiCard, OfficeFontsCard, OfficeTemplatesCard } from "./onlyoffice-cards";

/**
 * Tools → ONLYOFFICE. Editor sendiri tidak punya menu dokumen — ia dipanggil dari fitur mana pun yang punya berkas
 * (pratinjau lampiran/resource, "Edit di ONLYOFFICE", "Buat Dokumen" di form lampiran).
 * Tampilan per role (keputusan user): semua user melihat Cara memakai, Templat dokumen, dan AI di editor (urutan ini);
 * status server, format, dan font hanya untuk admin, di bawahnya.
 */
export function OnlyofficeSettings() {
  const admin = isAdminRole(useAuthStore((state) => state.user?.role));
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <UsageCard />
      <OfficeTemplatesCard />
      <OfficeAiCard />
      {admin && <ServerStatusCard />}
      {admin && <OfficeFontsCard />}
    </div>
  );
}

/** Status server ONLYOFFICE, format, dan alamat teknis (admin). */
function ServerStatusCard() {
  const { data, isLoading, isFetching, error, refetch } = useOfficeDiagnostics();
  const state = !data ? null : !data.enabled ? "disabled" : data.healthy ? "ok" : "down";
  return (
    <SectionCard
      icon={Server}
      title="Status server ONLYOFFICE"
      description="Server dokumen yang membuka dan menyunting berkas LifeOS."
      action={
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
          <RefreshCw className={cn(isFetching && "animate-spin")} /> Periksa ulang
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : error ? (
        <p className="text-sm text-destructive">{errorMessage(error)}</p>
      ) : data ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {state === "ok" ? (
              <Badge className="gap-1 bg-success/15 text-success">
                <CheckCircle2 className="size-3.5" /> Terhubung
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="size-3.5" /> {state === "disabled" ? "Belum diatur" : "Tidak terhubung"}
              </Badge>
            )}
            {data.version && <span className="text-sm text-muted-foreground">ONLYOFFICE Docs {data.version}</span>}
            <span className="text-sm text-muted-foreground">· Community Edition</span>
          </div>

          <FormatGroups />

          {state !== "ok" && (
            <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
              {state === "disabled"
                ? "Editor dokumen belum diatur di server (variabel ONLYOFFICE_* di backend/.env)."
                : "Server ONLYOFFICE tidak menjawab. Pastikan container ONLYOFFICE menyala."}{" "}
              Panduan: docs/SETUP.md §4 langkah 6 (development) atau docs/ONLYOFFICE.md. Selama itu, berkas tetap bisa
              diunduh dan PDF/gambar tetap bisa dipratinjau.
            </p>
          )}

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <InfoRow label="Riwayat versi">{data.details?.maxVersions ?? 10} versi terakhir per dokumen</InfoRow>
            <InfoRow label="Token keamanan (JWT)">{data.jwtConfigured ? "Aktif" : "Belum diatur"}</InfoRow>
            {data.details && (
              <>
                <InfoRow label="Alamat untuk browser">{data.documentServerUrl ?? "—"}</InfoRow>
                <InfoRow label="Alamat untuk backend">{data.details.internalUrl}</InfoRow>
                <InfoRow label="Backend dihubungi ONLYOFFICE di" className="sm:col-span-2">
                  {data.details.backendUrl}
                </InfoRow>
              </>
            )}
          </dl>
        </div>
      ) : null}
    </SectionCard>
  );
}

function UsageCard() {
  return (
    <SectionCard
      icon={Info}
      title="Cara memakai"
      description="ONLYOFFICE muncul otomatis di menu mana pun yang memiliki dokumen."
    >
      <ul className="grid gap-3 text-sm sm:grid-cols-2">
        <Tip icon={FilePen} title="Buka & sunting berkas">
          Klik lampiran atau Resource berupa DOCX/XLSX/PPTX untuk melihatnya; tombol <b>Edit di ONLYOFFICE</b> membuka
          editor (termasuk PDF).
        </Tip>
        <Tip icon={FilePlus2} title="Buat dokumen baru">
          Di form lampiran Project, Action/Task, Tandai Selesai, Agenda, dan form Resource: pilih Tipe{" "}
          <b>Buat Dokumen (ONLYOFFICE)</b>, lalu jenis dokumen kosong, templat, atau <b>Impor berkas</b>. Tag, File
          Control, dan Ringkas AI tetap berlaku.
        </Tip>
        <Tip icon={Save} title="Penyimpanan">
          Dokumen tersimpan otomatis saat editor ditutup. <b>Ctrl+S</b> menyimpan versi tanpa menutup editor.
        </Tip>
        <Tip icon={History} title="Riwayat versi">
          Satu sesi edit = satu versi. Versi lama bisa diunduh atau dipulihkan dari tombol <b>Riwayat versi</b>.
        </Tip>
        <Tip icon={Share2} title="Berbagi & edit bersama">
          Mengikuti izin berbagi item: <b>Edit</b> bisa menyunting bersamaan, <b>Komentar</b> hanya berkomentar,{" "}
          <b>Lihat</b> hanya membaca.
        </Tip>
        <Tip icon={Sparkles} title="AI di editor">
          Aktifkan di kartu <b>AI di editor</b>: tab <b>AI</b> ONLYOFFICE (Chatbot, Summarization, Translation, Grammar
          & Spelling) memakai provider & key di Pengaturan → AI.
        </Tip>
      </ul>
    </SectionCard>
  );
}

/** Format menurut daftar resmi ONLYOFFICE Docs (sama dengan aturan backend). */
function FormatGroups() {
  const groups = officeFormatsByMode();
  const rows: { label: string; hint: string; formats: string[] }[] = [
    { label: "Bisa disunting", hint: "Disimpan dalam format aslinya tanpa kehilangan format.", formats: groups.edit },
    {
      label: "Bisa disunting (sebagian format bisa hilang)",
      hint: "Disimpan dalam format aslinya, tetapi fitur yang tidak didukung format itu bisa hilang.",
      formats: groups.lossy,
    },
    { label: "Hanya dilihat", hint: "Dibuka baca saja.", formats: groups.view },
  ];
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-1.5">
          <div>
            <p className="text-sm font-semibold">{row.label}</p>
            <p className="text-xs text-muted-foreground">{row.hint}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {row.formats.map((ext) => (
              <Badge key={ext} variant="outline" className="font-mono text-[10px] uppercase">
                {ext}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function InfoRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{children}</dd>
    </div>
  );
}

function Tip({ icon: Icon, title, children }: { icon: typeof Info; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl border p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-module/12 text-module">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="text-muted-foreground">{children}</span>
      </span>
    </li>
  );
}
