import { describe, expect, it } from "vitest";
import type { Schedule } from "@/types/entities";
import { joinLinks, linkLabel, scheduleLinks } from "./planner-logic";
import {
  cloneAttachments,
  describeRecurrence,
  MAX_OCCURRENCES,
  membersInScope,
  occurrenceDates,
  planSeriesSave,
} from "./recurrence";

describe("tanggal pertemuan", () => {
  it("mingguan di beberapa hari (Sel & Kam) sampai tanggal", () => {
    // 13 Okt 2026 = Selasa
    expect(
      occurrenceDates("2026-10-13", { frequency: "weekly", interval: 1, days: [2, 4], until: "2026-10-27" }),
    ).toEqual(["2026-10-13", "2026-10-15", "2026-10-20", "2026-10-22", "2026-10-27"]);
  });

  it("mingguan setiap 2 minggu & jumlah pertemuan", () => {
    expect(occurrenceDates("2026-10-13", { frequency: "weekly", interval: 2, days: [2], count: 3 })).toEqual([
      "2026-10-13",
      "2026-10-27",
      "2026-11-10",
    ]);
  });

  it("hari mulai yang tidak termasuk hari terpilih dilewati", () => {
    // mulai Senin 12 Okt, hanya Rabu
    expect(occurrenceDates("2026-10-12", { frequency: "weekly", interval: 1, days: [3], count: 2 })).toEqual([
      "2026-10-14",
      "2026-10-21",
    ]);
  });

  it("harian & bulanan (tanggal 31 jatuh ke akhir bulan pendek)", () => {
    expect(occurrenceDates("2026-10-30", { frequency: "daily", interval: 2, count: 3 })).toEqual([
      "2026-10-30",
      "2026-11-01",
      "2026-11-03",
    ]);
    expect(occurrenceDates("2026-10-31", { frequency: "monthly", interval: 1, count: 3 })).toEqual([
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
    ]);
  });

  it("dibatasi MAX_OCCURRENCES; tanpa batas = satu pertemuan", () => {
    expect(occurrenceDates("2026-01-01", { frequency: "daily", interval: 1, until: "2030-01-01" })).toHaveLength(
      MAX_OCCURRENCES,
    );
    expect(occurrenceDates("2026-10-13", { frequency: "weekly", interval: 1 })).toEqual(["2026-10-13"]);
  });

  it("deskripsi pola", () => {
    expect(describeRecurrence({ frequency: "weekly", interval: 1, days: [4, 2], until: "2027-01-26" })).toBe(
      "Mingguan · Sel, Kam · s.d. 26 Jan 2027",
    );
    expect(describeRecurrence({ frequency: "weekly", interval: 2, days: [2], count: 8 })).toBe(
      "Setiap 2 minggu · Sel · 8 kali",
    );
  });
});

