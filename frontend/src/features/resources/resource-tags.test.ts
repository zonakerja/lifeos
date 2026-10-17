import { describe, expect, it } from "vitest";
import {
  addFreeTag,
  collectFreeTags,
  freeTagCounts,
  renameResourceTag,
  mergeAttachmentTags,
  nextRemovedTags,
  normalizeTag,
  resourceTags,
  splitTags,
} from "./resource-tags";

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

describe("tag yang dihapus user", () => {
  it("tag lampiran tidak menambahkan ulang tag yang sengaja dihapus", () => {
    expect(mergeAttachmentTags(["SOP"], ["regulasi", "Kearsipan"], ["Regulasi"])).toEqual(["SOP", "Kearsipan"]);
    expect(mergeAttachmentTags(["SOP"], ["sop"])).toEqual(["SOP"]);
  });

  it("mencatat tag yang dihapus dan melepasnya bila ditambah lagi", () => {
    expect(nextRemovedTags([], ["SOP", "Regulasi"], ["SOP"])).toEqual(["Regulasi"]);
    expect(nextRemovedTags(["Regulasi"], ["SOP"], ["SOP", "regulasi"])).toEqual([]);
    expect(nextRemovedTags(["Lama"], ["SOP"], ["SOP"])).toEqual(["Lama"]);
  });
});

describe("pengelolaan tag", () => {
  const list = [{ tags: ["Global Resource", "SOP"] }, { tags: ["sop", "Regulasi"] }, { tags: ["Agenda"] }];

  it("menghitung pemakaian tag bebas", () => {
    expect(freeTagCounts(list)).toEqual([
      { tag: "Regulasi", count: 1 },
      { tag: "SOP", count: 2 },
    ]);
  });

  it("mengganti nama, menggabungkan, dan menghapus tag", () => {
    expect(renameResourceTag({ tags: ["Global Resource", "SOP"] }, "sop", "Prosedur")).toEqual({
      tags: ["Global Resource", "Prosedur"],
      removedTags: ["sop"],
    });
    expect(renameResourceTag({ tags: ["SOP", "Prosedur"] }, "SOP", "prosedur").tags).toEqual(["Prosedur"]);
    expect(renameResourceTag({ tags: ["SOP", "Regulasi"] }, "Regulasi", null)).toEqual({
      tags: ["SOP"],
      removedTags: ["Regulasi"],
    });
    const untouched = { tags: ["SOP"] };
    expect(renameResourceTag(untouched, "Regulasi", "X")).toBe(untouched);
  });
});
