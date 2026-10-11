import { describe, expect, it } from "vitest";
import type { Activity, Area, Project, ProjectTask, Schedule } from "@/types/entities";
import {
  activityAncestors,
  activityTreeAttachments,
  activityLevel,
  activityTreeIds,
  childrenOf,
  completionDefaults,
  deleteDescription,
  freeProjectsOf,
  levelCounts,
  paraParentOf,
  projectAttachments,
  replacedUploadId,
  resourceFileAttachment,
  rootActivities,
} from "./para";
import { archiveAreaPlan, relatedSummary } from "./para-archive";

// Area a1: Sub Area sa1 → Kegiatan k1 → Sub Kegiatan sk1, sk2; Sub Area sa2 tanpa turunan
const activities: Activity[] = [
  { id: "sa1", title: "Kepegawaian", areaId: "a1" },
  { id: "k1", title: "Rekrutmen", areaId: "a1", parentId: "sa1" },
  { id: "sk1", title: "Seleksi Administrasi", areaId: "a1", parentId: "k1" },
  { id: "sk2", title: "Wawancara", areaId: "a1", parentId: "k1" },
  { id: "sa2", title: "Keuangan", areaId: "a1" },
  { id: "sa3", title: "Sub area lain", areaId: "a2" },
];
const byId = (id: string) => activities.find((a) => a.id === id)!;

describe("hierarki Area → Sub Area → Kegiatan → Sub Kegiatan", () => {
  it("menentukan tingkat dari rantai induk", () => {
    expect(rootActivities(activities, "a1").map((a) => a.id)).toEqual(["sa1", "sa2"]);
    expect(childrenOf(activities, "k1").map((a) => a.id)).toEqual(["sk1", "sk2"]);
    expect(activityLevel(activities, byId("sa1"))).toBe("Sub Area");
    expect(activityLevel(activities, byId("k1"))).toBe("Kegiatan");
    expect(activityLevel(activities, byId("sk1"))).toBe("Sub Kegiatan");
    expect(activityAncestors(activities, byId("sk1")).map((a) => a.id)).toEqual(["sa1", "k1"]);
  });

  it("mengumpulkan seluruh turunan (rekursif) untuk hapus berantai", () => {
    expect(activityTreeIds(activities, "sa1")).toEqual(["sa1", "k1", "sk1", "sk2"]);
    expect(activityTreeIds(activities, "k1")).toEqual(["k1", "sk1", "sk2"]);
    expect(activityTreeIds(activities, "sk1")).toEqual(["sk1"]);
  });

  it("aman terhadap data siklik", () => {
    const cyclic: Activity[] = [
      { id: "x", title: "X", areaId: "a1", parentId: "y" },
      { id: "y", title: "Y", areaId: "a1", parentId: "x" },
    ];
    expect(activityTreeIds(cyclic, "x")).toEqual(["x", "y"]);
    expect(activityAncestors(cyclic, cyclic[0]).length).toBeLessThanOrEqual(2);
  });

  it("menghitung item per tingkat", () => {
    const descendants = ["k1", "sk1", "sk2"].map(byId);
    expect(levelCounts(activities, descendants)).toEqual([
      { label: "Kegiatan", count: 1 },
      { label: "Sub Kegiatan", count: 2 },
    ]);
  });

  it("mengarsipkan area membawa semua tingkat beserta task-nya", () => {
    const tasks: ProjectTask[] = [
      { id: "t1", projectId: "sk1", title: "Task sub kegiatan" },
      { id: "t2", projectId: "sa1", title: "Task langsung di sub area" },
    ];
    const area: Area = { id: "a1", title: "Area" };
    const { archive, removal } = archiveAreaPlan(
      area,
      { projects: [], activities, tasks },
      { id: "x", archivedAt: "" },
    );
    expect(removal.activityIds).toEqual(["sa1", "k1", "sk1", "sk2", "sa2"]);
    expect(removal.taskIds).toEqual(["t1", "t2"]);
    expect(relatedSummary(archive)).toBe("2 sub area · 1 kegiatan · 2 sub kegiatan · 2 task");
  });
});

describe("freeProjectsOf", () => {
  it("project tanpa area atau dengan area yang sudah tidak ada", () => {
    const projects: Project[] = [
      { id: "p1", title: "Bebas" },
      { id: "p2", title: "Ber-area", areaId: "a1" },
      { id: "p3", title: "Area hilang", areaId: "a-hilang" },
      { id: "p4", title: "Kosong", areaId: "" },
    ];
    expect(freeProjectsOf(projects, [{ id: "a1", title: "A" }]).map((p) => p.id)).toEqual(["p1", "p3", "p4"]);
  });
});

describe("deleteDescription", () => {
  it("menyebut turunan per tingkat yang ikut terhapus", () => {
    expect(
      deleteDescription("Sub Area", {
        taskCount: 5,
        children: [
          { label: "Kegiatan", count: 1 },
          { label: "Sub Kegiatan", count: 2 },
        ],
      }),
    ).toContain("Sub Area ini beserta 1 kegiatan, 2 sub kegiatan dan 5 task");
    expect(deleteDescription("Sub Kegiatan", { taskCount: 1 })).toContain("Sub Kegiatan ini beserta 1 task");
    expect(deleteDescription("Project", { taskCount: 3 })).toContain("Project ini beserta 3 action");
    expect(deleteDescription("Project", { taskCount: 0 })).toBe("Anda yakin ingin menghapus item ini secara permanen?");
  });
});

