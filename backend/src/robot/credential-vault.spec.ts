import { describe, expect, it } from "vitest";
import { CredentialVault, maskUsername } from "./credential-vault";

const KEY = "0f".repeat(32);

describe("brankas kredensial", () => {
  it("enkripsi/dekripsi dengan AAD; acak setiap kali", () => {
    const vault = new CredentialVault(KEY);
    const aad = CredentialVault.aad("u1", "srikandi", "password");
    const a = vault.encrypt("rahasia", aad);
    const b = vault.encrypt("rahasia", aad);
    expect(a).not.toBe(b);
    expect(a.startsWith("c1.")).toBe(true);
    expect(a).not.toContain("rahasia");
    expect(vault.decrypt(a, aad)).toBe("rahasia");
  });

  it("ciphertext tidak bisa dipindah ke user / sistem / kolom lain atau dipakai dengan kunci lain", () => {
    const vault = new CredentialVault(KEY);
    const enc = vault.encrypt("rahasia", CredentialVault.aad("u1", "srikandi", "password"));
    expect(() => vault.decrypt(enc, CredentialVault.aad("u2", "srikandi", "password"))).toThrow();
    expect(() => vault.decrypt(enc, CredentialVault.aad("u1", "ekinerja", "password"))).toThrow();
    expect(() => vault.decrypt(enc, CredentialVault.aad("u1", "srikandi", "username"))).toThrow();
    expect(() =>
      new CredentialVault("1a".repeat(32)).decrypt(enc, CredentialVault.aad("u1", "srikandi", "password")),
    ).toThrow();
    const [v, iv, tag, ct] = enc.split(".");
    const tampered = [v, iv, tag, `${ct.slice(0, -2)}AA`].join(".");
    expect(() => vault.decrypt(tampered, CredentialVault.aad("u1", "srikandi", "password"))).toThrow();
  });

  it("kunci wajib 64 hex", () => {
    expect(() => new CredentialVault("pendek")).toThrow();
  });

  it("maskUsername", () => {
    expect(maskUsername("Budi.KEU")).toBe("Bu•••EU");
    expect(maskUsername("abc")).toBe("a•••");
  });
});
