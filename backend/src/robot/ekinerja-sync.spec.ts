import { describe, expect, it } from "vitest";
import { cleanRhk, planTargetSync, skpClientId, targetClientId, validSkp } from "./ekinerja-sync";

describe("sinkron SKP & RHK e-Kinerja", () => {
  it("ID stabil: sama untuk RHK yang sama, beda antar SKP/bagian", () => {
    expect(skpClientId("421351")).toBe("ekin-421351");
    const a = targetClientId("421351", "UTAMA", "Draft Laporan");
    expect(a).toBe(targetClientId("421351", "UTAMA", "Draft Laporan"));
    expect(a).not.toBe(targetClientId("421351", "TAMBAHAN", "Draft Laporan"));
    expect(a).not.toBe(targetClientId("297040", "UTAMA", "Draft Laporan"));
    expect(a).toMatch(/^ekin-421351-[0-9a-f]{12}$/);
  });

  it("RHK yang hilang: dihapus bila tidak dipakai, ditandai bila dipakai rencana aksi", () => {
    expect(planTargetSync(["a", "b", "c"], ["a"], new Set(["c"]))).toEqual({ remove: ["b"], stale: ["c"] });
  });

  it("validasi hasil robot", () => {
    const ok = { externalId: "421351", startDate: "2025-05-01", endDate: "2025-12-31", rhk: null };
    expect(validSkp(ok)).toBe(true);
    expect(validSkp({ ...ok, externalId: "../x" })).toBe(false);
    expect(validSkp({ ...ok, startDate: "01-May-2025" })).toBe(false);
    expect(cleanRhk([{ name: " ", section: "", leader: "", indicators: [] }])).toEqual([]);
    expect(cleanRhk([{ name: "A", section: "", leader: "L", indicators: [] }])[0].section).toBe("UTAMA");
  });
});
