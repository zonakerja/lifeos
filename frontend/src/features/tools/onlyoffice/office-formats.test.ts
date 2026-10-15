import { describe, expect, it } from "vitest";
import {
  extensionOf,
  isOfficeEditable,
  officeEditModeOf,
  officeFormatOf,
  officeFormatsByMode,
  officeKindOf,
} from "./office-formats";

describe("officeKindOf", () => {
  it("mengutamakan ekstensi nama berkas", () => {
    expect(officeKindOf("Nota Dinas.DOCX")).toBe("word");
    expect(officeKindOf("rekap.csv")).toBe("cell");
    expect(officeKindOf("paparan.ppt")).toBe("slide");
    expect(officeKindOf("sk.pdf", "application/octet-stream")).toBe("pdf");
    expect(officeKindOf("alur.vsdx")).toBe("diagram");
    expect(officeKindOf("foto.png", "image/png")).toBeNull();
  });

  it("ekstensi tak dikenal / tanpa ekstensi → dari MIME", () => {
    expect(officeKindOf("Laporan", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("cell");
    expect(officeKindOf(undefined, "application/pdf; charset=binary")).toBe("pdf");
    expect(officeFormatOf("Laporan v1.2", "application/vnd.oasis.opendocument.text")).toBe("odt");
    expect(officeKindOf("Tanpa jenis", "application/zip")).toBeNull();
  });
});

describe("mode sunting (daftar resmi ONLYOFFICE)", () => {
  it("edit, lossy, view", () => {
    expect(officeEditModeOf("a.docx")).toBe("edit");
    expect(officeEditModeOf("a.xlsm")).toBe("edit");
    expect(officeEditModeOf("a.odt")).toBe("lossy");
    expect(officeEditModeOf("a.csv")).toBe("lossy");
    expect(officeEditModeOf("a.doc")).toBe("view");
    expect(officeEditModeOf("a.vsdx")).toBe("view");
  });

  it("isOfficeEditable = edit + lossy", () => {
    expect(isOfficeEditable("a.docx")).toBe(true);
    expect(isOfficeEditable("a.pdf")).toBe(true);
    expect(isOfficeEditable("a.odt")).toBe(true);
    expect(isOfficeEditable("a.txt")).toBe(true);
    expect(isOfficeEditable("a.doc")).toBe(false);
    expect(isOfficeEditable("a.pages")).toBe(false);
    expect(isOfficeEditable("Judul tanpa ekstensi", "application/vnd.ms-excel")).toBe(true);
    expect(isOfficeEditable("Judul tanpa ekstensi", "application/msword")).toBe(false);
  });

  it("pengelompokan untuk halaman Tools", () => {
    const groups = officeFormatsByMode();
    expect(groups.edit).toContain("pptx");
    expect(groups.lossy).toContain("rtf");
    expect(groups.view).toContain("djvu");
    expect(groups.edit.length + groups.lossy.length + groups.view.length).toBe(74);
  });

  it("extensionOf", () => {
    expect(extensionOf("arsip.tar.GZ")).toBe("gz");
    expect(extensionOf("tanpa")).toBe("");
    expect(extensionOf(null)).toBe("");
  });
});
