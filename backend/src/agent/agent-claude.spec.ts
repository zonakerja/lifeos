import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import {
  basicClaudeRequest,
  chatCompletion,
  chunkFactory,
  claudeRequest,
  ClaudeTurnMemory,
  openAiUsage,
  replayableBlocks,
  runClaude,
} from "./agent-claude";

const noMemory = () => null;
const OPUS = "claude-opus-5-5";
const tool = { type: "function", function: { name: "cari", description: "Cari", parameters: { type: "object" } } };
const thinking = { type: "thinking" as const, thinking: "", signature: "sig-1" };
const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 80, cache_creation_input_tokens: 20 };

describe("claudeRequest", () => {
  it("system diangkat, parameter sampling dibuang, cache otomatis & pengaman model terbaru aktif", () => {
    const result = claudeRequest(
      {
        temperature: 0.2,
        top_p: 0.5,
        store: false,
        messages: [
          { role: "system", content: "Aturan A" },
          { role: "developer", content: "Aturan B" },
          { role: "user", content: "hai" },
        ],
      },
      OPUS,
      noMemory,
    );
    expect(result?.params).toMatchObject({
      model: OPUS,
      system: "Aturan A\n\nAturan B",
      messages: [{ role: "user", content: [{ type: "text", text: "hai" }] }],
      cache_control: { type: "ephemeral" },
      thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
      output_config: { effort: "medium" },
      fallbacks: "default",
    });
    expect(result?.params).not.toHaveProperty("temperature");
    expect(result?.params).not.toHaveProperty("top_p");
    expect(result?.betas).toEqual(["thinking-binding-controls-2026-08-01", "server-side-fallback-2026-07-01"]);
  });

  it("model lama tidak mendapat parameter yang tidak dikenalnya", () => {
    const result = claudeRequest({ messages: [{ role: "user", content: "x" }] }, "claude-sonnet-4-6", noMemory);
    expect(result?.params).not.toHaveProperty("thinking");
    expect(result?.params).not.toHaveProperty("fallbacks");
    expect(result?.params).not.toHaveProperty("output_config");
    expect(result?.betas).toEqual([]);
  });

  it("menolak body yang bukan chat", () => {
    expect(claudeRequest(null, OPUS, noMemory)).toBeNull();
    expect(claudeRequest({ messages: [] }, OPUS, noMemory)).toBeNull();
    expect(claudeRequest({ messages: [{ role: "system", content: "x" }] }, OPUS, noMemory)).toBeNull();
  });

  it("pemanggilan alat & hasilnya; hasil alat berurutan jadi satu pesan user", () => {
    const result = claudeRequest(
      {
        tools: [tool],
        messages: [
          { role: "user", content: "cari" },
          {
            role: "assistant",
            content: "Saya cari",
            tool_calls: [
              { id: "a1", type: "function", function: { name: "cari", arguments: '{"q":"x"}' } },
              { id: "a.2", type: "function", function: { name: "cari", arguments: "bukan json" } },
            ],
          },
          { role: "tool", tool_call_id: "a1", content: "hasil 1" },
          { role: "tool", tool_call_id: "a.2", content: [{ type: "text", text: "hasil 2" }] },
        ],
      },
      OPUS,
      noMemory,
    );
    expect(result?.params.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "cari" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Saya cari" },
          { type: "tool_use", id: "a1", name: "cari", input: { q: "x" } },
          { type: "tool_use", id: "a_2", name: "cari", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "a1", content: "hasil 1" },
          { type: "tool_result", tool_use_id: "a_2", content: "hasil 2" },
        ],
      },
    ]);
    expect(result?.params.tools).toEqual([{ name: "cari", description: "Cari", input_schema: { type: "object" } }]);
  });

  it("tool_choice paksa jadi auto pada model yang menolaknya", () => {
    const body = { tools: [tool], tool_choice: "required", messages: [{ role: "user", content: "x" }] };
    expect(claudeRequest(body, OPUS, noMemory)?.params.tool_choice).toBeUndefined();
    expect(claudeRequest(body, "claude-opus-5", noMemory)?.params.tool_choice).toEqual({ type: "any" });
    const none = { ...body, tool_choice: "none" };
    expect(claudeRequest(none, OPUS, noMemory)?.params.tool_choice).toEqual({ type: "none" });
    const single = { ...body, tool_choice: "auto", parallel_tool_calls: false };
    expect(claudeRequest(single, OPUS, noMemory)?.params.tool_choice).toEqual({
      type: "auto",
      disable_parallel_tool_use: true,
    });
  });

  it("gambar data URL & URL; skema JSON; batas output", () => {
    const result = claudeRequest(
      {
        max_tokens: 500_000,
        response_format: { type: "json_schema", json_schema: { schema: { type: "object" } } },
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } },
              { type: "image_url", image_url: { url: "https://x.test/a.png" } },
              { type: "text", text: "apa ini" },
            ],
          },
        ],
      },
      OPUS,
      noMemory,
    );
    expect(result?.params.max_tokens).toBe(128_000);
    expect(result?.params.output_config).toEqual({
      effort: "medium",
      format: { type: "json_schema", schema: { type: "object" } },
    });
    expect(result?.params.messages[0].content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } },
      { type: "image", source: { type: "url", url: "https://x.test/a.png" } },
      { type: "text", text: "apa ini" },
    ]);
  });
});

