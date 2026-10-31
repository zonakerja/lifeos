import { describe, expect, it } from "vitest";
import type { ActionPlanEntry, ActionPlanMonth, Resource, Skp, SkpTarget } from "@/types/entities";
import {
  defaultDescription,
  defaultPeriod,
  documentOptions,
  DEFAULT_TIME_REALIZATION,
  displayStatus,
  ekinRowKey,
  entryInMonth,
  entryIndicators,
  entrySignature,
  isLockedMonth,
  isPending,
  monthOf,
  entryStatus,
  indicatorRealization,
  groupByTarget,
  missingFields,
  periodLabel,
  periodOf,
  shiftPeriod,
  skpPeriodLabel,
  skpsForPeriod,
  skpsForYear,
  targetOptions,
  targetsForSkp,
  targetsForYear,
} from "./action-plan";

const entry = (over: Partial<ActionPlanEntry>): ActionPlanEntry => ({
  id: "e",
  period: "2026-10",
  description: "Menyusun laporan",
  status: "draft",
  ...over,
});

describe("rencana aksi (renaksi)", () => {
  it("bulan dari tanggal YMD dibaca lokal, bawaan dari tanggal selesai lalu tenggat", () => {
    expect(periodOf("2026-10-31")).toBe("2026-10");
    expect(periodOf("")).toBeNull();
    const today = new Date(2026, 9, 25);
    expect(defaultPeriod([undefined, "2026-09-30"], today)).toBe("2026-09");
    expect(defaultPeriod([undefined, ""], today)).toBe("2026-10");
  });

  it("label & geser bulan melewati tahun", () => {
    expect(periodLabel("2026-01")).toBe("Januari 2026");
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
    expect(shiftPeriod("2026-12", 1)).toBe("2027-01");
  });

  it("status siap hanya bila RHK, rencana aksi, realisasi, dan bukti lengkap", () => {
    const full = { targetId: "t", documentUrl: "https://x", realization: "Laporan" };
    expect(entryStatus(entry({}))).toBe("draft");
    expect(entryStatus(entry(full))).toBe("ready");
    expect(entryStatus(entry({ ...full, description: " " }))).toBe("draft");
    expect(entryStatus(entry({ status: "filled" }))).toBe("filled");
    expect(missingFields(entry({ targetId: "t" }))).toEqual(["realisasi", "bukti data dukung"]);
    // Hanya indikator WAKTU terpilih → realisasi tidak wajib (bawaan "Penyampaian tepat waktu")
    const target = {
      id: "t",
      year: 2026,
      name: "RHK",
      indicators: [
        { aspect: "KUANTITAS", indicator: "Jumlah Laporan", target: "8 Laporan" },
        { aspect: "WAKTU", indicator: "Target Waktu", target: "Bulanan" },
      ],
    };
    expect(entryStatus(entry({ ...full, realization: "" }), target)).toBe("draft");
    expect(entryStatus(entry({ ...full, realization: "", indicators: ["Target Waktu"] }), target)).toBe("ready");
  });

  it("indikator entri & realisasi per indikator", () => {
    const target = {
      id: "t",
      year: 2026,
      name: "RHK",
      indicators: [
        { aspect: "KUANTITAS", indicator: "Jumlah", target: "8" },
        { aspect: "WAKTU", indicator: "Waktu", target: "Bulanan" },
      ],
    };
    expect(entryIndicators({}, target).map((i) => i.indicator)).toEqual(["Jumlah", "Waktu"]);
    expect(entryIndicators({ indicators: ["Waktu"] }, target).map((i) => i.indicator)).toEqual(["Waktu"]);
    expect(entryIndicators({ indicators: ["Hilang"] }, target)).toHaveLength(2);
    expect(indicatorRealization({ realization: "Laporan" }, target.indicators[0])).toBe("Laporan");
    expect(indicatorRealization({ realization: "Laporan" }, target.indicators[1])).toBe(DEFAULT_TIME_REALIZATION);
    expect(indicatorRealization({ timeRealization: "Tepat" }, target.indicators[1])).toBe("Tepat");
  });

  it("kandidat link dokumen: web link, berkas, resource global; catatan dilewati; tanpa ganda", () => {
    const resources = [
      { id: "r1", title: "SK Tim", type: "file", uploadId: "u9" },
      { id: "r2", title: "Portal", type: "link", url: "https://portal" },
    ] as Resource[];
    const options = documentOptions(
      [
        { id: "a", type: "link", name: "Notulen", url: "https://docs/n" },
        { id: "b", type: "file", name: "Laporan.pdf", uploadId: "u1" },
        { id: "c", type: "note", noteId: "free-1" },
        { id: "d", type: "existing", existingId: "r1" },
        { id: "e", type: "existing", existingId: "r2" },
        { id: "f", type: "file", name: "Laporan lagi", uploadId: "u1" },
      ],
      resources,
    );
    expect(options.map((o) => [o.kind, o.label])).toEqual([
      ["url", "Notulen"],
      ["file", "Laporan.pdf"],
      ["file", "SK Tim"],
      ["url", "Portal"],
    ]);
  });

  it("uraian bawaan & pengelompokan per RHK", () => {
    expect(defaultDescription("Rapat koordinasi", "Bahas anggaran\nlainnya")).toBe("Rapat koordinasi — Bahas anggaran");
    expect(defaultDescription("Rapat", "Rapat")).toBe("Rapat");
    const targets = [
      { id: "t2", year: 2026, name: "B", order: 2 },
      { id: "t1", year: 2026, name: "A", order: 1 },
      { id: "t0", year: 2025, name: "Lama" },
    ] as SkpTarget[];
    expect(targetsForYear(targets, 2026).map((t) => t.id)).toEqual(["t1", "t2"]);
    const groups = groupByTarget(
      [entry({ id: "1", targetId: "t2" }), entry({ id: "2", targetId: "t1" }), entry({ id: "3" })],
      targets,
    );
    expect(groups.map((g) => g.target?.id ?? null)).toEqual(["t1", "t2", null]);
  });
});

