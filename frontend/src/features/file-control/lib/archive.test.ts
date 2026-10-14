import { describe, expect, it } from "vitest";
import type { ArchiveFile } from "./archive";
import type { ArchiveJra, ArchiveResource, PhysicalReference } from "@/types/entities";
import {
  borrowedArchiveIds,
  borrowingOverdueDays,
  classificationKey,
  computeDynamicStatus,
  containerHasFiles,
  countArchivesUsing,
  descendantIds,
  dispositionBlockReason,
  findBySmartCode,
  generateNextCode,
  isValidHierarchy,
  jraKey,
  locationForTarget,
  locationPath,
  retentionDatesFromJra,
} from "./archive";

const today = new Date(2026, 9, 8); // 8 Okt 2026 (lokal)
const archive = (fields: Partial<ArchiveResource>): ArchiveResource => ({
  id: "a1",
  title: "Arsip",
  type: "file",
  archivalStatus: "physical",
  ...fields,
});

const refs: PhysicalReference[] = [
  { id: "loc", type: "location", parentId: "", code: "LOC-2026-001", name: "Gedung A" },
  { id: "rak", type: "rack", parentId: "loc", code: "RAK-2026-001", name: "Rak 1" },
  { id: "box", type: "box", parentId: "rak", code: "BOX-2026-007", name: "Box 7" },
  { id: "map", type: "folder", parentId: "box", code: "MAP-2026-0001", name: "Map 1" },
];

describe("status dinamis arsip", () => {
  it("aktif → inaktif → perlu tindak lanjut sesuai tanggal retensi", () => {
    const base = { retentionActiveDate: "2026-12-31", retentionInactiveDate: "2027-12-31" };
    expect(computeDynamicStatus(archive(base), today)).toBe("active");
    expect(computeDynamicStatus(archive({ ...base, retentionActiveDate: "2026-01-01" }), today)).toBe("inactive");
    const expired = { retentionActiveDate: "2024-01-01", retentionInactiveDate: "2025-01-01" };
    expect(computeDynamicStatus(archive(expired), today)).toBe("expired");
  });

  it("arsip vital tidak pernah 'perlu tindak lanjut'; statis/musnah bersifat final", () => {
    const expired = { retentionActiveDate: "2024-01-01", retentionInactiveDate: "2025-01-01" };
    expect(computeDynamicStatus(archive({ ...expired, isVital: true }), today)).toBe("inactive");
    expect(computeDynamicStatus(archive({ ...expired, status: "destroyed" }), today)).toBe("destroyed");
    expect(computeDynamicStatus(archive({ ...expired, status: "static" }), today)).toBe("static");
  });
});

describe("syarat penyusutan", () => {
  const expired = { retentionActiveDate: "2024-01-01", retentionInactiveDate: "2025-01-01" };
  const file = (fields: Partial<ArchiveResource>) => {
    const r = archive({ ...expired, ...fields });
    return { ...r, isArchived: false, dynamicStatus: computeDynamicStatus(r, today) } as ArchiveFile;
  };
  const musnah = { id: "jm", jenisArsip: "x", retensiAktif: 1, retensiInaktif: 1, keterangan: "Musnah" } as ArchiveJra;
  const permanen = { ...musnah, id: "jp", keterangan: "Permanen" } as ArchiveJra;
  const none = new Set<string>();

  it("pemusnahan hanya untuk arsip expired non-Permanen; penyerahan hanya untuk Permanen", () => {
    expect(dispositionBlockReason(file({}), "destroy", musnah, none)).toBeNull();
    expect(dispositionBlockReason(file({}), "transfer", permanen, none)).toBeNull();
    expect(dispositionBlockReason(file({}), "destroy", permanen, none)).toMatch(/Permanen/);
    expect(dispositionBlockReason(file({}), "transfer", musnah, none)).toMatch(/Permanen/);
  });

  it("menolak arsip vital, belum expired, belum diberkaskan, final, dan yang sedang dipinjam", () => {
    expect(dispositionBlockReason(file({ isVital: true }), "destroy", undefined, none)).toMatch(/vital/);
    expect(dispositionBlockReason(file({ retentionInactiveDate: "2030-01-01" }), "destroy", musnah, none)).toMatch(
      /belum selesai/,
    );
    expect(dispositionBlockReason(file({ archivalStatus: "pending" }), "destroy", musnah, none)).toMatch(/diberkaskan/);
    expect(dispositionBlockReason(file({ status: "destroyed" }), "destroy", musnah, none)).toMatch(/Statis/);
    expect(dispositionBlockReason(file({}), "destroy", musnah, new Set(["a1"]))).toMatch(/dipinjam/);
  });

  it("arsip dipinjam = item peminjaman berstatus aktif", () => {
    const items = [{ id: "a1" }, { id: "a2" }];
    expect([
      ...borrowedArchiveIds([
        { status: "active", items: [items[0]] },
        { status: "returned", items: [items[1]] },
      ]),
    ]).toEqual(["a1"]);
  });

  it("keterlambatan peminjaman dihitung dari target kembali (hanya yang aktif)", () => {
    expect(borrowingOverdueDays({ status: "active", returnDate: "2026-10-05" }, today)).toBe(3);
    expect(borrowingOverdueDays({ status: "active", returnDate: "2026-10-08" }, today)).toBe(0);
    expect(borrowingOverdueDays({ status: "returned", returnDate: "2026-10-01" }, today)).toBe(0);
  });
});

