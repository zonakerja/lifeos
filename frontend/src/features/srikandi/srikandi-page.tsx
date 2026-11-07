import { useQueryClient } from "@tanstack/react-query";
import {
  CloudDownload,
  FileCheck2,
  FilePlus2,
  FileSignature,
  FileText,
  Library,
  Loader2,
  Paperclip,
} from "lucide-react";
import { useNavigate } from "react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SearchInput } from "@/components/common/search-input";
import { SectionCard } from "@/components/common/section-card";
import { HeroStat, ModulePage } from "@/components/layout/module-page";
import { previewFile } from "@/components/common/file-preview";
import { PaginationControl } from "@/components/common/pagination-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useSrikandiLetters, useSrikandiOutgoings } from "@/data/collections";
import { links } from "@/lib/deep-links";
import { queryKeys } from "@/data/query-keys";
import { RobotSettings } from "@/features/tools/robot/robot-settings";
import { ReferencesBoard } from "./references-board";
import { RegisterBoard } from "./register-board";
import { usePagination } from "@/hooks/use-pagination";
import { errorMessage } from "@/lib/api/client";
import { robotApi } from "@/lib/api/endpoints";
import { formatDateTime, formatShortDate, parseLocalYMD } from "@/lib/dates";
import type { SrikandiLetter } from "@/types/entities";

/**
 * AI Agent → SRIKANDI: naskah keluar yang sudah ditandatangani diambil robot (hanya membaca) ke LifeOS, plus tab
 * Connector (sesi robot SRIKANDI). Tanda tangan & pengiriman tetap dilakukan user di SRIKANDI.
 */
export function Component() {
  const { items } = useSrikandiLetters();
  const withPdf = items.filter((l) => l.uploadId).length;
  return (
    <ModulePage
      module="srikandi"
      meta={
        <HeroStat>
          <FileCheck2 className="size-3.5" /> {withPdf} naskah ber-TTD di LifeOS
        </HeroStat>
      }
    >
      {(tab) =>
        tab === "connector" ? (
          <ConnectorTab />
        ) : tab === "references" ? (
          <ReferencesBoard />
        ) : tab === "outgoing" ? (
          <LettersBoard letters={items} />
        ) : (
          <RegisterBoard />
        )
      }
    </ModulePage>
  );
}

/** Tab Connector: sama dengan Laporan Kinerja — Pengaturan koneksi | Otomasi terjadwal. */
function ConnectorTab() {
  return <RobotSettings systems={["srikandi"]} />;
}

const matches = (letter: SrikandiLetter, query: string) =>
  !query ||
  [letter.number, letter.subject, letter.origin, letter.dateText]
    .filter(Boolean)
    .some((v) => v!.toLowerCase().includes(query));

