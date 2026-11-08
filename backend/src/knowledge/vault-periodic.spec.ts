import { describe, expect, it } from "vitest";
import { parseNote } from "./vault-parser";
import { buildPeriodicNote, buildPeriodicSection, isoWeek, periodOf } from "./vault-periodic";

describe("vault-periodic", () => {
  it("minggu ISO termasuk pergantian tahun", () => {
    expect(isoWeek("2026-11-07")).toEqual({ year: 2026, week: 45, start: "2026-11-02", end: "2026-11-08" });
    expect(isoWeek("2027-01-01")).toMatchObject({ year: 2026, week: 53, start: "2026-12-28" });
    expect(isoWeek("2024-12-30")).toMatchObject({ year: 2025, week: 1, start: "2024-12-30" });
    expect(isoWeek("2026-01-04")).toMatchObject({ year: 2026, week: 1, start: "2025-12-29" });
  });

  it("periode mingguan & bulanan: path, judul, rentang", () => {
    expect(periodOf("week", "2026-11-07")).toMatchObject({
      path: "Mingguan/2026-W45.md",
      key: "2026-W45",
      title: "Minggu ke-45 2026 · 2 – 8 November 2026",
    });
    expect(periodOf("week", "2026-12-30").title).toBe("Minggu ke-53 2026 · 28 Desember 2026 – 3 Januari 2027");
    expect(periodOf("month", "2028-02-10")).toMatchObject({
      path: "Bulanan/2028-02.md",
      title: "Februari 2028",
      start: "2028-02-01",
      end: "2028-02-29",
    });
  });

  it("ringkasan: tautan hari / minggu, agenda urut, task + hitungan selesai", () => {
    const week = buildPeriodicSection({
      period: periodOf("week", "2026-11-04"),
      appUrl: "http://localhost:5173/",
      agenda: [
        { id: "b", title: "Rapat", startDate: "2026-11-05" },
        { id: "a", title: "Apel", startDate: "2026-11-02" },
      ],
      tasks: [
        { title: "Laporan", dueDate: "2026-11-06", completed: true },
        { title: "Surat", dueDate: "2026-11-03" },
      ],
      mirror: new Map([["schedule:b", "80-LifeOS/Agenda/2026-11-05 Rapat.md"]]),
    });
    expect(week).toContain("[[Harian/2026-11-02|Sen 2]]");
    expect(week).toContain("[[Harian/2026-11-08|Min 8]]");
    expect(week.indexOf("Apel")).toBeLessThan(week.indexOf("Rapat"));
    expect(week).toContain("[[80-LifeOS/Agenda/2026-11-05 Rapat|Rapat]]");
    expect(week).toContain("## Task jatuh tempo (1/2 selesai)");
    expect(week.indexOf("Surat")).toBeLessThan(week.indexOf("Laporan"));

    const month = buildPeriodicSection({
      period: periodOf("month", "2026-11-15"),
      appUrl: "",
      agenda: [],
      tasks: [],
      mirror: new Map(),
    });
    expect(month).toContain("[[Mingguan/2026-W44|W44]]"); // 1 Nov 2026 = Minggu → minggu 44
    expect(month).toContain("[[Mingguan/2026-W49|W49]]"); // 30 Nov = Senin minggu 49
    expect(month).toContain("_Tidak ada agenda._");
  });

  it("isi bawaan berproperti & templat dengan {{lifeos}}", () => {
    const period = periodOf("month", "2026-11-07");
    const note = buildPeriodicNote({ period, section: "RINGKASAN", now: new Date(2026, 10, 7, 9, 5) });
    const parsed = parseNote(period.path, note);
    expect(parsed.frontmatter).toMatchObject({ jenis: "bulanan", periode: "2026-11", tanggal: "2026-11-01" });
    expect(note).toContain("# November 2026");
    expect(note).toContain("RINGKASAN");
    const templated = buildPeriodicNote({
      period,
      section: "RINGKASAN",
      template: "# {{judul}}\n{{lifeos}}\n## Catatan",
      now: new Date(2026, 10, 7, 9, 5),
    });
    expect(templated).toBe("# November 2026\nRINGKASAN\n## Catatan");
  });
});
