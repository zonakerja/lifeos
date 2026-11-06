import { describe, expect, it } from "vitest";
import {
  embeddingProvider,
  ocrCandidates,
  parseRouting,
  providerCandidates,
  taskBackup,
  taskProvider,
} from "./ai-routing";

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

describe("cadangan per tugas", () => {
  const all = ["gemini", "anthropic", "openai"] as const;

  it("parseRouting membaca cadangan per tugas", () => {
    expect(parseRouting({ agent: "anthropic", agentBackup: "openai", chatBackup: "x" })).toEqual({
      agent: "anthropic",
      agentBackup: "openai",
    });
  });

  it("cadangan pilihan dicoba tepat setelah provider utama, lalu sisanya", () => {
    expect(providerCandidates("anthropic", all, [], true, undefined, "openai")).toEqual([
      "anthropic",
      "openai",
      "gemini",
    ]);
    // tanpa pilihan = urutan katalog
    expect(providerCandidates("anthropic", all, [], true)).toEqual(["anthropic", "gemini", "openai"]);
  });

  it("cadangan diabaikan bila tanpa key, sama dengan utama, atau cadangan otomatis mati", () => {
    expect(providerCandidates("anthropic", ["anthropic", "gemini"], [], true, undefined, "openai")).toEqual([
      "anthropic",
      "gemini",
    ]);
    expect(providerCandidates("gemini", ["gemini", "openai"], [], true, undefined, "gemini")).toEqual([
      "gemini",
      "openai",
    ]);
    expect(providerCandidates("anthropic", all, [], false, undefined, "openai")).toEqual(["anthropic"]);
  });

  it("taskBackup = cadangan yang benar-benar dipakai", () => {
    const routing = { agent: "anthropic", agentBackup: "openai" } as const;
    expect(taskBackup(routing, "agent", "gemini", all, true)).toBe("openai");
    expect(taskBackup(routing, "agent", "gemini", all, false)).toBeNull();
    expect(taskBackup({}, "chat", "gemini", ["gemini"], true)).toBeNull();
    expect(taskBackup({ chat: "gemini" }, "chat", null, ["gemini", "openai"], true)).toBe("openai");
  });
});
