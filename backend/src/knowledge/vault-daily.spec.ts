import { describe, expect, it } from "vitest";
import { buildDailyNote, buildDailySection, dailyPath, isYmd, longDate, type DailyInput } from "./vault-daily";
import { buildLinkResolver, parseNote } from "./vault-parser";

const base: DailyInput = {
  date: "2026-11-06",
  appUrl: "http://localhost:5173/",
  agenda: [],
  todos: [],
  tasks: [],
  overdue: [],
  parents: new Map(),
  mirror: new Map(),
};

describe("vault-daily", () => {
  it("tanggal: validasi, path, nama hari Indonesia", () => {
    expect(isYmd("2026-11-06")).toBe(true);
    expect(isYmd("2026-02-30")).toBe(false);
    expect(isYmd("06-11-2026")).toBe(false);
    expect(dailyPath("2026-11-06")).toBe("Harian/2026-11-06.md");
    expect(longDate("2026-11-06")).toBe("Jumat, 6 November 2026");
  });

  it("ringkasan kosong tetap berisi bagian & tautan Planner", () => {
    const text = buildDailySection(base);
    expect(text).toContain("_Tidak ada agenda._");
    expect(text).toContain("_Tidak ada to-do._");
    expect(text).not.toContain("## Terlambat");
    expect(text).toContain("http://localhost:5173/planner/daily?date=2026-11-06");
  });

  it("agenda urut jam, task bertaut ke cermin project & area, terlambat terpisah", () => {
    const text = buildDailySection({
      ...base,
      agenda: [
        { id: "g2", title: "Rapat sore", startDate: "2026-11-06", startTime: "15:00", endTime: "16:00" },
        { id: "g1", title: "Apel", startDate: "2026-11-06", startTime: "07:30", location: "Halaman" },
        {
          id: "g3",
          title: "Diklat",
          startDate: "2026-11-05",
          endDate: "2026-11-07",
          startTime: "08:00",
          endTime: "16:00",
        },
      ],
      todos: [{ title: "Kirim notulen", completed: true }],
      tasks: [
        { title: "Susun draf", projectId: "p1" },
        { title: "Rekap SPJ", projectId: "s1" },
      ],
      overdue: [{ title: "Review KAK", projectId: "p1", dueDate: "2026-11-01" }],
      parents: new Map([
        ["p1", { title: "Laporan Q4", kind: "project" as const }],
        ["s1", { title: "Anggaran", kind: "activity" as const, areaId: "a1" }],
      ]),
      mirror: new Map([
        ["para_project:p1", "80-LifeOS/Productivity/Project/Laporan Q4.md"],
        ["para_area:a1", "80-LifeOS/Productivity/Area/Keuangan.md"],
        ["schedule:g2", "80-LifeOS/Agenda/2026-11-06 Rapat sore.md"],
      ]),
    });
    const lines = text.split("\n");
    const iApel = lines.findIndex((l) => l.includes("Apel"));
    const iRapat = lines.findIndex((l) => l.includes("Rapat sore"));
    expect(iApel).toBeLessThan(iRapat);
    expect(text).toContain("- 07:30 **Apel** · Halaman");
    expect(text).toContain("[[80-LifeOS/Agenda/2026-11-06 Rapat sore|Rapat sore]]");
    expect(text).toContain("Berlanjut **Diklat**");
    expect(text).toContain("- [x] Kirim notulen");
    expect(text).toContain("- [ ] Susun draf — [[80-LifeOS/Productivity/Project/Laporan Q4|Laporan Q4]]");
    expect(text).toContain("- [ ] Rekap SPJ — [[80-LifeOS/Productivity/Area/Keuangan|Anggaran]]");
    expect(text).toContain(
      "## Terlambat\n- [ ] Review KAK — [[80-LifeOS/Productivity/Project/Laporan Q4|Laporan Q4]] · tenggat 2026-11-01",
    );

    // Tautan wiki terselesaikan ke berkas cermin
    const resolve = buildLinkResolver(
      [
        ...new Set([
          "80-LifeOS/Productivity/Project/Laporan Q4.md",
          "80-LifeOS/Productivity/Area/Keuangan.md",
          "80-LifeOS/Agenda/2026-11-06 Rapat sore.md",
        ]),
      ].map((path, i) => ({ id: String(i), path, frontmatter: null })),
    );
    for (const link of parseNote("Harian/2026-11-06.md", text).links) expect(resolve(link.target)).not.toBeNull();
  });

  it("templat: penanda diisi, ringkasan di {{lifeos}} atau di akhir; tanpa templat isi bawaan", () => {
    const now = new Date(2026, 10, 6, 9, 5);
    const withMarker = buildDailyNote({
      date: "2026-11-06",
      section: "RINGKASAN",
      template: "# {{judul}}\nTanggal {{tanggal}} jam {{jam}}\n{{lifeos}}\n## Refleksi",
      now,
    });
    expect(withMarker).toBe("# Jumat, 6 November 2026\nTanggal 2026-11-06 jam 09:05\nRINGKASAN\n## Refleksi");
    const noMarker = buildDailyNote({ date: "2026-11-06", section: "RINGKASAN", template: "# {{judul}}\n\n", now });
    expect(noMarker).toBe("# Jumat, 6 November 2026\n\nRINGKASAN\n");
    const plain = buildDailyNote({ date: "2026-11-06", section: "RINGKASAN", now });
    expect(plain).toContain("jenis: harian");
    expect(plain).toContain("# Jumat, 6 November 2026");
    expect(plain).toContain("## Catatan");
  });
});
