import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Eye, FileText, FolderLock, Loader2, ScrollText, ShieldAlert } from "lucide-react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { appLogoUrl, useAppSettings } from "@/data/use-app-settings";
import { errorMessage } from "@/lib/api/client";
import { publicVaultApi } from "@/lib/api/endpoints";
import type { PublicVaultView } from "@/types/api";
import { formatDateTime } from "@/lib/dates";
import { VaultFileViewer } from "./vault-file-viewer";
import { formatVaultSize } from "./vault-utils";

/**
 * Halaman publik brankas digital (tanpa login): bukti data dukung satu poin renaksi e-Kinerja yang dibuka atasan / pejabat
 * pembina kepegawaian. Server mencatat setiap pembukaan & unduhan (waktu, IP, perkiraan lokasi, peramban); pengunjung
 * diberi tahu pencatatan itu dan kewajiban pelindungan data pribadi.
 */
function PublicVaultPage() {
  const { token = "" } = useParams();
  const { settings } = useAppSettings();
  const logoUrl = appLogoUrl(settings);
  // Satu kali per kunjungan (setiap pemanggilan = satu catatan akses)
  const vault = useQuery({
    queryKey: ["public-vault", token],
    queryFn: () => publicVaultApi.open(token),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [viewing, setViewing] = useState<PublicVaultView["files"][number] | null>(null);

  return (
    <div data-module="kinerja" className="min-h-svh bg-background px-4 py-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4">
        <header className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-module text-module-foreground">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="size-full object-cover" />
            ) : (
              <FolderLock className="size-6" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Brankas Digital</p>
            <p className="truncate text-sm font-medium">{settings.name} · Bukti data dukung kinerja</p>
          </div>
        </header>

        {vault.isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border bg-card p-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Membuka brankas…
          </div>
        ) : vault.isError || !vault.data ? (
          <div className="rounded-2xl border bg-card p-8 text-center">
            <FolderLock className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-3 font-semibold">Brankas tidak dapat dibuka</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {errorMessage(vault.error, "Tautan tidak dikenal, sudah diganti, atau sudah dicabut pemiliknya.")}
            </p>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border bg-card p-5">
              <h1 className="text-lg leading-snug font-bold">{vault.data.title}</h1>
              {vault.data.description && (
                <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{vault.data.description}</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Pemilik: {vault.data.owner} · Diperbarui {formatDateTime(vault.data.updatedAt)} ·{" "}
                {vault.data.files.length} berkas
              </p>
              <ul className="mt-4 grid grid-cols-1 gap-2">
                {vault.data.files.map((file) => (
                  <li key={file.id} className="flex min-w-0 items-center gap-3 rounded-xl bg-muted/50 px-3 py-2">
                    <FileText className="size-5 shrink-0 text-module" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatVaultSize(file.size)}</p>
                    </div>
                    <Button variant="ghost" size="sm" title="Lihat" onClick={() => setViewing(file)}>
                      <Eye /> <span className="hidden sm:inline">Lihat</span>
                    </Button>
                    <Button asChild variant="outline" size="sm" title="Unduh">
                      <a href={publicVaultApi.fileUrl(token, file.id, true)} rel="noopener noreferrer">
                        <Download /> <span className="hidden sm:inline">Unduh</span>
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-warning/40 bg-warning/10 p-5 text-sm">
              <h2 className="flex items-center gap-2 font-semibold text-warning">
                <ShieldAlert className="size-5" /> Pemberitahuan Pelindungan Data Pribadi
              </h2>
              <ul className="mt-2 grid list-disc grid-cols-1 gap-1.5 pl-5 text-foreground/90">
                <li>
                  Brankas ini berisi dokumen kedinasan dan dapat memuat <strong>data pribadi</strong>. Akses hanya
                  diperuntukkan bagi atasan, pejabat penilai kinerja, dan pejabat pembina kepegawaian yang berwenang
                  dalam rangka penilaian kinerja.
                </li>
                <li>
                  Dilarang menyebarluaskan tautan, menyalin, mengunggah ulang, atau memakai dokumen di luar keperluan
                  tersebut. Bila tautan ini Anda terima tanpa kewenangan, mohon tutup halaman ini dan beri tahu
                  pemiliknya.
                </li>
                <li>
                  Memperoleh, mengungkapkan, atau menggunakan data pribadi yang bukan miliknya secara melawan hukum
                  diancam pidana penjara dan/atau denda sebagaimana diatur dalam{" "}
                  <strong>Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi</strong> (Pasal 65 jo.
                  Pasal 67), serta dapat dikenai sanksi disiplin bagi Aparatur Sipil Negara.
                </li>
              </ul>
            </section>

            <section className="rounded-2xl border bg-card p-5 text-sm">
              <h2 className="flex items-center gap-2 font-semibold">
                <ScrollText className="size-5 text-module" /> Akses Anda tercatat
              </h2>
              <p className="mt-1 text-muted-foreground">
                Untuk keamanan, setiap pembukaan brankas dan setiap berkas yang dilihat atau diunduh dicatat dan dapat
                dilihat pemilik brankas: waktu, alamat IP, perkiraan lokasi (dari alamat IP), serta jenis peramban dan
                perangkat.
              </p>
              <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 rounded-xl bg-muted/50 p-3 sm:grid-cols-[auto_1fr]">
                <dt className="text-muted-foreground">Waktu</dt>
                <dd className="font-medium">{formatDateTime(vault.data.visitor.at)}</dd>
                <dt className="text-muted-foreground">Alamat IP</dt>
                <dd className="font-medium break-all">{vault.data.visitor.ip ?? "Tidak terbaca"}</dd>
                <dt className="text-muted-foreground">Perkiraan lokasi</dt>
                <dd className="font-medium">{vault.data.visitor.location}</dd>
                <dt className="text-muted-foreground">Peramban</dt>
                <dd className="font-medium">{vault.data.visitor.browser ?? "Tidak terbaca"}</dd>
              </dl>
            </section>
          </>
        )}
      </div>
      <VaultFileViewer token={token} file={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

export { PublicVaultPage as Component };
