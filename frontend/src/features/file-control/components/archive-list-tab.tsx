import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  Clock,
  FileBox,
  HardDrive,
  Layers,
  Shield,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { type PageSize, PaginationControl, paginate } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBorrowings, useClassifications, useJraList, usePhysRefs } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import { useSearchParam } from "@/hooks/use-search-param";
import { useToday } from "@/hooks/use-today";
import { cn } from "@/lib/utils";
import type { DispositionType } from "@/types/entities";
import {
  type ArchiveFile,
  archiveTitle,
  borrowedArchiveIds,
  dispositionBlockReason,
  isPermanent,
} from "../lib/archive";
import { useArchiveFiles, useFileControlActions } from "../use-file-control";
import { ArchiveCard, PendingArchiveCard } from "./archive-card";
import { ArchiveProcessDialog } from "./archive-process-dialog";
import { ArchiveTimeFilter, defaultTimeFilter, matchesTimeFilter } from "./archive-time-filter";
import { DispositionFormDialog } from "./disposition-form-dialog";
import { ArchiveLabelDialog } from "./label-dialogs";

export type ArchiveListTabId = "pending" | "physical" | "digital" | "static" | "destroyed";

type SubTab = "all" | "active" | "inactive" | "vital" | "physical" | "digital";
type BulkSection = "destroy" | "static";

const LIFECYCLE_SUBTABS: { id: SubTab; label: string; icon: LucideIcon }[] = [
  { id: "all", label: "Semua", icon: Layers },
  { id: "active", label: "Aktif", icon: CheckCircle2 },
  { id: "inactive", label: "Inaktif", icon: Clock },
  { id: "vital", label: "Arsip Vital", icon: Shield },
];
const MEDIA_SUBTABS: { id: SubTab; label: string; icon: LucideIcon }[] = [
  { id: "all", label: "Semua", icon: Layers },
  { id: "physical", label: "Fisik", icon: FileBox },
  { id: "digital", label: "Digital", icon: HardDrive },
];

