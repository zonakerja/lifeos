import { Bell, CalendarDays } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProjects, useProjectTasks, useSchedules, useTodos } from "@/data/collections";
import { useIncomingShares } from "@/data/use-sharing";
import { scheduleStart } from "@/features/planner/lib/planner-logic";
import { useToday } from "@/hooks/use-today";
import { formatDayMonth, formatNumericDate, formatRelative, parseLocalYMD } from "@/lib/dates";
import { links } from "@/lib/deep-links";
import { PERMISSION_LABEL, SHAREABLE_LABEL, sharedItemPath } from "@/lib/sharing";
import { cn } from "@/lib/utils";
import {
  daysLeftLabel,
  overdueReminders,
  projectReminders,
  recentIncomingShares,
  upcomingSchedules,
} from "../lib/notifications";
import { agendaTimeLabel } from "../lib/overview-logic";

/** Maksimal tugas terlambat yang dirinci (sisanya diarahkan ke Planner Harian). */
const OVERDUE_LIMIT = 5;

/** Lonceng notifikasi: agenda 3 hari ke depan, tugas terlambat, pengingat deadline project, item baru dibagikan. */
export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const today = useToday();
  const { items: schedules } = useSchedules();
  const { items: projects } = useProjects();
  const { items: tasks } = useProjectTasks();
  const { items: todos } = useTodos();
  const { data: incoming } = useIncomingShares();

  const agenda = upcomingSchedules(schedules, today);
  const overdue = overdueReminders(todos, tasks, today);
  const reminders = projectReminders(projects, tasks, today);
  const shared = recentIncomingShares(incoming ?? [], today);
  const total = agenda.length + overdue.length + reminders.length + shared.length;

  const go = (path: string) => {
    setOpen(false);
    void navigate(path);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifikasi (${total})`}>
          <Bell />
          {total > 0 && (
            <span className="absolute top-1.5 right-1.5 flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/70" />
              <span className="relative inline-flex size-2.5 rounded-full border-2 border-background bg-destructive" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <ScrollArea className="max-h-[70svh]">
          <div className="flex flex-col gap-4 p-4">
            <section className="flex flex-col gap-2">
              <h3 className="flex items-center justify-between text-sm font-bold">
                Agenda (3 Hari) <Badge className="bg-mod-planner/15 text-mod-planner">{agenda.length}</Badge>
              </h3>
              {agenda.length === 0 && (
                <p className="py-2 text-center text-sm text-muted-foreground">Tidak ada agenda terdekat.</p>
              )}
              {agenda.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(links.schedule(s.id))}
                  className="rounded-xl border bg-muted/40 p-3 text-left transition-colors hover:bg-muted"
                >
                  <span className="mb-1 flex justify-between text-xs">
                    <span className="font-bold text-mod-planner">{agendaTimeLabel(s)}</span>
                    <span className="text-muted-foreground">{formatNumericDate(parseLocalYMD(scheduleStart(s)))}</span>
                  </span>
                  <span className="block truncate text-sm font-semibold">{s.title}</span>
                </button>
              ))}
            </section>

            {overdue.length > 0 && (
              <section className="flex flex-col gap-2 border-t pt-4">
                <h3 className="flex items-center justify-between text-sm font-bold">
                  Tugas Terlambat <Badge className="bg-destructive/12 text-destructive">{overdue.length}</Badge>
                </h3>
                {overdue.slice(0, OVERDUE_LIMIT).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => go(e.kind === "todo" ? links.todo(e.item.id) : links.task(e.item.id))}
                    className="flex items-center justify-between gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-left transition-colors hover:bg-destructive/10"
                  >
                    <span className="truncate text-sm font-semibold">{e.item.title}</span>
                    <span className="shrink-0 text-[10px] font-bold text-destructive">
                      {formatDayMonth(parseLocalYMD(e.due))}
                    </span>
                  </button>
                ))}
                {overdue.length > OVERDUE_LIMIT && (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => go("/planner/daily")}>
                    +{overdue.length - OVERDUE_LIMIT} lainnya di Planner Harian
                  </Button>
                )}
              </section>
            )}

            <section className="flex flex-col gap-2 border-t pt-4">
              <h3 className="flex items-center justify-between text-sm font-bold">
                Pengingat Project <Badge className="bg-mod-notes/15 text-mod-notes">{reminders.length}</Badge>
              </h3>
              {reminders.length === 0 && (
                <p className="py-2 text-center text-sm text-muted-foreground">Tidak ada pengingat proyek hari ini.</p>
              )}
              {reminders.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => go(links.project(r.project.id))}
                  className="rounded-xl border border-mod-notes/25 bg-mod-notes/6 p-3 text-left transition-shadow hover:shadow-md"
                >
                  <span className="mb-2 flex items-center justify-between gap-2">
                    <Badge
                      className={cn(
                        "uppercase",
                        r.daysLeft <= 7 ? "bg-destructive/12 text-destructive" : "bg-mod-notes/15 text-mod-notes",
                      )}
                    >
                      {daysLeftLabel(r.daysLeft)}
                    </Badge>
                    <span className="text-[10px] font-semibold text-muted-foreground">{r.reminderType}</span>
                  </span>
                  <span className="mb-2 block truncate text-sm font-semibold">{r.project.title}</span>
                  <span className="mb-1 flex justify-between text-[10px] font-bold text-muted-foreground">
                    <span>Progres Penyelesaian</span>
                    <span>{r.progress.toFixed(0)}%</span>
                  </span>
                  <Progress value={r.progress} className="h-1.5" indicatorClassName="bg-success" />
                </button>
              ))}
            </section>

            {shared.length > 0 && (
              <section className="flex flex-col gap-2 border-t pt-4">
                <h3 className="flex items-center justify-between text-sm font-bold">
                  Baru Dibagikan <Badge className="bg-info/12 text-info">{shared.length}</Badge>
                </h3>
                {shared.map((s) => {
                  const path = sharedItemPath(s.recordType, s.recordId) ?? "/settings/sharing";
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => go(path)}
                      className="rounded-xl border bg-muted/40 p-3 text-left transition-colors hover:bg-muted"
                    >
                      <span className="mb-1 flex justify-between gap-2 text-[10px] font-semibold text-muted-foreground">
                        <span>
                          {SHAREABLE_LABEL[s.recordType]} · {PERMISSION_LABEL[s.permission]}
                        </span>
                        <span>{formatRelative(s.createdAt, today)}</span>
                      </span>
                      <span className="block truncate text-sm font-semibold">{s.item?.title ?? "Item"}</span>
                      {s.owner?.name && (
                        <span className="block truncate text-[11px] text-muted-foreground">dari {s.owner.name}</span>
                      )}
                    </button>
                  );
                })}
              </section>
            )}
          </div>
        </ScrollArea>
        <div className="flex items-center gap-2 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <CalendarDays className="size-3.5" /> Klik item untuk membuka detailnya.
        </div>
      </PopoverContent>
    </Popover>
  );
}
