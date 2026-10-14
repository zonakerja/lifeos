import { describe, expect, it } from "vitest";
import {
  type ShareStructure,
  accessKey,
  atLeast,
  collectUploadIds,
  expandDescendants,
  parentRefsOf,
  parseNoteRef,
  referencesOf,
} from "./share-graph";

const structure: ShareStructure = {
  projects: [
    { id: "p1", areaId: "a1" },
    { id: "p2", areaId: null },
  ],
  activities: [
    { id: "sub1", areaId: "a1", parentId: null },
    { id: "keg1", areaId: "a1", parentId: "sub1" },
    { id: "subkeg1", areaId: "a1", parentId: "keg1" },
    { id: "other", areaId: "a2", parentId: null },
  ],
  tasks: [
    { id: "t-p1", projectId: "p1" },
    { id: "t-p2", projectId: "p2" },
    { id: "t-keg1", projectId: "keg1" },
    { id: "t-subkeg1", projectId: "subkeg1" },
    { id: "t-other", projectId: "other" },
  ],
  aiNotes: [
    { id: "n1", linkedScheduleId: "s1" },
    { id: "n2", linkedScheduleId: "s2" },
  ],
};

const keys = (map: Map<string, unknown>) => [...map.keys()].sort();

describe("expandDescendants", () => {
  it("project → action-nya saja", () => {
    const access = expandDescendants([{ type: "para_project", id: "p2", permission: "edit" }], structure);
    expect(keys(access)).toEqual(["para_project:p2", "para_task:t-p2"]);
    expect(access.get("para_project:p2")?.root).toBe(true);
    expect(access.get("para_task:t-p2")).toMatchObject({ root: false, permission: "edit" });
  });

  it("area → semua tingkat, project di area, dan semua task-nya", () => {
    const access = expandDescendants([{ type: "para_area", id: "a1", permission: "view" }], structure);
    expect(keys(access)).toEqual(
      [
        "para_area:a1",
        "para_activity:sub1",
        "para_activity:keg1",
        "para_activity:subkeg1",
        "para_project:p1",
        "para_task:t-p1",
        "para_task:t-keg1",
        "para_task:t-subkeg1",
      ].sort(),
    );
    expect(access.has("para_task:t-other")).toBe(false);
  });

  it("agenda → Notes AI terhubung", () => {
    const access = expandDescendants([{ type: "schedule", id: "s1", permission: "comment" }], structure);
    expect(keys(access)).toEqual(["ai_note:n1", "schedule:s1"]);
  });

  it("izin tertinggi menang bila item tercakup beberapa root", () => {
    const access = expandDescendants(
      [
        { type: "para_area", id: "a1", permission: "view" },
        { type: "para_project", id: "p1", permission: "edit" },
      ],
      structure,
    );
    expect(access.get("para_task:t-p1")?.permission).toBe("edit");
    expect(access.get("para_task:t-keg1")?.permission).toBe("view");
    expect(access.get("para_project:p1")).toMatchObject({ root: true, permission: "edit" });
  });
});

describe("rujukan & berkas", () => {
  it("parseNoteRef", () => {
    expect(parseNoteRef("free-123")).toEqual(["free_note", "123"]);
    expect(parseNoteRef("ai-1700000000000")).toEqual(["ai_note", "1700000000000"]);
    expect(parseNoteRef("list-9")).toEqual(["list", "9"]);
    expect(parseNoteRef("x-1")).toBeNull();
    expect(parseNoteRef(5)).toBeNull();
  });

  it("referencesOf: lampiran catatan/resource, field arsip, agenda Notes AI", () => {
    expect(
      referencesOf("para_task", {
        resources: [{ type: "note", noteId: "free-1" }, { type: "existing", existingId: "r9" }, null],
      }),
    ).toEqual([
      ["free_note", "1"],
      ["para_resource", "r9"],
    ]);
    expect(referencesOf("schedule", { results: [{ noteId: "ai-2" }] })).toEqual([["ai_note", "2"]]);
    expect(referencesOf("para_resource", { classificationId: "c1", physBoxId: "b1", noteId: "list-3" })).toEqual([
      ["list", "3"],
      ["archive_classification", "c1"],
      ["archive_physical_reference", "b1"],
    ]);
    expect(referencesOf("archive_physical_reference", { parentId: "rack1" })).toEqual([
      ["archive_physical_reference", "rack1"],
    ]);
    expect(referencesOf("ai_note", { linkedScheduleId: "s1" })).toEqual([["schedule", "s1"]]);
  });

  it("collectUploadIds menemukan semua key berakhiran uploadId", () => {
    const ids = collectUploadIds({
      uploadId: "u1",
      audioUploadId: "u2",
      resources: [{ uploadId: "u3" }],
      doc: { content: [{ type: "image", attrs: { uploadId: "u4" } }] },
      dispositionData: { uploadId: "u5" },
      fileAttachment: { name: "a.pdf", uploadId: "" },
    });
    expect([...ids].sort()).toEqual(["u1", "u2", "u3", "u4", "u5"]);
  });

  it("parentRefsOf untuk item baru yang dibuat kolaborator", () => {
    expect(parentRefsOf("para_task", { projectId: "p1" })).toEqual([
      ["para_project", "p1"],
      ["para_activity", "p1"],
    ]);
    expect(parentRefsOf("para_activity", { parentId: "sub1", areaId: "a1" })).toEqual([
      ["para_activity", "sub1"],
      ["para_area", "a1"],
    ]);
    expect(parentRefsOf("free_note", {})).toEqual([]);
  });

  it("atLeast & accessKey", () => {
    expect(atLeast("edit", "comment")).toBe(true);
    expect(atLeast("view", "comment")).toBe(false);
    expect(atLeast(undefined, "view")).toBe(false);
    expect(accessKey("para_task", "1")).toBe("para_task:1");
  });
});

