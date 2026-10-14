import { describe, expect, it } from "vitest";
import type { AgendaType, Routine, Schedule } from "@/types/entities";
import { matchesWords, queryWords, searchAgendaTypes, searchRoutines, searchSchedules } from "./planner-search";

describe("pencarian Planner", () => {
  it("per kata, tanpa huruf besar/kecil & aksen", () => {
    expect(queryWords("  Kuliah   SELASA ")).toEqual(["kuliah", "selasa"]);
    expect(matchesWords(["cafe"], "Rapat di Café Bandung")).toBe(true);
    expect(matchesWords(["rapat", "bandung"], "Rapat", null, "Kantor Bandung")).toBe(true);
    expect(matchesWords(["rapat", "jakarta"], "Rapat", "Kantor Bandung")).toBe(false);
    expect(matchesWords([], "apa saja")).toBe(true);
  });

  const schedules: Schedule[] = [
    {
      id: "k1",
      title: "Kuliah Statistika",
      type: "Kuliah",
      startDate: "2026-10-13",
      endDate: "2026-10-13",
      location: "Kampus B",
      media: "https://meet.google.com/abc\nhttps://zoom.us/j/1",
      recurrence: { frequency: "weekly", interval: 1, days: [2], count: 8 },
    },
    {
      id: "r1",
      title: "Rapat Anggaran",
      type: "Meeting",
      startDate: "2026-10-15",
      endDate: "2026-10-15",
      description: "Bahas RKA 2027",
      outcome: "Disetujui",
      reschedules: [{ fromDate: "2026-10-14", toDate: "2026-10-15", at: "2026-10-01T00:00:00Z" }],
    },
  ];
  const ids = (list: { id: string }[]) => list.map((x) => x.id);

  it("agenda: judul, tipe, lokasi, keterangan, hasil, link, hari/bulan, pola, jadwal ulang", () => {
    expect(ids(searchSchedules(schedules, "kuliah selasa"))).toEqual(["k1"]);
    expect(ids(searchSchedules(schedules, "oktober"))).toEqual(["k1", "r1"]);
    expect(ids(searchSchedules(schedules, "zoom"))).toEqual(["k1"]);
    expect(ids(searchSchedules(schedules, "rka disetujui"))).toEqual(["r1"]);
    expect(ids(searchSchedules(schedules, "berulang mingguan"))).toEqual(["k1"]);
    expect(ids(searchSchedules(schedules, "dijadwal ulang"))).toEqual(["r1"]);
    expect(ids(searchSchedules(schedules, "kamis"))).toEqual(["r1"]);
    expect(searchSchedules(schedules, "  ")).toBe(schedules);
  });

  it("rutinitas: judul & pola frekuensi", () => {
    const routines: Routine[] = [
      { id: "a", title: "Lari Pagi", frequency: "daily" },
      { id: "b", title: "Bayar Tagihan", frequency: "monthly", monthDates: ["5"] },
    ];
    expect(ids(searchRoutines(routines, "lari"))).toEqual(["a"]);
    expect(ids(searchRoutines(routines, "bulanan"))).toEqual(["b"]);
    expect(ids(searchRoutines(routines, "setiap hari"))).toEqual(["a"]);
  });

  it("referensi: nama tipe & label ikon", () => {
    const types: AgendaType[] = [
      { id: "1", name: "Webinar", icon: "video" },
      { id: "2", name: "Kuliah" },
    ];
    expect(ids(searchAgendaTypes(types, "web"))).toEqual(["1"]);
    expect(ids(searchAgendaTypes(types, "online"))).toEqual(["1"]);
    expect(ids(searchAgendaTypes(types, "kuliah"))).toEqual(["2"]);
  });
});
