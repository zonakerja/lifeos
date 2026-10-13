import { describe, expect, it } from "vitest";
import type { Project, ProjectTask } from "@/types/entities";
import { isProjectActiveIn } from "./para";
import { projectTimeProgress, taskProgress } from "./progress";

const project: Project = { id: "p", title: "P", startDate: "2026-10-01", deadline: "2026-10-10" };

describe("progres project", () => {
  it("progres waktu dihitung dari awal hari mulai sampai akhir hari deadline (tanggal lokal)", () => {
    expect(projectTimeProgress(project, new Date(2026, 8, 30, 12))).toBe(0);
    expect(projectTimeProgress(project, new Date(2026, 9, 1, 0, 0))).toBe(0);
    expect(projectTimeProgress(project, new Date(2026, 9, 6, 0, 0))).toBeCloseTo(50, 0);
    expect(projectTimeProgress(project, new Date(2026, 9, 10, 23, 0))).toBeLessThan(100);
    expect(projectTimeProgress(project, new Date(2026, 9, 11, 0, 0))).toBe(100);
    expect(projectTimeProgress({ id: "x", title: "X" }, new Date())).toBe(0);
  });

  it("progres task berbobot, fallback jumlah task", () => {
    const weighted: ProjectTask[] = [
      { id: "a", projectId: "p", title: "A", weight: 30, completed: true },
      { id: "b", projectId: "p", title: "B", weight: 70 },
    ];
    expect(taskProgress(weighted)).toBe(30);
    expect(
      taskProgress([
        { id: "a", projectId: "p", title: "A", completed: true },
        { id: "b", projectId: "p", title: "B" },
      ]),
    ).toBe(50);
    expect(taskProgress([])).toBe(0);
  });

  it("filter project aktif memakai tanggal lokal (deadline hari terakhir rentang tetap ikut)", () => {
    const now = new Date(2026, 9, 11);
    expect(isProjectActiveIn(project, new Date(2026, 9, 10), new Date(2026, 9, 31), now)).toBe(true);
    expect(isProjectActiveIn(project, new Date(2026, 9, 11), new Date(2026, 9, 31), now)).toBe(false);
    expect(isProjectActiveIn(project, new Date(2026, 8, 1), new Date(2026, 9, 1), now)).toBe(true);
  });
});