describe("beberapa SKP dalam setahun", () => {
  const skps = [
    { id: "s1", externalId: "1", startDate: "2025-01-01", endDate: "2025-04-30" },
    { id: "s2", externalId: "2", startDate: "2025-05-01", endDate: "2025-12-31" },
    { id: "s3", externalId: "3", startDate: "2026-01-01", endDate: "2026-06-15" },
    { id: "s4", externalId: "4", startDate: "2026-06-16", endDate: "2026-12-31" },
  ] as Skp[];
  const targets = [
    { id: "a", year: 2025, skpId: "s2", name: "RHK Mei-Des", order: 1 },
    { id: "b", year: 2025, skpId: "s1", name: "RHK Jan-Apr", order: 1 },
    { id: "m", year: 2025, name: "Manual 2025" },
  ] as SkpTarget[];

  it("bulan memilih SKP yang periodenya mencakup bulan itu", () => {
    expect(skpsForPeriod(skps, "2025-04").map((s) => s.id)).toEqual(["s1"]);
    expect(skpsForPeriod(skps, "2025-05").map((s) => s.id)).toEqual(["s2"]);
    expect(skpsForPeriod(skps, "2026-06").map((s) => s.id)).toEqual(["s3", "s4"]);
    expect(skpsForYear(skps, 2025)).toHaveLength(2);
    expect(skpPeriodLabel(skps[1])).toBe("1 Mei 2025 – 31 Des 2025");
  });

  it("pilihan RHK: milik SKP bulan itu; SKP dipecah di tengah bulan → pilih dulu; tanpa SKP → manual", () => {
    expect(targetOptions(skps, targets, "2025-07").targets.map((t) => t.id)).toEqual(["a"]);
    const split = targetOptions(skps, targets, "2026-06");
    expect([split.candidates.length, split.skp, split.targets]).toEqual([2, undefined, []]);
    expect(targetOptions(skps, targets, "2026-06", "s4").skp?.id).toBe("s4");
    expect(targetOptions(skps, targets, "2027-01").targets).toEqual([]);
    expect(targetOptions([], targets, "2025-07").targets.map((t) => t.id)).toEqual(["m"]);
    expect(targetsForSkp(targets, "s1").map((t) => t.id)).toEqual(["b"]);
  });
});