describe("lampiran yang ikut terhapus", () => {
  const file = (id: string, uploadId: string) => ({ id, type: "file" as const, uploadId, name: id });
  const tasks: ProjectTask[] = [
    { id: "t1", projectId: "p1", title: "Action", resources: [file("a1", "u-a1")] },
    { id: "t2", projectId: "sk1", title: "Task sub kegiatan", resources: [file("a2", "u-a2")] },
    { id: "t3", projectId: "lain", title: "Task lain", resources: [file("a3", "u-a3")] },
  ];

  it("project + action-nya", () => {
    const project: Project = { id: "p1", title: "P", resources: [file("pb", "u-pb")] };
    expect(projectAttachments(project, tasks).map((a) => a.id)).toEqual(["pb", "a1"]);
  });

  it("item area + seluruh turunan + task-nya", () => {
    const withFiles = activities.map((a) => (a.id === "k1" ? { ...a, resources: [file("kb", "u-kb")] } : a));
    expect(activityTreeAttachments(withFiles, tasks, "sa1").map((a) => a.id)).toEqual(["kb", "a2"]);
    expect(activityTreeAttachments(withFiles, tasks, "sa2")).toEqual([]);
  });
});

describe("berkas Resource Global", () => {
  it("resource berkas → lampiran untuk pembersihan", () => {
    expect(resourceFileAttachment({ id: "r1", title: "SK", uploadId: "u1", mimeType: "application/pdf" })).toEqual({
      id: "resource-file-r1",
      type: "file",
      uploadId: "u1",
      name: "SK",
      mimeType: "application/pdf",
    });
    expect(resourceFileAttachment({ id: "r2", title: "Link" })).toBeNull();
  });

  it("berkas lama yang diganti / tidak dipakai lagi", () => {
    expect(replacedUploadId({ uploadId: "u1" }, { type: "file", uploadId: "u2" })).toBe("u1");
    expect(replacedUploadId({ uploadId: "u1" }, { type: "file", uploadId: "u1" })).toBeNull();
    expect(replacedUploadId({ uploadId: "u1" }, { type: "link", uploadId: "u1" })).toBe("u1");
    expect(replacedUploadId(null, { type: "file", uploadId: "u2" })).toBeNull();
    expect(replacedUploadId({}, { type: "file", uploadId: "u2" })).toBeNull();
  });
});

describe("agenda milik project / item area", () => {
  const schedules: Schedule[] = [
    { id: "s1", title: "Rapat seleksi", projectId: "k1", resources: [{ id: "sr", type: "file", uploadId: "u-sr" }] },
    { id: "s2", title: "Kickoff", projectId: "p1", results: [{ id: "hs", type: "file", uploadId: "u-hs" }] },
    { id: "s3", title: "Agenda bebas" },
  ];

  it("lampiran agenda ikut dikumpulkan saat induknya dihapus", () => {
    const project: Project = { id: "p1", title: "P" };
    expect(projectAttachments(project, [], schedules).map((a) => a.id)).toEqual(["hs"]);
    expect(activityTreeAttachments(activities, [], "sa1", schedules).map((a) => a.id)).toEqual(["sr"]);
  });

  it("archiveAreaPlan membawa agenda kegiatan & project area", () => {
    const area: Area = { id: "a1", title: "Area" };
    const projects: Project[] = [{ id: "p1", title: "P", areaId: "a1" }];
    const { archive, removal } = archiveAreaPlan(
      area,
      { projects, activities, tasks: [], schedules },
      { id: "x", archivedAt: "" },
    );
    expect(removal.scheduleIds).toEqual(["s1", "s2"]);
    expect(relatedSummary(archive)).toContain("2 agenda");
  });

  it("paraParentOf menemukan project atau item area", () => {
    const projects: Project[] = [{ id: "p1", title: "Renovasi" }];
    expect(paraParentOf("p1", projects, activities)).toMatchObject({ kind: "project", title: "Renovasi" });
    expect(paraParentOf("sk1", projects, activities)).toMatchObject({ kind: "activity", label: "Sub Kegiatan" });
    expect(paraParentOf("tidak-ada", projects, activities)).toBeNull();
    expect(paraParentOf(undefined, projects, activities)).toBeNull();
  });

  it("deleteDescription menyebut agenda", () => {
    expect(deleteDescription("Project", { taskCount: 2, scheduleCount: 1 })).toContain("2 action dan 1 agenda");
  });
});

describe("completionDefaults (dialog Tandai Selesai)", () => {
  const siblings: ProjectTask[] = [
    { id: "a", projectId: "p", title: "A", weight: 30 },
    { id: "b", projectId: "p", title: "B", weight: 50 },
    { id: "c", projectId: "p", title: "C" },
    { id: "x", projectId: "lain", title: "X", weight: 90 },
  ];
  it("mengisi tanggal hari ini, prioritas medium, dan sisa bobot", () => {
    expect(completionDefaults(siblings[2], siblings, "2026-10-11")).toEqual({
      dueDate: "2026-10-11",
      priority: "medium",
      weight: 20,
    });
  });
  it("mempertahankan nilai yang sudah ada", () => {
    const task: ProjectTask = {
      id: "a",
      projectId: "p",
      title: "A",
      weight: 30,
      dueDate: "2026-10-01",
      priority: "high",
    };
    expect(completionDefaults(task, siblings, "2026-10-11")).toEqual({
      dueDate: "2026-10-01",
      priority: "high",
      weight: 30,
    });
  });
  it("sisa bobot tidak negatif", () => {
    const full: ProjectTask[] = [
      { id: "a", projectId: "p", title: "A", weight: 120 },
      { id: "c", projectId: "p", title: "C" },
    ];
    expect(completionDefaults(full[1], full, "2026-10-11").weight).toBe(0);
  });
});
