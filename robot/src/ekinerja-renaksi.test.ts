import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_BUTTON,
  indicatorsToCheck,
  modalPasses,
  monthName,
  monthOfHeading,
  monthSummary,
  parseItems,
  plannedSteps,
  rowKey,
  syncPlan,
  validRows,
} from "./ekinerja-renaksi.js";

const row = (over = {}) => ({
  rhk: "Mengikuti workshop/sosialisasi/rapat/diklat/course",
  indicator: "Jumlah Laporan",
  renaksi: ["Mengikuti rapat BMN"],
  realisasi: ["Laporan rapat BMN Oktober 2026"],
  bukti: ["https://drive.google.com/x"],
  ...over,
});

describe("renaksi e-Kinerja", () => {
  it("nama bulan & judul blok", () => {
    expect(monthName("2026-10")).toBe("oktober");
    expect(monthName("2026-13")).toBeNull();
    expect(monthOfHeading("oktober  Belum ada pengisian Rencana Aksi")).toBe("oktober");
    expect(monthOfHeading("Oktober")).toBe("oktober");
    expect(monthOfHeading("Rating Hasil Kerja")).toBeNull();
  });

  it("kunci baris = teks sel indikator", () => {
    expect(rowKey("A  b", "Jumlah Laporan")).toBe("rhk a b indikator jumlah laporan");
    expect(rowKey(" X ", "Y.")).toBe("rhk x indikator y");
  });

  it("hanya mencentang indikator yang diminta dan belum tercentang", () => {
    const k = rowKey(row().rhk, row().indicator);
    const r = indicatorsToCheck(
      [
        { key: k, checked: false },
        { key: "rhk lain indikator lain", checked: true },
      ],
      [row(), row({ rhk: "Tidak ada" })],
    );
    expect(r.check).toEqual([k]);
    expect(r.missing).toEqual(["rhk tidak ada indikator jumlah laporan"]);
    expect(indicatorsToCheck([{ key: k, checked: true }], [row()]).check).toEqual([]);
  });

  it("butir yang sudah ada dilewati (idempoten)", () => {
    const k = rowKey(row().rhk, row().indicator);
    const first = plannedSteps([{ key: k, renaksi: [], realisasi: [], bukti: [] }], [row()]);
    expect(first.steps.map((s) => s.kind)).toEqual(["renaksi", "realisasi", "bukti"]);
    const again = plannedSteps(
      [{ key: k, renaksi: ["mengikuti rapat BMN."], realisasi: ["Laporan rapat BMN Oktober 2026"], bukti: [] }],
      [row({ renaksi: ["Mengikuti rapat BMN", "Mengikuti rapat BMN"] })],
    );
    expect(again.steps).toEqual([{ key: k, kind: "bukti", value: "https://drive.google.com/x" }]);
    expect(plannedSteps([], [row()]).missing).toEqual([k]);
  });

  it("membaca butir sel Rencana Aksi dan Realisasi", () => {
    expect(
      parseItems([
        { label: "Renaksi", items: ["Belum diisi"] },
        { label: "Realisasi", items: [" a ", "b"] },
        { label: "Bukti Data Dukung", items: ["https://x"] },
      ]),
    ).toEqual({ renaksi: [], realisasi: ["a", "b"], bukti: ["https://x"] });
  });

  it("tombol kirim tidak pernah diklik", () => {
    expect(FORBIDDEN_BUTTON.test(" Kirim Penilaiaan Ke Atasan")).toBe(true);
    expect(FORBIDDEN_BUTTON.test(" Isi Realisasi")).toBe(false);
  });

  it("validasi masukan", () => {
    expect(validRows([row()])).toHaveLength(1);
    expect(validRows([])).toBeNull();
    expect(validRows([row({ rhk: "" })])).toBeNull();
    expect(validRows([row({ bukti: [1] })])).toBeNull();
  });
});

describe("pemantauan & sinkron bulan", () => {
  it("ringkasan bulan: dinilai, diajukan, draf, kosong, belum dibuka", () => {
    const rated = monthSummary(
      "juli Rating Hasil Kerja : SESUAI EKSPEKTASI Rating Perilaku Kerja : SESUAI EKSPEKTASI Predikat : Baik Persentase Tunkin (%) : 60 Cetak : Tanggal Pengajuan Penilaiaan : 08-07-2026 ( Hari Kerja Ke-6 )",
      false,
      false,
      2,
    );
    expect(rated).toEqual({
      status: "rated",
      submittedAt: "2026-07-08",
      workday: 6,
      ratings: { hasilKerja: "SESUAI EKSPEKTASI", perilaku: "SESUAI EKSPEKTASI", predikat: "Baik", tunkin: "60" },
    });
    expect(
      monthSummary("september Tanggal Pengajuan Penilaiaan : 26-10-2026 ( Hari Kerja Ke-18 )", false, false, 2),
    ).toEqual({ status: "submitted", submittedAt: "2026-10-26", workday: 18 });
    expect(monthSummary("oktober", false, true, 1).status).toBe("draft");
    expect(monthSummary("november Belum ada pengisian Rencana Aksi", true, false, 0).status).toBe("empty");
    expect(monthSummary("desember Belum ada pengisian Rencana Aksi -", false, false, 0).status).toBe("unavailable");
  });

  it("baris berisi butir di luar LifeOS ditulis ulang; indikator lama dilepas; yang kurang ditambah", () => {
    const key = rowKey(row().rhk, row().indicator);
    const old = { key: "rhk lama indikator x", renaksi: ["a"], realisasi: [], bukti: [] };
    const changed = { key, renaksi: ["Mengikuti rapat BMN"], realisasi: ["Laporan lama"], bukti: [] };
    expect(syncPlan([changed, old], [row()])).toEqual({ check: [], uncheck: [old.key], rewrite: [key] });
    const subset = { key, renaksi: ["Mengikuti rapat BMN"], realisasi: [], bukti: [] };
    expect(syncPlan([subset], [row()])).toEqual({ check: [], uncheck: [], rewrite: [] });
    expect(syncPlan([], [row()]).check).toEqual([key]);
    expect(syncPlan([old], []).uncheck).toEqual([]);
    const blank = { key: "rhk kosong indikator y", renaksi: [], realisasi: [], bukti: [] };
    expect(syncPlan([blank], [row()]).uncheck).toEqual([]);
  });

  it("modal: tulis ulang baris satu-satunya memakai indikator sementara", () => {
    const passes = modalPasses(["a", "b", "c"], ["a"], { check: [], uncheck: [], rewrite: ["a"] });
    expect(passes).toEqual({ first: { check: ["b"], uncheck: ["a"] }, second: { check: ["a"], uncheck: ["b"] } });
    expect(modalPasses(["a", "b", "c"], ["a", "b"], { check: [], uncheck: ["b"], rewrite: ["a"] })).toEqual({
      first: { check: ["c"], uncheck: ["a", "b"] },
      second: { check: ["a"], uncheck: ["c"] },
    });
    expect(modalPasses(["a"], ["a"], { check: [], uncheck: [], rewrite: ["a"] })).toBeNull();
    expect(modalPasses(["a", "b"], ["a"], { check: ["b"], uncheck: [], rewrite: [] })).toEqual({
      first: { check: ["b"], uncheck: [] },
      second: null,
    });
  });
});
