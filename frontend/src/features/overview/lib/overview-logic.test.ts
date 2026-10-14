import { describe, expect, it } from "vitest";
import { parseLocalYMD, toDateKey } from "@/lib/dates";
import type { ShareEntry } from "@/types/api";
import type { Project, ProjectTask, Schedule, Todo } from "@/types/entities";
import {
  daysLeftLabel,
  overdueReminders,
  projectReminders,
  recentIncomingShares,
  upcomingSchedules,
} from "./notifications";
import { agendaStatus, agendaTimeLabel, runningProjects, todayTasks, urgentTasks } from "./overview-logic";

const TODAY = "2026-10-15";
const today = parseLocalYMD(TODAY);
const at = (ymd: string, hh: number, mm = 0) => {
  const d = parseLocalYMD(ymd);
  d.setHours(hh, mm);
  return d;
};

const todo = (id: string, ymd: string, extra: Partial<Todo> = {}): Todo => ({
  id,
  title: id,
  completed: false,
  date: toDateKey(parseLocalYMD(ymd)),
  priority: "medium",
  ...extra,
});
const task = (id: string, dueDate: string | undefined, extra: Partial<ProjectTask> = {}): ProjectTask =>
  ({ id, title: id, projectId: "p1", completed: false, dueDate, ...extra }) as ProjectTask;
const project = (id: string, extra: Partial<Project> = {}): Project => ({ id, title: id, ...extra });

describe("proyek berjalan", () => {
  it("membuang project selesai/ditunda dan mengurutkan menurut deadline terdekat", () => {
    const list = runningProjects([
      project("tanpa-deadline"),
      project("jauh", { deadline: "2026-12-01" }),
      project("selesai", { deadline: "2026-10-16", status: "completed" }),
      project("ditunda", { deadline: "2026-10-16", status: "on-hold" }),
      project("dekat", { deadline: "2026-10-20", status: "active" }),
    ]);
    expect(list.map((p) => p.id)).toEqual(["dekat", "jauh", "tanpa-deadline"]);
  });
});

describe("tugas mendesak", () => {
  const todos = [
    todo("terlambat-low", "2026-10-10", { priority: "low" }),
    todo("terlambat-selesai", "2026-10-09", { completed: true }),
    todo("hari-ini-high", TODAY, { priority: "high" }),
    todo("besok-high", "2026-10-16", { priority: "high" }),
    todo("besok-medium", "2026-10-16", { priority: "medium" }),
    todo("jauh-high", "2026-11-30", { priority: "high" }),
  ];
  const tasks = [
    task("task-terlambat", "2026-10-01"),
    task("task-high-tanpa-tenggat", undefined, { priority: "high" }),
    task("task-high-7hari", "2026-10-22", { priority: "high" }),
    task("task-high-8hari", "2026-10-23", { priority: "high" }),
  ];

  it("memuat terlambat (prioritas apa pun) + prioritas tinggi ≤ 7 hari / tanpa tenggat, tanpa yang jatuh tempo hari ini", () => {
    expect(urgentTasks(todos, tasks, today).map((e) => e.item.id)).toEqual([
      "task-terlambat",
      "terlambat-low",
      "besok-high",
      "task-high-7hari",
      "task-high-tanpa-tenggat",
    ]);
  });

  it("notifikasi tugas terlambat hanya berisi yang lewat tenggat", () => {
    expect(overdueReminders(todos, tasks, today).map((e) => e.item.id)).toEqual(["task-terlambat", "terlambat-low"]);
  });
});

describe("to-do hari ini", () => {
  it("todo & task hari ini, belum selesai dulu lalu prioritas", () => {
    const list = todayTasks(
      [todo("a-low", TODAY, { priority: "low" }), todo("b-selesai", TODAY, { completed: true, priority: "high" })],
      [task("c-high", TODAY, { priority: "high" }), task("lain-hari", "2026-10-16")],
      TODAY,
    );
    expect(list.map((e) => e.item.id)).toEqual(["c-high", "a-low", "b-selesai"]);
  });
});

describe("status agenda", () => {
  const meeting: Schedule = {
    id: "m",
    title: "m",
    startDate: TODAY,
    endDate: TODAY,
    startTime: "09:00",
    endTime: "10:30",
  };

  it("akan datang / berlangsung / selesai menurut jam", () => {
    expect(agendaStatus(meeting, at(TODAY, 8, 59))).toBe("upcoming");
    expect(agendaStatus(meeting, at(TODAY, 9))).toBe("ongoing");
    expect(agendaStatus(meeting, at(TODAY, 10, 29))).toBe("ongoing");
    expect(agendaStatus(meeting, at(TODAY, 10, 30))).toBe("done");
  });

  it("tanpa jam selesai / sepanjang hari berlangsung sampai akhir hari terakhirnya", () => {
    expect(agendaStatus({ ...meeting, endTime: undefined }, at(TODAY, 23, 59))).toBe("ongoing");
    const multi: Schedule = { id: "x", title: "x", startDate: "2026-10-14", endDate: "2026-10-16", isAllDay: true };
    expect(agendaStatus(multi, at(TODAY, 7))).toBe("ongoing");
    expect(agendaStatus(multi, at("2026-10-17", 0))).toBe("done");
    expect(agendaTimeLabel(multi)).toBe("Sepanjang hari");
  });
});

describe("notifikasi", () => {
  it("agenda 3 hari diurutkan tanggal lalu jam", () => {
    const list = upcomingSchedules(
      [
        { id: "lusa", title: "", startDate: "2026-10-17" },
        { id: "siang", title: "", startDate: TODAY, startTime: "13:00" },
        { id: "pagi", title: "", startDate: TODAY, startTime: "08:00" },
        { id: "terlalu-jauh", title: "", startDate: "2026-10-19" },
      ],
      today,
    );
    expect(list.map((s) => s.id)).toEqual(["pagi", "siang", "lusa"]);
  });

  it("pengingat project tidak untuk project selesai", () => {
    const list = projectReminders(
      [project("aktif", { deadline: TODAY }), project("selesai", { deadline: TODAY, status: "completed" })],
      [],
      today,
    );
    expect(list.map((r) => r.project.id)).toEqual(["aktif"]);
    expect(daysLeftLabel(-3)).toBe("Lewat 3 hari");
  });

  it("item yang baru dibagikan: 7 hari terakhir, item terhapus dilewati, terbaru dulu", () => {
    const share = (id: string, createdAt: string, title: string | null = id) =>
      ({ id, createdAt, item: { title, date: null } }) as ShareEntry;
    const list = recentIncomingShares(
      [
        share("lama", "2026-10-01T10:00:00.000Z"),
        share("baru", "2026-10-14T10:00:00.000Z"),
        share("terhapus", "2026-10-14T11:00:00.000Z", null),
        share("terbaru", "2026-10-15T01:00:00.000Z"),
      ],
      new Date("2026-10-15T12:00:00.000Z"),
    );
    expect(list.map((s) => s.id)).toEqual(["terbaru", "baru"]);
  });
});
