import type { Response } from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";
import { responsesChunks, responsesCompletion, responsesRequest } from "./agent-openai";

const reply = (over: Partial<Response>) =>
  ({
    id: "resp_1",
    model: "gpt-6.1-sol",
    output: [],
    output_text: "",
    incomplete_details: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      input_tokens_details: { cached_tokens: 4 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    ...over,
  }) as Response;

describe("agent-openai", () => {
  it("responsesRequest: sistem, percakapan, alat, batas token, penalaran; store selalu mati", () => {
    const params = responsesRequest(
      {
        temperature: 0.2,
        max_tokens: 100,
        reasoning_effort: "medium",
        tool_choice: { type: "function", function: { name: "cari" } },
        tools: [
          { type: "function", function: { name: "cari", description: "d", parameters: { type: "object" } } },
          { type: "lain" },
        ],
        messages: [
          { role: "system", content: "S1" },
          { role: "developer", content: [{ type: "text", text: "S2" }] },
          {
            role: "user",
            content: [
              { type: "text", text: "Q" },
              { type: "image_url", image_url: { url: "data:x" } },
            ],
          },
          {
            role: "assistant",
            content: "pikir",
            tool_calls: [{ id: "c1", type: "function", function: { name: "cari", arguments: '{"a":1}' } }],
          },
          { role: "tool", tool_call_id: "c1", content: "hasil" },
        ],
      },
      "gpt-6.1-sol",
    );
    expect(params).toEqual({
      model: "gpt-6.1-sol",
      store: false,
      instructions: "S1\n\nS2",
      max_output_tokens: 100,
      reasoning: { effort: "medium" },
      tool_choice: { type: "function", name: "cari" },
      tools: [{ type: "function", name: "cari", description: "d", parameters: { type: "object" }, strict: false }],
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Q" },
            { type: "input_image", image_url: "data:x", detail: "auto" },
          ],
        },
        { role: "assistant", content: "pikir" },
        { type: "function_call", call_id: "c1", name: "cari", arguments: '{"a":1}' },
        { type: "function_call_output", call_id: "c1", output: "hasil" },
      ],
    });
    expect(responsesRequest({ messages: [] }, "m")).toBeNull();
    expect(responsesRequest(null, "m")).toBeNull();
    expect(
      responsesRequest({ messages: [{ role: "user", content: "x" }], reasoning_effort: "none" }, "m"),
    ).not.toHaveProperty("reasoning");
  });

  it("responsesCompletion: teks, alat, alasan selesai, pemakaian token", () => {
    const text = responsesCompletion(reply({ output_text: "halo" }), 1);
    expect(text.choices[0]).toEqual({
      index: 0,
      message: { role: "assistant", content: "halo" },
      finish_reason: "stop",
    });
    expect(text.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      prompt_tokens_details: { cached_tokens: 4 },
    });
    const call = { type: "function_call", id: "fc", call_id: "c1", name: "cari", arguments: "{}" };
    const tools = responsesCompletion(reply({ output: [call] as Response["output"] }), 1);
    expect(tools.choices[0].finish_reason).toBe("tool_calls");
    expect(tools.choices[0].message.tool_calls).toEqual([
      { id: "c1", type: "function", function: { name: "cari", arguments: "{}" } },
    ]);
    const cut = reply({ output_text: "x", incomplete_details: { reason: "max_output_tokens" } });
    expect(responsesCompletion(cut, 1).choices[0].finish_reason).toBe("length");
  });

  it("responsesChunks: alat dikirim utuh sebelum penutup, pemakaian paling akhir", () => {
    const chunks = responsesChunks("id", "m", 1);
    const call = { type: "function_call", id: "fc", call_id: "c1", name: "cari", arguments: "{}" };
    const done = chunks.finish(reply({ output: [call] as Response["output"] }));
    expect(done[0].choices[0].delta).toEqual({
      tool_calls: [{ index: 0, id: "c1", type: "function", function: { name: "cari", arguments: "{}" } }],
    });
    expect(done[1].choices[0].finish_reason).toBe("tool_calls");
    expect(done[2].choices).toEqual([]);
    expect(chunks.text("a").choices[0].delta).toEqual({ content: "a" });
  });
});
