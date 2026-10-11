import { CalendarRange, Check, CheckSquare, ChevronLeft, ChevronRight, Circle, RefreshCw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToday } from "@/hooks/use-today";
import { formatFullDate, generateCalendarDays, isSameDay, MONTH_NAMES } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Completion, ProjectTask, Routine, Schedule, Todo } from "@/types/entities";
import {
  type DaySummary,
  type IndicatorState,
  indicatorState,
  scheduleTimeLabel,
  summarizeDay,
} from "../lib/planner-logic";

/** Warna penanda kalender (sama dengan garis kiri item di daftar harian). */
export const INDICATORS = {
  routine: { label: "Rutinitas", dot: "bg-mod-overview", ring: "border-mod-overview" },
  schedule: { label: "Agenda", dot: "bg-mod-planner", ring: "border-mod-planner" },
  todo: { label: "Todo", dot: "bg-mod-productivity", ring: "border-mod-productivity" },
  task: { label: "Task/Action", dot: "bg-mod-notes", ring: "border-mod-notes" },
} as const;

type IndicatorKey = keyof typeof INDICATORS;

const DAY_HEADERS = ["M", "S", "S", "R", "K", "J", "S"];
/** Maksimum item per bagian di ringkasan hover. */
const MAX_PREVIEW = 4;

interface PlannerCalendarProps {
  selected: Date;
  onSelect: (date: Date) => void;
  schedules: Schedule[];
  todos: Todo[];
  routines: Routine[];
  tasks: ProjectTask[];
  completions: Completion[];
}

const statesOf = (day: DaySummary): Record<IndicatorKey, IndicatorState> => ({
  routine: indicatorState(day.routines),
  // Agenda tidak punya status selesai → selalu penanda penuh bila ada
  schedule: day.agendas.length ? "open" : "none",
  todo: indicatorState(day.todos),
  task: indicatorState(day.tasks),
});

/**
 * Kalender bulanan ringkas. Penanda per tanggal: titik penuh = ada item yang belum selesai, lingkaran = ada item &
 * semuanya selesai. Arahkan kursor ke tanggal untuk melihat agenda, rutinitas, dan to-do-nya.
 */
export function PlannerCalendar({
  selected,
  onSelect,
  schedules,
  todos,
  routines,
  tasks,
  completions,
}: PlannerCalendarProps) {
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
  const data = { schedules, routines, todos, tasks, completions };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold tracking-tight">
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
            <div key={i} className="text-center text-[10px] font-bold text-muted-foreground uppercase">
              {d}
            </div>
          ))}
          {days.map((day, i) => {
            if (!day) return <div key={i} />;
            const date = new Date(view.getFullYear(), view.getMonth(), day);
            const isSelected = isSameDay(date, selected);
            const isToday = isSameDay(date, today);
            const summary = summarizeDay(date, data);
            const states = statesOf(summary);
            const hasItems = Object.values(states).some((s) => s !== "none");
            const cell = (
              <button
                type="button"
                onClick={() => onSelect(date)}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1.5 rounded-xl border text-sm transition-colors sm:h-16",
                  isSelected
                    ? "border-module bg-module font-bold text-module-foreground shadow-md shadow-module/30"
                    : isToday
                      ? "border-module/40 font-bold text-module"
                      : "border-transparent hover:bg-module-soft",
                )}
              >
                {day}
                <span className="flex h-1.5 gap-0.5">
                  {(Object.keys(INDICATORS) as IndicatorKey[]).map((key) =>
                    states[key] === "none" ? null : (
                      <span
                        key={key}
                        className={cn(
                          "size-1.5 rounded-full",
                          states[key] === "open" ? INDICATORS[key].dot : cn("border", INDICATORS[key].ring),
                          isSelected && "ring-1 ring-white/70",
                        )}
                      />
                    ),
                  )}
                </span>
              </button>
            );
            if (!hasItems) return <div key={i}>{cell}</div>;
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>{cell}</TooltipTrigger>
                <TooltipContent side="top" className="block w-64 max-w-72 p-3">
                  <DayPreview date={date} summary={summary} />
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 rounded-xl bg-muted/60 px-3 py-2 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
          {Object.values(INDICATORS).map((ind) => (
            <span key={ind.label} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", ind.dot)} /> {ind.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 font-semibold tracking-normal normal-case">
            <span className="size-2 rounded-full bg-muted-foreground" /> belum selesai
            <span className="ml-1 size-2 rounded-full border border-muted-foreground" /> semua selesai
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Ringkasan isi tanggal di tooltip kalender. */
function DayPreview({ date, summary }: { date: Date; summary: DaySummary }) {
  const todoItems = [...summary.todos, ...summary.tasks.map((t) => ({ ...t, title: `${t.title} (Task)` }))];
  return (
    <div className="flex flex-col gap-2 text-left">
      <p className="text-xs font-bold">{formatFullDate(date)}</p>
      {summary.agendas.length > 0 && (
        <PreviewSection icon={<CalendarRange className="size-3" />} title="Agenda" count={summary.agendas.length}>
          {summary.agendas.slice(0, MAX_PREVIEW).map((s) => (
            <li key={s.id} className="flex gap-1.5">
              <span className="shrink-0 font-semibold opacity-70">{s.isAllDay ? "All Day" : scheduleTimeLabel(s)}</span>
              <span className="truncate">{s.title}</span>
            </li>
          ))}
        </PreviewSection>
      )}
      {summary.routines.length > 0 && (
        <PreviewSection icon={<RefreshCw className="size-3" />} title="Rutinitas" count={summary.routines.length}>
          {summary.routines.slice(0, MAX_PREVIEW).map(({ routine, done }) => (
            <PreviewItem key={routine.id} done={done} title={routine.title} />
          ))}
        </PreviewSection>
      )}
      {todoItems.length > 0 && (
        <PreviewSection icon={<CheckSquare className="size-3" />} title="To-Do" count={todoItems.length}>
          {todoItems.slice(0, MAX_PREVIEW).map((t) => (
            <PreviewItem key={t.id} done={t.done} title={t.title} />
          ))}
        </PreviewSection>
      )}
    </div>
  );
}

function PreviewSection({
  icon,
  title,
  count,
  children,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-0.5 flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase opacity-70">
        {icon} {title} ({count})
      </p>
      <ul className="flex flex-col gap-0.5 text-xs">
        {children}
        {count > MAX_PREVIEW && <li className="opacity-60">+{count - MAX_PREVIEW} lainnya</li>}
      </ul>
    </div>
  );
}

function PreviewItem({ done, title }: { done: boolean; title: string }) {
  return (
    <li className="flex items-center gap-1.5">
      {done ? <Check className="size-3 shrink-0" /> : <Circle className="size-3 shrink-0 opacity-60" />}
      <span className={cn("truncate", done && "line-through opacity-60")}>{title}</span>
    </li>
  );
}