/** Tab daftar arsip: Gantung, Fisik, Digital, Statis, Musnah. */
export function ArchiveListTab({ tab }: { tab: ArchiveListTabId }) {
  const today = useToday();
  const { canEdit } = usePermissions();
  const { files } = useArchiveFiles();
  const actions = useFileControlActions();
  const { items: classifications } = useClassifications();
  const { items: jraList } = useJraList();
  const { items: physRefs } = usePhysRefs();
  const { items: borrowings } = useBorrowings();
  const [, setDetailId] = useSearchParam("archive");

  const [subTab, setSubTab] = useState<SubTab>("all");
  const [search, setSearch] = useState("");
  const [timeFilter, setTimeFilter] = useState(() => defaultTimeFilter(today));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(100);
  const [bulkSection, setBulkSection] = useState<BulkSection | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<ArchiveFile | null>(null);
  const [labelFile, setLabelFile] = useState<ArchiveFile | null>(null);
  const [disposal, setDisposal] = useState<{ type: DispositionType; items: ArchiveFile[] } | null>(null);

  const jraOf = (f: ArchiveFile) => jraList.find((j) => j.id === f.jraId);
  const borrowed = borrowedArchiveIds(borrowings);

  const filtered = files
    .filter((r) => {
      const archivalStatus = r.archivalStatus || "pending";
      if (tab === "pending" && archivalStatus !== "pending") return false;
      if ((tab === "physical" || tab === "digital") && archivalStatus !== tab) return false;
      if ((tab === "static" || tab === "destroyed") && r.dynamicStatus !== tab) return false;

      const q = search.toLowerCase();
      if (
        q &&
        !(r.title ?? "").toLowerCase().includes(q) &&
        !(r.number ?? "").toLowerCase().includes(q) &&
        !(r.classificationCode ?? "").toLowerCase().includes(q)
      )
        return false;

      if (tab === "physical" || tab === "digital") {
        if (r.dynamicStatus === "destroyed" || r.dynamicStatus === "static") return false;
        if (subTab === "active" && r.dynamicStatus !== "active") return false;
        if (subTab === "inactive" && r.dynamicStatus !== "inactive" && r.dynamicStatus !== "expired") return false;
        if (subTab === "vital" && !r.isVital) return false;
      }
      if ((tab === "static" || tab === "destroyed") && (subTab === "physical" || subTab === "digital")) {
        if (archivalStatus !== subTab) return false;
      }
      return matchesTimeFilter(r.date, timeFilter);
    })
    .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime());

  const pageItems = paginate(filtered, page, pageSize);

  const resetBulk = () => {
    setBulkSection(null);
    setSelectedIds(new Set());
  };

  /** Validasi syarat penyusutan sebelum membuka form berita acara. */
  const initiateDisposition = (type: DispositionType, single?: ArchiveFile) => {
    const items = single ? [single] : files.filter((r) => selectedIds.has(r.id));
    if (items.length === 0) {
      toast.error("Pilih minimal satu arsip.");
      return;
    }
    const rejected = items
      .map((item) => ({ item, reason: dispositionBlockReason(item, type, jraOf(item), borrowed) }))
      .filter((x) => x.reason !== null);
    if (rejected.length > 0) {
      const [first] = rejected;
      toast.error(
        `Validasi gagal: ${rejected.length} arsip tidak memenuhi syarat — "${archiveTitle(first.item)}" ${first.reason}` +
          (rejected.length > 1 ? `, dan ${rejected.length - 1} lainnya.` : "."),
      );
      return;
    }
    setDisposal({ type, items });
  };

  const renderCard = (file: ArchiveFile) => (
    <ArchiveCard
      key={file.id}
      file={file}
      tab={tab}
      classifications={classifications}
      jraList={jraList}
      physRefs={physRefs}
      borrowed={borrowed.has(file.id)}
      canEdit={canEdit}
      bulkActive={!!bulkSection}
      selected={selectedIds.has(file.id)}
      onToggle={() =>
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(file.id)) next.delete(file.id);
          else next.add(file.id);
          return next;
        })
      }
      onDetail={() => setDetailId(file.id, { replace: false })}
      onLabel={() => setLabelFile(file)}
      onEdit={() => setProcessing(file)}
      onDispose={(type) => initiateDisposition(type, file)}
    />
  );

  const renderSection = (title: string, items: ArchiveFile[], bulkType: BulkSection | null) => {
    if (items.length === 0) return null;
    const active = bulkType !== null && bulkSection === bulkType;
    const Icon = bulkType === "destroy" ? AlertTriangle : bulkType === "static" ? Truck : Clock;
    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4
            className={cn(
              "flex items-center gap-2 text-xs font-bold uppercase",
              bulkType === "destroy"
                ? "text-destructive"
                : bulkType === "static"
                  ? "text-info"
                  : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" /> {title}
            <Badge variant="secondary">{items.length}</Badge>
          </h4>
          {bulkType && canEdit && (
            <div className="flex gap-2">
              {active && (
                <>
                  <Button
                    size="sm"
                    className={
                      bulkType === "destroy"
                        ? "bg-destructive text-white hover:bg-destructive/90"
                        : "bg-info text-info-foreground hover:bg-info/90"
                    }
                    onClick={() => initiateDisposition(bulkType === "destroy" ? "destroy" : "transfer")}
                  >
                    Eksekusi ({selectedIds.size})
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setSelectedIds(selectedIds.size === items.length ? new Set() : new Set(items.map((r) => r.id)))
                    }
                  >
                    Pilih Semua
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => {
                  setSelectedIds(new Set());
                  setBulkSection(active ? null : bulkType);
                }}
              >
                {active ? "Batal" : "Pilih Banyak"}
              </Button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{items.map(renderCard)}</div>
        <div className="border-t border-dashed" />
      </section>
    );
  };

  const subTabs =
    tab === "physical" || tab === "digital"
      ? LIFECYCLE_SUBTABS
      : tab === "static" || tab === "destroyed"
        ? MEDIA_SUBTABS
        : null;

  return (
    <div className="flex flex-col gap-5">
      {subTabs && (
        <ToggleGroup
          type="single"
          variant="outline"
          value={subTab}
          onValueChange={(v) => {
            if (!v) return;
            setSubTab(v as SubTab);
            setPage(1);
            resetBulk();
          }}
          className="w-full overflow-x-auto"
        >
          {subTabs.map((t) => (
            <ToggleGroupItem
              key={t.id}
              value={t.id}
              className="flex-1 gap-2 data-[state=on]:bg-module-soft data-[state=on]:text-module"
            >
              <t.icon /> {t.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <SearchInput
          className="md:flex-1"
          placeholder="Cari dokumen..."
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
        <ArchiveTimeFilter
          value={timeFilter}
          onChange={(v) => {
            setTimeFilter(v);
            setPage(1);
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <Empty className="border-2 border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ArchiveRestore />
            </EmptyMedia>
            <EmptyTitle>Tidak ada dokumen di kategori ini.</EmptyTitle>
            <EmptyDescription>
              {tab === "pending"
                ? "Unggah resource bertipe file di Productivity → Resources untuk mulai memberkaskan."
                : "Coba ubah filter atau kata kunci pencarian."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {(tab === "physical" || tab === "digital") && subTab === "inactive" ? (
            <div className="space-y-6">
              {renderSection(
                "Siap Dimusnahkan (Expired & Non-Permanen)",
                filtered.filter((r) => r.dynamicStatus === "expired" && !r.isVital && !isPermanent(jraOf(r))),
                "destroy",
              )}
              {renderSection(
                "Siap Diserahkan (Expired & Permanen)",
                filtered.filter((r) => r.dynamicStatus === "expired" && isPermanent(jraOf(r))),
                "static",
              )}
              {renderSection(
                "Menunggu Masa Retensi",
                filtered.filter((r) => r.dynamicStatus === "inactive"),
                null,
              )}
            </div>
          ) : tab === "pending" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pageItems.map((file) => (
                <PendingArchiveCard key={file.id} file={file} canEdit={canEdit} onProcess={() => setProcessing(file)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{pageItems.map(renderCard)}</div>
          )}
          <PaginationControl
            totalItems={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            sizes={[25, 50, 100]}
          />
        </>
      )}

      <ArchiveProcessDialog file={processing} onClose={() => setProcessing(null)} />
      <ArchiveLabelDialog file={labelFile} onClose={() => setLabelFile(null)} />
      <DispositionFormDialog
        type={disposal?.type ?? null}
        count={disposal?.items.length ?? 1}
        onClose={() => setDisposal(null)}
        onConfirm={(formData) => {
          if (!disposal) return;
          actions.executeDisposition(disposal.type, disposal.items, formData);
          toast.success(`Arsip berhasil diproses menjadi status ${disposal.type === "destroy" ? "Musnah" : "Statis"}.`);
          setDisposal(null);
          resetBulk();
        }}
      />
    </div>
  );
}
