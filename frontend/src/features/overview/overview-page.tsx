import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  CheckSquare,
  Clock,
  Layers,
  MapPin,
  Plus,
  RefreshCw,
  Repeat,
  Video,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { PriorityBadge } from "@/components/common/priority-badge";
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
  scheduleLinks,
} from "@/features/planner/lib/planner-logic";
import { TodoDialog } from "@/features/planner/components/planner-dialogs";
import { ScheduleDialogs } from "@/features/planner/components/schedule-dialogs";
import { CompleteTaskDialog } from "@/features/productivity/components/complete-task-dialog";
import { ParaDetailDialogs } from "@/features/productivity/components/para-detail-dialogs";
import { completionDefaults } from "@/features/productivity/lib/para";
import { projectTaskProgress, projectTimeProgress } from "@/features/productivity/lib/progress";
import { useNow } from "@/hooks/use-now";
import { useOpenSession } from "@/hooks/use-retained";
import { useSearchParam } from "@/hooks/use-search-param";
import { useToday } from "@/hooks/use-today";
import { completionPatch } from "@/lib/completion";
import { formatDayMonth, formatFullDate, formatLocalYMD, parseLocalYMD, toDateKey } from "@/lib/dates";
import { itemAccess } from "@/lib/sharing";
import { toExternalHref } from "@/lib/urls";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { type Area, completionId, type Priority, type ProjectTask } from "@/types/entities";
import {
  AGENDA_STATUS_LABEL,
  agendaStatus,
  agendaTimeLabel,
  type AgendaStatus,
  isOverdue,
  type OverviewTask,
  runningProjects,
  todayTasks,
  urgentTasks,
} from "./lib/overview-logic";

/** Jumlah baris yang tampil per kartu tugas sebelum diarahkan ke Planner. */
const URGENT_LIMIT = 5;
const TODAY_LIMIT = 8;
const PROJECT_LIMIT = 4;

/** ID todo baru (sama dengan Planner Harian). */
const newTodoId = () => `todo-${Date.now()}`;

const AGENDA_STATUS_STYLE: Record<AgendaStatus, string> = {
  upcoming: "bg-info/12 text-info",
  ongoing: "bg-success/15 text-success",
  done: "bg-muted text-muted-foreground",
};

