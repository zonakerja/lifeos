import { useAreas, useParaArchives, useProjects, useResources } from "@/data/collections";
import { generateId } from "@/lib/ids";
import type { Area, ParaArchive, Project, Resource } from "@/types/entities";

/**
 * Operasi arsip/pulihkan PARA.
 * Item yang diarsipkan dipindahkan ke koleksi `para_archive` sebagai snapshot `data`.
 */
export function useParaActions() {
  const projects = useProjects();
  const areas = useAreas();
  const resources = useResources();
  const archives = useParaArchives();

  const snapshot = (originalType: ParaArchive["originalType"], data: object): ParaArchive => ({
    id: generateId("arch"),
    originalType,
    data: data as Record<string, unknown>,
    archivedAt: new Date().toISOString(),
  });

  return {
    /** Area beserta semua project di dalamnya dipindahkan ke arsip. */
    archiveArea(area: Area) {
      const related = projects.items.filter((p) => p.areaId === area.id);
      archives.setItems((prev) => [...prev, snapshot("area", area), ...related.map((p) => snapshot("project", p))]);
      areas.setItems((prev) => prev.filter((a) => a.id !== area.id));
      projects.setItems((prev) => prev.filter((p) => p.areaId !== area.id));
    },
    archiveProject(project: Project) {
      archives.setItems((prev) => [...prev, snapshot("project", project)]);
      projects.setItems((prev) => prev.filter((p) => p.id !== project.id));
    },
    archiveResource(resource: Resource) {
      archives.setItems((prev) => [...prev, snapshot("resource", resource)]);
      resources.setItems((prev) => prev.filter((r) => r.id !== resource.id));
    },
    restore(item: ParaArchive) {
      if (item.originalType === "project") projects.setItems((prev) => [...prev, item.data as unknown as Project]);
      else if (item.originalType === "area") areas.setItems((prev) => [...prev, item.data as unknown as Area]);
      else if (item.originalType === "resource")
        resources.setItems((prev) => [...prev, item.data as unknown as Resource]);
      archives.setItems((prev) => prev.filter((a) => a.id !== item.id));
    },
  };
}
