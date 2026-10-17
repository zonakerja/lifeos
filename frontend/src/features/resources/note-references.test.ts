import { describe, expect, it } from "vitest";
import type { Activity, AttachedResource, Project, ProjectTask, Resource, Schedule } from "@/types/entities";
import { noteKey, noteReferences } from "./note-references";

const note = (noteId: string): AttachedResource => ({ id: `att-${noteId}`, type: "note", noteId, name: "Catatan" });

describe("noteReferences", () => {
  const key = noteKey("ai", 42);
  const sources = {
    schedules: [
      { id: "s1", title: "Rapat", results: [note(key)] },
      { id: "s2", title: "Kuliah", resources: [note(key)] },
      { id: "s3", title: "Lain", results: [note("ai-7")] },
    ] as Schedule[],
    projects: [{ id: "p1", title: "Proyek", resources: [note(key)] }] as Project[],
    activities: [{ id: "a1", title: "Kegiatan", areaId: "ar1", resources: [note(key)] }] as Activity[],
    tasks: [{ id: "t1", title: "Task", projectId: "p1", resources: [note(key)] }] as ProjectTask[],
    resources: [{ id: "r1", title: "Notulen", type: "note", noteId: key }] as Resource[],
  };

  it("menemukan semua lampiran & Resource Global yang merujuk catatan", () => {
    expect(noteReferences(key, sources).map((r) => r.place)).toEqual([
      "Hasil Agenda",
      "Dasar Pelaksanaan Agenda",
      "Project",
      "Area",
      "Action / Task",
      "Resource Global",
    ]);
  });

  it("catatan lain / jenis lain dengan id sama tidak terhitung", () => {
    expect(noteReferences(noteKey("free", 42), sources)).toEqual([]);
    expect(noteReferences("ai-7", sources).map((r) => r.title)).toEqual(["Lain"]);
  });

  it("sumber My Notebook dihitung sebagai rujukan (per jenis catatan)", () => {
    const notebooks = [
      { notebookId: "nb1", notebookTitle: "Riset", recordType: "free_note" as const, recordId: "7", assetId: null },
      { notebookId: "nb2", notebookTitle: "Lain", recordType: "list" as const, recordId: "7", assetId: null },
    ];
    expect(noteReferences("free-7", { notebooks })).toEqual([
      { place: "Sumber My Notebook", title: "Riset", path: "/notes/notebook?notebook=nb1" },
    ]);
    expect(noteReferences("ai-7", { notebooks })).toEqual([]);
  });

  it("Notes AI yang hanya memilih agenda (linkedScheduleId) bukan rujukan", () => {
    expect(noteReferences(key, { schedules: [{ id: "s9", title: "X" } as Schedule] })).toEqual([]);
  });
});
