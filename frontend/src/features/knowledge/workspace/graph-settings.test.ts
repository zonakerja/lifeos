import { describe, expect, it } from "vitest";
import { animationOrder, DEFAULT_GRAPH_SETTINGS, forceParams, labelAlpha, parseGraphSettings } from "./graph-settings";

describe("graph-settings", () => {
  it("parseGraphSettings: bawaan untuk nilai kosong, angka dijepit, kunci asing dibuang", () => {
    expect(parseGraphSettings(null)).toEqual(DEFAULT_GRAPH_SETTINGS);
    const parsed = parseGraphSettings({ repelForce: 999, arrows: true, linkDistance: "x", foo: 1 });
    expect(parsed.repelForce).toBe(20);
    expect(parsed.arrows).toBe(true);
    expect(parsed.linkDistance).toBe(DEFAULT_GRAPH_SETTINGS.linkDistance);
    expect("foo" in parsed).toBe(false);
  });

  it("forceParams & labelAlpha", () => {
    expect(forceParams({ centerForce: 0.5, repelForce: 10, linkForce: 0.6 })).toEqual({
      charge: -60,
      center: 0.05,
      link: 0.6,
    });
    expect(labelAlpha(1, 0)).toBe(1);
    expect(labelAlpha(1, 1.4)).toBe(0);
    expect(labelAlpha(2.1, 1.4)).toBe(1);
    expect(labelAlpha(1.75, 1.4)).toBeCloseTo(0.5);
  });

  it("animationOrder: tertua dulu, seri = path", () => {
    expect(
      animationOrder([
        { id: "b", path: "b.md", createdAt: "2026-02-01" },
        { id: "a", path: "a.md", createdAt: "2026-02-01" },
        { id: "c", path: "c.md", createdAt: "2026-01-01" },
      ]),
    ).toEqual(["c", "a", "b"]);
  });
});