describe("Claude lewat router", () => {
  it("nama model router (titik) tetap mendapat fitur model terbaru", () => {
    const result = claudeRequest({ messages: [{ role: "user", content: "hai" }] }, "claude-opus-5.5", noMemory);
    expect(result?.params).toMatchObject({
      model: "claude-opus-5.5",
      fallbacks: "default",
      output_config: { effort: "medium" },
    });
    expect(result?.betas.length).toBe(2);
  });

  it("permintaan dasar membuang fitur beta tetapi mempertahankan cache, effort, dan pemikiran adaptif", () => {
    const full = claudeRequest({ messages: [{ role: "user", content: "hai" }], tools: [tool] }, OPUS, noMemory)!;
    const basic = basicClaudeRequest(full);
    expect(basic.betas).toEqual([]);
    expect(basic.params).not.toHaveProperty("fallbacks");
    expect(basic.params).toMatchObject({ cache_control: { type: "ephemeral" }, thinking: { type: "adaptive" } });
    expect((basic.params as { thinking: object }).thinking).not.toHaveProperty("block_binding");
    expect(basic.params.tools?.length).toBe(1);
    // permintaan asli tidak berubah
    expect(full.params).toHaveProperty("fallbacks");
  });
});

describe("blok pemikiran", () => {
  const stored = [
    thinking,
    { type: "text" as const, text: "Saya cari" },
    { type: "tool_use" as const, id: "t1", name: "cari", input: { q: "x" } },
  ];
  const turn = (args: string, content = "Saya cari") => ({
    messages: [
      { role: "user", content: "cari" },
      { role: "assistant", content, tool_calls: [{ id: "t1", function: { name: "cari", arguments: args } }] },
      { role: "tool", tool_call_id: "t1", content: "hasil" },
    ],
  });

  it("disimpan per user lalu dikirim balik utuh", () => {
    const memory = new ClaudeTurnMemory();
    memory.remember("u1", stored);
    const result = claudeRequest(turn('{"q":"x"}'), OPUS, (ids) => memory.recall("u1", ids));
    expect(result?.params.messages[1].content).toEqual(stored);
    expect(memory.recall("u2", ["t1"])).toBeNull();
  });

  it("riwayat yang diubah Hermes dibangun ulang tanpa pemikiran", () => {
    const memory = new ClaudeTurnMemory();
    memory.remember("u1", stored);
    for (const body of [turn('{"q":"y"}'), turn('{"q":"x"}', "teks diringkas")]) {
      const content = claudeRequest(body, OPUS, (ids) => memory.recall("u1", ids))?.params.messages[1].content;
      expect(content).not.toContainEqual(thinking);
    }
  });

  it("giliran tanpa pemikiran tidak disimpan; kedaluwarsa & batas jumlah berlaku", () => {
    const memory = new ClaudeTurnMemory(2, 1_000);
    memory.remember("u", [{ type: "tool_use", id: "x", name: "n", input: {} }], 0);
    expect(memory.recall("u", ["x"], 0)).toBeNull();

    const block = (id: string) => [thinking, { type: "tool_use" as const, id, name: "n", input: {} }];
    memory.remember("u", block("a"), 0);
    expect(memory.recall("u", ["a"], 999)).not.toBeNull();
    expect(memory.recall("u", ["a"], 1_001)).toBeNull();
    memory.remember("u", block("b"), 0);
    memory.remember("u", block("c"), 0);
    expect(memory.recall("u", ["a"], 0)).toBeNull();
    expect(memory.recall("u", ["c"], 0)).not.toBeNull();
  });

  it("setelah fallback, pemikiran & alat sebelum batas dibuang, teks tetap", () => {
    const content = [
      thinking,
      { type: "text", text: "awal " },
      { type: "tool_use", id: "lama", name: "n", input: {} },
      { type: "fallback", from: { model: OPUS }, to: { model: "claude-opus-5" } },
      { type: "text", text: "lanjut" },
      { type: "tool_use", id: "baru", name: "n", input: {} },
    ] as unknown as Parameters<typeof replayableBlocks>[0];
    expect(replayableBlocks(content)).toEqual([
      { type: "text", text: "awal " },
      { type: "text", text: "lanjut" },
      { type: "tool_use", id: "baru", name: "n", input: {} },
    ]);
  });
});

