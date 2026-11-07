import { describe, expect, it } from "vitest";
import type { KnowledgeTask } from "@/types/api";
import { groupTasks, matchesTaskQuery, taskCounts, tasksForDay } from "./task-logic";

let n = 0;
const task = (patch: Partial<KnowledgeTask>): KnowledgeTask => ({
  noteId: "n1",
  path: "Proyek/A.md",
  noteTitle: "A",
  index: n++,
  line: 0,
  raw: "- [ ] x",
  text: "Tugas",
  status: "todo",
  due: null,
  scheduled: null,
  start: null,
  doneDate: null,
  priority: null,
  recurrence: null,
  tags: [],
  heading: null,
  ...patch,
});

const today = "2026-11-07";
const tasks = [
  task({ text: "Terlambat", due: "2026-11-01" }),
  task({ text: "Hari ini tinggi", due: today, priority: "high" }),
  task({ text: "Hari ini", scheduled: today }),
  task({ text: "Minggu ini", due: "2026-11-12" }),
  task({ text: "Nanti", due: "2026-12-01", path: "B.md", noteTitle: "B" }),
  task({ text: "Bebas", tags: ["kantor/rapat"] }),
  task({ text: "Beres", status: "done", doneDate: today }),
  task({ text: "Batal", status: "cancelled" }),
];

describe("groupTasks", () => {
  it("mengelompokkan menurut tanggal (tenggat lalu jadwal), prioritas di depan", () => {
    const groups = groupTasks(tasks, { today, status: "open", query: "", groupBy: "date" });
    expect(groups.map((g) => [g.key, g.tasks.map((t) => t.text)])).toEqual([
      ["overdue", ["Terlambat"]],
      ["today", ["Hari ini tinggi", "Hari ini"]],
      ["week", ["Minggu ini"]],
      ["later", ["Nanti"]],
      ["nodate", ["Bebas"]],
    ]);
  });

  it("status selesai / semua dan per catatan", () => {
    expect(groupTasks(tasks, { today, status: "done", query: "", groupBy: "date" }).map((g) => g.key)).toEqual([
      "done",
    ]);
    expect(groupTasks(tasks, { today, status: "all", query: "", groupBy: "date" }).at(-1)?.key).toBe("cancelled");
    expect(groupTasks(tasks, { today, status: "open", query: "", groupBy: "note" }).map((g) => g.label)).toEqual([
      "A",
      "B",
    ]);
  });
});

describe("pencarian & hitungan", () => {
  it("kata + #tag (termasuk sub-tag)", () => {
    expect(matchesTaskQuery(tasks[5], "#kantor")).toBe(true);
    expect(matchesTaskQuery(tasks[5], "#kan")).toBe(false);
    expect(matchesTaskQuery(tasks[4], "nanti b.md")).toBe(true);
  });

  it("hitungan & tugas per hari", () => {
    expect(taskCounts(tasks, today)).toEqual({ open: 6, overdue: 1, today: 2 });
    const day = tasksForDay(tasks, today, today);
    expect(day.due.map((t) => t.text)).toEqual(["Hari ini tinggi", "Hari ini"]);
    expect(day.overdue.map((t) => t.text)).toEqual(["Terlambat"]);
    expect(day.doneToday.map((t) => t.text)).toEqual(["Beres"]);
    expect(tasksForDay(tasks, "2026-11-12", today).overdue).toEqual([]);
  });
});
