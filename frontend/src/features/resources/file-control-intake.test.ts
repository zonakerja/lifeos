import { describe, expect, it } from "vitest";
import { archiveLockReason, fileControlStatus, isFiledArchive, isInFileControl } from "./file-control-intake";

describe("archiveLockReason", () => {
  it("mengunci arsip yang sudah diberkaskan", () => {
    expect(archiveLockReason({ archivalStatus: "physical", archiveRegId: "ARC-2026-ABC123" })).toContain(
      "ARC-2026-ABC123",
    );
    expect(archiveLockReason({ archivalStatus: "digital" })).toContain("digital");
  });
  it("tidak mengunci arsip Gantung / bukan arsip", () => {
    expect(archiveLockReason({ archivalStatus: "pending" })).toBeNull();
    expect(archiveLockReason({})).toBeNull();
    expect(archiveLockReason(null)).toBeNull();
  });
});

describe("isInFileControl", () => {
  it("hanya berkas yang sudah dimasukkan", () => {
    expect(isInFileControl({ type: "file", archivalStatus: "pending" })).toBe(true);
    expect(isInFileControl({ type: "file", archivalStatus: "digital" })).toBe(true);
    expect(isInFileControl({ type: "file" })).toBe(false);
    expect(isInFileControl({ type: "file", archivalStatus: "none" })).toBe(false);
    expect(isInFileControl({ type: "link", archivalStatus: "pending" })).toBe(false);
  });
});

describe("fileControlStatus", () => {
  it("centang memasukkan ke Gantung", () => {
    expect(fileControlStatus(undefined, true)).toBe("pending");
    expect(fileControlStatus("none", true)).toBe("pending");
  });
  it("lepas centang mengeluarkan atau tetap kosong", () => {
    expect(fileControlStatus("pending", false)).toBe("none");
    expect(fileControlStatus(undefined, false)).toBeUndefined();
  });
  it("arsip yang sudah diberkaskan tidak berubah", () => {
    expect(fileControlStatus("physical", false)).toBe("physical");
    expect(fileControlStatus("digital", true)).toBe("digital");
    expect(isFiledArchive("physical")).toBe(true);
    expect(isFiledArchive("pending")).toBe(false);
  });
});
