import { BookOpen, Grid2x2, Layers } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { HeroStat, ModulePage } from "@/components/layout/module-page";
import { useActivities, useAreas, useProjects, useProjectTasks, useResources } from "@/data/collections";
import { ScheduleDialogs } from "@/features/planner/components/schedule-dialogs";
import { useSearchParam, useSetSearchParams } from "@/hooks/use-search-param";
import type { Area } from "@/types/entities";
import { AreaDetailDialog } from "./components/area-dialogs";
import { AreasTab } from "./components/areas-tab";
import { ArchivesTab } from "./components/archives-tab";
import { OverviewTab } from "./components/overview-tab";
import { ProjectDetailDialog } from "./components/project-dialogs";
import { ProjectsTab } from "./components/projects-tab";
import { ResourcesTab } from "./components/resources-tab";
import { useParaActions } from "./use-para-actions";

export function Component() {
  const { items: projects } = useProjects();
  const { items: areas } = useAreas();
  const { items: resources } = useResources();
  const { items: tasks } = useProjectTasks();
  const { items: activities } = useActivities();
  const actions = useParaActions();
  const [archivingArea, setArchivingArea] = useState<Area | null>(null);

  // Dialog detail dikendalikan URL (deep link dari overview, notifikasi, pencarian, chatbot)
  const [projectId, setProjectId] = useSearchParam("project");
  const [areaId, setAreaId] = useSearchParam("area");
  const [taskId] = useSearchParam("task");
  const setParams = useSetSearchParams();

  // ?task=<id> → buka project pemiliknya, atau area dari sub area/kegiatan pemiliknya
  const task = taskId ? tasks.find((t) => t.id === taskId) : undefined;
  const taskProject = task ? projects.find((p) => p.id === task.projectId) : undefined;
  const taskArea =
    task && !taskProject
      ? areas.find((a) => a.id === activities.find((x) => x.id === task.projectId)?.areaId)
      : undefined;

  const openProject = projects.find((p) => p.id === projectId) ?? taskProject ?? null;
  const openArea = areas.find((a) => a.id === areaId) ?? taskArea ?? null;

  return (
    <ModulePage
      module="productivity"
      meta={
        <>
          <HeroStat>
            <Layers className="size-3.5" /> {projects.length} projects
          </HeroStat>
          <HeroStat>
            <Grid2x2 className="size-3.5" /> {areas.length} areas
          </HeroStat>
          <HeroStat>
            <BookOpen className="size-3.5" /> {resources.length} resources
          </HeroStat>
        </>
      }
    >
      {(tab) => (
        <>
          {tab === "overview" && <OverviewTab onOpenProject={(id) => setProjectId(id, { replace: false })} />}
          {tab === "projects" && <ProjectsTab onOpenProject={(id) => setProjectId(id, { replace: false })} />}
          {tab === "areas" && (
            <AreasTab onOpenArea={(id) => setAreaId(id, { replace: false })} onArchiveArea={setArchivingArea} />
          )}
          {tab === "resources" && <ResourcesTab />}
          {tab === "archives" && <ArchivesTab />}

          <ProjectDetailDialog
            project={openProject}
            onOpenChange={(open) => {
              if (open) return;
              setParams({ project: null, task: null });
            }}
          />
          {/* Agenda milik Project / item Area: tampilan lihat (Hasil Agenda) & form (?agenda=, ?edit=) */}
          <ScheduleDialogs />
          <AreaDetailDialog
            area={openArea}
            onArchive={setArchivingArea}
            onOpenChange={(open) => {
              if (open) return;
              setParams({ area: null, task: null });
            }}
          />
          <ConfirmDialog
            open={!!archivingArea}
            onOpenChange={(open) => !open && setArchivingArea(null)}
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
              setArchivingArea(null);
            }}
          />
        </>
      )}
    </ModulePage>
  );
}
