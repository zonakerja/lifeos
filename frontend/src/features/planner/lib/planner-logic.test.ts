import { describe, expect, it, vi } from "vitest";
import { formatDayMonth, formatShortDate } from "@/lib/dates";
import type { ProjectTask, Routine, Schedule, Todo } from "@/types/entities";
import {
  doneOn,
  scheduleDateRangeLabel,
  scheduleTimeLabel,
  filterSchedules,
  indicatorState,
  summarizeDay,
  isDoneLate,
  isRoutineActiveOnDate,
  isSchedulePast,
  overdueTasks,
  overdueTodos,
  overlappingFreezes,
} from "./planner-logic";
import { defaultAgendaColor, resolveAgendaStyle, scheduleTypeStyle } from "./schedule-style";

const TODAY = "2026-10-11";

const sch = (id: string, startDate: string, endDate = startDate, extra: Partial<Schedule> = {}): Schedule => ({
  id,
  title: id,
  startDate,
  endDate,
  ...extra,
});

describe("agenda akan datang / sudah lewat", () => {
  const schedules = [
    sch("lalu-lama", "2026-09-01"),
    sch("lalu-baru", "2026-10-10"),
    sch("berjalan", "2026-10-09", "2026-10-12"),
    sch("hari-ini-siang", TODAY, TODAY, { startTime: "13:00" }),
    sch("hari-ini-pagi", TODAY, TODAY, { startTime: "08:00" }),
    sch("hari-ini-allday", TODAY, TODAY, { isAllDay: true, startTime: "10:00" }),
    sch("besok", "2026-10-12"),
  ];

  it("agenda yang masih berlangsung belum dianggap lewat", () => {
    expect(isSchedulePast(sch("x", "2026-10-09", "2026-10-12"), TODAY)).toBe(false);
    expect(isSchedulePast(sch("x", "2026-10-10"), TODAY)).toBe(true);
    // Agenda lama yang hanya punya `date`
    expect(isSchedulePast({ id: "x", title: "x", date: "2026-10-01" }, TODAY)).toBe(true);
  });

  it("akan datang diurutkan per tanggal lalu jam (all-day lebih dulu)", () => {
    expect(filterSchedules(schedules, "upcoming", TODAY).map((s) => s.id)).toEqual([
      "berjalan",
      "hari-ini-allday",
      "hari-ini-pagi",
      "hari-ini-siang",
      "besok",
    ]);
  });

  it("sudah lewat diurutkan dari yang terbaru; semua = akan datang lalu lewat", () => {
    expect(filterSchedules(schedules, "past", TODAY).map((s) => s.id)).toEqual(["lalu-baru", "lalu-lama"]);
    const all = filterSchedules(schedules, "all", TODAY).map((s) => s.id);
    expect(all).toHaveLength(schedules.length);
    expect(all.slice(-2)).toEqual(["lalu-baru", "lalu-lama"]);
  });
});

describe("tugas terlambat", () => {
  const todo = (id: string, ymd: string, completed = false): Todo => ({
    id,
    title: id,
    completed,
    priority: "medium",
    date: new Date(`${ymd}T00:00:00`).toDateString(),
  });

  it("todo belum selesai sebelum hari ini, tertua dulu", () => {
    const todos = [todo("kemarin", "2026-10-10"), todo("lama", "2026-10-01"), todo("selesai", "2026-10-05", true)];
    todos.push(todo("hari-ini", TODAY), todo("besok", "2026-10-12"));
    expect(overdueTodos(todos, TODAY).map((t) => t.id)).toEqual(["lama", "kemarin"]);
  });

  it("task/action belum selesai dengan tenggat lewat; tanpa tenggat diabaikan", () => {
    const tasks: ProjectTask[] = [
      { id: "lewat", projectId: "p", title: "a", dueDate: "2026-10-03" },
      { id: "selesai", projectId: "p", title: "b", dueDate: "2026-10-03", completed: true },
      { id: "tanpa-tenggat", projectId: "p", title: "c" },
      { id: "hari-ini", projectId: "p", title: "d", dueDate: TODAY },
    ];
    expect(overdueTasks(tasks, TODAY).map((t) => t.id)).toEqual(["lewat"]);
  });
});

describe("gaya tipe agenda", () => {
  it("tipe bawaan punya warna & ikon default, pengaturan user diutamakan", () => {
    expect(resolveAgendaStyle("Meeting")).toEqual({ color: "planner", icon: "briefcase" });
    expect(resolveAgendaStyle("Meeting", { color: "files", icon: "star" })).toEqual({ color: "files", icon: "star" });
  });

  it("tipe tanpa pengaturan mendapat warna stabil dari namanya", () => {
    expect(defaultAgendaColor("Webinar")).toBe(defaultAgendaColor("Webinar"));
    expect(resolveAgendaStyle("Webinar").icon).toBe("clock");
  });

  it("agenda memakai gaya tipe dari daftar referensi", () => {
    const types = [{ id: "t1", name: "Webinar", color: "productivity" as const, icon: "video" as const }];
    expect(scheduleTypeStyle("Webinar", types).className).toContain("bg-mod-productivity");
    expect(scheduleTypeStyle("Tidak dikenal", types).className).toContain("bg-mod-");
  });
});

