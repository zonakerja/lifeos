import { Archive, Layers, PencilLine, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ownedFiles } from "@/features/resources/attachment-cleanup";
import { DeleteWithFilesDialog } from "@/features/resources/delete-with-files-dialog";
import { useAttachmentCleanup } from "@/features/resources/use-attachment-cleanup";
import { ShareButton } from "@/features/sharing/share-dialog";
import { SharedBadge } from "@/features/sharing/shared-badge";
import { itemAccess } from "@/lib/sharing";
import { DateRangeFilter } from "@/components/common/date-range-filter";
import { type PageSize, PaginationControl, paginate } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { useAreas, useProjects, useProjectTasks } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import { useToday } from "@/hooks/use-today";
import { DEFAULT_DATE_FILTER, dateFilterRange } from "@/lib/date-filter";
import { formatNumericDate } from "@/lib/dates";
import type { Project } from "@/types/entities";
import { deleteDescription, isProjectActiveIn, PARA_INFO } from "../lib/para";
import { projectTaskProgress, projectTimeProgress } from "../lib/progress";
import { useParaActions } from "../use-para-actions";
import { MiniProgress } from "./overview-tab";
import { ParaInfo } from "./para-info";
import { ProjectFormDialog } from "./project-dialogs";

export function ProjectsTab({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const today = useToday();
  const { items: projects } = useProjects();
  const { items: areas } = useAreas();
  const { items: tasks } = useProjectTasks();
  const { canEdit } = usePermissions();
  const actions = useParaActions();
  const cleanup = useAttachmentCleanup();
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(DEFAULT_DATE_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  // Lampiran project + action yang ikut terhapus (berkasnya dibersihkan dari storage)
  const deletingAttachments = deleting ? actions.deleteAttachments("project", deleting) : null;
  const [archiving, setArchiving] = useState<Project | null>(null);

  const range = dateFilterRange(dateFilter, today);
  const filtered = projects
    .filter((p) => !search || p.title.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => !range || isProjectActiveIn(p, range[0], range[1], today));

  return (
    <div className="flex flex-col gap-5">
      <ParaInfo icon={Layers} {...PARA_INFO.projects} />
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <h3 className="text-xl font-bold">Active Projects</h3>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Cari Project..." />
          <DateRangeFilter
            value={dateFilter}
            onChange={(v) => {
              setDateFilter(v);
              setPage(1);
            }}
            labels={{ month: "Aktif Bulan Ini", year: "Aktif Tahun Ini" }}
          />
          {canEdit && (
            <Button onClick={() => setEditing("new")}>
              <Plus /> New Project
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyDescription>Tidak ada project yang ditemukan.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paginate(filtered, page, pageSize).map((p) => {
            const area = areas.find((a) => a.id === p.areaId);
            const access = itemAccess(p);
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenProject(p.id)}
                onKeyDown={(e) => e.key === "Enter" && onOpenProject(p.id)}
                className="group flex cursor-pointer flex-col gap-3 rounded-3xl border bg-card p-5 transition-all hover:border-module/40 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Area project milik user lain tidak ikut terbagi → tidak dilabeli "Free Project" */}
                      {(area || !p.share) && (
                        <Badge
                          className={
                            area ? "bg-primary/12 text-primary uppercase" : "bg-mod-notes/15 text-mod-notes uppercase"
                          }
                        >
                          {area ? area.title : "Free Project"}
                        </Badge>
                      )}
                      <SharedBadge item={p} recordType="para_project" />
                    </div>
                    <h4 className="mt-2 truncate text-lg font-bold">{p.title}</h4>
                  </div>
                  {canEdit && access.canEdit && (
                    <div className="flex shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon-sm" title="Ubah" onClick={() => setEditing(p)}>
                        <PencilLine />
                      </Button>
                      {/* Hapus, arsipkan, dan bagikan hanya oleh pemilik */}
                      {access.isOwner && (
                        <>
                          <ShareButton item={p} recordType="para_project" title={p.title} iconOnly />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Hapus"
                            className="hover:text-destructive"
                            onClick={() => setDeleting(p)}
                          >
                            <Trash2 />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Arsipkan"
                            className="hover:text-warning"
                            onClick={() => setArchiving(p)}
                          >
                            <Archive />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <MiniProgress label="Task" value={projectTaskProgress(p, tasks)} className="bg-primary" />
                <MiniProgress label="Waktu" value={projectTimeProgress(p, today)} className="bg-info" />
                <p className="text-xs text-muted-foreground">
                  Deadline: {p.deadline ? formatNumericDate(p.deadline) : "-"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <PaginationControl
        totalItems={filtered.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <ProjectFormDialog project={editing} onOpenChange={(open) => !open && setEditing(null)} />
      <DeleteWithFilesDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Project?"
        description={deleteDescription("Project", deleting ? actions.deleteImpact(deleting.id) : { taskCount: 0 })}
        itemName={deleting?.title}
        files={deletingAttachments ? ownedFiles(deletingAttachments) : []}
        shared={deletingAttachments ? cleanup.referenced(deletingAttachments) : undefined}
        confirmLabel="Konfirmasi Hapus"
        onConfirm={(keepIds) => {
          if (deleting) actions.deleteProject(deleting, keepIds);
          setDeleting(null);
        }}
      />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(open) => !open && setArchiving(null)}
        title="Arsipkan Project?"
        description="Project ini beserta semua action-nya akan dipindahkan ke Arsip. Anda bisa memulihkannya nanti."
        itemName={archiving?.title}
        confirmLabel="Arsipkan"
        destructive={false}
        onConfirm={() => {
          if (archiving) actions.archiveProject(archiving);
          setArchiving(null);
        }}
      />
    </div>
  );
}