function LettersBoard({ letters }: { letters: SrikandiLetter[] }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { items: registers } = useSrikandiOutgoings();
  const registerOf = new Map(registers.filter((r) => r.letterId).map((r) => [r.letterId!, r]));
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const sorted = [...letters]
    .filter((l) => matches(l, search.trim().toLowerCase()))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.number.localeCompare(a.number));
  const { pageItems, setPage, controlProps } = usePagination(sorted, 10);
  const lastSync = letters
    .map((l) => l.syncedAt ?? "")
    .sort()
    .at(-1);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await robotApi.syncLetters();
      await Promise.all(
        (["srikandi_letter", "para_resource"] as const).map((t) =>
          client.invalidateQueries({ queryKey: queryKeys.records(t) }),
        ),
      );
      if (r.missed.length) toast.warning(`PDF belum tertangkap untuk: ${r.missed.join(", ")}.`);
      toast.success(
        `${r.letters} naskah terbaca, ${r.imported} PDF ber-TTD & ${r.attachments} lampiran baru diambil.`,
        {
          description: `${r.resources} berkas baru masuk Resource Global (Dokumen Final) & File Control.`,
        },
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <SectionCard
      icon={FileSignature}
      title="Daftar Naskah Keluar"
      description={
        lastSync
          ? `Diambil dari SRIKANDI ${formatDateTime(lastSync)}. Naskah yang sudah ditandatangani disimpan PDF-nya di LifeOS.`
          : "Ambil daftar naskah keluar dari SRIKANDI. Naskah yang sudah ditandatangani beserta lampirannya disimpan di LifeOS dan masuk Resource Global (Dokumen Final) & File Control."
      }
      action={
        <Button size="sm" onClick={() => void sync()} disabled={syncing}>
          {syncing ? <Loader2 className="animate-spin" /> : <CloudDownload />} Ambil dari SRIKANDI
        </Button>
      }
      contentClassName="flex flex-col gap-3"
    >
      <SearchInput
        value={search}
        onChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Cari nomor, hal, asal naskah…"
      />
      {sorted.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileSignature />
            </EmptyMedia>
            <EmptyTitle>{letters.length ? "Tidak ada yang cocok" : "Belum ada naskah"}</EmptyTitle>
            <EmptyDescription>
              {letters.length
                ? "Ubah kata pencarian."
                : "Klik Ambil dari SRIKANDI. Pastikan sesi SRIKANDI aktif di tab Connector."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {pageItems.map((l) => (
            <li key={l.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{l.subject || "(tanpa hal)"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{l.number || "Belum bernomor"}</span>
                  {l.date ? ` · ${formatShortDate(parseLocalYMD(l.date))}` : l.dateText ? ` · ${l.dateText}` : ""}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                  {l.signStatus && <Badge variant="secondary">TTD: {l.signStatus}</Badge>}
                  {l.sendStatus && <Badge variant="secondary">{l.sendStatus}</Badge>}
                  {l.uploadId ? (
                    <Badge className="bg-success/15 text-success">PDF ber-TTD di LifeOS</Badge>
                  ) : (
                    <Badge className="bg-muted text-muted-foreground">Belum ada PDF</Badge>
                  )}
                  {registerOf.has(l.id) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-xs text-module"
                      title="Naskah ini tertaut ke entri Register Naskah Keluar (dokumen mentahnya)"
                      onClick={() => navigate(links.srikandiRegister(registerOf.get(l.id)!.id))}
                    >
                      <FilePlus2 className="size-3" /> Register
                    </Button>
                  )}
                  {!!l.resources && Object.keys(l.resources).length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-xs text-info"
                      title="Naskah & lampiran ada di Resource Global (tag Dokumen Final) dan File Control → Gantung"
                      onClick={() => navigate("/productivity/resources")}
                    >
                      <Library className="size-3" /> Resource Global · File Control
                    </Button>
                  )}
                </div>
                {!!l.attachments?.length && (
                  <div className="mt-2 flex flex-col gap-1">
                    <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                      <Paperclip className="size-3.5" /> {l.attachments.length} lampiran
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {l.attachments.map((a) =>
                        a.uploadId ? (
                          <Button
                            key={a.name}
                            size="sm"
                            variant="secondary"
                            className="h-7 max-w-full min-w-0 text-xs"
                            title={a.name}
                            onClick={() => previewFile({ uploadId: a.uploadId!, name: a.name })}
                          >
                            <FileText className="shrink-0" /> <span className="truncate">{a.name}</span>
                          </Button>
                        ) : (
                          <Badge key={a.name} className="max-w-full bg-warning/15 text-warning" title={a.name}>
                            <span className="truncate">{a.name} · belum terambil</span>
                          </Badge>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
              {l.uploadId && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() =>
                    previewFile({
                      uploadId: l.uploadId!,
                      name: `${l.number || "naskah"}.pdf`,
                      mimeType: "application/pdf",
                    })
                  }
                >
                  <FileCheck2 /> Lihat PDF
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <PaginationControl {...controlProps} />
    </SectionCard>
  );
}
