import { describe, expect, it } from "vitest";
import {
  automationAlerts,
  currentYear,
  DEFAULT_SCHEDULES,
  parseSchedule,
  parseSchedulerId,
  schedulerId,
  toCron,
  type AutomationSchedule,
} from "./automation-logic";
import { summarizeRobotJob } from "../robot/robot-jobs";

const parsed = (input: unknown) => parseSchedule(input) as AutomationSchedule;

describe("toCron", () => {
  it("menerjemahkan jadwal bawaan sesuai kebutuhan pemilik", () => {
    expect(toCron(DEFAULT_SCHEDULES.ekinerja_skp)).toBe("0 7 * * *");
    expect(toCron(DEFAULT_SCHEDULES.srikandi_letters)).toBe("0 7-17 * * 1,2,3,4,5");
    expect(toCron(DEFAULT_SCHEDULES.srikandi_references)).toBe("0 7 * * *");
    expect(toCron(DEFAULT_SCHEDULES.srikandi_classifications)).toBe("0 7 * * 1");
  });

  it("jam tunggal pada mode per jam tidak menjadi rentang", () => {
    expect(toCron(parsed({ mode: "hourly", minute: 30, from: 9, to: 9, days: [2] }))).toBe("30 9 * * 2");
  });
});

describe("parseSchedule", () => {
  it("merapikan hari (unik, urut) dan memberi zona waktu bawaan", () => {
    expect(parseSchedule({ mode: "daily", time: "06:45", days: [5, 1, 1] })).toEqual({
      mode: "daily",
      time: "06:45",
      days: [1, 5],
      timezone: "Asia/Jakarta",
    });
  });

  it("menolak isian tidak valid", () => {
    expect(parseSchedule({ mode: "daily", time: "25:00", days: [1] })).toBeTypeOf("string");
    expect(parseSchedule({ mode: "daily", time: "07:00", days: [] })).toBeTypeOf("string");
    expect(parseSchedule({ mode: "hourly", minute: 0, from: 17, to: 7, days: [1] })).toBeTypeOf("string");
    expect(parseSchedule({ mode: "daily", time: "07:00", days: [1], timezone: "Europe/London" })).toBeTypeOf("string");
    expect(parseSchedule({ mode: "weekly" })).toBeTypeOf("string");
  });

  it("cron kustom: paling sering sekali per jam", () => {
    expect(parsed({ mode: "cron", pattern: "  15  8-16/2 * * 1-5 " })).toMatchObject({ pattern: "15 8-16/2 * * 1-5" });
    expect(parseSchedule({ mode: "cron", pattern: "*/5 * * * *" })).toContain("menit");
    expect(parseSchedule({ mode: "cron", pattern: "0 24 * * *" })).toBeTypeOf("string");
    expect(parseSchedule({ mode: "cron", pattern: "0 7 * *" })).toBeTypeOf("string");
    expect(parseSchedule({ mode: "cron", pattern: "0 7 * * MON" })).toBeTypeOf("string");
    expect(parseSchedule({ mode: "cron", pattern: "0 */0 * * *" })).toBeTypeOf("string");
  });
});

describe("pendukung", () => {
  it("ID job scheduler bolak-balik", () => {
    expect(parseSchedulerId(schedulerId("u1", "srikandi_letters"))).toEqual({ userId: "u1", kind: "srikandi_letters" });
    expect(parseSchedulerId("lain:u1:x")).toBeNull();
  });

  it("tahun berjalan mengikuti zona waktu jadwal", () => {
    // 31 Des 2026 18.00 UTC = 1 Jan 2027 01.00 WIB
    expect(currentYear("Asia/Jakarta", new Date("2026-12-31T18:00:00Z"))).toBe(2027);
  });

  it("ringkasan hasil sinkron", () => {
    expect(summarizeRobotJob("ekinerja_skp", { year: 2026, skps: 2, rhk: 6 })).toBe("SKP 2026: 2 SKP, 6 RHK");
    expect(summarizeRobotJob("srikandi_references", { counts: { signer: 3, recipient: 4 } })).toBe(
      "7 referensi dari 2 kategori",
    );
  });
});

describe("automationAlerts", () => {
  const at = new Date("2026-11-02T00:30:00Z");
  const job = (kind: string, enabled = true, lastStatus: string | null = null) => ({
    kind,
    enabled,
    lastStatus,
    lastMessage: lastStatus === "failed" ? "Robot: galat 500" : null,
    lastRunAt: at,
  });

  it("sesi kedaluwarsa → satu notifikasi + jumlah jadwal yang dijeda", () => {
    const alerts = automationAlerts(
      [{ system: "srikandi", status: "expired", hasSession: true, lastCheckAt: at }],
      [job("srikandi_letters"), job("srikandi_references"), job("srikandi_classifications", false)],
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "session_expired", system: "srikandi", path: "/srikandi/connector" });
    expect(alerts[0].message).toContain("2 jadwal otomatis SRIKANDI dijeda");
    expect(alerts[0].id).toContain(at.toISOString());
  });

  it("jadwal aktif tanpa sesi → belum login; tanpa jadwal aktif → diam", () => {
    expect(automationAlerts([], [job("ekinerja_skp")])[0]).toMatchObject({
      kind: "session_missing",
      system: "ekinerja",
    });
    expect(automationAlerts([], [job("ekinerja_skp", false)])).toEqual([]);
    expect(
      automationAlerts([{ system: "ekinerja", status: "none", hasSession: false, lastCheckAt: null }], []),
    ).toEqual([]);
  });

  it("sesi aktif: hanya tugas aktif yang gagal", () => {
    const alerts = automationAlerts(
      [{ system: "ekinerja", status: "active", hasSession: true, lastCheckAt: at }],
      [
        job("ekinerja_skp", true, "failed"),
        job("ekinerja_renaksi", true, "ok"),
        job("ekinerja_session", false, "failed"),
      ],
    );
    expect(alerts.map((a) => a.kind)).toEqual(["job_failed"]);
    expect(alerts[0].title).toContain("Ambil SKP & RHK");
  });
});
