import { describe, expect, it } from "vitest";
import {
  buildRenaksiPlan,
  buildSyncPlan,
  DEFAULT_TIME_REALIZATION,
  emptyRows,
  entryItems,
  entryPresent,
  entrySignature,
  filledEntries,
  hasPendingChanges,
  importCandidates,
  isChanged,
  rowKey,
} from "./ekinerja-renaksi";

const target = {
  id: "t1",
  name: "Draft Laporan Tugas Belajar",
  skpId: "ekin-545406",
  indicators: [
    { aspect: "KUANTITAS", indicator: "Jumlah Draft Laporan", target: "8 Laporan" },
    { aspect: "WAKTU", indicator: "Target Waktu Pencapaian", target: "Bulanan" },
  ],
};
const entry = (over = {}) => ({
  id: "e1",
  period: "2026-10",
  skpId: "ekin-545406",
  targetId: "t1",
  description: "Menyusun laporan",
  realization: "Laporan Oktober",
  documentUrl: "https://drive/x",
  status: "ready",
  ...over,
});

describe("renaksi e-Kinerja (backend)", () => {
  it("butir per indikator; indikator waktu memakai realisasi bawaan", () => {
    const items = entryItems(entry(), target);
    expect(items).toHaveLength(6);
    expect(items.filter((i) => i.kind === "realisasi").map((i) => i.value)).toEqual([
      "Laporan Oktober",
      DEFAULT_TIME_REALIZATION,
    ]);
    expect(entryItems(entry({ indicators: ["Target Waktu Pencapaian"], realization: "" }), target)).toHaveLength(3);
    expect(entryItems(entry({ realization: "" }), target)).toEqual([]);
    expect(entryItems(entry({ documentUrl: "" }), target)).toEqual([]);
    expect(entryItems(entry(), { ...target, indicators: [] })).toEqual([]);
  });

  it("menggabungkan entri per SKP tanpa butir ganda; entri terisi/bulan lain dilewati", () => {
    const { bySkp, skipped } = buildRenaksiPlan(
      [
        entry(),
        entry({ id: "e2", description: "Rapat koordinasi" }),
        entry({ id: "e3", status: "filled" }),
        entry({ id: "e4", period: "2026-09" }),
        entry({ id: "e5", targetId: "hilang" }),
      ],
      [target],
      "2026-10",
    );
    const plan = bySkp.get("ekin-545406")!;
    expect(plan.entryIds).toEqual(["e1", "e2"]);
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0].renaksi).toEqual(["Menyusun laporan", "Rapat koordinasi"]);
    expect(plan.rows[1].realisasi).toEqual([DEFAULT_TIME_REALIZATION]);
    expect(skipped).toEqual(["e5"]);
  });

  it("entri terisi bila semua butirnya terbaca di e-Kinerja", () => {
    const k1 = rowKey(target.name, "Jumlah Draft Laporan");
    const k2 = rowKey(target.name, "Target Waktu Pencapaian");
    const rows = [
      { key: k1, renaksi: ["menyusun laporan."], realisasi: ["Laporan Oktober"], bukti: ["https://drive/x"] },
      { key: k2, renaksi: ["Menyusun laporan"], realisasi: [DEFAULT_TIME_REALIZATION], bukti: [] },
    ];
    expect(filledEntries([entry()], [target], rows)).toEqual([]);
    rows[1].bukti.push("https://drive/x");
    expect(filledEntries([entry()], [target], rows).map((e) => e.id)).toEqual(["e1"]);
  });
});

describe("pemantauan & sinkron dua arah", () => {
  const key = (indicator: string) => rowKey(target.name, indicator);

  it("pengenal perubahan: tanda tangan berubah saat isi diubah, tidak berubah karena spasi/huruf", () => {
    const filled = { ...entry({ status: "filled" }), pushedSignature: entrySignature(entry()) };
    expect(isChanged(filled)).toBe(false);
    expect(isChanged({ ...filled, description: "  menyusun LAPORAN. " })).toBe(false);
    expect(isChanged({ ...filled, documentUrl: "https://drive/y" })).toBe(true);
    expect(hasPendingChanges([filled])).toBe(false);
    expect(hasPendingChanges([{ ...filled, deleted: true }])).toBe(true);
  });

  it("isian sinkron memuat entri terisi tetapi tidak yang ditandai hapus", () => {
    const { bySkp } = buildSyncPlan(
      [entry({ status: "filled" }), { ...entry({ id: "e2", description: "Dihapus" }), deleted: true }],
      [target],
      "2026-10",
    );
    expect(bySkp.get("ekin-545406")!.rows[0].renaksi).toEqual(["Menyusun laporan"]);
  });

  it("butir yang hanya ada di e-Kinerja menjadi calon entri; butir milik entri (sekarang/lama) tidak", () => {
    const rows = [
      {
        key: key("Jumlah Draft Laporan"),
        renaksi: ["Menyusun laporan", "Rapat dengan dosen"],
        realisasi: ["Laporan Oktober", "Notulen rapat"],
        bukti: ["https://drive/x", "https://drive/z"],
      },
      {
        key: key("Target Waktu Pencapaian"),
        renaksi: ["Menyusun laporan lama", "Rapat dengan dosen"],
        realisasi: [DEFAULT_TIME_REALIZATION, DEFAULT_TIME_REALIZATION],
        bukti: ["https://drive/x", "https://drive/z"],
      },
    ];
    const changed = { ...entry(), pushed: entry({ description: "Menyusun laporan lama" }) };
    expect(importCandidates(rows, [changed], [target])).toEqual([
      {
        targetId: "t1",
        description: "Rapat dengan dosen",
        documentUrl: "https://drive/z",
        indicators: ["Jumlah Draft Laporan", "Target Waktu Pencapaian"],
        realization: "Notulen rapat",
        timeRealization: DEFAULT_TIME_REALIZATION,
      },
    ]);
    expect(entryPresent(entry(), target, rows)).toBe(false);
    expect(entryPresent(entry({ indicators: ["Jumlah Draft Laporan"] }), target, rows)).toBe(true);
  });
});

describe("bulan dikosongkan", () => {
  it("baris berisi menjadi baris tanpa butir; baris kosong & tak dikenal dilewati", () => {
    const rows = [
      { key: rowKey(target.name, "Jumlah Draft Laporan"), renaksi: ["a"], realisasi: [], bukti: [] },
      { key: rowKey(target.name, "Target Waktu Pencapaian"), renaksi: [], realisasi: [], bukti: [] },
      { key: "rhk lain indikator x", renaksi: ["b"], realisasi: [], bukti: [] },
    ];
    expect(emptyRows(rows, [target])).toEqual([
      { rhk: target.name, indicator: "Jumlah Draft Laporan", renaksi: [], realisasi: [], bukti: [] },
    ]);
  });
});
