import { describe, expect, it } from "vitest";
import { movedVersionPath, OBSERVED_INTERVAL_MS, versionAction, versionsToPrune } from "./vault-history";

const now = new Date("2026-11-07T10:00:00Z");
const latest = (over: Partial<{ hash: string; reason: string; ago: number }> = {}) => ({
  id: "v1",
  hash: over.hash ?? "a",
  reason: over.reason ?? "observed",
  createdAt: new Date(now.getTime() - (over.ago ?? 60_000)),
});

describe("vault-history", () => {
  it("lewati isi sama, rapatkan versi terpantau, tambah selain itu", () => {
    expect(versionAction(latest(), { hash: "a", reason: "before_save", now })).toEqual({ kind: "mark", id: "v1" });
    expect(versionAction(latest({ reason: "before_task" }), { hash: "a", reason: "before_save", now })).toEqual({
      kind: "skip",
    });
    expect(versionAction(latest(), { hash: "a", reason: "observed", now })).toEqual({ kind: "skip" });
    expect(versionAction(latest(), { hash: "b", reason: "observed", now })).toEqual({ kind: "replace", id: "v1" });
    expect(versionAction(latest({ ago: OBSERVED_INTERVAL_MS + 1 }), { hash: "b", reason: "observed", now })).toEqual({
      kind: "create",
    });
    expect(versionAction(latest({ reason: "before_save" }), { hash: "b", reason: "observed", now })).toEqual({
      kind: "create",
    });
    expect(versionAction(latest(), { hash: "b", reason: "before_save", now })).toEqual({ kind: "create" });
    expect(versionAction(null, { hash: "b", reason: "observed", now })).toEqual({ kind: "create" });
  });

  it("pangkas & pindah path", () => {
    expect(versionsToPrune([{ id: "1" }, { id: "2" }, { id: "3" }], 2)).toEqual(["3"]);
    expect(movedVersionPath("A/B.md", "A/B.md", "C/B.md", false)).toBe("C/B.md");
    expect(movedVersionPath("A/X.md", "A/B.md", "C/B.md", false)).toBeNull();
    expect(movedVersionPath("A/sub/B.md", "A", "Z", true)).toBe("Z/sub/B.md");
    expect(movedVersionPath("AB/B.md", "A", "Z", true)).toBeNull();
  });
});