describe("pemantauan e-Kinerja & pengenal perubahan", () => {
  const target: SkpTarget = {
    id: "t1",
    year: 2026,
    skpId: "s1",
    name: "Draft Laporan",
    indicators: [
      { aspect: "KUANTITAS", indicator: "Jumlah Laporan", target: "1 Laporan" },
      { aspect: "WAKTU", indicator: "Target Waktu", target: "Bulanan" },
    ],
  };
  const full = entry({
    targetId: "t1",
    skpId: "s1",
    realization: "Laporan Oktober",
    documentUrl: "https://drive/x",
    status: "filled",
  });
  const row = (indicator: string, realisasi: string) => ({
    key: ekinRowKey("Draft Laporan", indicator),
    text: `RHK Draft Laporan Indikator ${indicator}`,
    renaksi: ["Menyusun laporan"],
    realisasi: [realisasi],
    bukti: ["https://drive/x"],
  });
  const month = (
    status: ActionPlanMonth["status"],
    rows = [row("Jumlah Laporan", "Laporan Oktober"), row("Target Waktu", DEFAULT_TIME_REALIZATION)],
  ): ActionPlanMonth => ({
    id: "m",
    period: "2026-10",
    skpId: "s1",
    status,
    rows,
  });

  it("tanda tangan sama dengan backend: abaikan spasi/huruf/titik akhir, urutan indikator", () => {
    expect(entrySignature({ ...full, description: " menyusun LAPORAN. " })).toBe(entrySignature(full));
    expect(entrySignature({ ...full, indicators: ["B", "A"] })).toBe(
      entrySignature({ ...full, indicators: ["a", "b"] }),
    );
    expect(entrySignature({ ...full, documentUrl: "https://drive/y" })).not.toBe(entrySignature(full));
  });

  it("status gabungan: terisi, berubah, akan dihapus, tidak ada di e-Kinerja, terkunci", () => {
    const pushed = { ...full, pushedSignature: entrySignature(full) };
    expect(displayStatus(pushed, target, month("draft"))).toBe("filled");
    expect(displayStatus({ ...pushed, realization: "Laporan revisi" }, target, month("draft"))).toBe("changed");
    expect(displayStatus({ ...pushed, deleted: true }, target, month("draft"))).toBe("deleted");
    expect(displayStatus(pushed, target, month("draft", [row("Jumlah Laporan", "Laporan Oktober")]))).toBe("missing");
    expect(displayStatus({ ...pushed, realization: "x" }, target, month("submitted"))).toBe("locked");
    expect(displayStatus(entry({ targetId: "t1" }), target, null)).toBe("draft");
    expect(isPending("changed") && isPending("deleted") && !isPending("filled") && !isPending("locked")).toBe(true);
  });

  it("isi entri dicocokkan per indikator (realisasi waktu bawaan)", () => {
    expect(entryInMonth(full, target, month("draft"))).toBe(true);
    expect(entryInMonth({ ...full, documentUrl: "https://lain" }, target, month("draft"))).toBe(false);
    expect(isLockedMonth(month("rated")) && !isLockedMonth(month("draft")) && !isLockedMonth(null)).toBe(true);
    expect(monthOf([month("draft")], "2026-10", "s1")?.status).toBe("draft");
    expect(monthOf([month("draft")], "2026-11")).toBeNull();
  });
});