describe("tanggal mulai rutinitas", () => {
  it("startDate dibaca sebagai tanggal lokal, juga di zona waktu barat UTC", () => {
    vi.stubEnv("TZ", "America/New_York");
    try {
      const routine: Routine = { id: "r", title: "r", frequency: "daily", startDate: "2026-10-08", active: true };
      expect(isRoutineActiveOnDate(routine, new Date(2026, 9, 7))).toBe(false);
      expect(isRoutineActiveOnDate(routine, new Date(2026, 9, 8))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("tanggal akhir bulan", () => {
  const base = { id: "r", title: "r", active: true, startDate: "2026-01-31" } as const;

  it("bulanan tanggal 31 jatuh ke hari terakhir bulan pendek", () => {
    const routine: Routine = { ...base, frequency: "monthly", monthDates: ["31"] };
    expect(isRoutineActiveOnDate(routine, new Date(2026, 10, 30))).toBe(true); // 30 Nov
    expect(isRoutineActiveOnDate(routine, new Date(2026, 10, 29))).toBe(false);
    expect(isRoutineActiveOnDate(routine, new Date(2026, 1, 28))).toBe(true); // 28 Feb
    expect(isRoutineActiveOnDate(routine, new Date(2026, 11, 31))).toBe(true);
    expect(isRoutineActiveOnDate(routine, new Date(2026, 11, 30))).toBe(false);
  });

  it("interval bulanan & tahunan dari tanggal 31 / 29 Feb", () => {
    const monthly: Routine = { ...base, frequency: "interval", interval: 1, intervalType: "months" };
    expect(isRoutineActiveOnDate(monthly, new Date(2026, 3, 30))).toBe(true); // 30 Apr
    expect(isRoutineActiveOnDate(monthly, new Date(2026, 4, 31))).toBe(true);
    expect(isRoutineActiveOnDate(monthly, new Date(2026, 4, 30))).toBe(false);
    const yearly: Routine = {
      ...base,
      startDate: "2028-02-29",
      frequency: "interval",
      interval: 1,
      intervalType: "years",
    };
    expect(isRoutineActiveOnDate(yearly, new Date(2029, 1, 28))).toBe(true);
    expect(isRoutineActiveOnDate(yearly, new Date(2032, 1, 29))).toBe(true);
    expect(isRoutineActiveOnDate(yearly, new Date(2032, 1, 28))).toBe(false);
  });
});

describe("freeze beririsan", () => {
  const periods = [
    { startDate: "2026-10-01", endDate: "2026-10-05", reason: "a" },
    { startDate: "2026-10-20", endDate: "2026-10-25", reason: "b" },
    { startDate: "2026-10-10", endDate: "2026-10-09", reason: "dibatalkan" },
  ];

  it("menemukan periode yang beririsan, mengabaikan yang dibatalkan & dirinya sendiri", () => {
    expect(overlappingFreezes(periods, { startDate: "2026-10-05", endDate: "2026-10-21", reason: "" })).toHaveLength(2);
    expect(overlappingFreezes(periods, { startDate: "2026-10-06", endDate: "2026-10-19", reason: "" })).toHaveLength(0);
    expect(overlappingFreezes(periods, periods[0], 0)).toHaveLength(0);
    expect(overlappingFreezes(periods, { startDate: "", endDate: "", reason: "" })).toHaveLength(0);
  });
});

describe("todo diselesaikan terlambat", () => {
  const at = (ymd: string) => new Date(`${ymd}T14:00:00`).toISOString();
  const todo = (id: string, ymd: string, completedAt?: string): Todo => ({
    id,
    title: id,
    priority: "medium",
    date: new Date(`${ymd}T00:00:00`).toDateString(),
    completed: !!completedAt,
    completedAt,
  });
  const todos = [
    todo("belum", "2026-10-08"),
    todo("selesai-hari-ini", "2026-10-09", at(TODAY)),
    todo("selesai-kemarin", "2026-10-08", at("2026-10-10")),
    todo("tepat-waktu", "2026-10-09", at("2026-10-09")),
    todo("data-lama", "2026-10-07", undefined),
  ];
  todos[4].completed = true; // selesai tanpa completedAt (data lama)

  it("hari ini: belum selesai + yang diselesaikan terlambat hari ini (belum selesai dulu)", () => {
    expect(overdueTodos(todos, TODAY).map((t) => t.id)).toEqual(["belum", "selesai-hari-ini"]);
  });

  it("tanggal lampau hanya menampilkan yang diselesaikan terlambat pada tanggal itu", () => {
    expect(overdueTodos(todos, "2026-10-10", TODAY).map((t) => t.id)).toEqual(["selesai-kemarin"]);
    expect(overdueTodos(todos, "2026-10-09", TODAY)).toHaveLength(0);
  });

  it("doneOn & isDoneLate: data lama dianggap selesai di tanggalnya", () => {
    expect(isDoneLate(todos[1], "2026-10-09")).toBe(true);
    expect(doneOn(todos[1], "2026-10-09")).toBe(TODAY);
    expect(isDoneLate(todos[3], "2026-10-09")).toBe(false);
    expect(doneOn(todos[4], "2026-10-07")).toBe("2026-10-07");
    expect(isDoneLate(todos[0], "2026-10-08")).toBe(false);
  });
});

describe("ringkasan tanggal kalender", () => {
  // Data dibuat saat test berjalan (bukan saat koleksi) agar zona waktunya sama dengan pengecekan
  const fixture = () => {
    const day = new Date(2026, 9, 11);
    const routines: Routine[] = [
      { id: "r1", title: "Olahraga", frequency: "daily", startDate: "2026-10-01", active: true },
      { id: "r2", title: "Lari", frequency: "weekly", days: [1], startDate: "2026-10-01", active: true },
    ];
    const data = {
      schedules: [sch("s1", "2026-10-10", "2026-10-12"), sch("s2", "2026-10-12")],
      routines,
      todos: [
        { id: "t1", title: "a", completed: true, priority: "low" as const, date: day.toDateString() },
        { id: "t2", title: "b", completed: true, priority: "low" as const, date: day.toDateString() },
      ],
      tasks: [{ id: "k1", projectId: "p", title: "c", dueDate: "2026-10-11" }],
      completions: [{ routineId: "r1", date: day.toDateString() }],
    };
    return { day, data };
  };

  it("mengumpulkan agenda, rutinitas terjadwal + status, todo & task bertanggal itu", () => {
    const { day, data } = fixture();
    const s = summarizeDay(day, data);
    expect(s.agendas.map((a) => a.id)).toEqual(["s1"]);
    expect(s.routines.map((r) => [r.routine.id, r.done])).toEqual([["r1", true]]);
    expect(s.todos.map((t) => t.done)).toEqual([true, true]);
    expect(s.tasks.map((t) => [t.id, t.done])).toEqual([["k1", false]]);
  });

  it("penanda: kosong / belum selesai / semua selesai (todo selesai tetap ditandai)", () => {
    const { day, data } = fixture();
    const s = summarizeDay(day, data);
    expect(indicatorState(s.todos)).toBe("done");
    expect(indicatorState(s.tasks)).toBe("open");
    expect(indicatorState(s.routines)).toBe("done");
    expect(indicatorState([])).toBe("none");
  });
});

describe("label waktu & tanggal agenda", () => {
  const base: Schedule = { id: "s", title: "Rapat" };
  it("scheduleTimeLabel tidak menampilkan ??:?? saat jam kosong", () => {
    expect(scheduleTimeLabel({ ...base, isAllDay: true })).toBe("All Day");
    expect(scheduleTimeLabel({ ...base, startTime: "09:00", endTime: "10:00" })).toBe("09:00 - 10:00");
    expect(scheduleTimeLabel({ ...base, startTime: "09:00" })).toBe("09:00");
    expect(scheduleTimeLabel({ ...base, endTime: "10:00" })).toBe("s.d. 10:00");
    expect(scheduleTimeLabel(base)).toBe("Tanpa jam");
  });

  it("scheduleDateRangeLabel menampilkan agenda multi-hari sekali dengan rentangnya", () => {
    expect(scheduleDateRangeLabel({ ...base, startDate: "2026-10-11", endDate: "2026-10-11" })).toBe(
      formatShortDate(new Date(2026, 9, 11)),
    );
    expect(scheduleDateRangeLabel({ ...base, startDate: "2026-10-11", endDate: "2026-10-13" })).toBe(
      `${formatDayMonth(new Date(2026, 9, 11))} – ${formatShortDate(new Date(2026, 9, 13))}`,
    );
    expect(scheduleDateRangeLabel({ ...base, startDate: "2026-12-30", endDate: "2027-01-02" })).toBe(
      `${formatShortDate(new Date(2026, 11, 30))} – ${formatShortDate(new Date(2027, 0, 2))}`,
    );
    expect(scheduleDateRangeLabel(base)).toBe("-");
  });
});
