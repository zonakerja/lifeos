import { describe, expect, it } from "vitest";
import { isMine, itemAccess, sharedItemPath } from "./sharing";

const share = (permission: "view" | "comment" | "edit") => ({
  share: { ownerId: "u1", ownerName: "Budi", permission, root: true },
});

describe("itemAccess", () => {
  it("item milik sendiri: semua boleh", () => {
    expect(itemAccess({})).toMatchObject({ shared: false, canEdit: true, canComment: true, isOwner: true });
    expect(itemAccess(null).isOwner).toBe(true);
  });

  it("izin berbagi menentukan ubah & komentar; bukan pemilik", () => {
    expect(itemAccess(share("view"))).toMatchObject({
      shared: true,
      canEdit: false,
      canComment: false,
      isOwner: false,
    });
    expect(itemAccess(share("comment"))).toMatchObject({ canEdit: false, canComment: true });
    expect(itemAccess(share("edit"))).toMatchObject({ canEdit: true, canComment: true, ownerName: "Budi" });
  });

  it("isMine", () => {
    expect(isMine({})).toBe(true);
    expect(isMine(share("edit"))).toBe(false);
  });
});

describe("sharedItemPath", () => {
  it("memetakan jenis item ke halaman", () => {
    expect(sharedItemPath("para_project", "p1")).toBe("/productivity/projects?project=p1");
    expect(sharedItemPath("para_area", "a1")).toBe("/productivity/areas?area=a1");
    expect(sharedItemPath("free_note", "1")).toBe("/notes/free?note=1");
    expect(sharedItemPath("list", "9")).toBe("/notes/lists?list=9");
    expect(sharedItemPath("schedule", "s1")).toBe("/planner/schedule?agenda=s1");
    expect(sharedItemPath("todo", "x")).toBeNull();
  });
});
