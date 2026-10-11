import { describe, expect, it } from "vitest";
import { completionChangePatch, completionPatch } from "./completion";

describe("completionPatch", () => {
  it("mencatat dan menghapus waktu selesai", () => {
    expect(completionPatch(true, new Date("2026-10-11T03:00:00Z"))).toEqual({
      completed: true,
      completedAt: "2026-10-11T03:00:00.000Z",
    });
    expect(completionPatch(false)).toEqual({ completed: false, completedAt: undefined });
  });

  it("hanya berubah bila status selesai berubah", () => {
    const now = new Date("2026-10-11T03:00:00Z");
    expect(completionChangePatch({ completed: true }, true, now)).toEqual({});
    expect(completionChangePatch({}, false, now)).toEqual({});
    expect(completionChangePatch({}, true, now)).toEqual({ completed: true, completedAt: "2026-10-11T03:00:00.000Z" });
    expect(completionChangePatch({ completed: true }, false, now)).toEqual({
      completed: false,
      completedAt: undefined,
    });
  });
});
