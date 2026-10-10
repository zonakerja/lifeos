import { describe, expect, it } from "vitest";
import type { Activity, Area, Project, ProjectTask } from "@/types/entities";
import {
  activityAncestors,
  activityLevel,
  activityTreeIds,
  childrenOf,
  deleteDescription,
  freeProjectsOf,
  levelCounts,
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
