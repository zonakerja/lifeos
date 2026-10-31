import { describe, expect, it } from "vitest";
import { cleanLeader, groupRhk, overlapsYear, parseDmy, parseSkpBlock, type RhkRow } from "./ekinerja.js";

describe("e-Kinerja: daftar SKP", () => {
  it("tanggal 01-May-2025 dan singkatan Indonesia", () => {
    expect(parseDmy("01-May-2025")).toBe("2025-05-01");
    expect(parseDmy("31-Dec-2025")).toBe("2025-12-31");
    expect(parseDmy("1-Mei-2026")).toBe("2026-05-01");
    expect(parseDmy("31-Foo-2025")).toBeNull();
  });

  it("blok SKP: periode, status, pendekatan, pejabat penilai, nomor SKP", () => {
    const text =
      "Periode\t:\t01-May-2025 s.d 31-Dec-2025\nPendekatan\t:\tKUANTITATIF\nKantor\t:\tSekretariat\n" +
      "Status\t:\tDisetujui\nKeterangan\t:\t\nPejabat Penilai\t:\tDODDY HENDRA WIJAYA, SE., M.Sc.";
    expect(parseSkpBlock(text, "https://e-kinerja.kemenhub.go.id/skp/renaksi/421351")).toEqual({
      externalId: "421351",
      startDate: "2025-05-01",
      endDate: "2025-12-31",
      status: "Disetujui",
      approach: "KUANTITATIF",
      appraiser: "DODDY HENDRA WIJAYA, SE., M.Sc.",
    });
    expect(parseSkpBlock("tanpa periode", "/skp/renaksi/1")).toBeNull();
  });

  it("satu tahun bisa terdiri dari beberapa SKP", () => {
    const skps = [
      { startDate: "2025-01-01", endDate: "2025-04-30" },
      { startDate: "2025-05-01", endDate: "2025-12-31" },
      { startDate: "2024-09-01", endDate: "2024-12-31" },
    ];
    expect(skps.filter((s) => overlapsYear(s, 2025))).toHaveLength(2);
  });
});

describe("e-Kinerja: RHK dari Detail SKP", () => {
  const leader =
    "Persentase Pencapaian terpenuhinya Pengelolaan BMN\nIndikator : Pencapaian persentase Pengelolaan BMN";
  const row = (no: string, rhk: string, aspect: string, target: string, section = "UTAMA"): RhkRow => ({
    section,
    no,
    leader,
    rhk,
    aspect,
    indicator: `Indikator ${no}`,
    target,
  });

  it("RHK pimpinan tanpa bagian Indikator", () => {
    expect(cleanLeader(leader)).toBe("Persentase Pencapaian terpenuhinya Pengelolaan BMN");
  });

  it("baris beraspek berbeda digabung per RHK, urutan dipertahankan, bagian tambahan terpisah", () => {
    const rhk = groupRhk([
      row("1", "Draft Laporan Hasil Pelaksanaan Kegiatan Tugas Belajar", "KUANTITAS", "8 Laporan"),
      row("2", "Draft Laporan Rencana Kegiatan Perkuliahan", "KUANTITAS", "2 Laporan"),
      row("3", "Nilai Indeks Prestasi di atas 3,25", "KUALITAS", "100%"),
      row("4", "Draft Laporan Hasil Pelaksanaan  Kegiatan Tugas Belajar", "WAKTU", "1 Tahun"),
      row("1", "Membantu panitia", "KUANTITAS", "1 Kegiatan", "Tambahan"),
      row("x", "", "", ""),
    ]);
    expect(rhk.map((r) => [r.name, r.section, r.indicators.length])).toEqual([
      ["Draft Laporan Hasil Pelaksanaan Kegiatan Tugas Belajar", "UTAMA", 2],
      ["Draft Laporan Rencana Kegiatan Perkuliahan", "UTAMA", 1],
      ["Nilai Indeks Prestasi di atas 3,25", "UTAMA", 1],
      ["Membantu panitia", "TAMBAHAN", 1],
    ]);
    expect(rhk[0].indicators[1]).toEqual({ aspect: "WAKTU", indicator: "Indikator 4", target: "1 Tahun" });
    expect(rhk[0].leader).toBe("Persentase Pencapaian terpenuhinya Pengelolaan BMN");
  });
});

describe("e-Kinerja: SKP draft", () => {
  it("teks tombol Edit RHK / Hapus RHK tidak ikut narasi; indikator RHK pimpinan dipisah", async () => {
    const { groupRhk, splitLeader } = await import("./ekinerja.js");
    const [rhk] = groupRhk([
      {
        section: "UTAMA",
        no: "1",
        leader: "Persentase Kepatuhan Pengelolaan BMN\nIndikator : Persentase",
        rhk: "Draft Laporan Hasil Pelaksanaan Kegiatan Tugas Belajar\n Edit RHK  Hapus RHK",
        aspect: "KUANTITAS",
        indicator: "Jumlah Draft Laporan",
        target: "8 Laporan",
      },
    ]);
    expect(rhk.name).toBe("Draft Laporan Hasil Pelaksanaan Kegiatan Tugas Belajar");
    expect([rhk.leader, rhk.leaderIndicator]).toEqual(["Persentase Kepatuhan Pengelolaan BMN", "Persentase"]);
    expect(splitLeader("Tanpa indikator")).toEqual({ leader: "Tanpa indikator", indicator: "" });
  });
});
