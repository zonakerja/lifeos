import { BookOpen, Grid2x2, Layers } from "lucide-react";
import { useState } from "react";
import { HeroStat, ModulePage } from "@/components/layout/module-page";
import { useAreas, useProjects, useResources } from "@/data/collections";
import { ScheduleDialogs } from "@/features/planner/components/schedule-dialogs";
import { useSearchParam } from "@/hooks/use-search-param";
import type { Area } from "@/types/entities";
import { AreasTab } from "./components/areas-tab";
import { ArchivesTab } from "./components/archives-tab";
import { OverviewTab } from "./components/overview-tab";
import { ParaDetailDialogs } from "./components/para-detail-dialogs";
import { ProjectsTab } from "./components/projects-tab";
import { ResourcesTab } from "./components/resources-tab";

export function Component() {
  const { items: projects } = useProjects();
  const { items: areas } = useAreas();
  const { items: resources } = useResources();
  const [archivingArea, setArchivingArea] = useState<Area | null>(null);

  // Dialog detail dikendalikan URL (deep link dari overview, notifikasi, pencarian, chatbot) — lihat ParaDetailDialogs
  const [, setProjectId] = useSearchParam("project");
  const [, setAreaId] = useSearchParam("area");

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

          <ParaDetailDialogs archivingArea={archivingArea} onArchivingAreaChange={setArchivingArea} />
          {/* Agenda milik Project / item Area: tampilan lihat (Hasil Agenda) & form (?agenda=, ?edit=) */}
          <ScheduleDialogs />
        </>
      )}
    </ModulePage>
  );
}
