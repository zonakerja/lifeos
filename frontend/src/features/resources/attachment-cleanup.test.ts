import { describe, expect, it } from "vitest";
import type { AttachedResource } from "@/types/entities";
import { describeCleanup, ownedFiles, planAttachmentCleanup, referencedUploadIds } from "./attachment-cleanup";

const file = (id: string, uploadId: string, extra: Partial<AttachedResource> = {}): AttachedResource => ({
  id,
  type: "file",
  name: id,
  uploadId,
  ...extra,
});

describe("pembersihan berkas lampiran", () => {
  const undangan = file("a1", "up-undangan");
  const notulen = file("a2", "up-notulen");
  const dariGlobal = file("a3", "up-global", { type: "existing", existingId: "res-1" });
  const link: AttachedResource = { id: "a4", type: "link", name: "Meet", url: "https://meet.google.com/x" };

  it("hanya berkas milik item (bukan rujukan Resource Global / link), unik per uploadId", () => {
    expect(ownedFiles([undangan, notulen, dariGlobal, link, file("a5", "up-undangan")]).map((f) => f.id)).toEqual([
      "a1",
      "a2",
    ]);
  });

  it("uploadId yang masih dirujuk di luar item yang dihapus", () => {
    const referenced = referencedUploadIds(
      [{ uploadId: "up-global" }, {}],
      [[undangan, notulen], [file("b1", "up-notulen")], undefined],
      ["a1", "a2"],
    );
    expect([...referenced].sort()).toEqual(["up-global", "up-notulen"]);
  });

  it("rencana: dipertahankan → Resource Global, dipakai di tempat lain → dibiarkan, sisanya dihapus", () => {
    const plan = planAttachmentCleanup([undangan, notulen, file("a6", "up-foto")], ["a6"], new Set(["up-notulen"]));
    expect(plan.remove).toEqual(["up-undangan"]);
    expect(plan.keep.map((f) => f.id)).toEqual(["a6"]);
    expect(plan.shared.map((f) => f.id)).toEqual(["a2"]);
    expect(describeCleanup(plan)).toBe(
      "1 berkas dihapus, 1 disimpan ke Resource Global, 1 tetap (dipakai di tempat lain)",
    );
    expect(describeCleanup(planAttachmentCleanup([], [], new Set()))).toBeNull();
  });
});
