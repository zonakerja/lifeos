import { describe, expect, it } from "vitest";
import {
  ABANDONED,
  STALE_MS,
  abandonOwner,
  addPending,
  removePending,
  sweepable,
  touchOwner,
  type PendingUpload,
} from "./pending-uploads";

const now = 1_000_000_000;

describe("pending uploads", () => {
  it("mencatat, memperbarui, dan melepas catatan", () => {
    let entries: PendingUpload[] = [];
    entries = addPending(entries, "u1", "pageA", now);
    entries = addPending(entries, "u1", "pageA", now + 5); // tidak dobel
    entries = addPending(entries, "u2", "pageB", now);
    expect(entries).toEqual([
      { id: "u1", owner: "pageA", at: now + 5 },
      { id: "u2", owner: "pageB", at: now },
    ]);
    expect(touchOwner(entries, "pageB", now + 60)[1].at).toBe(now + 60);
    expect(removePending(entries, "u1").map((e) => e.id)).toEqual(["u2"]);
  });

  it("halaman yang ditutup menandai catatannya ditinggalkan", () => {
    const entries = abandonOwner(
      [
        { id: "u1", owner: "pageA", at: now },
        { id: "u2", owner: "pageB", at: now },
      ],
      "pageA",
    );
    expect(entries.map((e) => e.at)).toEqual([ABANDONED, now]);
  });

  it("hanya menyapu catatan halaman lain yang ditinggalkan atau tidak berdetak lama", () => {
    const entries: PendingUpload[] = [
      { id: "ditinggal", owner: "pageA", at: ABANDONED },
      { id: "aktif", owner: "pageB", at: now - 60_000 },
      { id: "mati", owner: "pageC", at: now - STALE_MS - 1 },
      { id: "milikSendiriDitinggal", owner: "pageMe", at: ABANDONED },
    ];
    expect(sweepable(entries, "pageMe", now).map((e) => e.id)).toEqual(["ditinggal", "mati"]);
  });
});
