import { describe, expect, it } from "vitest";
import { DOCUMENT_ACCEPT, importNeedsConversion, isDocumentFile } from "./office-templates";

describe("templat & impor dokumen", () => {
  it("hanya dokumen, spreadsheet, presentasi, dan PDF", () => {
    expect(isDocumentFile("Kop Surat.dotx")).toBe(true);
    expect(isDocumentFile("Rekap.xltx")).toBe(true);
    expect(isDocumentFile("Paparan.potx")).toBe(true);
    expect(isDocumentFile("Formulir.pdf")).toBe(true);
    expect(isDocumentFile("Laporan lama.doc")).toBe(true);
    expect(isDocumentFile("Alur.vsdx")).toBe(false);
    expect(isDocumentFile("logo.png", "image/png")).toBe(false);
    expect(DOCUMENT_ACCEPT).toContain(".docx");
    expect(DOCUMENT_ACCEPT).not.toContain(".vsdx");
  });

  it("format lama yang hanya bisa dilihat dikonversi saat impor", () => {
    expect(importNeedsConversion("Laporan.doc")).toBe(true);
    expect(importNeedsConversion("Paparan.ppt")).toBe(true);
    expect(importNeedsConversion("Anggaran.xls")).toBe(false);
    expect(importNeedsConversion("Nota.docx")).toBe(false);
    expect(importNeedsConversion("Notulen.odt")).toBe(false);
  });
});
