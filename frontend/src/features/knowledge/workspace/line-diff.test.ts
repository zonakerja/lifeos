import { describe, expect, it } from "vitest";
import { diffStats, lineDiff } from "./line-diff";

describe("lineDiff", () => {
  it("baris ditambah, dihapus, diubah", () => {
    const diff = lineDiff("a\nb\nc", "a\nB\nc\nd")!;
    expect(diff).toEqual([
      { type: "same", text: "a" },
      { type: "add", text: "B" },
      { type: "del", text: "b" },
      { type: "same", text: "c" },
      { type: "add", text: "d" },
    ]);
    expect(diffStats(diff)).toEqual({ added: 2, removed: 1 });
  });

  it("baris sama yang jauh diringkas", () => {
    const before = Array.from({ length: 20 }, (_, i) => `baris ${i}`).join("\n");
    const after = before.replace("baris 10", "baris sepuluh");
    const diff = lineDiff(before, after, 1)!;
    expect(diff[0]).toEqual({ type: "skip", count: 9 });
    expect(diff.filter((l) => l.type === "add")).toEqual([{ type: "add", text: "baris sepuluh" }]);
    expect(diff.at(-1)).toEqual({ type: "skip", count: 8 });
  });

  it("isi sama & CRLF", () => {
    expect(diffStats(lineDiff("a\r\nb", "a\nb")!)).toEqual({ added: 0, removed: 0 });
  });
});
