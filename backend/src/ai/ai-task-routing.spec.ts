import { describe, expect, it } from "vitest";
import { embeddingProvider, ocrCandidates, parseRouting, taskProvider } from "./ai-routing";

describe("pembagian tugas AI", () => {
  it("parseRouting membuang nilai asing", () => {
    expect(parseRouting({ chat: "openai", general: "x", ocr: null, embedding: "anthropic", lain: 1 })).toEqual({
      chat: "openai",
    });
    expect(parseRouting(null)).toEqual({});
  });

  it("taskProvider: pilihan tugas bila key ada, selain itu provider aktif", () => {
    expect(taskProvider({ chat: "openai" }, "chat", "gemini", ["gemini", "openai"])).toBe("openai");
    expect(taskProvider({ chat: "anthropic" }, "chat", "gemini", ["gemini", "openai"])).toBe("gemini");
    expect(taskProvider({}, "general", "openai", ["openai"])).toBe("openai");
    expect(taskProvider({}, "general", null, [])).toBeNull();
    expect(taskProvider(parseRouting({ agent: "gemini" }), "agent", "openai", ["gemini", "openai"])).toBe("gemini");
    expect(taskProvider(parseRouting({ agent: "gemini" }), "agent", "openai", ["openai"])).toBe("openai");
  });

  it("ocrCandidates: pilihan user lebih dulu, lalu urutan bawaan; hanya yang punya key", () => {
    expect(ocrCandidates({ ocr: "openai" }, ["gemini", "openai"], "pdf")).toEqual(["openai", "gemini"]);
    expect(ocrCandidates({}, ["openai", "anthropic"], "image")).toEqual(["openai", "anthropic"]);
    expect(ocrCandidates({}, [], "pdf")).toEqual([]);
  });

  it("embeddingProvider: pilihan user bila key ada, lalu Gemini, lalu OpenAI", () => {
    expect(embeddingProvider({ embedding: "openai" }, ["gemini", "openai"])).toBe("openai");
    expect(embeddingProvider({ embedding: "openai" }, ["gemini"])).toBe("gemini");
    expect(embeddingProvider({}, ["openai"])).toBe("openai");
    expect(embeddingProvider({}, ["anthropic"])).toBeNull();
  });
});
