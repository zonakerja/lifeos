import { describe, expect, it } from "vitest";
import { AiCrypto, keyHint } from "./ai-crypto";
import { AI_PROVIDERS, attachmentKind } from "./ai-providers";
import { kindFromStatus } from "./providers/ai-client";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

describe("AiCrypto", () => {
  it("mengenkripsi lalu mendekripsi kembali ke nilai semula", () => {
    const crypto = new AiCrypto(KEY_A);
    const secret = "AIzaSy-contoh-key-123456";
    const encrypted = crypto.encrypt(secret);
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(encrypted).not.toContain(secret);
    expect(crypto.decrypt(encrypted)).toBe(secret);
  });

  it("menghasilkan ciphertext berbeda untuk nilai yang sama (IV acak)", () => {
    const crypto = new AiCrypto(KEY_A);
    expect(crypto.encrypt("sama")).not.toBe(crypto.encrypt("sama"));
  });

  it("menolak kunci yang salah dan data yang diubah", () => {
    const encrypted = new AiCrypto(KEY_A).encrypt("rahasia");
    expect(() => new AiCrypto(KEY_B).decrypt(encrypted)).toThrow();
    const [v, iv, tag, ct] = encrypted.split(".");
    const tampered = [v, iv, tag, (ct[0] === "A" ? "B" : "A") + ct.slice(1)].join(".");
    expect(() => new AiCrypto(KEY_A).decrypt(tampered)).toThrow();
    expect(() => new AiCrypto(KEY_A).decrypt("plaintext-lama")).toThrow();
  });

  it("menolak kunci yang bukan 32 byte", () => {
    expect(() => new AiCrypto("abcd")).toThrow();
  });

  it("hint hanya 4 karakter terakhir, kosong untuk key pendek", () => {
    expect(keyHint("sk-1234567890abcd")).toBe("abcd");
    expect(keyHint("pendek")).toBe("");
  });
});

describe("attachmentKind", () => {
  it.each([
    ["image/png", "image"],
    ["image/jpeg", "image"],
    ["application/pdf", "pdf"],
    ["audio/webm;codecs=opus", "audio"],
    ["audio/mpeg", "audio"],
    ["text/plain", "text"],
    ["text/markdown; charset=utf-8", "text"],
    ["application/json", "text"],
    ["image/svg+xml", null],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", null],
  ])("%s → %s", (mime, kind) => {
    expect(attachmentKind(mime)).toBe(kind);
  });

  it("hanya Gemini yang menerima audio", () => {
    expect(AI_PROVIDERS.gemini.supports.audio).toBe(true);
    expect(AI_PROVIDERS.anthropic.supports.audio).toBe(false);
    expect(AI_PROVIDERS.openai.supports.audio).toBe(false);
  });
});

describe("kindFromStatus", () => {
  it.each([
    [401, "", "auth"],
    [403, "", "auth"],
    [404, "", "model"],
    [429, "", "quota"],
    [400, "API key not valid. Please pass a valid API key.", "auth"],
    [400, "Unsupported MIME type", "invalid"],
    [500, "", "unavailable"],
    [undefined, "", "unavailable"],
  ])("%s %s → %s", (status, message, kind) => {
    expect(kindFromStatus(status, message)).toBe(kind);
  });
});
