import { describe, expect, it } from "vitest";
import type { Activity, Area, Project, ProjectTask, Resource } from "@/types/entities";
import {
  archiveAreaPlan,
  archiveLogEntry,
  archiveProjectPlan,
  archiveResourcePlan,
  mergeById,
  relatedSummary,
  restorePlan,
} from "./para-archive";

const meta = { id: "arch-1", archivedAt: "2026-10-11T00:00:00.000Z" };
const area: Area = { id: "area-1", title: "Kesehatan" };
const projects: Project[] = [
  { id: "proj-1", title: "Lari 10K", areaId: "area-1" },
  { id: "proj-2", title: "Renovasi", areaId: "area-2" },
  { id: "proj-3", title: "Bebas" },
];
const activities: Activity[] = [
  { id: "act-1", title: "Olahraga pagi", areaId: "area-1" },
  { id: "act-2", title: "Anggaran", areaId: "area-2" },
];
const tasks: ProjectTask[] = [
  { id: "t-1", projectId: "proj-1", title: "Daftar lomba" },
  { id: "t-2", projectId: "act-1", title: "Jogging" },
  { id: "t-3", projectId: "proj-2", title: "Beli cat" },
  { id: "t-4", projectId: "act-2", title: "Rekap" },
  { id: "t-5", projectId: "proj-3", title: "Lainnya" },
];
const data = { projects, activities, tasks };

describe("archiveProjectPlan", () => {
  it("membawa action milik project ke arsip dan menandainya untuk dikeluarkan", () => {
    const { archive, removal } = archiveProjectPlan(projects[1], data, meta);
    expect(archive).toMatchObject({ originalType: "project", originalId: "proj-2", data: projects[1] });
    expect(archive.related?.tasks?.map((t) => t.id)).toEqual(["t-3"]);
    expect(removal).toMatchObject({ projectIds: ["proj-2"], taskIds: ["t-3"], activityIds: [], areaIds: [] });
  });
});

describe("archiveAreaPlan", () => {
  it("membawa project, sub area, dan semua task area dalam satu entri", () => {
    const { archive, removal } = archiveAreaPlan(area, data, meta);
    expect(archive.originalType).toBe("area");
    expect(archive.related?.projects?.map((p) => p.id)).toEqual(["proj-1"]);
    expect(archive.related?.activities?.map((a) => a.id)).toEqual(["act-1"]);
    expect(archive.related?.tasks?.map((t) => t.id)).toEqual(["t-1", "t-2"]);
    expect(removal).toEqual({
      areaIds: ["area-1"],
      projectIds: ["proj-1"],
      activityIds: ["act-1"],
      taskIds: ["t-1", "t-2"],
      resourceIds: [],
    });
  });
});

describe("restorePlan", () => {
  it("memulihkan area beserta seluruh turunannya", () => {
    const { archive } = archiveAreaPlan(area, data, meta);
    const r = restorePlan(archive);
    expect(r.areas).toEqual([area]);
    expect(r.projects.map((p) => p.id)).toEqual(["proj-1"]);
    expect(r.activities.map((a) => a.id)).toEqual(["act-1"]);
    expect(r.tasks.map((t) => t.id)).toEqual(["t-1", "t-2"]);
    expect(r.resources).toEqual([]);
  });

  it("memulihkan project beserta action-nya", () => {
    const r = restorePlan(archiveProjectPlan(projects[0], data, meta).archive);
    expect(r.projects).toEqual([projects[0]]);
    expect(r.tasks.map((t) => t.id)).toEqual(["t-1"]);
  });

  it("arsip tanpa `related` hanya memulihkan item induk", () => {
    const r = restorePlan({ ...meta, originalType: "project", data: { ...projects[2] } });
    expect(r.projects).toEqual([projects[2]]);
    expect(r.tasks).toEqual([]);
  });

  it("memulihkan resource", () => {
    const resource: Resource = { id: "res-1", title: "Panduan", type: "link" };
    const r = restorePlan(archiveResourcePlan(resource, meta).archive);
    expect(r.resources).toEqual([resource]);
  });
});

describe("mergeById", () => {
  it("mengganti item ber-ID sama tanpa duplikasi", () => {
    const merged = mergeById(tasks.slice(0, 2), [{ ...tasks[0], title: "Baru" }, tasks[2]]);
    expect(merged.map((t) => t.id)).toEqual(["t-2", "t-1", "t-3"]);
    expect(merged.find((t) => t.id === "t-1")?.title).toBe("Baru");
  });
});

describe("relatedSummary", () => {
  it("meringkas jumlah turunan", () => {
    expect(relatedSummary(archiveAreaPlan(area, data, meta).archive)).toBe("1 project · 1 sub area · 2 task");
    expect(relatedSummary(archiveProjectPlan(projects[0], data, meta).archive)).toBe("1 action");
    expect(relatedSummary(archiveProjectPlan({ id: "x", title: "Kosong" }, data, meta).archive)).toBe("");
  });
});

describe("archiveLogEntry & kepemilikan", () => {
  it("arsip & log mengikuti pemilik item (super admin mengarsipkan data user lain)", () => {
    const owned = { ...projects[0], userId: "user-lain" };
    const { archive } = archiveProjectPlan(owned, data, meta);
    expect(archive.userId).toBe("user-lain");
    const log = archiveLogEntry("archived", archive, {
      id: "log-1",
      at: "2026-10-11T01:00:00.000Z",
      actorName: "Admin",
    });
    expect(log).toEqual({
      id: "log-1",
      userId: "user-lain",
      action: "archived",
      originalType: "project",
      originalId: "proj-1",
      archiveId: "arch-1",
      title: "Lari 10K",
      summary: "1 action",
      actorName: "Admin",
      at: "2026-10-11T01:00:00.000Z",
    });
  });

  it("tanpa pemilik eksplisit → tanpa userId (milik pengguna aktif)", () => {
    const { archive } = archiveResourcePlan({ id: "r", title: "R", type: "link" }, meta);
    expect("userId" in archive).toBe(false);
    expect(archiveLogEntry("restored", archive, { id: "l", at: "x" })).toMatchObject({
      action: "restored",
      title: "R",
      summary: "",
    });
  });
});
