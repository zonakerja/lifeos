import { describe, expect, it } from "vitest";
import {
  allowedFormats,
  anthropicBaseUrl,
  canonicalClaudeModel,
  credentialLabel,
  endpointOf,
  endpointSupports,
  isPrivateHost,
  normalizeBaseUrl,
} from "./ai-endpoint";
import { providerCandidates } from "./ai-routing";
import { EFFORT_MODELS, FALLBACK_MODELS, modelMatches } from "./providers/anthropic.client";

describe("normalizeBaseUrl", () => {
  it("menerima https publik dan membuang garis miring akhir", () => {
    expect(normalizeBaseUrl(" https://router.example.com/v1/ ", true)).toEqual({
      ok: true,
      url: "https://router.example.com/v1",
    });
    expect(normalizeBaseUrl("https://openrouter.ai/api/v1", true)).toEqual({
      ok: true,
      url: "https://openrouter.ai/api/v1",
    });
  });

  it("menolak http publik, kredensial, query, dan alamat rusak", () => {
    expect(normalizeBaseUrl("http://router.example.com/v1", false).ok).toBe(false);
    expect(normalizeBaseUrl("https://user:pass@router.example.com", true).ok).toBe(false);
    expect(normalizeBaseUrl("https://router.example.com/v1?key=x", true).ok).toBe(false);
    expect(normalizeBaseUrl("ftp://router.example.com", false).ok).toBe(false);
    expect(normalizeBaseUrl("bukan alamat", true).ok).toBe(false);
  });

  it("host lokal/privat hanya di luar production (router lokal / server tiruan)", () => {
    expect(normalizeBaseUrl("http://localhost:4999/v1", false)).toEqual({ ok: true, url: "http://localhost:4999/v1" });
    expect(normalizeBaseUrl("http://localhost:4999/v1", true).ok).toBe(false);
    expect(normalizeBaseUrl("https://10.0.0.5/v1", true).ok).toBe(false);
    expect(normalizeBaseUrl("https://[::1]/v1", true).ok).toBe(false);
  });
});

describe("isPrivateHost", () => {
  it("mengenali alamat lokal & privat", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "192.168.1.2",
      "172.20.0.1",
      "169.254.169.254",
      "::1",
      "fd00::1",
      "api.local",
    ]) {
      expect(isPrivateHost(host)).toBe(true);
    }
    for (const host of ["router.classai.id", "8.8.8.8", "172.32.0.1", "openrouter.ai"]) {
      expect(isPrivateHost(host)).toBe(false);
    }
  });
});

describe("endpointOf & format", () => {
  it("tanpa alamat = langsung; format tidak sah jatuh ke bawaan provider", () => {
    expect(endpointOf({ provider: "gemini", baseUrl: null, apiFormat: null })).toBeNull();
    expect(endpointOf({ provider: "gemini", baseUrl: "https://r.example/v1", apiFormat: "anthropic" })).toEqual({
      baseUrl: "https://r.example/v1",
      format: "openai",
    });
    expect(endpointOf({ provider: "anthropic", baseUrl: "https://r.example/v1", apiFormat: null })?.format).toBe(
      "anthropic",
    );
    expect(endpointOf({ provider: "anthropic", baseUrl: "https://r.example/v1", apiFormat: "openai" })?.format).toBe(
      "openai",
    );
    expect(allowedFormats("openai")).toEqual(["openai"]);
  });

  it("alamat SDK Anthropic tanpa akhiran /v1", () => {
    expect(anthropicBaseUrl("https://router.example.com/v1")).toBe("https://router.example.com");
    expect(anthropicBaseUrl("https://router.example.com/anthropic")).toBe("https://router.example.com/anthropic");
  });

  it("label & lampiran mengikuti jalur", () => {
    const viaRouter = { provider: "gemini" as const, baseUrl: "https://router.example.com/v1", apiFormat: "openai" };
    expect(credentialLabel(viaRouter)).toBe("Google Gemini lewat router.example.com");
    expect(credentialLabel({ ...viaRouter, baseUrl: null })).toBe("Google Gemini");
    expect(endpointSupports(viaRouter).audio).toBe(false);
    expect(endpointSupports({ ...viaRouter, baseUrl: null }).audio).toBe(true);
  });

  it("cadangan lampiran memakai kemampuan jalur", () => {
    // Gemini lewat router tidak menerima audio → audio tidak bisa diproses siapa pun
    const supports = () => ({ image: true, pdf: true, text: true, audio: false });
    expect(providerCandidates("gemini", ["gemini", "openai"], ["audio"], true, supports)).toEqual([]);
    expect(providerCandidates("gemini", ["gemini", "openai"], ["pdf"], true, supports)).toEqual(["gemini", "openai"]);
  });
});

describe("nama model Claude di router", () => {
  it("dinormalkan agar fitur model tetap dikenali", () => {
    expect(canonicalClaudeModel("claude-opus-5.5")).toBe("claude-opus-5-5");
    expect(canonicalClaudeModel("anthropic/claude-sonnet-5.5")).toBe("claude-sonnet-5-5");
    expect(modelMatches(EFFORT_MODELS, "claude-sonnet-5.5")).toBe(true);
    expect(modelMatches(FALLBACK_MODELS, "anthropic/claude-opus-5.5")).toBe(true);
    expect(modelMatches(EFFORT_MODELS, "claude-haiku-4.5")).toBe(false);
  });
});
