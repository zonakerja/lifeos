import { describe, expect, it } from "vitest";
import type { Schedule } from "@/types/entities";
import { planSeriesSave } from "./recurrence";
import { applyReschedule, dayDiff, movedAwayFrom, originalSlot, revertReschedule, shiftYmd } from "./reschedule";

const AT = "2026-10-14T03:00:00.000Z";
const kuliah: Schedule = {
  id: "k1",
  title: "Kuliah Statistika",
  startDate: "2026-10-20",
  endDate: "2026-10-20",
  startTime: "19:00",
  endTime: "21:00",
};

describe("jadwal ulang agenda", () => {
  it("memindahkan tanggal & jam, mencatat jadwal semula + alasan", () => {
    const moved = applyReschedule(
      kuliah,
      { startDate: "2026-10-22", startTime: "13:00", endTime: "15:00", reason: " Dosen dinas " },
      AT,
    );
    expect([moved.startDate, moved.endDate, moved.startTime, moved.endTime]).toEqual([
      "2026-10-22",
      "2026-10-22",
      "13:00",
      "15:00",
    ]);
    expect(originalSlot(moved)).toEqual({
      fromDate: "2026-10-20",
      fromStartTime: "19:00",
      fromEndTime: "21:00",
      toDate: "2026-10-22",
      toStartTime: "13:00",
      reason: "Dosen dinas",
      at: AT,
    });
  });

  it("agenda multi-hari tetap sepanjang durasinya; dipindah dua kali → jadwal semula tetap entri pertama", () => {
    const camp: Schedule = { ...kuliah, startDate: "2026-10-20", endDate: "2026-10-22", isAllDay: true };
    const once = applyReschedule(camp, { startDate: "2026-10-27" }, AT);
    expect([once.startDate, once.endDate, once.startTime]).toEqual(["2026-10-27", "2026-10-29", "19:00"]);
    const twice = applyReschedule(once, { startDate: "2026-10-18" }, AT);
    expect(twice.reschedules).toHaveLength(2);
    expect(originalSlot(twice)?.fromDate).toBe("2026-10-20");
  });

  it("kembalikan ke jadwal semula", () => {
    const moved = applyReschedule(
      applyReschedule(kuliah, { startDate: "2026-10-22", startTime: "13:00" }, AT),
      {
        startDate: "2026-10-23",
        startTime: "08:00",
      },
      AT,
    );
    const back = revertReschedule(moved);
    expect([back.startDate, back.startTime, back.endTime, back.reschedules]).toEqual([
      "2026-10-20",
      "19:00",
      "21:00",
      undefined,
    ]);
    expect(revertReschedule(kuliah)).toBe(kuliah);
  });

  it("agenda yang dipindahkan dari suatu tanggal", () => {
    const moved = applyReschedule(kuliah, { startDate: "2026-10-22" }, AT);
    expect(movedAwayFrom([moved, kuliah], "2026-10-20").map((s) => s.id)).toEqual(["k1"]);
    expect(movedAwayFrom([moved], "2026-10-22")).toHaveLength(0);
    // Dipindah lalu kembali ke tanggal semula → bukan "dipindahkan"
    expect(movedAwayFrom([applyReschedule(moved, { startDate: "2026-10-20" }, AT)], "2026-10-20")).toHaveLength(0);
  });

  it("helper tanggal", () => {
    expect(shiftYmd("2026-10-31", 1)).toBe("2026-11-01");
    expect(dayDiff("2026-10-20", "2026-10-27")).toBe(7);
    expect(dayDiff("2026-10-20", "2026-10-18")).toBe(-2);
  });
});

describe("jadwal ulang di dalam seri berulang", () => {
  const weekly = { frequency: "weekly" as const, interval: 1, days: [2], count: 3 };
  const series = planSeriesSave(
    { ...kuliah, recurrence: weekly },
    null,
    [],
    "all",
    (i) => `n-${i}`,
    () => "ser",
  ).upsert;

  it("pertemuan baru tidak mewarisi riwayat; ubah jam semua pertemuan tidak menghapus pemindahan", () => {
    const moved = applyReschedule(series[1], { startDate: "2026-10-29", startTime: "19:00", endTime: "21:00" }, AT);
    const members = [series[0], moved, series[2]];
    const plan = planSeriesSave(
      { ...series[0], location: "R. 301" },
      series[0],
      members,
      "all",
      (i) => `x-${i}`,
      () => "-",
    );
    const kept = plan.upsert.find((s) => s.id === moved.id)!;
    expect([kept.startDate, kept.location, kept.reschedules?.length]).toEqual(["2026-10-29", "R. 301", 1]);
  });

  it("pola berubah → tanggal dihitung ulang & riwayat pemindahan dibersihkan", () => {
    const moved = applyReschedule(series[1], { startDate: "2026-10-29" }, AT);
    const members = [series[0], moved, series[2]];
    const plan = planSeriesSave(
      { ...series[0], recurrence: { ...weekly, count: 2 } },
      series[0],
      members,
      "all",
      (i) => `x-${i}`,
      () => "-",
    );
    expect(plan.upsert.map((s) => [s.startDate, s.reschedules])).toEqual([
      ["2026-10-20", undefined],
      ["2026-10-27", undefined],
    ]);
  });
});