/** Respons SSE Anthropic tiruan untuk SDK sungguhan. */
function fakeClaude(events: object[], status = 200, requests: unknown[] = []) {
  return new Anthropic({
    apiKey: "kunci-uji",
    maxRetries: 0,
    fetch: (async (_url: unknown, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      if (status !== 200) {
        const error = { type: "error", error: { type: "invalid_request_error", message: "ditolak" } };
        return new Response(JSON.stringify(error), { status, headers: { "content-type": "application/json" } });
      }
      const body = events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as unknown as typeof fetch,
  });
}

const STREAM = [
  {
    type: "message_start",
    message: {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: OPUS,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 80, cache_creation_input_tokens: 20 },
    },
  },
  { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig-1" } },
  { type: "content_block_stop", index: 0 },
  { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Sa" } },
  { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "ya" } },
  { type: "content_block_stop", index: 1 },
  { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "t1", name: "cari", input: {} } },
  { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"q":' } },
  { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '"x"}' } },
  { type: "content_block_stop", index: 2 },
  { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 5 } },
  { type: "message_stop" },
];

describe("runClaude dengan SDK sungguhan", () => {
  const request = claudeRequest({ messages: [{ role: "user", content: "x" }] }, OPUS, noMemory)!;

  it("stream → teks bertahap, alat di akhir, pemikiran tersimpan bertanda tangan", async () => {
    const requests: Record<string, unknown>[] = [];
    const texts: string[] = [];
    let connected = 0;
    const message = await runClaude(
      fakeClaude(STREAM, 200, requests),
      request,
      new AbortController().signal,
      () => (connected += 1),
      (text) => texts.push(text),
    );
    expect(connected).toBe(1);
    expect(texts).toEqual(["Sa", "ya"]);
    expect(requests[0]).toMatchObject({ stream: true, cache_control: { type: "ephemeral" } });
    expect(requests[0]).not.toHaveProperty("betas");

    expect(replayableBlocks(message.content)).toEqual([
      { type: "thinking", thinking: "", signature: "sig-1" },
      { type: "text", text: "Saya" },
      { type: "tool_use", id: "t1", name: "cari", input: { q: "x" } },
    ]);

    const chunks = chunkFactory("c1", OPUS, 1).finish(message) as {
      choices: { delta: { tool_calls?: unknown }; finish_reason: string | null }[];
      usage?: unknown;
    }[];
    expect(chunks[0].choices[0].delta.tool_calls).toEqual([
      { index: 0, id: "t1", type: "function", function: { name: "cari", arguments: '{"q":"x"}' } },
    ]);
    expect(chunks[1].choices[0].finish_reason).toBe("tool_calls");
    expect(chunks[2].usage).toMatchObject({ prompt_tokens: 110, completion_tokens: 5 });

    expect(chatCompletion(message, 1).choices[0]).toMatchObject({
      finish_reason: "tool_calls",
      message: { content: "Saya", tool_calls: [{ id: "t1" }] },
    });
  });

  it("error sebelum stream tidak memicu connect (status bisa diteruskan apa adanya)", async () => {
    let connected = false;
    await expect(
      runClaude(
        fakeClaude([], 400),
        request,
        new AbortController().signal,
        () => (connected = true),
        () => {},
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(connected).toBe(false);
  });
});

describe("keluaran format OpenAI", () => {
  it("prompt_tokens mencakup cache", () => {
    expect(openAiUsage(usage as Parameters<typeof openAiUsage>[0])).toMatchObject({
      prompt_tokens: 110,
      total_tokens: 115,
      prompt_tokens_details: { cached_tokens: 80 },
      cache_read_input_tokens: 80,
      cache_creation_input_tokens: 20,
    });
  });

  it("penolakan filter keamanan jadi content_filter + keterangan", () => {
    const message = {
      id: "m",
      model: OPUS,
      content: [],
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber", explanation: "Ditolak." },
      usage,
    } as unknown as Parameters<typeof chatCompletion>[0];
    expect(chatCompletion(message, 1).choices[0]).toMatchObject({
      finish_reason: "content_filter",
      message: { content: "Ditolak." },
    });
  });
});
