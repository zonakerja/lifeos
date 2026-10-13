import { Archive, Grid2x2, PencilLine, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { type PageSize, PaginationControl, paginate } from "@/components/common/pagination-control";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { useActivities, useAreas, useProjects } from "@/data/collections";
import { ShareButton } from "@/features/sharing/share-dialog";
import { SharedBadge } from "@/features/sharing/shared-badge";
import { usePermissions } from "@/hooks/use-permissions";
import { itemAccess } from "@/lib/sharing";
import { cn } from "@/lib/utils";
import type { Area } from "@/types/entities";
import { PARA_INFO } from "../lib/para";
import { AreaFormDialog } from "./area-dialogs";
import { CARD_ACTION_CLASS } from "./overview-tab";
import { ParaInfo } from "./para-info";

export function AreasTab({
  onOpenArea,
  onArchiveArea,
}: {
  onOpenArea: (id: string) => void;
  onArchiveArea: (area: Area) => void;
}) {
  const { items: areas, setItems: setAreas } = useAreas();
  const { items: projects } = useProjects();
  const { items: activities } = useActivities();
  const { canEdit } = usePermissions();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [editing, setEditing] = useState<Area | "new" | null>(null);
  const [deleting, setDeleting] = useState<Area | null>(null);

  const requestDelete = (area: Area) => {
    const p = projects.filter((x) => x.areaId === area.id).length;
    const a = activities.filter((x) => x.areaId === area.id && !x.parentId).length;
    if (p > 0 || a > 0) {
      toast.error("Tidak dapat menghapus Area", {
        description: `Area "${area.title}" masih memiliki ${a} sub area dan ${p} project aktif. Hapus atau arsipkan item tersebut terlebih dahulu.`,
      });
      return;
    }
    setDeleting(area);
  };

  return (
    <div className="flex flex-col gap-5">
      <ParaInfo icon={Grid2x2} {...PARA_INFO.areas} />
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">Areas</h3>
        {canEdit && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> New Area
          </Button>
        )}
      </div>

      {areas.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyDescription>
              Belum ada Area. Area adalah tanggung jawab jangka panjang (Health, Finance, Family).
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paginate(areas, page, pageSize).map((area) => {
            const projectCount = projects.filter((p) => p.areaId === area.id).length;
            const subAreaCount = activities.filter((a) => a.areaId === area.id && !a.parentId).length;
            return (
              <div
                key={area.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenArea(area.id)}
                onKeyDown={(e) => e.key === "Enter" && onOpenArea(area.id)}
                className="group relative flex min-w-0 cursor-pointer flex-col gap-2 overflow-hidden rounded-2xl border bg-card p-4 transition-all hover:border-module/40 hover:shadow-md"
              >
                <div className="pointer-events-none absolute -top-8 -left-8 size-20 rounded-full bg-module-gradient opacity-20" />
                {/* Baris atas: penanda | tombol aksi — judul di baris sendiri agar tidak tertimpa */}
                <div className="relative flex min-h-7 items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-module-soft text-module">
                      <Grid2x2 className="size-3.5" />
                    </span>
                    <SharedBadge item={area} recordType="para_area" className="min-w-0 shrink truncate" />
                  </div>
                  {canEdit && itemAccess(area).canEdit && (
                    <div className="-my-1 -mr-1.5 flex shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Ubah"
                        className={CARD_ACTION_CLASS}
                        onClick={() => setEditing(area)}
                      >
                        <PencilLine />
                      </Button>
                      {/* Bagikan, arsipkan, hapus hanya oleh pemilik */}
                      {!area.share && (
                        <>
                          <ShareButton
                            item={area}
                            recordType="para_area"
                            title={area.title}
                            iconOnly
                            className={CARD_ACTION_CLASS}
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Arsipkan"
                            className={cn(CARD_ACTION_CLASS, "hover:text-warning")}
                            onClick={() => onArchiveArea(area)}
                          >
                            <Archive />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Hapus"
                            className={cn(CARD_ACTION_CLASS, "hover:text-destructive")}
                            onClick={() => requestDelete(area)}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <h4 className="relative line-clamp-2 text-base leading-snug font-bold" title={area.title}>
                  {area.title}
                </h4>
                <p className="relative line-clamp-2 text-xs text-muted-foreground">
                  {area.description || "Area tanggung jawab utama."}
                </p>
                <div className="relative mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-[11px] font-semibold">
                  <span className="rounded-md bg-module-soft px-2 py-0.5 text-module">{subAreaCount} sub area</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">{projectCount} project</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PaginationControl
        totalItems={areas.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <AreaFormDialog area={editing} onOpenChange={(open) => !open && setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Area?"
        description="Anda yakin ingin menghapus Area ini secara permanen dari database?"
        itemName={deleting?.title}
        confirmLabel="Konfirmasi Hapus"
        onConfirm={() => {
          if (deleting) setAreas((prev) => prev.filter((a) => a.id !== deleting.id));
          setDeleting(null);
        }}
      />
    </div>
  );
}
