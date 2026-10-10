import { CheckCircle2, ChevronLeft, ChevronRight, Layers, ListTodo } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { useToday } from "@/hooks/use-today";
import { formatFullDate, formatLocalYMD, formatNumericDate, isSameDay, WEEKDAY_SHORT } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/entities";
import { type EnrichedTask, isProjectRunningOn, projectColorClass } from "../lib/para";
import { useRetained } from "@/hooks/use-retained";

interface ParaCalendarProps {
  projects: Project[];
  tasks: EnrichedTask[];
  onDateClick: (date: Date) => void;
}

/** Kalender bulanan: rentang project aktif + titik action/task. */
export function ParaCalendar({ projects, tasks, onDateClick }: ParaCalendarProps) {
  const today = useToday();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-col items-center justify-between gap-3 border-b p-4 md:flex-row">
        <h3 className="text-lg font-bold">Calendar Overview</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Bulan sebelumnya"
            onClick={() => setMonth(new Date(year, m - 1, 1))}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-36 text-center text-sm font-bold capitalize">
            {month.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Bulan berikutnya"
            onClick={() => setMonth(new Date(year, m + 1, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 border-b bg-muted/40 px-4 py-2.5 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
        <span className="flex items-center gap-2">
          <span className="h-2 w-4 rounded-sm bg-module opacity-50" /> Active Project Span
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-success" /> Project Action
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-mod-notes" /> Area Task
        </span>
      </div>
      <div className="grid grid-cols-7 border-b py-2 text-center text-xs font-bold text-muted-foreground">
        {WEEKDAY_SHORT.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`e-${i}`} className="min-h-20 border-r border-b md:min-h-24" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = new Date(year, m, i + 1);
          const ymd = formatLocalYMD(date);
          const running = projects.filter((p) => isProjectRunningOn(p, ymd));
          const dayTasks = tasks.filter((t) => t.dueDate === ymd);
          const isToday = isSameDay(date, today);
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onDateClick(date)}
              className={cn(
                "flex min-h-20 flex-col gap-1 border-r border-b p-1 text-left transition-colors hover:bg-module-soft md:min-h-24",
                isToday && "bg-module-soft/60",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs font-bold",
                  isToday ? "bg-module text-module-foreground" : "text-muted-foreground",
                )}
              >
                {i + 1}
              </span>
              {running.slice(0, 3).map((p) => (
                <span
                  key={p.id}
                  title={`Project: ${p.title}`}
                  className={cn("h-1.5 w-full rounded-full opacity-50", projectColorClass(p.id))}
                />
              ))}
              {running.length > 3 && (
                <span className="text-[8px] leading-none text-muted-foreground">+{running.length - 3} more</span>
              )}
              <span className="flex flex-wrap gap-1">
                {dayTasks.map((t) => (
                  <span
                    key={t.id}
                    title={`${t.kind === "project-action" ? "Action" : "Area Task"}: ${t.title}`}
                    className={cn(
                      "size-2 rounded-full",
                      t.kind === "project-action" ? "bg-success" : t.kind === "area-task" ? "bg-mod-notes" : "hidden",
                    )}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/** Agenda harian PARA untuk tanggal yang diklik. */
export function DayDetailDialog({
  date: dateProp,
  projects,
  tasks,
  onOpenChange,
}: {
  date: Date | null;
  projects: Project[];
  tasks: EnrichedTask[];
  onOpenChange: (open: boolean) => void;
}) {
  const date = useRetained(dateProp);
  const ymd = date ? formatLocalYMD(date) : "";
  const running = projects.filter((p) => isProjectRunningOn(p, ymd));
  const dayTasks = tasks.filter((t) => t.dueDate === ymd);
  const actions = dayTasks.filter((t) => t.kind === "project-action");
  const areaTasks = dayTasks.filter((t) => t.kind === "area-task");

  return (
    <Dialog open={!!dateProp} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogDescription className="text-xs font-bold tracking-wider text-module uppercase">
            Agenda Harian
          </DialogDescription>
          <DialogTitle className="text-2xl font-extrabold">{date ? formatFullDate(date) : ""}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5 overflow-y-auto">
          {running.length > 0 && (
            <section className="flex flex-col gap-2">
              <h4 className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase">
                <Layers className="size-3.5" /> Active Projects Running
              </h4>
              {running.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
                  <span className={cn("size-3 rounded-full", projectColorClass(p.id))} />
                  <div>
                    <p className="text-sm font-bold">{p.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Deadline: {p.deadline ? formatNumericDate(p.deadline) : "-"}
                    </p>
                  </div>
                </div>
              ))}
            </section>
          )}
          {actions.length > 0 && (
            <section className="flex flex-col gap-2">
              <h4 className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase">
                <CheckCircle2 className="size-3.5" /> Project Actions Due
              </h4>
              {actions.map((t) => (
                <div key={t.id} className="rounded-xl border border-l-4 border-l-success p-3">
                  <p className="text-sm font-bold">{t.title}</p>
                  {t.parentName && <p className="mt-1 text-[10px] font-medium text-success">{t.parentName}</p>}
                </div>
              ))}
            </section>
          )}
          {areaTasks.length > 0 && (
            <section className="flex flex-col gap-2">
              <h4 className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase">
                <ListTodo className="size-3.5" /> Area Tasks Due
              </h4>
              {areaTasks.map((t) => (
                <div key={t.id} className="rounded-xl border border-l-4 border-l-mod-notes p-3">
                  <p className="text-sm font-bold">{t.title}</p>
                  {t.parentName && <p className="mt-1 text-[10px] font-medium text-mod-notes">{t.parentName}</p>}
                </div>
              ))}
            </section>
          )}
          {running.length === 0 && actions.length === 0 && areaTasks.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyDescription>Tidak ada agenda tercatat untuk hari ini.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
