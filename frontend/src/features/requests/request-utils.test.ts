import { describe, expect, it } from "vitest";
import type { RequestSummary } from "@/types/api";
import {
  autoDecisionState,
  defaultDocumentName,
  defaultPolicyInput,
  filterRequests,
  mergeSuggestedValues,
  parseGroupCodes,
  policyAgreement,
  policyToInput,
  tagLabel,
} from "./request-utils";

const item = (id: string, patch: Partial<RequestSummary>): RequestSummary => ({
  id,
  kind: "psp",
  title: id,
  applicant: null,
  groupCode: null,
  letterNumber: null,
  letterDate: null,
  subject: null,
  status: "baru",
  source: "manual",
  attachments: [],
  documents: [],
  autoDecision: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...patch,
});

describe("filterRequests", () => {
  const items = [
    item("a", { status: "baru", updatedAt: "2026-10-03T00:00:00Z", applicant: "KSOP Tanjung Perak" }),
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

describe("Kebijakan Otomatis", () => {
  const base = {
    policyId: "p",
    policyName: "PSP",
    mode: "auto" as const,
    outcome: "approve" as const,
    applied: true,
    reasons: [],
    score: 100,
    decidedAt: "2026-11-06T00:00:00Z",
  };

  it("autoDecisionState membedakan shadow, tunda, terkirim, batal, gagal", () => {
    expect(autoDecisionState({ ...base, applied: false })).toBe("shadow");
    expect(autoDecisionState({ ...base, applied: false, outcome: "review" })).toBe("review");
    expect(autoDecisionState({ ...base, sendAt: "x" })).toBe("waiting");
    expect(autoDecisionState({ ...base, sendAt: "x", sentAt: "y" })).toBe("sent");
    expect(autoDecisionState({ ...base, sendAt: "x", cancelledAt: "y" })).toBe("cancelled");
    expect(autoDecisionState({ ...base, error: "gagal" })).toBe("failed");
    expect(autoDecisionState(base)).toBe("approved");
  });

  it("parseGroupCodes huruf besar, unik, pemisah koma/spasi", () => {
    expect(parseGroupCodes(" satker-a, SATKER-A ; satker-b ")).toEqual(["SATKER-A", "SATKER-B"]);
    expect(parseGroupCodes("")).toEqual([]);
  });

  it("policyAgreement null tanpa pembanding, persen dibulatkan", () => {
    expect(policyAgreement({ decisions: 3, applied: 0, judged: 0, agree: 0 })).toBeNull();
    expect(policyAgreement({ decisions: 3, applied: 0, judged: 3, agree: 2 })).toEqual({
      agree: 2,
      judged: 3,
      percent: 67,
    });
  });

  it("policyToInput membuang id & statistik", () => {
    const input = policyToInput({
      ...defaultPolicyInput(),
      id: "x",
      createdAt: "a",
      updatedAt: "b",
      stats: { decisions: 0, applied: 0, judged: 0, agree: 0 },
    } as never);
    expect(Object.keys(input)).not.toContain("id");
    expect(Object.keys(input)).not.toContain("stats");
    expect(input.threshold).toBe(75);
  });
});