export function Component() {
  const user = useAuthStore((s) => s.user);
  const today = useToday();
  const now = useNow();
  const todayYmd = formatLocalYMD(today);
  const todayKey = toDateKey(today);
  const [, setAgendaParam] = useSearchParam("agenda");
  // Item dibuka sebagai modal di Overview (tanpa berpindah menu): ?todo=<id>|new, ?task=<id>, ?project=<id>
  const [todoParam, setTodoParam] = useSearchParam("todo");

  const { items: routines } = useRoutines();
  const { items: completions, setItems: setCompletions } = useCompletions();
  const { items: schedules } = useSchedules();
  const { items: todos, setItems: setTodos } = useTodos();
  const { items: projects } = useProjects();
  const { items: tasks, setItems: setTasks } = useProjectTasks();
  const { items: activities } = useActivities();

  const [completing, setCompleting] = useState<{ task: ProjectTask; isAction: boolean } | null>(null);
  const [archivingArea, setArchivingArea] = useState<Area | null>(null);
  const editingTodo = todoParam && todoParam !== "new" ? (todos.find((t) => t.id === todoParam) ?? null) : null;
  const todoOpen = todoParam === "new" || !!editingTodo;
  // Form todo dimulai ulang setiap dibuka (tanggal/judul tidak terbawa dari todo sebelumnya)
  const todoSession = useOpenSession(todoOpen);

  const saveTodo = (title: string, priority: Priority, todoYmd: string) => {
    const date = toDateKey(parseLocalYMD(todoYmd));
    const editing = editingTodo;
    if (editing) setTodos((prev) => prev.map((t) => (t.id === editing.id ? { ...t, title, priority, date } : t)));
    else setTodos((prev) => [...prev, { id: newTodoId(), title, completed: false, date, priority }]);
  };

  // Rutinitas hari ini
  const activeRoutines = routines.filter((r) => isRoutineActiveOnDate(r, today));
  const isRoutineDone = (routineId: string) =>
    completions.some((c) => completionId(c) === completionId({ routineId, date: todayKey }));
  const doneRoutines = activeRoutines.filter((r) => isRoutineDone(r.id)).length;
  const routinePct = activeRoutines.length === 0 ? 0 : Math.round((doneRoutines / activeRoutines.length) * 100);

  const urgent = urgentTasks(todos, tasks, today);
  const todays = todayTasks(todos, tasks, todayYmd);
  const openToday = todays.filter((e) => !e.item.completed).length;
  const running = runningProjects(projects);
  const agendaToday = schedules.filter((s) => isScheduleOnDate(s, todayYmd)).sort(compareScheduleTime);

  /** Induk task/action (judul project atau item area) dan jenisnya. */
  const parentOf = (t: ProjectTask) => {
    const project = projects.find((p) => p.id === t.projectId);
    if (project) return { name: project.title, isAction: true };
    return { name: activities.find((a) => a.id === t.projectId)?.title ?? "", isAction: false };
  };

  const toggleRoutine = (routineId: string) => {
    const done = isRoutineDone(routineId);
    setCompletions((prev) =>
      done
        ? prev.filter((c) => !(c.routineId === routineId && c.date === todayKey))
        : [
            ...prev,
            { routineId, date: todayKey, actualDate: todayKey, note: "", completedAt: new Date().toISOString() },
          ],
    );
  };

  const toggleTask = (entry: OverviewTask) => {
    if (entry.kind === "todo") {
      const completed = !entry.item.completed;
      const id = entry.item.id;
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...completionPatch(completed) } : t)));
      if (completed && isOverdue(entry, todayYmd)) toast.success("Tugas terlambat diselesaikan hari ini.");
      return;
    }
    const task = entry.item;
    // Sama dengan Planner & Productivity: centang → dialog Tandai Selesai; batal centang langsung
    if (task.completed)
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...completionPatch(false) } : t)));
    else setCompleting({ task, isAction: parentOf(task).isAction });
  };

  const renderTask = (entry: OverviewTask) => {
    const done = !!entry.item.completed;
    const parent = entry.kind === "task" ? parentOf(entry.item) : null;
    const canEdit = entry.kind === "todo" || itemAccess(entry.item).canEdit;
    const overdue = isOverdue(entry, todayYmd);
    return (
      <li
        key={entry.id}
        className={cn(
          "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
          done ? "bg-muted/40" : "bg-card hover:bg-module-soft",
        )}
      >
        <button
          type="button"
          disabled={!canEdit}
          aria-label={done ? `Batalkan selesai: ${entry.item.title}` : `Tandai selesai: ${entry.item.title}`}
          title={canEdit ? (done ? "Batalkan selesai" : "Tandai selesai") : "Hanya bisa dilihat"}
          onClick={() => toggleTask(entry)}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors disabled:cursor-default disabled:opacity-50",
            done ? "border-module bg-module text-module-foreground" : "border-muted-foreground/40 hover:border-module",
          )}
        >
          {done && <Check className="size-3" strokeWidth={4} />}
        </button>
        <Link
          to={{
            search:
              entry.kind === "todo"
                ? `?todo=${encodeURIComponent(entry.item.id)}`
                : `?task=${encodeURIComponent(entry.item.id)}`,
          }}
          className="min-w-0 flex-1"
          title="Buka detail"
        >
          <span className={cn("block truncate text-sm font-semibold", done && "text-muted-foreground line-through")}>
            {entry.item.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {overdue ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                <CalendarClock className="size-3" /> Terlambat · {formatDayMonth(parseLocalYMD(entry.due))}
              </span>
            ) : (
              entry.due &&
              entry.due !== todayYmd && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                  <CalendarDays className="size-3" /> {formatDayMonth(parseLocalYMD(entry.due))}
                </span>
              )
            )}
            {!done && <PriorityBadge priority={entry.item.priority} />}
            {parent && (
              <Badge className={parent.isAction ? "bg-mod-notes/15 text-mod-notes" : "bg-primary/12 text-primary"}>
                {parent.isAction ? "Action" : "Task"}
              </Badge>
            )}
            {parent?.name && (
              <span className="max-w-40 truncate text-[10px] font-semibold text-muted-foreground">{parent.name}</span>
            )}
          </span>
        </Link>
      </li>
    );
  };

  const moreLink = (count: number) =>
    count > 0 && (
      <Button variant="ghost" size="sm" className="self-start text-xs" asChild>
        <Link to="/planner/daily">
          +{count} lainnya di Planner <ArrowRight />
        </Link>
      </Button>
    );

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
            <CheckSquare className="size-3.5" /> {openToday} to-do hari ini
          </HeroStat>
          <HeroStat>
            <AlertTriangle className="size-3.5" /> {urgent.length} tugas mendesak
          </HeroStat>
          <HeroStat>
            <Layers className="size-3.5" /> {running.length} proyek berjalan
          </HeroStat>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          {/* Rutinitas hari ini (bisa dicentang langsung) */}
          <section
            data-module="planner"
            className="relative overflow-hidden rounded-3xl bg-module-gradient p-6 text-white shadow-lg shadow-module/25 lg:col-span-2"
          >
            <div className="pointer-events-none absolute -top-16 -right-16 size-64 rounded-full bg-white/10 blur-3xl" />
            <div className="relative flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl font-bold tracking-tight">Rutinitas Hari Ini</h3>
                <Link
                  to="/planner/routines"
                  title="Kelola rutinitas"
                  className="rounded-2xl bg-white/20 p-3 backdrop-blur transition-colors hover:bg-white/30"
                >
                  <RefreshCw className="size-5" />
                </Link>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-extrabold tracking-tighter">{routinePct}%</span>
                <span className="font-medium opacity-85">
                  {doneRoutines} dari {activeRoutines.length} selesai
                </span>
              </div>
              <Progress value={routinePct} className="h-3 bg-black/20" indicatorClassName="bg-white" />
              {activeRoutines.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {activeRoutines.map((r) => {
                    const done = isRoutineDone(r.id);
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => toggleRoutine(r.id)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors",
                            done ? "bg-white/25" : "bg-black/10 hover:bg-white/15",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-md border-2 border-white/80",
                              done && "bg-white text-module",
                            )}
                          >
                            {done && <Check className="size-3" strokeWidth={4} />}
                          </span>
                          <span className={cn("truncate", done && "line-through opacity-80")}>{r.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm opacity-90">Tidak ada rutinitas yang dijadwalkan hari ini.</p>
              )}
              {activeRoutines.length > 0 && routinePct === 100 && (
                <p className="text-sm font-semibold">Semua rutinitas selesai. Luar biasa! 🎉</p>
              )}
            </div>
          </section>

          {/* Agenda hari ini */}
          <div data-module="planner" className="min-w-0 lg:col-span-3">
            <SectionCard
              icon={CalendarRange}
              title="Agenda Hari Ini"
              description={
                agendaToday.length > 0
                  ? `${agendaToday.filter((s) => agendaStatus(s, now) !== "done").length} belum selesai`
                  : "Jadwal hari ini"
              }
              className="h-full"
              action={
                <div className="flex gap-1">
                  <Button
                    size="icon-sm"
                    title="Tambah agenda"
                    aria-label="Tambah agenda"
                    onClick={() => setAgendaParam("new")}
                  >
                    <Plus />
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/planner/daily">
                      Planner <ArrowRight />
                    </Link>
                  </Button>
                </div>
              }
            >
              {agendaToday.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {agendaToday.map((item) => {
                    const status = agendaStatus(item, now);
                    const mediaLinks = scheduleLinks(item);
                    const mediaHref = status !== "done" ? toExternalHref(mediaLinks[0]) : null;
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border-l-4 border-l-module bg-module/8 p-3 transition-colors hover:bg-module/15",
                          status === "done" && "opacity-60",
                        )}
                      >
                        <button
                          type="button"
                          title="Lihat detail agenda"
                          onClick={() => setAgendaParam(item.id)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="hidden w-20 shrink-0 text-xs font-bold text-module sm:block">
                            {agendaTimeLabel(item)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-semibold">{item.title}</span>
                              {item.seriesId && (
                                <Repeat className="size-3 shrink-0 text-module" aria-label="Agenda berulang" />
                              )}
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span className="font-bold text-module sm:hidden">{agendaTimeLabel(item)}</span>
                              <Badge className={AGENDA_STATUS_STYLE[status]}>{AGENDA_STATUS_LABEL[status]}</Badge>
                              {item.type && <span className="truncate">{item.type}</span>}
                              {item.location ? (
                                <span className="flex min-w-0 items-center gap-1">
                                  <MapPin className="size-3 shrink-0" />{" "}
                                  <span className="truncate">{item.location}</span>
                                </span>
                              ) : (
                                mediaLinks.length > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Video className="size-3 shrink-0" /> Online
                                  </span>
                                )
                              )}
                            </span>
                          </span>
                        </button>
                        {mediaHref && (
                          <Button size="sm" className="h-7 shrink-0 px-2.5" asChild>
                            <a href={mediaHref} target="_blank" rel="noopener noreferrer" title={mediaLinks[0]}>
                              <Video /> Gabung
                              {mediaLinks.length > 1 && (
                                <span className="rounded bg-primary-foreground/20 px-1 text-[10px]">
                                  +{mediaLinks.length - 1}
                                </span>
                              )}
                            </a>
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
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

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* To-do hari ini: todo Planner + task/action yang jatuh tempo hari ini */}
          <div data-module="productivity" className="min-w-0">
            <SectionCard
              icon={CheckSquare}
              title="To-do Hari Ini"
              description={
                todays.length > 0 ? `${todays.length - openToday} dari ${todays.length} selesai` : "Tugas hari ini"
              }
              className="h-full"
              contentClassName="flex flex-col gap-2"
              action={
                <Button size="icon-sm" title="Tambah to-do" aria-label="Tambah to-do" asChild>
                  <Link to={{ search: "?todo=new" }}>
                    <Plus />
                  </Link>
                </Button>
              }
            >
              {todays.length > 0 ? (
                <>
                  <ul className="flex flex-col gap-2">{todays.slice(0, TODAY_LIMIT).map(renderTask)}</ul>
                  {moreLink(todays.length - TODAY_LIMIT)}
                </>
              ) : (
                <Empty className="border border-dashed py-8">
                  <EmptyHeader>
                    <EmptyDescription>Belum ada to-do untuk hari ini.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </SectionCard>
          </div>

          {/* Tugas mendesak: terlambat + prioritas tinggi 7 hari ke depan */}
          <div data-module="notes" className="min-w-0">
            <SectionCard
              icon={AlertTriangle}
              title="Tugas Mendesak"
              description="Terlambat & prioritas tinggi 7 hari ke depan"
              className="h-full"
              contentClassName="flex flex-col gap-2"
            >
              {urgent.length > 0 ? (
                <>
                  <ul className="flex flex-col gap-2">{urgent.slice(0, URGENT_LIMIT).map(renderTask)}</ul>
                  {moreLink(urgent.length - URGENT_LIMIT)}
                </>
              ) : (
                <Empty className="border border-dashed py-8">
                  <EmptyHeader>
                    <EmptyDescription>Aman! Tidak ada tugas terlambat atau prioritas tinggi.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </SectionCard>
          </div>
        </div>

        {/* Proyek berjalan: status aktif, deadline terdekat dulu */}
        <div data-module="productivity" className="min-w-0">
          <SectionCard
            icon={Layers}
            title="Proyek Berjalan"
            description={
              running.length > PROJECT_LIMIT
                ? `${PROJECT_LIMIT} dari ${running.length} proyek dengan deadline terdekat`
                : "Pantau progres tugas dan sisa waktu proyek Anda."
            }
            action={
              <Button variant="secondary" size="sm" asChild>
                <Link to="/productivity/projects">Lihat Semua</Link>
              </Button>
            }
          >
            {running.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {running.slice(0, PROJECT_LIMIT).map((p) => {
                  const taskPct = projectTaskProgress(p, tasks);
                  const timePct = projectTimeProgress(p, today);
                  const late = !!p.deadline && p.deadline < todayYmd;
                  return (
                    <Link
                      key={p.id}
                      to={{ search: `?project=${encodeURIComponent(p.id)}` }}
                      className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-muted/30 p-4 transition-all hover:border-module/40 hover:bg-card hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="truncate text-base font-bold">{p.title}</h4>
                        {p.deadline && (
                          <Badge
                            variant="secondary"
                            className={cn("shrink-0", late && "bg-destructive/12 text-destructive")}
                            title={late ? "Lewat deadline" : "Deadline"}
                          >
                            <CalendarDays /> {formatDayMonth(parseLocalYMD(p.deadline))}
                          </Badge>
                        )}
                      </div>
                      <ProgressRow label="Penyelesaian Tugas" value={taskPct} className="bg-success" />
                      <ProgressRow label="Waktu Berjalan" value={timePct} className="bg-info" />
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
      {/* Dialog lihat/buat agenda (?agenda=<id>|new) */}
      <ScheduleDialogs defaultDate={todayYmd} />
      <ParaDetailDialogs archivingArea={archivingArea} onArchivingAreaChange={setArchivingArea} />
      <TodoDialog
        key={todoSession}
        open={todoOpen}
        editing={editingTodo}
        defaultDate={todayYmd}
        onOpenChange={(open) => !open && setTodoParam(null)}
        onSave={saveTodo}
      />
      <CompleteTaskDialog
        task={completing?.task ?? null}
        label={completing?.isAction ? "Action" : "Task"}
        withWeight={!!completing?.isAction}
        defaults={completing ? completionDefaults(completing.task, tasks, todayYmd) : null}
        onOpenChange={(open) => !open && setCompleting(null)}
        onConfirm={(values) => {
          const id = completing?.task.id;
          if (id)
            setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...values, ...completionPatch(true) } : t)));
          setCompleting(null);
        }}
      />
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
