import { Archive, CheckCircle2, Filter, History, RotateCcw } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DateRangeFilter } from "@/components/common/date-range-filter";
import { type PageSize, PaginationControl, paginate } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { useParaArchives } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import { useToday } from "@/hooks/use-today";
import { DEFAULT_DATE_FILTER, matchesDateFilter } from "@/lib/date-filter";
import { formatNumericDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ParaArchive } from "@/types/entities";
import { PARA_INFO } from "../lib/para";
import { useParaActions } from "../use-para-actions";
import { ParaInfo } from "./para-info";

type TypeFilter = "all" | "project" | "area" | "resource";
const TYPE_LABELS: Record<TypeFilter, string> = {
  all: "Semua Arsip",
  project: "Project",
  area: "Area",
  resource: "Resource",
};
const TYPE_STYLE: Record<string, string> = {
  project: "bg-primary/12 text-primary",
  area: "bg-success/15 text-success",
  resource: "bg-mod-notes/15 text-mod-notes",
};

const archiveName = (a: ParaArchive) => String(a.data.title ?? a.data.name ?? "Untitled");

export function ArchivesTab() {
  const today = useToday();
  const { items: archives } = useParaArchives();
  const { canEdit } = usePermissions();
  const actions = useParaActions();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(DEFAULT_DATE_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [restoring, setRestoring] = useState<ParaArchive | null>(null);

  const filtered = archives
    .filter((a) => typeFilter === "all" || a.originalType === typeFilter)
    .filter((a) => !search || archiveName(a).toLowerCase().includes(search.toLowerCase()))
    .filter((a) => matchesDateFilter(a.archivedAt, dateFilter, today))
    .sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());

  return (
    <div className="flex flex-col gap-5 md:flex-row">
      <Card className="h-fit w-full shrink-0 py-4 md:w-60">
        <CardContent className="flex flex-col gap-1 px-3">
          <h4 className="mb-1 flex items-center gap-2 px-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
            <Filter className="size-3" /> Filter Arsip
          </h4>
          {(Object.keys(TYPE_LABELS) as TypeFilter[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setTypeFilter(type);
                setPage(1);
              }}
              className={cn(
                "flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                typeFilter === type
                  ? "bg-module text-module-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {TYPE_LABELS[type]}
              {typeFilter === type && <CheckCircle2 className="size-4" />}
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <ParaInfo icon={Archive} {...PARA_INFO.archives} />
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Cari dalam arsip..." className="md:w-72" />
          <DateRangeFilter value={dateFilter} onChange={setDateFilter} />
        </div>

        {filtered.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-muted text-muted-foreground">
                <Archive />
              </EmptyMedia>
              <EmptyDescription>Tidak ada item arsip yang sesuai filter.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {paginate(filtered, page, pageSize).map((arch) => (
              <li
                key={arch.id}
                className="flex flex-col justify-between gap-3 rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md md:flex-row md:items-center"
              >
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge className={cn("uppercase", TYPE_STYLE[arch.originalType] ?? "bg-muted")}>
                      {arch.originalType}
                    </Badge>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <History className="size-3" /> Archived: {formatNumericDate(arch.archivedAt)}
                    </span>
                  </div>
                  <h4 className="truncate text-base font-bold">{archiveName(arch)}</h4>
                  {typeof arch.data.description === "string" && arch.data.description && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{arch.data.description}</p>
                  )}
                </div>
                {canEdit && (
                  <Button variant="secondary" size="sm" onClick={() => setRestoring(arch)}>
                    <RotateCcw /> Pulihkan
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <PaginationControl
          totalItems={filtered.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      <ConfirmDialog
        open={!!restoring}
        onOpenChange={(open) => !open && setRestoring(null)}
        title="Aktifkan Kembali?"
        description="Item ini akan dipulihkan dan kembali aktif di daftar utama."
        itemName={restoring ? archiveName(restoring) : undefined}
        confirmLabel="Pulihkan"
        destructive={false}
        onConfirm={() => {
          if (restoring) actions.restore(restoring);
          setRestoring(null);
        }}
      />
    </div>
  );
}
