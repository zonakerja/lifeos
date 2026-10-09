import {
  AlertTriangle,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  MapPin,
  PencilLine,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PRIORITY_RANK, PriorityBadge } from "@/components/common/priority-badge";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import {
  useActivities,
  useCompletions,
  useProjects,
  useProjectTasks,
  useRoutines,
  useSchedules,
  useTodos,
} from "@/data/collections";
import { TaskQuickDialog, type TaskKind } from "@/features/productivity/components/task-quick-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { useSearchParam } from "@/hooks/use-search-param";
import { useToday } from "@/hooks/use-today";
import { addDays, formatFullDate, formatLocalYMD, formatNumericDate, parseLocalYMD, toDateKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { completionId, type Priority, type ProjectTask, type Todo } from "@/types/entities";
import { compareScheduleTime, isRoutineActiveOnDate, isScheduleOnDate, scheduleTime } from "../lib/planner-logic";
import { PlannerCalendar } from "./planner-calendar";
import { ActivityLogDialog, TodoDialog } from "./planner-dialogs";

type CombinedItem = ({ isProd: false } & Todo) | ({ isProd: true; kind: TaskKind; parentName: string } & ProjectTask);

/** Gaya per jenis item to-do gabungan. */
const ITEM_STYLE = {
  todo: {
    border: "border-l-mod-productivity",
    check: "border-mod-productivity bg-mod-productivity",
    done: "bg-mod-productivity/8",
  },
  action: { border: "border-l-mod-notes", check: "border-mod-notes bg-mod-notes", done: "bg-mod-notes/8" },
  task: { border: "border-l-primary", check: "border-primary bg-primary", done: "bg-primary/8" },
};

export function DailyTab() {
  const { items: schedules } = useSchedules();
  const { items: routines } = useRoutines();
  const { items: todos, setItems: setTodos } = useTodos();
  const { items: completions, setItems: setCompletions } = useCompletions();
  const { items: tasks, setItems: setTasks } = useProjectTasks();
  const { items: projects } = useProjects();
  const { items: activities } = useActivities();
  const { canEdit } = usePermissions();

  const today = useToday();
  // Tanggal & dialog todo disimpan di URL: ?date=YYYY-MM-DD, ?todo=<id>|new (deep link)
  const [dateParam, setDateParam] = useSearchParam("date");
  const [todoParam, setTodoParam] = useSearchParam("todo");
  const editingTodo = todoParam && todoParam !== "new" ? (todos.find((t) => t.id === todoParam) ?? null) : null;
  const todoDialogOpen = todoParam === "new" || !!editingTodo;
  const currentDate = useMemo(
    () => (dateParam ? parseLocalYMD(dateParam) : editingTodo ? new Date(editingTodo.date) : today),
    [dateParam, editingTodo, today],
  );
  const setDate = (date: Date) => setDateParam(formatLocalYMD(date));

  const [logRoutine, setLogRoutine] = useState<{ id: string; title: string } | null>(null);
  const [editingTask, setEditingTask] = useState<{ task: ProjectTask; kind: TaskKind } | null>(null);
  const [deleting, setDeleting] = useState<CombinedItem | null>(null);

  const ymd = formatLocalYMD(currentDate);
  const dateKey = toDateKey(currentDate);

  const todaysSchedules = schedules.filter((s) => isScheduleOnDate(s, ymd)).sort(compareScheduleTime);
  const todaysRoutines = routines.filter((r) => isRoutineActiveOnDate(r, currentDate));

  const combined: CombinedItem[] = [
    ...todos.filter((t) => t.date === dateKey).map((t) => ({ ...t, isProd: false as const })),
    ...tasks
      .filter((t) => t.dueDate === ymd)
      .map((t) => {
        const project = projects.find((p) => p.id === t.projectId);
        const activity = project ? undefined : activities.find((a) => a.id === t.projectId);
        return {
          ...t,
          isProd: true as const,
          kind: (project ? "action" : "task") as TaskKind,
          parentName: project?.title ?? activity?.title ?? "",
        };
      }),
  ].sort((a, b) => (PRIORITY_RANK[b.priority ?? "low"] ?? 0) - (PRIORITY_RANK[a.priority ?? "low"] ?? 0));

  const toggleRoutine = (routineId: string) => {
    if (!canEdit) return;
    const done = completions.some((c) => c.routineId === routineId && c.date === dateKey);
    setCompletions((prev) =>
      done
        ? prev.filter((c) => !(c.routineId === routineId && c.date === dateKey))
        : [...prev, { routineId, date: dateKey, actualDate: dateKey, note: "", completedAt: new Date().toISOString() }],
    );
  };

  const saveLog = (actualDate: string, note: string) => {
    if (!logRoutine) return;
    const routineId = logRoutine.id;
    setCompletions((prev) => [
      ...prev.filter((c) => !(c.routineId === routineId && c.date === dateKey)),
      {
        routineId,
        date: dateKey,
        actualDate: toDateKey(parseLocalYMD(actualDate)),
        note,
        completedAt: new Date().toISOString(),
      },
    ]);
    setLogRoutine(null);
  };

  const toggleItem = (item: CombinedItem) => {
    if (!canEdit) return;
    if (item.isProd) {
      // Centang task produktivitas membuka dialog update
      setEditingTask({ task: stripCombined(item), kind: item.kind });
    } else {
      setTodos((prev) => prev.map((t) => (t.id === item.id ? { ...t, completed: !t.completed } : t)));
    }
  };

  const saveTodo = (title: string, priority: Priority) => {
    const editing = editingTodo;
    if (editing) {
      setTodos((prev) => prev.map((t) => (t.id === editing.id ? { ...t, title, priority } : t)));
    } else {
      setTodos((prev) => [...prev, { id: `todo-${Date.now()}`, title, completed: false, date: dateKey, priority }]);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">{formatFullDate(currentDate)}</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Hari sebelumnya"
            onClick={() => setDate(addDays(currentDate, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="secondary"
            className="bg-module-soft text-module hover:bg-module/15"
            onClick={() => setDate(new Date())}
          >
            Hari Ini
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Hari berikutnya"
            onClick={() => setDate(addDays(currentDate, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          icon={RefreshCw}
          title="Rutinitas & Agenda"
          description="Jadwal hari ini"
          contentClassName="flex flex-col gap-2.5"
        >
          {todaysSchedules.map((sch) => (
            <div
              key={sch.id}
              className="flex items-center gap-4 rounded-xl border-l-4 border-l-mod-planner bg-mod-planner/8 p-3"
            >
              <span className="min-w-12 text-xs font-bold text-mod-planner">
                {sch.isAllDay ? "All Day" : scheduleTime(sch) || "??:??"}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{sch.title}</p>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="size-3" /> {sch.location || "Online"}
                </p>
              </div>
            </div>
          ))}

          {todaysRoutines.map((routine) => {
            const completion = completions.find(
              (c) => completionId(c) === completionId({ routineId: routine.id, date: dateKey }),
            );
            const done = !!completion;
            const late = done && completion.actualDate !== completion.date;
            return (
              <div
                key={routine.id}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border border-l-4 border-l-mod-overview p-3 transition-colors",
                  done ? "bg-mod-overview/8" : "bg-card hover:shadow-sm",
                )}
              >
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleRoutine(routine.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors",
                      done ? "border-mod-overview bg-mod-overview text-white" : "border-muted-foreground/40",
                    )}
                  >
                    {done && <Check className="size-3.5" strokeWidth={4} />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block truncate font-semibold", done && "text-muted-foreground line-through")}>
                      {routine.title}
                    </span>
                    {late && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning-foreground dark:text-warning">
                        <AlertTriangle className="size-3" /> {formatNumericDate(completion.actualDate)}
                      </span>
                    )}
                  </span>
                </button>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Log aktual"
                    onClick={() => setLogRoutine({ id: routine.id, title: routine.title })}
                  >
                    <ClipboardList />
                  </Button>
                )}
              </div>
            );
          })}

          {todaysRoutines.length === 0 && todaysSchedules.length === 0 && (
            <Empty className="border border-dashed py-10">
              <EmptyHeader>
                <EmptyDescription>Kosong hari ini.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </SectionCard>

        <SectionCard
          icon={CheckSquare}
          title="To-Do List"
          description="Tugas terpadu"
          contentClassName="flex flex-col gap-2"
          action={
            canEdit && (
              <Button size="icon" aria-label="Tambah tugas" onClick={() => setTodoParam("new")}>
                <Plus />
              </Button>
            )
          }
        >
          {combined.map((item) => {
            const style = ITEM_STYLE[item.isProd ? item.kind : "todo"];
            return (
              <div
                key={`${item.isProd ? "p" : "t"}-${item.id}`}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border border-l-4 px-3 py-2.5 transition-colors",
                  style.border,
                  item.completed ? style.done : "bg-card hover:shadow-sm",
                )}
              >
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleItem(item)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border-2",
                      item.completed ? cn(style.check, "text-white") : "border-muted-foreground/40",
                    )}
                  >
                    {item.completed && <Check className="size-3" strokeWidth={4} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm font-semibold",
                        item.completed && "text-muted-foreground line-through",
                      )}
                    >
                      {item.title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      {!item.completed && <PriorityBadge priority={item.priority} />}
                      {item.isProd && item.parentName && (
                        <span className="max-w-32 truncate text-[10px] font-semibold text-muted-foreground">
                          {item.parentName}
                        </span>
                      )}
                      {item.isProd && (
                        <Badge
                          className={
                            item.kind === "action" ? "bg-mod-notes/15 text-mod-notes" : "bg-primary/12 text-primary"
                          }
                        >
                          {item.kind === "action" ? "Action" : "Task"}
                        </Badge>
                      )}
                    </span>
                  </span>
                </button>
                {canEdit && (
                  <div className="flex gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Ubah"
                      onClick={() =>
                        item.isProd
                          ? setEditingTask({ task: stripCombined(item), kind: item.kind })
                          : setTodoParam(item.id)
                      }
                    >
                      <PencilLine />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Hapus"
                      className="hover:text-destructive"
                      onClick={() => setDeleting(item)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {combined.length === 0 && (
            <Empty className="border border-dashed py-10">
              <EmptyHeader>
                <EmptyDescription>Belum ada tugas.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </SectionCard>
      </div>

      <PlannerCalendar
        selected={currentDate}
        onSelect={setDate}
        schedules={schedules}
        todos={todos}
        routines={routines}
        tasks={tasks}
      />

      <TodoDialog
        open={todoDialogOpen}
        editing={editingTodo}
        onOpenChange={(open) => !open && setTodoParam(null)}
        onSave={saveTodo}
      />
      <ActivityLogDialog
        routineTitle={logRoutine?.title ?? null}
        scheduledDate={currentDate}
        onOpenChange={(open) => !open && setLogRoutine(null)}
        onSave={saveLog}
      />
      <TaskQuickDialog
        task={editingTask?.task ?? null}
        kind={editingTask?.kind ?? "task"}
        onOpenChange={(open) => !open && setEditingTask(null)}
        onSave={(task) => {
          setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...task } : t)));
          setEditingTask(null);
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Tugas?"
        description="Tugas ini akan dihapus permanen."
        itemName={deleting?.title}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting?.isProd) setTasks((prev) => prev.filter((t) => t.id !== deleting.id));
          else if (deleting) setTodos((prev) => prev.filter((t) => t.id !== deleting.id));
          setDeleting(null);
        }}
      />
    </div>
  );
}

/** Buang field tampilan sebelum menyimpan task produktivitas. */
const stripCombined = (item: Extract<CombinedItem, { isProd: true }>): ProjectTask => {
  const { isProd, kind, parentName, ...task } = item;
  void isProd;
  void kind;
  void parentName;
  return task;
};
