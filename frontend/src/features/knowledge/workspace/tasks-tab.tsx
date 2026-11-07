import { CalendarClock, CalendarDays, CircleDot, FileText, ListChecks, Repeat } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SearchInput } from "@/components/common/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useKnowledgeTasks, useToggleKnowledgeTask } from "@/data/use-knowledge-workspace";
import { useToday } from "@/hooks/use-today";
import { ApiError, errorMessage } from "@/lib/api/client";
import { formatDayMonth, formatLocalYMD, parseLocalYMD, todayYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { KnowledgeTask } from "@/types/api";
import {
  groupTasks,
  PRIORITY_INFO,
  type TaskGroupBy,
  type TaskStatusFilter,
  type TaskTone,
  taskCounts,
  taskDate,
  taskKey,
} from "./task-logic";
import { useOpenNote } from "./workspace-store";

const TONE_CLASS: Record<TaskTone, string> = {
  destructive: "text-destructive",
  warning: "text-warning",
  info: "text-info",
  success: "text-success",
  muted: "text-muted-foreground",
};
const GROUP_LIMIT = 50;
const TAG_IN_TEXT = /(?:^|\s)#[\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*/gu;

/** Centang tugas vault (dipakai tab Tugas & Planner Harian): tulis balik ke berkas, galat → toast. */
export function useVaultTaskToggle() {
  const toggle = useToggleKnowledgeTask();
  return (task: KnowledgeTask, done: boolean) =>
    toggle.mutate(
      { noteId: task.noteId, index: task.index, raw: task.raw, done, today: todayYMD() },
      {
        onSuccess: () => {
          if (done && task.recurrence)
            toast.success("Tugas berulang selesai — kejadian berikutnya dibuat di catatannya");
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError && error.status === 409 ? "Tugas berubah di tempat lain" : "Gagal mengubah tugas",
            { description: errorMessage(error) },
          ),
      },
    );
}

/** Satu baris tugas vault: centang, teks, tanggal, prioritas, berulang, tag, dan catatan asalnya. */
export function VaultTaskRow({
  task,
  today,
  onToggle,
  showNote = true,
}: {
  task: KnowledgeTask;
  today: string;
  onToggle: (task: KnowledgeTask, done: boolean) => void;
  showNote?: boolean;
}) {
  const openNote = useOpenNote();
  const done = task.status === "done";
  const cancelled = task.status === "cancelled";
  const date = taskDate(task);
  const overdue = !done && !cancelled && !!date && date < today;
  return (
    <li className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50">
      <Checkbox
        className="mt-0.5"
        checked={done}
        disabled={cancelled}
        onCheckedChange={(value) => onToggle(task, value === true)}
        aria-label={done ? "Buka lagi tugas" : "Tandai selesai"}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm leading-snug break-words",
            (done || cancelled) && "text-muted-foreground line-through",
          )}
        >
          {/* #tag tampil sebagai label di bawah, bukan di dalam teks */}
          {task.text.replace(TAG_IN_TEXT, " ").trim() || (
            <span className="italic text-muted-foreground">{task.text || "(tanpa teks)"}</span>
          )}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {task.status === "in_progress" && (
            <span className="flex items-center gap-1 text-info">
              <CircleDot className="size-3" /> Sedang dikerjakan
            </span>
          )}
          {task.due ? (
            <span className={cn("flex items-center gap-1", overdue && "font-semibold text-destructive")}>
              <CalendarDays className="size-3" /> {formatDayMonth(parseLocalYMD(task.due))}
            </span>
          ) : task.scheduled ? (
            <span className={cn("flex items-center gap-1", overdue && "font-semibold text-destructive")}>
              <CalendarClock className="size-3" /> dijadwalkan {formatDayMonth(parseLocalYMD(task.scheduled))}
            </span>
          ) : null}
          {done && task.doneDate && <span>selesai {formatDayMonth(parseLocalYMD(task.doneDate))}</span>}
          {task.priority && (
            <Badge
              variant="outline"
              className={cn(
                "h-4 px-1.5 text-[10px]",
                PRIORITY_INFO[task.priority].rank <= 1 && "border-destructive/40 text-destructive",
              )}
            >
              {PRIORITY_INFO[task.priority].label}
            </Badge>
          )}
          {task.recurrence && (
            <span className="flex items-center gap-1" title={task.recurrence}>
              <Repeat className="size-3" /> {task.recurrence}
            </span>
          )}
          {task.tags.map((tag) => (
            <span key={tag} className="text-module">
              #{tag}
            </span>
          ))}
          {showNote && (
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 hover:text-foreground hover:underline"
              onClick={() => openNote(task.noteId, task.heading ?? undefined)}
              title={task.path}
            >
              <FileText className="size-3 shrink-0" />
              <span className="truncate">
                {task.noteTitle}
                {task.heading ? ` › ${task.heading}` : ""}
              </span>
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Tab Tugas (K3, pola plugin Tasks Obsidian): semua `- [ ]` dari catatan vault. Centang ditulis balik ke berkasnya
 * (`[x]` + `✅ tanggal`); tugas yang sudah berubah di Obsidian ditolak, bukan ditimpa.
 */
export function TasksTab() {
  const { data, isLoading } = useKnowledgeTasks();
  const today = formatLocalYMD(useToday());
  const toggle = useVaultTaskToggle();
  const openNote = useOpenNote();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TaskStatusFilter>("open");
  const [groupBy, setGroupBy] = useState<TaskGroupBy>("date");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  if (isLoading || !data) return <Spinner className="m-6" />;
  const counts = taskCounts(data.tasks, today);
  const groups = groupTasks(data.tasks, { today, status, query, groupBy });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-3 py-2">
        <div className="mr-auto min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <ListChecks className="size-4 text-module" /> Tugas di vault
          </p>
          <p className="text-[11px] text-muted-foreground">
            {counts.open} belum selesai
            {counts.overdue > 0 && <span className="text-destructive"> · {counts.overdue} terlambat</span>}
            {counts.today > 0 && <span className="text-warning"> · {counts.today} hari ini</span>}
          </p>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Cari tugas, catatan, #tag…" />
        <Select value={status} onValueChange={(v) => setStatus(v as TaskStatusFilter)}>
          <SelectTrigger className="w-36" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Belum selesai</SelectItem>
            <SelectItem value="done">Selesai</SelectItem>
            <SelectItem value="all">Semua</SelectItem>
          </SelectContent>
        </Select>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as TaskGroupBy)}>
          <SelectTrigger className="w-36" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Per tanggal</SelectItem>
            <SelectItem value="note">Per catatan</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.truncated && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          Vault berisi sangat banyak tugas — hanya 3.000 tugas pertama yang ditampilkan.
        </p>
      )}

      {groups.length === 0 ? (
        <Empty className="rounded-2xl border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListChecks />
            </EmptyMedia>
            <EmptyTitle>{data.tasks.length ? "Tidak ada tugas yang cocok" : "Belum ada tugas di vault"}</EmptyTitle>
            <EmptyDescription>
              Tulis tugas di catatan mana pun: <code>- [ ] Kirim laporan 📅 2026-11-10</code>. Tambahan opsional: ⏳
              dijadwalkan, ⏫ prioritas tinggi, 🔁 every week (berulang), #tag.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {groups.map((group) => {
            const all = expanded.has(group.key);
            const shown = all ? group.tasks : group.tasks.slice(0, GROUP_LIMIT);
            return (
              <section key={group.key} className="min-w-0 rounded-2xl border bg-card p-2">
                <h3 className={cn("flex min-w-0 px-2 pt-1 pb-1.5 text-xs font-bold", TONE_CLASS[group.tone])}>
                  {groupBy === "note" ? (
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-1 text-foreground hover:underline"
                      onClick={() => openNote(group.tasks[0].noteId)}
                      title={group.key}
                    >
                      <FileText className="size-3.5 shrink-0" />
                      <span className="truncate">{group.label}</span>
                    </button>
                  ) : (
                    group.label
                  )}
                  <span className="ml-1 shrink-0 font-normal text-muted-foreground">· {group.tasks.length}</span>
                </h3>
                <ul>
                  {shown.map((task) => (
                    <VaultTaskRow
                      key={taskKey(task)}
                      task={task}
                      today={today}
                      onToggle={toggle}
                      showNote={groupBy === "date"}
                    />
                  ))}
                </ul>
                {group.tasks.length > shown.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-1 h-7 text-xs"
                    onClick={() => setExpanded((prev) => new Set(prev).add(group.key))}
                  >
                    Tampilkan {group.tasks.length - shown.length} lainnya
                  </Button>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
