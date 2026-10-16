import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.validation";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/lifeos",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  S3_ACCESS_KEY_ID: "lifeos",
  S3_SECRET_ACCESS_KEY: "lifeos-secret",
  AI_ENCRYPTION_KEY: "c".repeat(64),
};

describe("validasi env ONLYOFFICE", () => {
  it("string kosong dari compose produksi = nonaktif (bukan error)", () => {
    const env = validateEnv({
      ...base,
      ONLYOFFICE_URL: "",
      ONLYOFFICE_INTERNAL_URL: "",
      ONLYOFFICE_JWT_SECRET: "",
      ONLYOFFICE_FONTS_DIR: "",
    });
    expect(env.ONLYOFFICE_URL).toBeUndefined();
    expect(env.ONLYOFFICE_JWT_SECRET).toBeUndefined();
    expect(env.ONLYOFFICE_FONTS_DIR).toBeUndefined();
  });

  it("URL diisi tanpa secret tetap ditolak; URL tidak valid ditolak", () => {
    expect(() =>
      validateEnv({ ...base, ONLYOFFICE_URL: "https://lifeos.id/office", ONLYOFFICE_JWT_SECRET: "" }),
    ).toThrow(/ONLYOFFICE_JWT_SECRET/);
    expect(() => validateEnv({ ...base, ONLYOFFICE_URL: "bukan-url", ONLYOFFICE_JWT_SECRET: "x".repeat(32) })).toThrow(
      /ONLYOFFICE_URL/,
    );
  });

  it("konfigurasi lengkap diterima", () => {
    const env = validateEnv({
      ...base,
      ONLYOFFICE_URL: "https://lifeos.id/office",
      ONLYOFFICE_INTERNAL_URL: "http://onlyoffice",
      ONLYOFFICE_JWT_SECRET: "x".repeat(32),
      ONLYOFFICE_FONTS_DIR: "/app/office-fonts",
    });
    expect(env.ONLYOFFICE_INTERNAL_URL).toBe("http://onlyoffice");
  });
});
