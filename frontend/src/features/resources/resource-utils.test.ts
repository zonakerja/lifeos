import { describe, expect, it } from "vitest";
import type { AttachedResource, Resource } from "@/types/entities";
import { mergeIntoGlobalResources } from "./resource-utils";

const att = (over: Partial<AttachedResource>): AttachedResource => ({
  id: "a1",
  type: "file",
  name: "SOP.pdf",
  uploadId: "up1",
  addToGlobal: true,
  ...over,
});

describe("mergeIntoGlobalResources — tag bebas", () => {
  it("resource baru membawa tag konteks + tag bebas", () => {
    const [res] = mergeIntoGlobalResources([], [att({ tags: ["SOP", "Kearsipan"] })], "Agenda");
    expect(res.tags).toEqual(["Agenda", "SOP", "Kearsipan"]);
  });

  it("resource yang sudah ada mendapat tag baru tanpa duplikat", () => {
    const existing: Resource = { id: "r1", title: "SOP", type: "file", tags: ["Global Resource", "SOP"] };
    const [res] = mergeIntoGlobalResources(
      [existing],
      [att({ type: "existing", existingId: "r1", tags: ["sop", "Regulasi"] })],
      "Project Action",
    );
    expect(res.tags).toEqual(["Global Resource", "SOP", "Project Action", "Regulasi"]);
  });

  it("lampiran tanpa addToGlobal tidak menyentuh Resource Global", () => {
    expect(mergeIntoGlobalResources([], [att({ addToGlobal: false, tags: ["SOP"] })], "Agenda")).toEqual([]);
  });
});
