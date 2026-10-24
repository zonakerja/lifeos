import { describe, expect, it } from "vitest";
import {
  bearerToken,
  daysBetween,
  expiryFrom,
  generateToken,
  hashToken,
  isExpired,
  isYmd,
  normalizeScopes,
  shouldTouch,
  summarizeArgs,
  todayYmd,
  tokenPrefix,
  ymdToDateString,
} from "./api-token-logic";

describe("token", () => {
  it("bentuk token, hash, prefix, dan pembacaan header Bearer", () => {
    const token = generateToken();
    expect(token.startsWith("lifeos_pat_")).toBe(true);
    expect(generateToken()).not.toBe(token);
    expect(hashToken(token)).toHaveLength(64);
    expect(tokenPrefix(token)).toBe(token.slice(0, 15));
    expect(bearerToken(`Bearer ${token}`)).toBe(token);
    expect(bearerToken(`bearer   ${token}`)).toBe(token);
    expect(bearerToken("Bearer eyJhbGciOi.jwt.token")).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });

  it("cakupan dinormalisasi, masa berlaku, sentuhan terakhir dipakai", () => {
    expect(normalizeScopes(["ai:chat", "admin:all", "knowledge:read", "ai:chat"])).toEqual([
      "knowledge:read",
      "ai:chat",
    ]);
    expect(normalizeScopes("x")).toEqual([]);
    const now = new Date("2026-10-24T00:00:00Z");
    expect(expiryFrom(30, now)?.toISOString()).toBe("2026-11-23T00:00:00.000Z");
    expect(expiryFrom(null, now)).toBeNull();
    expect(isExpired(new Date("2026-10-23T00:00:00Z"), now)).toBe(true);
    expect(isExpired(null, now)).toBe(false);
    expect(shouldTouch(null, now)).toBe(true);
    expect(shouldTouch(new Date(now.getTime() - 60_000), now)).toBe(false);
  });
});

describe("log & tanggal", () => {
  it("ringkasan argumen memotong teks panjang", () => {
    const summary = summarizeArgs({ query: "a".repeat(300), nested: { deep: { deeper: 1 } } }) as Record<
      string,
      unknown
    >;
    expect((summary.query as string).length).toBe(201);
    expect(summary.nested).toEqual({ deep: "…" });
  });

  it("tanggal hari ini WIB, format to-do, validasi YMD", () => {
    // 2026-10-23 20:00 UTC = 24 Okt 03:00 WIB
    expect(todayYmd(new Date("2026-10-23T20:00:00Z"))).toBe("2026-10-24");
    expect(ymdToDateString("2026-10-24")).toBe("Sat Oct 24 2026");
    expect(isYmd("2026-10-24")).toBe(true);
    expect(isYmd("24-10-2026")).toBe(false);
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
  });
});
