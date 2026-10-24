import { describe, expect, it } from "vitest";
import { describeInput, mcpConfigSnippets, mcpUrl } from "./integrations-utils";

describe("integrasi MCP", () => {
  it("alamat MCP dari origin", () => {
    expect(mcpUrl("http://localhost:5173")).toBe("http://localhost:5173/api/v1/mcp");
    expect(mcpUrl("https://lifeos.example.id/")).toBe("https://lifeos.example.id/api/v1/mcp");
  });

  it("contoh konfigurasi memuat alamat & token", () => {
    const { json, hermes } = mcpConfigSnippets("https://x/api/v1/mcp", "lifeos_pat_abc");
    expect(JSON.parse(json).mcpServers.lifeos).toEqual({
      type: "http",
      url: "https://x/api/v1/mcp",
      headers: { Authorization: "Bearer lifeos_pat_abc" },
    });
    expect(hermes).toContain('url: "https://x/api/v1/mcp"');
    expect(hermes).toContain('Authorization: "Bearer lifeos_pat_abc"');
  });

  it("ringkasan argumen log", () => {
    expect(describeInput({ query: "sewa", limit: 3 })).toBe("query: sewa · limit: 3");
    expect(describeInput(null)).toBe("");
  });
});
