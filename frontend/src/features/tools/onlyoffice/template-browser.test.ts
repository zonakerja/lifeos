import { describe, expect, it } from "vitest";
import { matchesTemplate } from "./template-browser";

describe("pencarian templat", () => {
  it("setiap kata harus ada di nama, tanpa peka huruf besar/kecil", () => {
    const template = { name: "Surat Undangan Rapat" };
    expect(matchesTemplate(template, "")).toBe(true);
    expect(matchesTemplate(template, "surat")).toBe(true);
    expect(matchesTemplate(template, "UNDANGAN surat")).toBe(true);
    expect(matchesTemplate(template, "surat tugas")).toBe(false);
  });
});
