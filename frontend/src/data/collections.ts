import { useCollection } from "@/data/use-collection";
import {
  completionId,
  type Activity,
  type ArchiveBorrowing,
  type ArchiveClassification,
  type ArchiveDispositionLog,
  type ArchiveJra,
  type ArchiveMoveLog,
  type AgendaType,
  type AiNote,
  type Area,
  type Completion,
  type FreeList,
  type FreeNote,
  type ParaArchive,
  type ParaArchiveLog,
  type PhysicalReference,
  type Project,
  type ProjectTask,
  type Resource,
  type Routine,
  type Schedule,
  type Todo,
} from "@/types/entities";

/**
 * Hook koleksi bertipe per entitas. Semua komponen memakai hook ini (bukan
 * useCollection langsung) agar nama record type terpusat di satu tempat.
 */

// Planner
export const useAgendaTypes = () => useCollection<AgendaType>("agenda_type");
export const useSchedules = () => useCollection<Schedule>("schedule");
export const useRoutines = () => useCollection<Routine>("routine");
export const useTodos = () => useCollection<Todo>("todo");
export const useCompletions = () => useCollection<Completion>("completion", { getId: completionId });

// Notes
export const useFreeNotes = () => useCollection<FreeNote>("free_note");
export const useAiNotes = () => useCollection<AiNote>("ai_note");
export const useLists = () => useCollection<FreeList>("list");

// Productivity (PARA)
export const useProjects = () => useCollection<Project>("para_project");
export const useAreas = () => useCollection<Area>("para_area");
export const useProjectTasks = () => useCollection<ProjectTask>("para_task");
export const useActivities = () => useCollection<Activity>("para_activity");
export const useResources = () => useCollection<Resource>("para_resource");
export const useParaArchives = () => useCollection<ParaArchive>("para_archive");
export const useParaArchiveLogs = () => useCollection<ParaArchiveLog>("para_archive_log");

// File Control (kearsipan)
export const useClassifications = () => useCollection<ArchiveClassification>("archive_classification");
export const useJraList = () => useCollection<ArchiveJra>("archive_jra");
export const usePhysRefs = () => useCollection<PhysicalReference>("archive_physical_reference");
export const useBorrowings = () => useCollection<ArchiveBorrowing>("archive_borrowing");
export const useDispositionLogs = () => useCollection<ArchiveDispositionLog>("archive_disposition");
export const useMoveLogs = () => useCollection<ArchiveMoveLog>("archive_move_log");
