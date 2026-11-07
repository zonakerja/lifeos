import { BrainCircuit } from "lucide-react";
import { Link } from "react-router";
import { useKnowledgeStatus } from "@/data/use-knowledge";
import { useKnowledgeTasks } from "@/data/use-knowledge-workspace";
import { formatLocalYMD } from "@/lib/dates";
import { tasksForDay, taskKey } from "./workspace/task-logic";
import { useVaultTaskToggle, VaultTaskRow } from "./workspace/tasks-tab";

const todayNow = () => formatLocalYMD(new Date());

/**
 * Tugas vault Knowledge di Planner Harian (K3): tugas Obsidian yang jatuh tempo / dijadwalkan pada tanggal itu, plus yang
 * terlambat saat melihat hari ini. Tidak tampil bila vault belum dipilih atau tidak ada tugas.
 */
export function PlannerVaultTasks({ date }: { date: string }) {
  const { data: status } = useKnowledgeStatus();
  const ready = !!status?.folder && !!status.folderExists;
  const { data } = useKnowledgeTasks(ready);
  const toggle = useVaultTaskToggle();
  if (!ready || !data) return null;
  const today = todayNow();
  const day = tasksForDay(data.tasks, date, today);
  const items = [...day.overdue, ...day.due, ...day.doneToday];
  if (!items.length) return null;
  return (
    <div className="rounded-2xl border border-dashed p-2" data-module="knowledge">
      <div className="flex items-center justify-between gap-2 px-1 pb-1">
        <span className="flex items-center gap-1.5 text-xs font-bold text-module">
          <BrainCircuit className="size-3.5" /> Dari vault Knowledge ({items.length})
        </span>
        <Link to="/knowledge/tasks" className="text-[11px] text-muted-foreground hover:text-foreground hover:underline">
          Semua tugas vault
        </Link>
      </div>
      <ul>
        {items.map((task) => (
          <VaultTaskRow key={taskKey(task)} task={task} today={today} onToggle={toggle} />
        ))}
      </ul>
    </div>
  );
}
