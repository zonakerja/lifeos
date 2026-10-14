import { describe, expect, it } from "vitest";
import { addFreeTag, collectFreeTags, normalizeTag, resourceTags, splitTags } from "./resource-tags";

describe("resource tags", () => {
  it("membaca tags atau sourceTag lama", () => {
    expect(resourceTags({ tags: ["Agenda", "SOP"] })).toEqual(["Agenda", "SOP"]);
    expect(resourceTags({ sourceTag: "Project" })).toEqual(["Project"]);
    expect(resourceTags({})).toEqual([]);
  });

  it("memisahkan tag konteks dan tag bebas", () => {
    expect(splitTags(["Global Resource", "SOP", "Agenda", "Regulasi"])).toEqual({
      context: ["Global Resource", "Agenda"],
      free: ["SOP", "Regulasi"],
    });
  });

  it("merapikan masukan", () => {
    expect(normalizeTag("  Peraturan   Daerah ")).toBe("Peraturan Daerah");
    expect(normalizeTag("   ")).toBeNull();
    expect(normalizeTag("x".repeat(60))).toHaveLength(40);
  });

  it("menambah tanpa duplikat dan mengikuti penulisan yang sudah ada", () => {
    expect(addFreeTag(["SOP"], "sop")).toEqual(["SOP"]);
    expect(addFreeTag([], "regulasi", ["Regulasi"])).toEqual(["Regulasi"]);
    expect(addFreeTag([], "Agenda")).toEqual([]); // tag konteks tidak bisa ditambah manual
    expect(addFreeTag(["SOP"], " Keuangan ")).toEqual(["SOP", "Keuangan"]);
  });

  it("mengumpulkan saran tag bebas unik", () => {
    expect(
      collectFreeTags([
        { tags: ["Global Resource", "SOP"] },
        { tags: ["sop", "Regulasi", "Agenda"] },
        { sourceTag: "Keuangan" },
      ]),
    ).toEqual(["Keuangan", "Regulasi", "SOP"]);
  });
});
