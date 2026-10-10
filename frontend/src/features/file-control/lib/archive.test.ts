import { describe, expect, it } from "vitest";
import type { ArchiveFile } from "./archive";
import type { ArchiveJra, ArchiveResource, PhysicalReference } from "@/types/entities";
import {
  computeDynamicStatus,
  containerHasFiles,
  descendantIds,
  findBySmartCode,
  generateNextCode,
  isAwaitingDisposition,
  isValidHierarchy,
  locationForTarget,
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

  it("hanya arsip terkelola yang masa inaktifnya selesai yang menunggu penyusutan", () => {
    expect(isAwaitingDisposition(archive({ retentionInactiveDate: "2026-10-08" }), today)).toBe(true);
    expect(isAwaitingDisposition(archive({ retentionInactiveDate: "2026-10-09" }), today)).toBe(false);
    expect(
      isAwaitingDisposition(archive({ archivalStatus: "pending", retentionInactiveDate: "2020-01-01" }), today),
    ).toBe(false);
    expect(isAwaitingDisposition(archive({ status: "static", retentionInactiveDate: "2020-01-01" }), today)).toBe(
      false,
    );
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
