import { Archive, Grid2x2, PencilLine, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { type PageSize, PaginationControl, paginate } from "@/components/common/pagination-control";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { useActivities, useAreas, useProjects } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import type { Area } from "@/types/entities";
import { PARA_INFO } from "../lib/para";
import { AreaFormDialog } from "./area-dialogs";
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
    const a = activities.filter((x) => x.areaId === area.id).length;
    if (p > 0 || a > 0) {
      toast.error("Tidak dapat menghapus Area", {
        description: `Area "${area.title}" masih memiliki ${a} kegiatan dan ${p} project aktif. Hapus atau arsipkan item tersebut terlebih dahulu.`,
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paginate(areas, page, pageSize).map((area) => {
            const projectCount = projects.filter((p) => p.areaId === area.id).length;
            return (
              <div
                key={area.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenArea(area.id)}
                onKeyDown={(e) => e.key === "Enter" && onOpenArea(area.id)}
                className="group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl border bg-card p-6 transition-transform hover:scale-[1.02] hover:shadow-xl"
              >
                <div className="pointer-events-none absolute -top-6 -right-6 size-24 rounded-full bg-module-gradient opacity-25" />
                <div className="relative mb-2 flex items-start justify-between gap-2">
                  <h4 className="text-xl font-bold">{area.title}</h4>
                  {canEdit && (
                    <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon-sm" title="Ubah" onClick={() => setEditing(area)}>
                        <PencilLine />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Arsipkan"
                        className="hover:text-warning"
                        onClick={() => onArchiveArea(area)}
                      >
                        <Archive />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Hapus"
                        className="hover:text-destructive"
                        onClick={() => requestDelete(area)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="relative mb-6 line-clamp-2 text-xs text-muted-foreground">
                  {area.description || "Area tanggung jawab utama."}
                </p>
                <div className="relative mt-auto flex items-end justify-between">
                  <span className="text-3xl font-extrabold text-module">{projectCount}</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Active Projects</span>
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
