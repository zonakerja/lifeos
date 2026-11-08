import { describe, expect, it } from "vitest";
import {
  addNode,
  autoSides,
  canvasBounds,
  canvasColor,
  type CanvasData,
  connect,
  edgeGeometry,
  fitView,
  moveNode,
  newCanvasId,
  removeNode,
  resizeNode,
  toCanvasData,
} from "./canvas-logic";

const node = (id: string, x: number, y: number, over: Record<string, unknown> = {}) => ({
  id,
  type: "text" as const,
  text: id,
  x,
  y,
  width: 200,
  height: 100,
  ...over,
});
const base = (): CanvasData => ({
  nodes: [node("a", 0, 0), node("b", 400, 0), node("g", -20, -20, { type: "group", width: 260, height: 160 })],
  edges: [{ id: "e1", fromNode: "a", toNode: "b" }],
  extra: true,
});

describe("geometri", () => {
  it("sisi otomatis & lintasan", () => {
    expect(autoSides(node("a", 0, 0), node("b", 400, 0))).toEqual(["right", "left"]);
    expect(autoSides(node("a", 0, 0), node("b", 0, 400))).toEqual(["bottom", "top"]);
    const geo = edgeGeometry({ id: "e", fromNode: "a", toNode: "b" }, node("a", 0, 0), node("b", 400, 0));
    expect(geo.path.startsWith("M 200 50 C")).toBe(true);
    expect(geo.mid).toEqual({ x: 300, y: 50 });
  });

  it("batas & pas layar", () => {
    expect(canvasBounds(base().nodes)).toEqual({ x: -20, y: -20, width: 620, height: 160 });
    const view = fitView(base().nodes, { width: 700, height: 500 });
    expect(view.zoom).toBeCloseTo(1);
    expect(canvasBounds([])).toBeNull();
  });

  it("warna preset & heksa", () => {
    expect(canvasColor("1")).toBe("var(--destructive)");
    expect(canvasColor("#ff0000")).toBe("#ff0000");
    expect(canvasColor("javascript:x")).toBeNull();
    expect(canvasColor()).toBeNull();
  });
});

describe("penyuntingan", () => {
  it("tambah, pindah (ikut grup), ubah ukuran, hapus", () => {
    const added = addNode(base(), { type: "text", text: "baru", x: 13, y: 27, width: 200, height: 100 });
    expect(added.data.nodes.at(-1)).toMatchObject({ id: added.id, x: 10, y: 30 });
    expect(added.data.extra).toBe(true);
    const moved = moveNode(base(), "g", 0, 0);
    expect(moved.nodes.find((n) => n.id === "a")).toMatchObject({ x: 20, y: 20 });
    expect(moved.nodes.find((n) => n.id === "b")).toMatchObject({ x: 400, y: 0 });
    expect(resizeNode(base(), "a", 50, 10).nodes[0]).toMatchObject({ width: 120, height: 60 });
    const removed = removeNode(base(), "a");
    expect(removed.nodes.map((n) => n.id)).toEqual(["b", "g"]);
    expect(removed.edges).toEqual([]);
  });

  it("hubungkan tanpa ganda / diri sendiri", () => {
    expect(connect(base(), "a", "b")).toBeNull();
    expect(connect(base(), "a", "a")).toBeNull();
    expect(connect(base(), "b", "a")?.edges).toHaveLength(2);
    expect(connect(base(), "a", "zz")).toBeNull();
  });

  it("id unik & data longgar", () => {
    let n = 0;
    const seq = [...Array(16).fill(0), ...Array(16).fill(0.5)];
    expect(newCanvasId(["0000000000000000"], () => seq[n++])).toBe("8888888888888888");
    const data = toCanvasData({
      nodes: [node("a", 0, 0), { id: "x" }],
      edges: [{ id: "e", fromNode: "a", toNode: "x" }],
    });
    expect(data.nodes.map((nd) => nd.id)).toEqual(["a"]);
    expect(data.edges).toEqual([]);
  });
});
