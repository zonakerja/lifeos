import { describe, expect, it } from "vitest";
import {
  bearerFromHeaders,
  chatCompletion,
  chatCompletionStream,
  chatToPrompt,
  officeAiPluginOptions,
  officeAiTarget,
} from "./office-ai";

describe("tab AI ONLYOFFICE lewat AI LifeOS", () => {
  it("opsi plugin menunjuk proxy & provider di origin aplikasi", () => {
    expect(officeAiPluginOptions({ appOrigin: "https://lifeos.id/", token: "t", modelName: "AI LifeOS" })).toEqual({
      lifeos: {
        token: "t",
        proxy: "https://lifeos.id/api/v1/office/ai/proxy",
        url: "https://lifeos.id/api/v1/office/ai/openai",
        modelId: "lifeos",
        modelName: "AI LifeOS",
      },
    });
  });

  it("jenis permintaan dari URL target", () => {
    expect(officeAiTarget("http://localhost:5173/api/v1/office/ai/openai/chat/completions")).toBe("chat");
    expect(officeAiTarget("http://x/api/v1/office/ai/openai/v1/chat/completions")).toBe("chat");
    expect(officeAiTarget("http://x/api/v1/office/ai/openai/models")).toBe("models");
    expect(officeAiTarget("http://x/api/v1/office/ai/openai/images/generations")).toBe("unsupported");
    expect(officeAiTarget("bukan url")).toBe("unsupported");
    expect(officeAiTarget(undefined)).toBe("unsupported");
  });

  it("token sesi dari header Authorization (huruf apa pun)", () => {
    expect(bearerFromHeaders({ authorization: "Bearer abc" })).toBe("abc");
    expect(bearerFromHeaders({ "Content-Type": "x", Authorization: "bearer  def " })).toBe("def");
    expect(bearerFromHeaders({ Authorization: "Basic x" })).toBeNull();
    expect(bearerFromHeaders(null)).toBeNull();
  });

  it("pesan chat → prompt + gambar", () => {
    const png = Buffer.from("gambar").toString("base64");
    const one = chatToPrompt([
      { role: "system", content: "Jawab singkat." },
      {
        role: "user",
        content: [
          { type: "text", text: "Baca teks di gambar ini" },
          { type: "image_url", image_url: { url: `data:image/png;base64,${png}` } },
        ],
      },
    ]);
    expect(one.prompt).toBe("Instruksi:\nJawab singkat.\n\nBaca teks di gambar ini");
    expect(one.images).toHaveLength(1);
    expect(one.images[0].mimeType).toBe("image/png");
    expect(one.images[0].data.toString()).toBe("gambar");

    const multi = chatToPrompt([
      { role: "user", content: "Halo" },
      { role: "assistant", content: "Hai" },
      { role: "user", content: "Ringkas dokumen" },
    ]);
    expect(multi.prompt).toBe("Pengguna:\nHalo\n\nAsisten:\nHai\n\nPengguna:\nRingkas dokumen");
    expect(chatToPrompt("bukan array")).toEqual({ prompt: "", images: [] });
  });

  it("jawaban format OpenAI (biasa & streaming)", () => {
    expect(chatCompletion("Hasil", "lifeos").choices[0].message.content).toBe("Hasil");
    const sse = chatCompletionStream("Hasil", "lifeos");
    const chunks = sse
      .split("\n\n")
      .filter((line) => line.startsWith("data: {"))
      .map((line) => JSON.parse(line.slice(6)));
    expect(chunks[0].choices[0].delta.content).toBe("Hasil");
    expect(chunks[1].choices[0].finish_reason).toBe("stop");
    expect(sse.endsWith("data: [DONE]\n\n")).toBe(true);
  });
});
