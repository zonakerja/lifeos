import { Archive, Box, CalendarDays, Grid2x2, Layers } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import {
  useActivities,
  useAreas,
  useParaArchives,
  useProjects,
  useProjectTasks,
  useResources,
} from "@/data/collections";
import { useToday } from "@/hooks/use-today";
import { formatNumericDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { enrichTasks } from "../lib/para";
import { projectTaskProgress, projectTimeProgress } from "../lib/progress";
import { DayDetailDialog, ParaCalendar } from "./para-calendar";

export function OverviewTab({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const today = useToday();
  const { items: projects } = useProjects();
  const { items: areas } = useAreas();
  const { items: resources } = useResources();
  const { items: archives } = useParaArchives();
  const { items: tasks } = useProjectTasks();
  const { items: activities } = useActivities();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const enriched = enrichTasks(tasks, projects, activities);
  const incomplete = projects
    .filter((p) => projectTaskProgress(p, tasks) < 100 || projectTimeProgress(p, today) < 100)
    .slice(0, 5);

  const stats = [
    { label: "Projects", value: projects.length, icon: Layers, module: "overview" },
    { label: "Areas", value: areas.length, icon: Grid2x2, module: "productivity" },
    { label: "Resources", value: resources.length, icon: Box, module: "notes" },
    { label: "Archives", value: archives.length, icon: Archive, module: "settings" },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            data-module={s.module}
            className="relative overflow-hidden rounded-3xl bg-module-gradient p-5 text-white shadow-md shadow-module/20"
          >
            <div className="pointer-events-none absolute -right-6 -bottom-6 size-24 rounded-full bg-white/15" />
            <s.icon className="mb-3 size-7 opacity-85" />
            <p className="text-sm font-medium text-white/85">{s.label}</p>
            <p className="text-3xl font-extrabold">{s.value}</p>
          </div>
        ))}
      </div>

      <ParaCalendar projects={projects} tasks={enriched} onDateClick={setSelectedDate} />

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-bold">Recent Active Projects</h3>
        {incomplete.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyDescription>Tidak ada project aktif yang belum selesai.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          incomplete.map((p) => {
            const area = areas.find((a) => a.id === p.areaId);
            const taskPct = projectTaskProgress(p, tasks);
            const timePct = projectTimeProgress(p, today);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenProject(p.id)}
                className="flex flex-col gap-4 rounded-2xl border bg-card p-4 text-left transition-shadow hover:shadow-md md:flex-row md:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge
                      className={cn(
                        area ? "bg-primary/12 text-primary" : "bg-mod-notes/15 text-mod-notes",
                        "uppercase",
                      )}
                    >
                      {area ? area.title : "Free Project"}
                    </Badge>
                    {p.deadline && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="size-3" /> {formatNumericDate(p.deadline)}
                      </span>
                    )}
                  </div>
                  <h4 className="truncate text-base font-bold">{p.title}</h4>
                </div>
                <div className="flex w-full flex-col gap-2.5 md:w-1/3">
                  <MiniProgress label="Task Completion" value={taskPct} className="bg-primary" />
                  <MiniProgress label="Time Elapsed" value={timePct} className="bg-info" />
                </div>
              </button>
            );
          })
        )}
      </section>

      <DayDetailDialog
        date={selectedDate}
        projects={projects}
        tasks={enriched}
        onOpenChange={(open) => !open && setSelectedDate(null)}
      />
    </div>
  );
}

/** Tombol aksi ikon di kartu Project/Area: lebih kecil dari icon-sm agar tidak mendesak judul. */
export const CARD_ACTION_CLASS = "size-7 [&_svg:not([class*='size-'])]:size-3.5";

export function MiniProgress({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] font-bold text-muted-foreground uppercase">
        <span>{label}</span>
        <span>{value.toFixed(0)}%</span>
      </div>
      <Progress value={value} className="h-1.5" indicatorClassName={className} />
    </div>
  );
}
