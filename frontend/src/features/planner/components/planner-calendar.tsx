import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToday } from "@/hooks/use-today";
import { formatLocalYMD, generateCalendarDays, isSameDay, MONTH_NAMES } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ProjectTask, Routine, Schedule, Todo } from "@/types/entities";
import { isRoutineActiveOnDate, isScheduleOnDate } from "../lib/planner-logic";

/** Warna indikator kalender (konsisten dengan daftar harian). */
export const INDICATORS = {
  routine: { label: "Rutinitas", className: "bg-mod-overview" },
  schedule: { label: "Agenda", className: "bg-mod-planner" },
  todo: { label: "Todo", className: "bg-mod-productivity" },
  task: { label: "Task/Action", className: "bg-mod-notes" },
} as const;

const DAY_HEADERS = ["M", "S", "S", "R", "K", "J", "S"];

interface PlannerCalendarProps {
  selected: Date;
  onSelect: (date: Date) => void;
  schedules: Schedule[];
  todos: Todo[];
  routines: Routine[];
  tasks: ProjectTask[];
}

/** Kalender bulanan dengan indikator aktivitas per hari. */
export function PlannerCalendar({ selected, onSelect, schedules, todos, routines, tasks }: PlannerCalendarProps) {
  const [view, setView] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const today = useToday();

  // Ikuti bulan tanggal terpilih saat berpindah lewat navigasi harian (penyesuaian state saat render)
  const selectedMonth = `${selected.getFullYear()}-${selected.getMonth()}`;
  const [syncedMonth, setSyncedMonth] = useState(selectedMonth);
  if (syncedMonth !== selectedMonth) {
    setSyncedMonth(selectedMonth);
    setView(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }
  const days = generateCalendarDays(view.getFullYear(), view.getMonth());

  const indicatorsFor = (day: number) => {
    const date = new Date(view.getFullYear(), view.getMonth(), day);
    const ymd = formatLocalYMD(date);
    return {
      routine: routines.some((r) => isRoutineActiveOnDate(r, date)),
      schedule: schedules.some((s) => isScheduleOnDate(s, ymd)),
      todo: todos.some((t) => !t.completed && formatLocalYMD(t.date) === ymd),
      task: tasks.some((t) => !t.completed && t.dueDate === ymd),
    };
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold tracking-tight">
            {MONTH_NAMES[view.getMonth()]} <span className="text-module">{view.getFullYear()}</span>
          </h3>
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Bulan sebelumnya"
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Bulan berikutnya"
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {DAY_HEADERS.map((d, i) => (
            <div key={i} className="py-1 text-center text-[10px] font-bold text-muted-foreground uppercase">
              {d}
            </div>
          ))}
          {days.map((day, i) => {
            if (!day) return <div key={i} />;
            const date = new Date(view.getFullYear(), view.getMonth(), day);
            const isSelected = isSameDay(date, selected);
            const isToday = isSameDay(date, today);
            const ind = indicatorsFor(day);
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelect(date)}
                className={cn(
                  "flex aspect-square flex-col items-center justify-center rounded-xl border text-sm transition-all",
                  isSelected
                    ? "z-10 scale-105 border-module bg-module font-bold text-module-foreground shadow-lg shadow-module/30"
                    : isToday
                      ? "border-module/40 font-bold text-module"
                      : "border-transparent hover:bg-module-soft",
                )}
              >
                {day}
                <span className="mt-1 flex h-1.5 gap-0.5">
                  {(Object.keys(INDICATORS) as (keyof typeof INDICATORS)[]).map(
                    (key) =>
                      ind[key] && (
                        <span
                          key={key}
                          title={INDICATORS[key].label}
                          className={cn(
                            "size-1.5 rounded-full",
                            INDICATORS[key].className,
                            isSelected && "ring-1 ring-white/70",
                          )}
                        />
                      ),
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-center gap-4 rounded-xl bg-muted/60 p-3 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
          {Object.values(INDICATORS).map((i) => (
            <span key={i.label} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", i.className)} /> {i.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
