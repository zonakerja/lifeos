import { describe, expect, it } from "vitest";
import { type AssetCheck, compareAssets, decidePolicy, matchPolicy, normalizeCode, parseRupiah } from "./agent-policy";

const MASTER = [
  { nup: "1", kodeBarang: "3.10.01.02.001", nama: "Laptop", nilai: 12_000_000 },
  { nup: "2", kodeBarang: "3.10.01.02.001", nama: "Laptop", nilai: 12_000_000 },
  { nup: "7", kodeBarang: "3.05.02.01.003", nama: "Kursi Kerja", nilai: 1_500_000 },
];
const OPTIONS = { criticalFields: ["nup", "kodeBarang"] as ("nup" | "kodeBarang")[], valueTolerance: 0 };

describe("normalisasi", () => {
  it("kode & NUP abaikan tanda baca dan huruf besar/kecil", () => {
    expect(normalizeCode(" 3.10-01 02 001 ")).toBe("31001020 01".replace(" ", ""));
    expect(normalizeCode("ab-1")).toBe("AB1");
  });

  it("nilai rupiah", () => {
    expect(parseRupiah("Rp 12.000.000,00")).toBe(12_000_000);
    expect(parseRupiah("12.000.000")).toBe(12_000_000);
    expect(parseRupiah("1500000")).toBe(1_500_000);
    expect(parseRupiah("12.5")).toBe(12.5);
    expect(parseRupiah("")).toBeNull();
    expect(parseRupiah("tidak ada")).toBeNull();
  });
});

describe("compareAssets", () => {
  it("cocok, berbeda, tidak ditemukan; skor = persen aset cocok", () => {
    const check = compareAssets(
      [
        { nup: "1", kodeBarang: "3.10.01.02.001", nama: "LAPTOP", nilai: "Rp 12.000.000" },
        { nup: "7", kodeBarang: "3.10.01.02.001", nama: "Kursi Kerja" },
        { nup: "99", kodeBarang: "3.10.01.02.001" },
        { nup: "2", kodeBarang: "31001 02001", nilai: 12_000_000 },
      ],
      MASTER,
      OPTIONS,
    );
    expect(check.items.map((i) => i.status)).toEqual(["cocok", "berbeda", "tidak_ditemukan", "cocok"]);
    expect(check.items[1].diffs).toEqual([
      { field: "kodeBarang", claimed: "3.10.01.02.001", master: "3.05.02.01.003" },
    ]);
    expect(check).toMatchObject({ total: 4, matched: 2, score: 50 });
  });

  it("nama hanya dicatat kecuali termasuk kolom kritis; nilai memakai toleransi", () => {
    const claim = [{ nup: "7", kodeBarang: "3.05.02.01.003", nama: "Meja", nilai: 1_560_000 }];
    const loose = compareAssets(claim, MASTER, { ...OPTIONS, valueTolerance: 5 });
    expect(loose.items[0].status).toBe("cocok");
    expect(loose.items[0].diffs.map((d) => d.field)).toEqual(["nama"]);
    expect(compareAssets(claim, MASTER, OPTIONS).items[0].status).toBe("berbeda");
    expect(
      compareAssets(claim, MASTER, { criticalFields: ["nup", "kodeBarang", "nama"], valueTolerance: 5 }).items[0]
        .status,
    ).toBe("berbeda");
  });

  it("tanpa aset = skor 0", () => {
    expect(compareAssets([], MASTER, OPTIONS)).toMatchObject({ total: 0, matched: 0, score: 0 });
  });
});

describe("matchPolicy", () => {
  const policies = [
    { id: "umum", mode: "shadow", requestKind: "psp", groupCodes: [] },
    { id: "khusus", mode: "auto", requestKind: "psp", groupCodes: ["satker-a"] },
    { id: "mati", mode: "off", requestKind: "penghapusan", groupCodes: [] },
  ];

  it("aturan yang menyebut grup didahulukan; jenis lain / mati diabaikan", () => {
    expect(matchPolicy(policies, { kind: "psp", groupCode: "SATKER-A" })?.id).toBe("khusus");
    expect(matchPolicy(policies, { kind: "psp", groupCode: "LAIN" })?.id).toBe("umum");
    expect(matchPolicy(policies, { kind: "psp" })?.id).toBe("umum");
    expect(matchPolicy(policies, { kind: "penghapusan" })).toBeNull();
    expect(matchPolicy([policies[1]], { kind: "psp", groupCode: "LAIN" })).toBeNull();
  });
});

describe("decidePolicy", () => {
  const check = (matched: number, total: number): AssetCheck => ({
    total,
    matched,
    score: Math.round((matched / total) * 100),
    items: [],
  });
  const base = {
    mode: "auto",
    threshold: 75,
    check: check(4, 5),
    masterAvailable: true,
    documents: 1,
    requestStatus: "diproses",
    paused: false,
    usedToday: 0,
    dailyLimit: 5,
  };

  it("memenuhi aturan di mode auto = disetujui & dijalankan", () => {
    expect(decidePolicy(base)).toMatchObject({ outcome: "approve", apply: true });
  });

  it("di bawah ambang / tanpa dokumen / tanpa data master / sudah diputuskan = ke pemilik", () => {
    expect(decidePolicy({ ...base, check: check(2, 4) }).reasons[0]).toContain("di bawah ambang 75%");
    expect(decidePolicy({ ...base, documents: 0 })).toMatchObject({ outcome: "review", apply: false });
    const blank = decidePolicy({ ...base, unfilled: ["jabatan_tujuan"] });
    expect(blank).toMatchObject({ outcome: "review", apply: false });
    expect(blank.reasons[0]).toContain("jabatan_tujuan");
    expect(decidePolicy({ ...base, masterAvailable: false }).outcome).toBe("review");
    expect(decidePolicy({ ...base, check: null }).outcome).toBe("review");
    expect(decidePolicy({ ...base, check: { total: 0, matched: 0, score: 0, items: [] } }).outcome).toBe("review");
    expect(decidePolicy({ ...base, requestStatus: "disetujui" }).outcome).toBe("review");
  });

  it("shadow, sakelar darurat, dan batas harian mencatat tanpa menjalankan", () => {
    for (const blocked of [{ mode: "shadow" }, { paused: true }, { usedToday: 5 }]) {
      const decision = decidePolicy({ ...base, ...blocked });
      expect(decision).toMatchObject({ outcome: "approve", apply: false });
      expect(decision.reasons).toHaveLength(2);
    }
  });
});
