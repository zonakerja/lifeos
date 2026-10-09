import { ArrowRightLeft, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { type PageSize, PaginationControl, paginate } from "@/components/common/pagination-control";
import { SearchableSelect } from "@/components/common/searchable-select";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useMoveLogs, usePhysRefs } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import type { ArchiveMoveLog } from "@/types/entities";
import { useFileControlActions } from "../../use-file-control";
import { BulkMoveDialog, type MoveTarget } from "../bulk-move-dialog";

const ROOT = "root";

/** Warna log berdasarkan prefiks deskripsi (WADAH / MASSAL / ARSIP). */
function logTone(log: ArchiveMoveLog) {
  const desc = log.description || "";
  if (desc.includes("WADAH")) return "border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning";
  if (desc.includes("MASSAL") || desc.includes("BLK")) return "border-primary/30 bg-primary/10 text-primary";
  return "border-success/30 bg-success/10 text-success";
}

/** Pemindahan arsip/wadah massal + riwayat pemindahan. */
export function MovePanel() {
  const { items: refs } = usePhysRefs();
  const { items: logs } = useMoveLogs();
  const { canEdit } = usePermissions();
  const actions = useFileControlActions();
  const [targetId, setTargetId] = useState("");
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  const sorted = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const target = targetId === ROOT ? null : (refs.find((r) => r.id === targetId) ?? null);

  return (
    <div className="space-y-6">
      {canEdit && (
        <SectionCard
          title="1. Tentukan Wadah Tujuan"
          description="Pilih gedung, rak, box, atau map tujuan — lalu tambahkan item lewat pencarian atau scanner."
          action={
            targetId ? (
              <Button variant="link" size="sm" className="text-destructive" onClick={() => setTargetId("")}>
                Reset Tujuan
              </Button>
            ) : undefined
          }
        >
          <SearchableSelect
            value={targetId}
            onChange={setTargetId}
            placeholder="Cari Wadah Tujuan (Gedung, Rak, Box, Map)..."
            options={[
              { value: ROOT, label: "ROOT (Tanpa Wadah)" },
              ...refs.map((r) => ({ value: r.id, label: `[${r.type.toUpperCase()}] ${r.code} - ${r.name}` })),
            ]}
          />
        </SectionCard>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold">Riwayat Pemindahan</h3>
          <p className="text-xs text-muted-foreground">Log aktivitas penataan fisik terbaru.</p>
        </div>
        {canEdit && (
          <Button disabled={!targetId} onClick={() => setMoveTarget(target ?? "root")}>
            <Plus /> Pindahkan
          </Button>
        )}
      </div>

      {sorted.length === 0 ? (
        <Empty className="border-2 border-dashed">
          <EmptyHeader>
            <EmptyTitle>Belum ada riwayat aktivitas.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {paginate(sorted, page, pageSize).map((log) => (
            <div key={log.id} className={cn("flex flex-col gap-3 rounded-2xl border p-4", logTone(log))}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card/60">
                    <ArrowRightLeft className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-foreground">{log.id}</p>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(log.date).toLocaleString("id-ID")}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-xs text-foreground/80">
                      {(log.description || "").replace(/WADAH \| |ARSIP \| |MASSAL \| /g, "")} →{" "}
                      <span className="font-bold text-module">{log.targetName}</span>
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0 bg-card/60 text-[10px] uppercase">
                  Oleh: {log.user}
                </Badge>
              </div>
              {log.movedItems && log.movedItems.length > 0 && (
                <div className="border-t border-current/10 pt-3 md:ml-14">
                  <p className="mb-2 text-[10px] font-bold tracking-widest uppercase opacity-60">
                    Rincian Item Dipindahkan:
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {log.movedItems.map((item, i) => (
                      <div key={`${item.id}-${i}`} className="flex items-center gap-2 rounded-lg bg-card/70 p-2">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-foreground">{item.name}</p>
                          <p className="truncate font-mono text-[9px] text-muted-foreground">{item.code}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <PaginationControl
            totalItems={sorted.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            sizes={[5, 10, 25]}
          />
        </div>
      )}

      <BulkMoveDialog
        target={moveTarget}
        onClose={() => setMoveTarget(null)}
        onExecute={(items) => {
          actions.moveItems(items, target, "scanner");
          toast.success(`Berhasil memindahkan ${items.length} item ke ${target?.name ?? "ROOT"}.`);
          setMoveTarget(null);
        }}
      />
    </div>
  );
}