describe("simpan seri", () => {
  const ids = (prefix: string) => (i: number) => `${prefix}-${i}`;
  const base: Schedule = {
    id: "k1",
    title: "Kuliah Statistika",
    startDate: "2026-10-13",
    endDate: "2026-10-13",
    startTime: "19:00",
    resources: [{ id: "sb-1", type: "file", name: "RPS.pdf", uploadId: "up-rps" }],
  };
  const weekly = { frequency: "weekly" as const, interval: 1, days: [2], count: 4 };

  it("agenda baru berulang → satu seri, ID & lampiran unik per pertemuan", () => {
    const plan = planSeriesSave({ ...base, recurrence: weekly }, null, [], "all", ids("n"), () => "ser");
    expect(plan.upsert.map((s) => [s.id, s.startDate, s.seriesId])).toEqual([
      ["k1", "2026-10-13", "ser"],
      ["n-1", "2026-10-20", "ser"],
      ["n-2", "2026-10-27", "ser"],
      ["n-3", "2026-11-03", "ser"],
    ]);
    const attachmentIds = plan.upsert.flatMap((s) => s.resources?.map((r) => r.id) ?? []);
    expect(new Set(attachmentIds).size).toBe(4);
    expect(plan.upsert.every((s) => s.resources?.[0].uploadId === "up-rps")).toBe(true);
  });

  const series = planSeriesSave({ ...base, recurrence: weekly }, null, [], "all", ids("n"), () => "ser").upsert.map(
    (s, i) => (i === 1 ? { ...s, outcome: "Materi bab 2" } : s),
  );

  it("ubah jam 'ini & berikutnya' tanpa mengubah pola → hanya pertemuan ke-2 dst, hasil tetap", () => {
    const edited = { ...series[1], startTime: "18:30" };
    const plan = planSeriesSave(edited, series[1], series, "following", ids("x"), () => "-");
    expect(plan.upsert.map((s) => s.id)).toEqual(["n-1", "n-2", "n-3"]);
    expect(plan.upsert.every((s) => s.startTime === "18:30")).toBe(true);
    expect(plan.upsert[0].outcome).toBe("Materi bab 2");
    expect(plan.remove).toHaveLength(0);
  });

  it("durasi baru ikut diterapkan ke pertemuan dalam cakupan", () => {
    const edited = { ...series[0], endDate: "2026-10-14" }; // jadi 2 hari
    const plan = planSeriesSave(edited, series[0], series, "all", ids("x"), () => "-");
    expect(plan.upsert.map((s) => [s.startDate, s.endDate])).toEqual([
      ["2026-10-13", "2026-10-14"],
      ["2026-10-20", "2026-10-21"],
      ["2026-10-27", "2026-10-28"],
      ["2026-11-03", "2026-11-04"],
    ]);
  });

  it("ubah pola (jadi 2 pertemuan) untuk semua → tanggal dihitung ulang, kelebihan dihapus", () => {
    const edited = { ...series[2], recurrence: { ...weekly, count: 2 } };
    const plan = planSeriesSave(edited, series[2], series, "all", ids("x"), () => "-");
    expect(plan.upsert.map((s) => [s.id, s.startDate])).toEqual([
      ["k1", "2026-10-13"],
      ["n-1", "2026-10-20"],
    ]);
    expect(plan.remove.map((s) => s.id)).toEqual(["n-2", "n-3"]);
  });

  it("matikan pengulangan: ini saja dilepas; ini & berikutnya mengakhiri seri", () => {
    const off = { ...series[1], recurrence: undefined };
    const only = planSeriesSave(off, series[1], series, "this", ids("x"), () => "-");
    expect(only.upsert[0].seriesId).toBeUndefined();
    expect(only.remove).toHaveLength(0);
    const end = planSeriesSave(off, series[1], series, "following", ids("x"), () => "-");
    expect(end.remove.map((s) => s.id)).toEqual(["n-2", "n-3"]);
  });

  it("cakupan anggota seri", () => {
    expect(membersInScope(series, series[2], "following").map((s) => s.id)).toEqual(["n-2", "n-3"]);
    expect(membersInScope(series, series[2], "this").map((s) => s.id)).toEqual(["n-2"]);
    expect(cloneAttachments([{ id: "sb-1~k1", type: "link" }], "n-9")[0].id).toBe("sb-1~n-9");
  });
});

describe("banyak link", () => {
  it("dipisah baris; data lama satu link tetap terbaca", () => {
    expect(scheduleLinks({ media: "https://meet.google.com/a\n\n zoom.us/j/1 " })).toEqual([
      "https://meet.google.com/a",
      "zoom.us/j/1",
    ]);
    expect(scheduleLinks({ media: "https://x.com" })).toEqual(["https://x.com"]);
    expect(joinLinks([" a ", "", "b"])).toBe("a\nb");
    expect(linkLabel("https://www.youtube.com/live/abc")).toBe("youtube.com");
    expect(linkLabel("Ruang 3")).toBe("Ruang 3");
  });
});
