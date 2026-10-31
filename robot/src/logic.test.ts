import { describe, expect, it } from "vitest";
import { allowedHosts, authorized, clampText, looksLikeLogin, parseInput, urlAllowed } from "./logic.js";

describe("otorisasi & alamat", () => {
  it("authorized: Bearer token persis", () => {
    expect(authorized("Bearer rahasia-panjang", "rahasia-panjang")).toBe(true);
    expect(authorized("Bearer salah", "rahasia-panjang")).toBe(false);
    expect(authorized(undefined, "rahasia-panjang")).toBe(false);
    expect(authorized("Bearer x", "")).toBe(false);
  });

  it("allowedHosts & urlAllowed: hanya host konektor (+ subdomain), https", () => {
    const hosts = allowedHosts("https://srikandi.arsip.go.id/app", ["https://sso.contoh.go.id/", " "]);
    expect(hosts).toEqual(["srikandi.arsip.go.id", "sso.contoh.go.id"]);
    expect(urlAllowed("https://srikandi.arsip.go.id/surat", hosts)).toBe(true);
    expect(urlAllowed("https://api.srikandi.arsip.go.id/x", hosts)).toBe(true);
    expect(urlAllowed("http://srikandi.arsip.go.id/", hosts)).toBe(false);
    expect(urlAllowed("https://evil.com/?srikandi.arsip.go.id", hosts)).toBe(false);
    expect(urlAllowed("https://srikandi.arsip.go.id.evil.com/", hosts)).toBe(false);
    expect(urlAllowed("javascript:alert(1)", hosts)).toBe(false);
    expect(urlAllowed("http://localhost:4000/x", ["localhost"])).toBe(true);
    expect(allowedHosts("bukan url")).toEqual([]);
  });
});

describe("deteksi login", () => {
  it("kolom password atau penanda alamat login", () => {
    expect(looksLikeLogin("https://a.go.id/dashboard", true)).toBe(true);
    expect(looksLikeLogin("https://a.go.id/auth/realms/x/login-actions", false)).toBe(true);
    expect(looksLikeLogin("https://a.go.id/dashboard", false)).toBe(false);
    expect(looksLikeLogin("https://a.go.id/masuk", false, ["/masuk"])).toBe(true);
  });
});

describe("masukan browser jarak jauh", () => {
  it("parseInput menerima event sah & menolak sisanya", () => {
    expect(parseInput({ type: "click", x: 10, y: 20 })).toEqual({ type: "click", x: 10, y: 20 });
    expect(parseInput({ type: "click", x: -1, y: 20 })).toBeNull();
    expect(parseInput({ type: "click", x: 99999, y: 20 })).toBeNull();
    expect(parseInput({ type: "type", text: "budi" })).toEqual({ type: "type", text: "budi" });
    expect(parseInput({ type: "type", text: "" })).toBeNull();
    expect(parseInput({ type: "key", key: "Enter" })).toEqual({ type: "key", key: "Enter" });
    expect(parseInput({ type: "key", key: "F12" })).toBeNull();
    expect(parseInput({ type: "key", key: "Control+Shift+I" })).toBeNull();
    expect(parseInput({ type: "scroll", x: 1, y: 1, dy: 300 })).toEqual({ type: "scroll", x: 1, y: 1, dy: 300 });
    expect(parseInput({ type: "goto", url: "https://a" })).toEqual({ type: "goto", url: "https://a" });
    expect(parseInput({ type: "hapus" })).toBeNull();
    expect(parseInput(null)).toBeNull();
  });

  it("clampText", () => {
    expect(clampText("abcdef", 3)).toBe("abc\n… (dipotong)");
    expect(clampText("ab", 3)).toBe("ab");
  });
});
