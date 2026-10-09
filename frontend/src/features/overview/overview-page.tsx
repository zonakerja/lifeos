import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  Clock,
  Layers,
  MapPin,
  PencilLine,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router";
import { SectionCard } from "@/components/common/section-card";
import { HeroStat, ModulePage } from "@/components/layout/module-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import {
  useActivities,
  useCompletions,
  useProjects,
  useProjectTasks,
  useRoutines,
  useSchedules,
  useTodos,
} from "@/data/collections";
import {
  compareScheduleTime,
  isRoutineActiveOnDate,
  isScheduleOnDate,
  scheduleTimeLabel,
} from "@/features/planner/lib/planner-logic";
import { projectTaskProgress, projectTimeProgress } from "@/features/productivity/lib/progress";
import { useToday } from "@/hooks/use-today";
import { formatDayMonth, formatFullDate, formatLocalYMD, toDateKey } from "@/lib/dates";
import { links } from "@/lib/deep-links";
import { useAuthStore } from "@/stores/auth-store";

const FAR_FUTURE = 8640000000000000;

export function Component() {
  const user = useAuthStore((s) => s.user);
  const today = useToday();
  const todayYmd = formatLocalYMD(today);
  const todayKey = toDateKey(today);

  const { items: routines } = useRoutines();
  const { items: completions } = useCompletions();
  const { items: schedules } = useSchedules();
  const { items: todos } = useTodos();
  const { items: projects } = useProjects();
  const { items: tasks } = useProjectTasks();
  const { items: activities } = useActivities();

  // Performa rutinitas hari ini
  const activeRoutines = routines.filter((r) => isRoutineActiveOnDate(r, today));
  const doneRoutines = activeRoutines.filter((r) =>
    completions.some((c) => c.routineId === r.id && c.date === todayKey),
  ).length;
  const routinePct = activeRoutines.length === 0 ? 0 : Math.round((doneRoutines / activeRoutines.length) * 100);

  // Tugas prioritas tinggi (todo + task/action produktivitas), 3 terdekat
  const urgent = [
    ...todos
      .filter((t) => t.priority === "high" && !t.completed)
      .map((t) => ({
        id: `todo-${t.id}`,
        title: t.title,
        parent: "",
        path: links.todo(t.id),
        sort: new Date(t.date || FAR_FUTURE).getTime(),
      })),
    ...tasks
      .filter((t) => t.priority === "high" && !t.completed)
      .map((t) => {
        const parent =
          projects.find((p) => p.id === t.projectId)?.title ??
          activities.find((a) => a.id === t.projectId)?.title ??
          "";
        return {
          id: `task-${t.id}`,
          title: t.title,
          parent,
          path: links.task(t.id),
          sort: new Date(t.dueDate || FAR_FUTURE).getTime(),
        };
      }),
  ]
    .sort((a, b) => a.sort - b.sort)
    .slice(0, 3);

  const runningProjects = projects.filter((p) => p.status !== "archived").slice(0, 4);
  const agendaToday = schedules.filter((s) => isScheduleOnDate(s, todayYmd)).sort(compareScheduleTime);

  return (
    <ModulePage
      module="overview"
      title={`Halo, ${user?.name ?? ""}`}
      description={
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5" /> {formatFullDate(today)}
        </span>
      }
      meta={
        <>
          <HeroStat>
            <CalendarDays className="size-3.5" /> {agendaToday.length} agenda
          </HeroStat>
          <HeroStat>
            <AlertTriangle className="size-3.5" /> {urgent.length} tugas mendesak
          </HeroStat>
          <HeroStat>
            <Layers className="size-3.5" /> {runningProjects.length} proyek berjalan
          </HeroStat>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Performa rutinitas */}
        <section
          data-module="productivity"
          className="relative overflow-hidden rounded-3xl bg-module-gradient p-6 text-white shadow-lg shadow-module/25 md:p-8"
        >
          <div className="pointer-events-none absolute -top-16 -right-16 size-64 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold tracking-tight md:text-2xl">Performa Rutinitas</h3>
              <span className="rounded-2xl bg-white/20 p-3 backdrop-blur">
                <RefreshCw className="size-5" />
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-extrabold tracking-tighter">{routinePct}%</span>
              <span className="font-medium text-white/85">selesai hari ini</span>
            </div>
            <Progress value={routinePct} className="h-3 bg-black/20" indicatorClassName="bg-white" />
            <p className="text-sm text-white/90">
              {doneRoutines} dari {activeRoutines.length} kebiasaan telah dilakukan.
              {routinePct === 100 ? " Luar biasa! 🎉" : " Tetap semangat! 💪"}
            </p>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-5">
          {/* Tugas mendesak */}
          <div data-module="notes" className="lg:col-span-2">
            <SectionCard
              icon={AlertTriangle}
              title="Tugas Mendesak"
              description="Fokus selesaikan ini."
              className="h-full"
            >
              {urgent.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {urgent.map((task) => (
                    <li key={task.id}>
                      <Link
                        to={task.path}
                        className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3 transition-colors hover:bg-module-soft"
                      >
                        <span className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{task.title}</span>
                          {task.parent && (
                            <span className="block truncate text-[11px] text-muted-foreground">{task.parent}</span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty className="border border-dashed py-8">
                  <EmptyHeader>
                    <EmptyDescription>Aman! Tidak ada tugas prioritas mendesak.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </SectionCard>
          </div>

          {/* Agenda hari ini */}
          <div data-module="planner" className="lg:col-span-3">
            <SectionCard
              icon={CalendarRange}
              title="Agenda Hari Ini"
              description="Jadwal penuh hari ini."
              className="h-full"
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/planner/daily">
                    Planner <ArrowRight />
                  </Link>
                </Button>
              }
            >
              {agendaToday.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {agendaToday.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between gap-3 rounded-2xl border bg-muted/30 p-4"
                    >
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          {item.type && <Badge className="bg-module/15 text-module uppercase">{item.type}</Badge>}
                          <span className="flex items-center gap-1 text-sm font-bold text-module">
                            <Clock className="size-3.5" /> {item.isAllDay ? "All Day" : scheduleTimeLabel(item)}
                          </span>
                        </div>
                        <h4 className="font-bold">{item.title}</h4>
                        {item.location && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="size-3" /> {item.location}
                          </p>
                        )}
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <Link to={links.scheduleEdit(item.id)}>
                          <PencilLine /> Detail / Edit
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty className="border border-dashed py-8">
                  <EmptyHeader>
                    <EmptyDescription>Tidak ada agenda hari ini.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </SectionCard>
          </div>
        </div>

        {/* Proyek berjalan */}
        <div data-module="productivity">
          <SectionCard
            icon={Layers}
            title="Proyek Berjalan"
            description="Pantau progres tugas dan sisa waktu proyek Anda."
            action={
              <Button variant="secondary" size="sm" asChild>
                <Link to="/productivity/projects">Lihat Semua</Link>
              </Button>
            }
          >
            {runningProjects.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {runningProjects.map((p) => {
                  const taskPct = projectTaskProgress(p, tasks);
                  const timePct = projectTimeProgress(p, today);
                  return (
                    <Link
                      key={p.id}
                      to={links.project(p.id)}
                      className="flex flex-col gap-4 rounded-2xl border bg-muted/30 p-4 transition-all hover:border-module/40 hover:bg-card hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="truncate text-base font-bold">{p.title}</h4>
                        {p.deadline && (
                          <Badge variant="secondary" className="shrink-0">
                            <CalendarDays /> {formatDayMonth(p.deadline)}
                          </Badge>
                        )}
                      </div>
                      <ProgressRow label="Task Completion" value={taskPct} className="bg-success" />
                      <ProgressRow label="Time Elapsed" value={timePct} className="bg-info" />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Empty className="border border-dashed py-10">
                <EmptyHeader>
                  <EmptyDescription>Belum ada proyek aktif. Silakan tambah di menu Productivity.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </SectionCard>
        </div>
      </div>
    </ModulePage>
  );
}

function ProgressRow({ label, value, className }: { label: string; value: number; className: string }) {
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
