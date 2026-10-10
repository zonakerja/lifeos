import { ArchiveRestore, FileBox, FileX, HardDrive, Truck } from "lucide-react";
import { useEffect, useEffectEvent } from "react";
import { toast } from "sonner";
import { HeroStat, ModulePage } from "@/components/layout/module-page";
import { useJraList } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import { useSearchParam } from "@/hooks/use-search-param";
import { useToday } from "@/hooks/use-today";
import { ArchiveDetailDialog } from "./components/archive-detail-dialog";
import { type ArchiveListTabId, ArchiveListTab } from "./components/archive-list-tab";
import { ArrangementTab } from "./components/arrangement/arrangement-tab";
import { TransactionsTab } from "./components/transactions/transactions-tab";
import { ReferencesTab } from "./components/references/references-tab";
import { useArchiveFiles, useFileControlActions } from "./use-file-control";

const LIST_TABS: ArchiveListTabId[] = ["pending", "physical", "digital", "static", "destroyed"];

export function Component() {
  const today = useToday();
  const { canEdit } = usePermissions();
  const { files, isLoading } = useArchiveFiles();
  const jra = useJraList();
  const actions = useFileControlActions();
  const [detailId, setDetailId] = useSearchParam("archive");
  const detail = files.find((f) => f.id === detailId) ?? null;

  // Auto-dispose arsip digital yang masa inaktifnya lewat (sekali per perubahan data, idempoten)
  const autoDispose = useEffectEvent(() => {
    if (isLoading || jra.isLoading || !canEdit) return;
    const executed = actions.runAutoDispose(today);
    if (executed > 0) toast.info(`${executed} arsip digital dieksekusi otomatis (Auto-Dispose).`);
  });
  useEffect(() => autoDispose(), [files, isLoading, jra.isLoading]);

  const notFinal = (f: (typeof files)[number]) => f.dynamicStatus !== "destroyed" && f.dynamicStatus !== "static";
  const count = {
    pending: files.filter((f) => (f.archivalStatus || "pending") === "pending").length,
    physical: files.filter((f) => f.archivalStatus === "physical" && notFinal(f)).length,
    digital: files.filter((f) => f.archivalStatus === "digital" && notFinal(f)).length,
    static: files.filter((f) => f.status === "static").length,
    destroyed: files.filter((f) => f.status === "destroyed").length,
  };

  return (
    <ModulePage
      module="files"
      meta={
        <>
          <HeroStat>
            <ArchiveRestore className="size-3.5" /> {count.pending} gantung
          </HeroStat>
          <HeroStat>
            <FileBox className="size-3.5" /> {count.physical} fisik
          </HeroStat>
          <HeroStat>
            <HardDrive className="size-3.5" /> {count.digital} digital
          </HeroStat>
          <HeroStat>
            <Truck className="size-3.5" /> {count.static} statis
          </HeroStat>
          <HeroStat>
            <FileX className="size-3.5" /> {count.destroyed} musnah
          </HeroStat>
        </>
      }
    >
      {(tab) => (
        <>
          {LIST_TABS.includes(tab as ArchiveListTabId) && <ArchiveListTab key={tab} tab={tab as ArchiveListTabId} />}
          {tab === "arrangement" && <ArrangementTab />}
          {tab === "transactions" && <TransactionsTab />}
          {tab === "references" && <ReferencesTab />}
          <ArchiveDetailDialog file={detail} onClose={() => setDetailId(null)} />
        </>
      )}
    </ModulePage>
  );
}