describe("agenda milik project / item area", () => {
  const withSchedules: ShareStructure = {
    projects: [{ id: "p1", areaId: "a1" }],
    activities: [
      { id: "sub1", areaId: "a1", parentId: null },
      { id: "keg1", areaId: "a1", parentId: "sub1" },
    ],
    tasks: [],
    schedules: [
      { id: "s-p1", projectId: "p1" },
      { id: "s-keg1", projectId: "keg1" },
      { id: "s-bebas", projectId: null },
    ],
    aiNotes: [{ id: "n1", linkedScheduleId: "s-p1" }],
  };
  const keys = (m: Map<string, { type: string; id: string }>) => [...m.keys()].sort();

  it("project yang dibagikan menyertakan agenda-nya beserta Notes AI terhubung", () => {
    const access = expandDescendants([{ type: "para_project", id: "p1", permission: "edit" }], withSchedules);
    expect(keys(access)).toEqual(["ai_note:n1", "para_project:p1", "schedule:s-p1"]);
    expect(access.get("schedule:s-p1")?.permission).toBe("edit");
  });

  it("area yang dibagikan menyertakan agenda project & item area-nya", () => {
    const access = expandDescendants([{ type: "para_area", id: "a1", permission: "view" }], withSchedules);
    expect(keys(access)).toContain("schedule:s-p1");
    expect(keys(access)).toContain("schedule:s-keg1");
    expect(keys(access)).not.toContain("schedule:s-bebas");
  });

  it("agenda baru dari kolaborator mengikuti pemilik induknya", () => {
    expect(parentRefsOf("schedule", { projectId: "p1" })).toEqual([
      ["para_project", "p1"],
      ["para_activity", "p1"],
    ]);
    expect(parentRefsOf("schedule", {})).toEqual([]);
  });
});

describe("seri agenda berulang", () => {
  const withSeries: ShareStructure = {
    projects: [],
    activities: [],
    tasks: [],
    seriesSchedules: [
      { id: "k1", seriesId: "ser-1" },
      { id: "k2", seriesId: "ser-1" },
      { id: "x1", seriesId: "ser-2" },
    ],
    aiNotes: [{ id: "n-k2", linkedScheduleId: "k2" }],
  };

  it("membagikan seri = semua pertemuannya (sebagai root) + Notes AI terhubung", () => {
    const access = expandDescendants([{ type: "schedule_series", id: "ser-1", permission: "comment" }], withSeries);
    expect([...access.keys()].sort()).toEqual(["ai_note:n-k2", "schedule:k1", "schedule:k2", "schedule_series:ser-1"]);
    expect(access.get("schedule:k1")).toMatchObject({ permission: "comment", root: true });
    // Notes AI tetap turunan biasa
    expect(access.get("ai_note:n-k2")?.root).toBe(false);
  });

  it("pertemuan baru dari kolaborator merujuk seri sebagai induk", () => {
    expect(parentRefsOf("schedule", { seriesId: "ser-1" })).toEqual([["schedule_series", "ser-1"]]);
    expect(parentRefsOf("schedule", { seriesId: "ser-1", projectId: "p1" })).toEqual([
      ["para_project", "p1"],
      ["para_activity", "p1"],
      ["schedule_series", "ser-1"],
    ]);
    expect(parentRefsOf("para_task", { seriesId: "ser-1" })).toEqual([]);
  });
});
