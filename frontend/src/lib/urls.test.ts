import { describe, expect, it } from "vitest";
import { toExternalHref } from "./urls";

describe("toExternalHref", () => {
  it("menambahkan https pada link tanpa skema", () => {
    expect(toExternalHref("zoom.us/j/123")).toBe("https://zoom.us/j/123");
    expect(toExternalHref(" meet.local:8080/ruang ")).toBe("https://meet.local:8080/ruang");
  });

  it("mempertahankan http/https dan menolak skema lain", () => {
    expect(toExternalHref("http://contoh.com/a")).toBe("http://contoh.com/a");
    expect(toExternalHref("https://meet.google.com/abc")).toBe("https://meet.google.com/abc");
    expect(toExternalHref("javascript:alert(1)")).toBeNull();
    expect(toExternalHref("mailto:a@b.c")).toBeNull();
    expect(toExternalHref("")).toBeNull();
    expect(toExternalHref("Ruang rapat lt. 3")).toBeNull();
  });
});