describe("referensi", () => {
  it("kunci duplikat klasifikasi & JRA tidak peka huruf besar/kecil", () => {
    const c = { kodePokok: "um", kodeSub: "01", kodeItem: "001" };
    expect(classificationKey(c)).toBe("UM.01.001");
    expect(jraKey({ kategoriUtama: "Keuangan ", subKategori: "Anggaran", jenisArsip: "RAB" })).toBe(
      jraKey({ kategoriUtama: "keuangan", subKategori: "ANGGARAN", jenisArsip: "rab" }),
    );
  });

  it("jumlah arsip pemakai referensi & lokasi lengkap", () => {
    const files = [archive({ classificationId: "c1" }), archive({ classificationId: "c1", jraId: "j1" })];
    expect(countArchivesUsing(files, "classificationId", "c1")).toBe(2);
    expect(countArchivesUsing(files, "jraId", "j2")).toBe(0);
    expect(locationPath(archive({ physLocationId: "loc", physRackId: "rak", physBoxId: "box" }), refs)).toBe(
      "Gedung A / Rak 1 / Box 7",
    );
    expect(locationPath(archive({}), refs)).toBe("");
  });
});

describe("retensi dari JRA", () => {
  it("tanggal dokumen + aktif tahun, lalu + inaktif tahun", () => {
    const jra = { id: "j", jenisArsip: "x", retensiAktif: 2, retensiInaktif: 5, keterangan: "Musnah" } as ArchiveJra;
    expect(retentionDatesFromJra("2026-03-15", jra)).toEqual({
      retentionActiveDate: "2028-03-15",
      retentionInactiveDate: "2033-03-15",
    });
  });
});

describe("hierarki penyimpanan fisik", () => {
  it("wadah hanya masuk ke tingkat tepat di atasnya; arsip boleh ke mana saja", () => {
    expect(isValidHierarchy("rack", "location")).toBe(true);
    expect(isValidHierarchy("box", "location")).toBe(false);
    expect(isValidHierarchy("location", "root")).toBe(true);
    expect(isValidHierarchy("file", "rack")).toBe(true);
  });

  it("rantai lokasi lengkap saat arsip dimasukkan ke map", () => {
    expect(locationForTarget(refs[3], refs)).toEqual({
      physLocationId: "loc",
      physRackId: "rak",
      physBoxId: "box",
      physFolderId: "map",
    });
    expect(locationForTarget(null, refs)).toEqual({
      physLocationId: "",
      physRackId: "",
      physBoxId: "",
      physFolderId: "",
    });
  });

  it("turunan wadah & deteksi wadah berisi arsip", () => {
    expect(descendantIds(refs, "loc")).toEqual(["rak", "box", "map"]);
    expect(containerHasFiles("loc", refs, [archive({ physFolderId: "map" })])).toBe(true);
    expect(containerHasFiles("loc", refs, [])).toBe(false);
    // Arsip digital tidak ditata secara fisik: lokasi lama yang tersimpan tidak membuat wadah dianggap berisi
    expect(containerHasFiles("loc", refs, [archive({ archivalStatus: "digital", physFolderId: "map" })])).toBe(false);
  });

  it("kode wadah berikutnya per jenis & tahun berjalan", () => {
    const year = new Date().getFullYear();
    const sameYear = refs.map((r) => ({ ...r, code: r.code.replace("2026", String(year)) }));
    expect(generateNextCode(sameYear, "box")).toBe(`BOX-${year}-008`);
    expect(generateNextCode(sameYear, "folder")).toBe(`MAP-${year}-0002`);
  });

  it("smart scan: ID, lalu kode wadah, lalu ID registrasi arsip", () => {
    const files = [
      { ...archive({ archiveRegId: "ARC-2026-abc123" }), isArchived: false, dynamicStatus: "active" },
    ] as ArchiveFile[];
    expect(findBySmartCode("box", refs, files)?.id).toBe("box");
    expect(findBySmartCode("RAK-2026-001", refs, files)?.id).toBe("rak");
    expect(findBySmartCode("ARC-2026-abc123", refs, files)?.id).toBe("a1");
    expect(findBySmartCode("tidak-ada", refs, files)).toBeUndefined();
  });
});
