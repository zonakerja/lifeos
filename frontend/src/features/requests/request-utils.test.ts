import { describe, expect, it } from "vitest";
import type { RequestSummary } from "@/types/api";
import { defaultDocumentName, filterRequests, mergeSuggestedValues, tagLabel } from "./request-utils";

const item = (id: string, patch: Partial<RequestSummary>): RequestSummary => ({
  id,
  kind: "psp",
  title: id,
  satker: null,
  letterNumber: null,
  letterDate: null,
  subject: null,
  status: "baru",
  source: "manual",
  attachments: [],
  documents: [],
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...patch,
});

describe("filterRequests", () => {
  const items = [
    item("a", { status: "baru", updatedAt: "2026-10-03T00:00:00Z", satker: "KSOP Tanjung Perak" }),
    item("b", { status: "menunggu_verifikasi", updatedAt: "2026-10-01T00:00:00Z", kind: "penghapusan" }),
    item("c", { status: "disetujui", updatedAt: "2026-10-05T00:00:00Z" }),
    item("d", { status: "diproses", updatedAt: "2026-10-04T00:00:00Z" }),
  ];

  it("antrian: menunggu verifikasi dulu, lalu baru, lalu diproses", () => {
    expect(filterRequests(items, { tab: "queue", kind: "all", query: "" }).map((r) => r.id)).toEqual(["b", "a", "d"]);
    expect(filterRequests(items, { tab: "done", kind: "all", query: "" }).map((r) => r.id)).toEqual(["c"]);
  });

  it("menyaring jenis & kata kunci per kata tanpa aksen", () => {
    expect(filterRequests(items, { tab: "queue", kind: "penghapusan", query: "" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterRequests(items, { tab: "queue", kind: "all", query: "perak ksop" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterRequests(items, { tab: "queue", kind: "all", query: "penghapusan" }).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("isi templat", () => {
  it("usulan AI hanya mengisi nilai yang masih kosong", () => {
    expect(
      mergeSuggestedValues({ hal: "Diketik user", tujuan: " " }, { hal: "AI", tujuan: "Kepala", lain: "x" }),
    ).toEqual({ hal: "Diketik user", tujuan: "Kepala", lain: "x" });
  });

  it("label penanda & nama dokumen", () => {
    expect(tagLabel("jabatan_tujuan")).toBe("Jabatan tujuan");
    expect(defaultDocumentName("Nota Dinas", "PSP: laptop/printer")).toBe("Nota Dinas - PSP  laptop printer");
  });
});
