import { describe, expect, it } from "vitest";
import type { AutomationSchedule } from "@/types/api";
import {
  alertAction,
  describeDays,
  describeSchedule,
  needsLogin,
  newAlerts,
  runDuration,
  scheduleForMode,
} from "./automation-utils";

describe("automation-utils", () => {
  it("menjelaskan hari", () => {
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe("setiap hari");
    expect(describeDays([5, 4, 3, 2, 1])).toBe("Senin–Jumat (hari kerja)");
    expect(describeDays([1])).toBe("setiap Senin");
    expect(describeDays([0, 3])).toBe("Rabu, Minggu");
  });

  it("menjelaskan jadwal", () => {
    expect(
      describeSchedule({ mode: "daily", time: "07:00", days: [0, 1, 2, 3, 4, 5, 6], timezone: "Asia/Jakarta" }),
    ).toBe("setiap hari pukul 07.00 WIB");
    expect(
      describeSchedule({ mode: "hourly", minute: 0, from: 7, to: 17, days: [1, 2, 3, 4, 5], timezone: "Asia/Jakarta" }),
    ).toBe("Senin–Jumat (hari kerja), tiap jam 07.00–17.00 WIB");
    expect(describeSchedule({ mode: "cron", pattern: "0 7 1 * *", timezone: "Asia/Makassar" })).toContain("WITA");
  });

  it("pendukung tampilan", () => {
    expect(needsLogin("Sesi SRIKANDI kedaluwarsa. Login ulang di SRIKANDI → Connector.")).toBe(true);
    expect(needsLogin("Robot: galat 500")).toBe(false);
    expect(runDuration({ startedAt: "2026-11-01T00:00:00Z", finishedAt: "2026-11-01T00:01:20Z" })).toBe("1 mnt 20 dtk");
    expect(runDuration({ startedAt: null, finishedAt: null })).toBeNull();
    const daily: AutomationSchedule = { mode: "daily", time: "08:00", days: [1], timezone: "Asia/Jakarta" };
    expect(scheduleForMode("hourly", daily)).toMatchObject({ mode: "hourly", days: [1], from: 7, to: 17 });
    expect(scheduleForMode("daily", daily)).toBe(daily);
  });
});

describe("notifikasi robot", () => {
  const alert = (id: string, kind: "session_expired" | "job_failed" = "session_expired") => ({
    id,
    kind,
    system: "srikandi" as const,
    title: "Sesi SRIKANDI kedaluwarsa",
    message: "Login ulang",
    at: null,
    path: "/srikandi/connector",
  });

  it("hanya notifikasi baru yang ditampilkan; yang hilang dilupakan", () => {
    const { fresh, keep } = newAlerts([alert("a"), alert("b")], ["a", "lama"]);
    expect(fresh.map((a) => a.id)).toEqual(["b"]);
    expect(keep).toEqual(["a", "b"]);
  });

  it("label tindak lanjut", () => {
    expect(alertAction(alert("a"))).toBe("Login ulang");
    expect(alertAction(alert("b", "job_failed"))).toBe("Lihat otomasi");
  });
});
