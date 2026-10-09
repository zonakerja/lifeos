import { CalendarCheck, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { HeroStat, ModulePage } from "@/components/layout/module-page";
import { useRoutines, useSchedules } from "@/data/collections";
import { useToday } from "@/hooks/use-today";
import { formatLocalYMD } from "@/lib/dates";
import { DailyTab } from "./components/daily-tab";
import { ReferencesTab } from "./components/references-tab";
import { RoutinesTab } from "./components/routines-tab";
import { ScheduleTab } from "./components/schedule-tab";
import { isRoutineActiveOnDate, isScheduleOnDate } from "./lib/planner-logic";

const TABS: Record<string, () => ReactNode> = {
  daily: () => <DailyTab />,
  schedule: () => <ScheduleTab />,
  routines: () => <RoutinesTab />,
  references: () => <ReferencesTab />,
};

export function Component() {
  const { items: schedules } = useSchedules();
  const { items: routines } = useRoutines();
  const now = useToday();
  const today = formatLocalYMD(now);
  const agendaToday = schedules.filter((s) => isScheduleOnDate(s, today)).length;
  const routinesToday = routines.filter((r) => isRoutineActiveOnDate(r, now)).length;

  return (
    <ModulePage
      module="planner"
      meta={
        <>
          <HeroStat>
            <CalendarCheck className="size-3.5" /> {agendaToday} agenda hari ini
          </HeroStat>
          <HeroStat>
            <RefreshCw className="size-3.5" /> {routinesToday} rutinitas aktif
          </HeroStat>
        </>
      }
    >
      {(tab) => tab && TABS[tab]?.()}
    </ModulePage>
  );
}
