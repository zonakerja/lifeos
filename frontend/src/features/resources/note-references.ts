import { links } from "@/lib/deep-links";
import type { NotebookUsage } from "@/types/api";
import type { Activity, AttachedResource, Project, ProjectTask, Resource, Schedule } from "@/types/entities";

/**
 * Rujukan ke satu catatan (Catatan Bebas / Notes AI / List) dari lampiran item lain dan Resource Global.
 * Catatan yang masih dirujuk tidak boleh dihapus — tautannya dilepas dulu — agar lampiran tidak menunjuk catatan
 * yang sudah tidak ada. Sumber **My Notebook** juga dihitung (sumbernya akan berubah menjadi "Item sudah dihapus").
 * Notes AI yang hanya memilih agenda (`linkedScheduleId`) bukan rujukan lampiran.
 */

export type NoteKind = "free" | "ai" | "list";

/** Key lampiran catatan: "free-<id>" | "ai-<id>" | "list-<id>" (`AttachedResource.noteId`). */
export const noteKey = (kind: NoteKind, id: string | number) => `${kind}-${id}`;

export interface NoteReference {
  /** Label tempat (mis. "Hasil Agenda") */
  place: string;
  /** Judul item yang merujuk */
  title: string;
  /** Path untuk membuka item itu (melepas tautan di sana) */
  path: string;
}

export interface NoteReferenceSources {
  schedules?: Schedule[];
  projects?: Project[];
  activities?: Activity[];
  tasks?: ProjectTask[];
  resources?: Resource[];
  /** Sumber notebook milik user (`GET /notebooks/usage`) */
  notebooks?: NotebookUsage[];
}

/** Jenis catatan → record type sumber notebook. */
const NOTEBOOK_RECORD_TYPE: Record<NoteKind, string> = { free: "free_note", ai: "ai_note", list: "list" };

const has = (list: AttachedResource[] | undefined, key: string) => !!list?.some((a) => a.noteId === key);

export function noteReferences(key: string, sources: NoteReferenceSources): NoteReference[] {
  const refs: NoteReference[] = [];
  for (const s of sources.schedules ?? []) {
    if (has(s.results, key)) refs.push({ place: "Hasil Agenda", title: s.title, path: links.schedule(s.id) });
    if (has(s.resources, key))
      refs.push({ place: "Dasar Pelaksanaan Agenda", title: s.title, path: links.schedule(s.id) });
  }
  for (const p of sources.projects ?? []) {
    if (has(p.resources, key)) refs.push({ place: "Project", title: p.title, path: links.project(p.id) });
  }
  for (const a of sources.activities ?? []) {
    if (has(a.resources, key))
      refs.push({ place: "Area", title: a.title, path: a.areaId ? links.area(a.areaId) : links.areas() });
  }
  for (const t of sources.tasks ?? []) {
    if (has(t.resources, key)) refs.push({ place: "Action / Task", title: t.title, path: links.task(t.id) });
  }
  for (const r of sources.resources ?? []) {
    if (r.noteId === key) refs.push({ place: "Resource Global", title: r.title, path: links.resource(r.id) });
  }
  const [kind, ...rest] = key.split("-");
  const recordType = NOTEBOOK_RECORD_TYPE[kind as NoteKind];
  const recordId = rest.join("-");
  for (const u of sources.notebooks ?? []) {
    if (recordType && u.recordType === recordType && u.recordId === recordId)
      refs.push({ place: "Sumber My Notebook", title: u.notebookTitle, path: links.notebook(u.notebookId) });
  }
  return refs;
}
