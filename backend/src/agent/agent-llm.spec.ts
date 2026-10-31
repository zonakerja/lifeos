import { describe, expect, it } from "vitest";
import { API_SCOPES } from "../integrations/api-token-logic";
import {
  AGENT_MODEL_ID,
  DEFAULT_AGENT_SCOPES,
  modelsResponse,
  prepareChatBody,
  upstreamErrorSummary,
} from "./agent-llm";

describe("proxy model agen", () => {
  it("model diganti model user; kunci khusus OpenAI dibuang untuk provider lain", () => {
    const body = { model: AGENT_MODEL_ID, messages: [{ role: "user", content: "hai" }], stream: true, store: false };
    expect(prepareChatBody(body, "gemini", "gemini-3.8-flash")).toEqual({
      model: "gemini-3.8-flash",
      messages: body.messages,
      stream: true,
    });
    expect(prepareChatBody(body, "openai", "gpt-6.1-sol")).toMatchObject({ model: "gpt-6.1-sol", store: false });
    // Isi asli tidak diubah (dipakai ulang Hermes)
    expect(body.model).toBe(AGENT_MODEL_ID);
  });

  it("menolak body tanpa messages", () => {
    expect(prepareChatBody(null, "gemini", "m")).toBeNull();
    expect(prepareChatBody([], "gemini", "m")).toBeNull();
    expect(prepareChatBody({ messages: [] }, "gemini", "m")).toBeNull();
    expect(prepareChatBody({ prompt: "x" }, "gemini", "m")).toBeNull();
  });

  it("daftar model: satu model lifeos-agent dengan konteks provider", () => {
    const list = modelsResponse("gemini", "gemini-3.8-flash");
    expect(list.data).toHaveLength(1);
    expect(list.data[0]).toMatchObject({ id: AGENT_MODEL_ID, context_length: 1_000_000 });
    expect(modelsResponse(null, null).data[0].context_length).toBe(128_000);
  });

  it("ringkasan error provider", () => {
    expect(upstreamErrorSummary(429, '{"error":{"message":"Quota exceeded"}}')).toBe("429: Quota exceeded");
    expect(upstreamErrorSummary(400, '[{"error":{"message":"bad"}}]')).toBe("400: bad");
    expect(upstreamErrorSummary(500, "")).toBe("500: tanpa keterangan");
    expect(upstreamErrorSummary(502, "x".repeat(400))).toHaveLength(305);
  });

  it("izin bawaan agen = semua cakupan, termasuk ai:model", () => {
    expect(DEFAULT_AGENT_SCOPES).toEqual([...API_SCOPES]);
    expect(DEFAULT_AGENT_SCOPES).toContain("ai:model");
  });
});
