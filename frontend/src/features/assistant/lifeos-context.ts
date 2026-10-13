import { ApiError } from "@/lib/api/client";
import {
  useActivities,
  useAiNotes,
  useFreeNotes,
  useLists,
  useProjects,
  useProjectTasks,
  useResources,
  useRoutines,
  useSchedules,
  useTodos,
} from "@/data/collections";
import { scheduleStart } from "@/features/planner/lib/planner-logic";
import type {
  Activity,
  AiNote,
  FreeList,
  FreeNote,
  Project,
  ProjectTask,
  Resource,
  Routine,
  Schedule,
  Todo,
} from "@/types/entities";

export interface LifeosData {
  routines: Routine[];
  schedules: Schedule[];
  todos: Todo[];
  freeNotes: FreeNote[];
  aiNotes: AiNote[];
  lists: FreeList[];
  projects: Project[];
  projectTasks: ProjectTask[];
  activities: Activity[];
  resources: Resource[];
}

/** Semua data yang dipakai fitur pencarian/AI global (diambil dari cache TanStack Query). */
export function useLifeosData(): LifeosData {
  return {
    routines: useRoutines().items,
    schedules: useSchedules().items,
    todos: useTodos().items,
    freeNotes: useFreeNotes().items,
    aiNotes: useAiNotes().items,
    lists: useLists().items,
    projects: useProjects().items,
    projectTasks: useProjectTasks().items,
    activities: useActivities().items,
    resources: useResources().items,
  };
}

const section = <T>(items: T[], line: (item: T) => string, limit: number) =>
  items.map(line).join("\n").substring(0, limit) || "Kosong";

/**
 * Konteks data user untuk prompt AI, dengan ID `app:<type>:<id>` agar AI bisa
 * membuat link yang dapat diklik (lihat `resolveAppLink`).
 */
export function buildLifeosContext(data: LifeosData, variant: "search" | "chat") {
  const isSearch = variant === "search";
  const parts = [
    [
      "RESOURCES",
      section(
        data.resources.filter((r) => r.aiSummary || r.content),
        (r) =>
          `- ID: app:resource:${r.id} | Judul: ${r.title} | Info: ${r.aiSummary?.substring(0, 250) || r.content?.substring(0, 100)}`,
        3000,
      ),
    ],
    [
      "AI NOTES",
      section(
        data.aiNotes.filter((n) => n.aiSummary),
        (n) =>
          isSearch
            ? `- ID: app:ainote:${n.id} | Judul: ${n.title} | Info: ${n.aiSummary?.substring(0, 250)}`
            : `- ID: app:ainote:${n.id} | Judul: ${n.title}`,
        isSearch ? 3000 : 1500,
      ),
    ],
    ...(isSearch
      ? [
          [
            "FREE NOTES",
            section(
              data.freeNotes.filter((n) => n.content),
              (n) => `- ID: app:freenote:${n.id} | Judul: ${n.title} | Info: ${n.content?.substring(0, 200)}`,
              2000,
            ),
          ],
        ]
      : []),
    [
      "AGENDA",
      section(
        data.schedules,
        (s) => `- ID: app:schedule:${s.id} | ${s.title} (Tgl: ${scheduleStart(s)})`,
        isSearch ? 2000 : 1500,
      ),
    ],
    [
      "PROJECTS",
      section(
        data.projects,
        (p) =>
          isSearch
            ? `- ID: app:project:${p.id} | ${p.title} (Deadline: ${p.deadline})`
            : `- ID: app:project:${p.id} | ${p.title}`,
        isSearch ? 2000 : 1000,
      ),
    ],
    ...(!isSearch
      ? [
          [
            "SUB AREA/KEGIATAN/SUB KEGIATAN (AREA)",
            section(data.activities, (a) => `- ID: app:activity:${a.id} | ${a.title}`, 1000),
          ],
        ]
      : []),
    [
      "PROJECT ACTIONS / TASKS",
      section(
        data.projectTasks.filter((t) => !t.completed),
        (t) => `- ID: app:task:${t.id} | ${t.title} (Tugas/Action)`,
        1000,
      ),
    ],
    [
      "TO-DO HARIAN",
      section(
        data.todos.filter((t) => !t.completed),
        (t) => `- ID: app:todo:${t.id} | ${t.title}`,
        1000,
      ),
    ],
    [
      "RUTINITAS",
      section(
        data.routines.filter((r) => r.active),
        (r) => `- ID: app:routine:${r.id} | ${r.title}`,
        1000,
      ),
    ],
  ];

  return `[DATA APLIKASI LIFEOS USER]\n${parts.map(([title, body]) => `--- ${title} ---\n${body}`).join("\n")}`;
}

/** Pesan error AI untuk ditampilkan di chat (pesan dari backend sudah menjelaskan penyebab & tindakannya). */
export const aiErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof ApiError && error.status === 429 ? `⚠️ ${message}` : `❌ ${message}`;
};
