import { describe, expect, it } from "vitest";
import { AiCrypto } from "../ai/ai-crypto";
import {
  isRobotSystem,
  normalizeHosts,
  normalizeSystemUrl,
  robotSessionKey,
  SYSTEM_INFO,
  urlInConnector,
} from "./robot-logic";

describe("konektor robot", () => {
  it("katalog sistem & nama sistem", () => {
    expect(isRobotSystem("srikandi")).toBe(true);
    expect(isRobotSystem("siman")).toBe(false);
    expect(SYSTEM_INFO.srikandi.defaultUrl).toMatch(/^https:\/\//);
    expect(SYSTEM_INFO.srikandi.limits).toMatch(/tidak pernah menandatangani/);
  });

  it("kunci sesi diturunkan & berbeda dari kunci AI, dapat dipakai AES-GCM", () => {
    const aiKey = "a".repeat(64);
    const key = robotSessionKey(aiKey);
    expect(key).toHaveLength(64);
    expect(key).not.toBe(aiKey);
    const crypto = new AiCrypto(key);
    expect(crypto.decrypt(crypto.encrypt('{"cookies":[]}'))).toBe('{"cookies":[]}');
    expect(() => new AiCrypto(aiKey).decrypt(crypto.encrypt("x"))).toThrow();
  });

  it("normalizeSystemUrl: https saja, tanpa kredensial di URL", () => {
    expect(normalizeSystemUrl(" https://srikandi.arsip.go.id/ ")).toBe("https://srikandi.arsip.go.id");
    expect(normalizeSystemUrl("https://ekin.contoh.go.id/app#x")).toBe("https://ekin.contoh.go.id/app");
    expect(normalizeSystemUrl("http://ekin.contoh.go.id")).toBeNull();
    expect(normalizeSystemUrl("http://localhost:8080")).toBe("http://localhost:8080");
    expect(normalizeSystemUrl("https://user:pw@contoh.go.id")).toBeNull();
    expect(normalizeSystemUrl("bukan url")).toBeNull();
  });

  it("normalizeHosts & urlInConnector", () => {
    expect(normalizeHosts(["https://SSO.Contoh.go.id/login", "sso.contoh.go.id", "x", ""])).toEqual([
      "sso.contoh.go.id",
    ]);
    expect(urlInConnector("https://srikandi.arsip.go.id/naskah", "https://srikandi.arsip.go.id", [])).toBe(true);
    expect(urlInConnector("https://sso.contoh.go.id/a", "https://srikandi.arsip.go.id", ["sso.contoh.go.id"])).toBe(
      true,
    );
    expect(urlInConnector("https://google.com", "https://srikandi.arsip.go.id", [])).toBe(false);
    expect(urlInConnector("https://srikandi.arsip.go.id.evil.com", "https://srikandi.arsip.go.id", [])).toBe(false);
  });
});
