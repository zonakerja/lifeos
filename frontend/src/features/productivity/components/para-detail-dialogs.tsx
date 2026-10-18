import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useActivities, useAreas, useProjects, useProjectTasks } from "@/data/collections";
import { useSearchParam, useSetSearchParams } from "@/hooks/use-search-param";
import type { Area } from "@/types/entities";
import { useParaActions } from "../use-para-actions";
import { AreaDetailDialog } from "./area-dialogs";
import { ProjectDetailDialog } from "./project-dialogs";

interface ParaDetailDialogsProps {
  /** Area yang sedang dikonfirmasi untuk diarsipkan (juga dipicu dari luar, mis. kartu tab Areas) */
  archivingArea: Area | null;
  onArchivingAreaChange: (area: Area | null) => void;
}

/**
 * Dialog detail Project & Area yang dikendalikan URL: `?project=<id>`, `?area=<id>`, `?task=<id>` (membuka project
 * pemilik task, atau area dari sub area/kegiatan pemiliknya). Dipasang di halaman Productivity dan Overview sehingga
 * item bisa dibuka di halaman mana pun tanpa berpindah menu. Agenda di dalamnya memakai `ScheduleDialogs` halaman.
 */
export function ParaDetailDialogs({ archivingArea, onArchivingAreaChange }: ParaDetailDialogsProps) {
  const { items: projects } = useProjects();
  const { items: areas } = useAreas();
  const { items: tasks } = useProjectTasks();
  const { items: activities } = useActivities();
  const actions = useParaActions();

  const [projectId] = useSearchParam("project");
  const [areaId, setAreaId] = useSearchParam("area");
  const [taskId] = useSearchParam("task");
  const setParams = useSetSearchParams();

  const task = taskId ? tasks.find((t) => t.id === taskId) : undefined;
  const taskProject = task ? projects.find((p) => p.id === task.projectId) : undefined;
  const taskArea =
    task && !taskProject
      ? areas.find((a) => a.id === activities.find((x) => x.id === task.projectId)?.areaId)
      : undefined;

  const openProject = projects.find((p) => p.id === projectId) ?? taskProject ?? null;
  const openArea = areas.find((a) => a.id === areaId) ?? taskArea ?? null;
  // Dibuka dari task area: kegiatan pemilik task langsung terpilih (tanpa ini panel kanan kosong)
  const areaSelection = taskArea && !areaId && task ? { kind: "activity" as const, id: task.projectId } : null;

  return (
    <>
      <ProjectDetailDialog
        project={openProject}
        onOpenChange={(open) => {
          if (open) return;
          setParams({ project: null, task: null });
        }}
      />
      <AreaDetailDialog
        area={openArea}
        initialSelection={areaSelection}
        onArchive={onArchivingAreaChange}
        onOpenChange={(open) => {
          if (open) return;
          setParams({ area: null, task: null });
        }}
      />
      <ConfirmDialog
        open={!!archivingArea}
        onOpenChange={(open) => !open && onArchivingAreaChange(null)}
        title="Arsipkan Area?"
        description="Area ini beserta semua project, sub area, kegiatan, sub kegiatan, dan task di dalamnya akan dipindahkan ke Arsip. Memulihkan area akan mengembalikan semuanya."
        itemName={archivingArea?.title}
        confirmLabel="Arsipkan"
        destructive={false}
        onConfirm={() => {
          if (archivingArea) {
            actions.archiveArea(archivingArea);
            if (openArea?.id === archivingArea.id) setAreaId(null);
          }
          onArchivingAreaChange(null);
        }}
      />
    </>
  );
}
