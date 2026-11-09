import type {
  FunctionTool,
  Response,
  ResponseCreateParamsBase,
  ResponseFunctionToolCall,
  ResponseInputContent,
  ResponseInputItem,
} from "openai/resources/responses/responses";

/**
 * Hermes berbicara Chat Completions, sedangkan model OpenAI bernalar (mis. `gpt-6.1-sol`) hanya menerima alat lewat Responses API.
 * Terjemahan dua arah ini dipakai proxy agen untuk OpenAI langsung; `store: false` agar percakapan tidak disimpan di server OpenAI.
 */
type Json = Record<string, unknown>;
type Params = ResponseCreateParamsBase;

const textOf = (content: unknown) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as Json[])
    .map((part) => (part?.type === "text" && typeof part.text === "string" ? part.text : ""))
    .join("");
};

function userContent(content: unknown): string | ResponseInputContent[] {
  if (!Array.isArray(content)) return textOf(content);
  return (content as Json[]).flatMap((part): ResponseInputContent[] => {
    if (part?.type === "text" && typeof part.text === "string") return [{ type: "input_text", text: part.text }];
    const url = (part?.image_url as { url?: unknown } | undefined)?.url;
    if (part?.type === "image_url" && typeof url === "string")
      return [{ type: "input_image", image_url: url, detail: "auto" }];
    return [];
  });
}

function toTools(tools: unknown): FunctionTool[] {
  if (!Array.isArray(tools)) return [];
  return (tools as Json[]).flatMap((tool): FunctionTool[] => {
    const fn = tool?.function as Json | undefined;
    if (tool?.type !== "function" || typeof fn?.name !== "string") return [];
    return [
      {
        type: "function",
        name: fn.name,
        description: typeof fn.description === "string" ? fn.description : null,
        parameters: (fn.parameters as Record<string, unknown>) ?? { type: "object", properties: {} },
        strict: false,
      },
    ];
  });
}

function toToolChoice(choice: unknown): Params["tool_choice"] | undefined {
  if (choice === "auto" || choice === "none" || choice === "required") return choice;
  const name = ((choice as Json | undefined)?.function as Json | undefined)?.name;
  return typeof name === "string" ? { type: "function", name } : undefined;
}

/** Body `chat/completions` → parameter Responses API. Null bila bukan permintaan chat (tanpa `messages`). */
export function responsesRequest(body: unknown, model: string): Params | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const source = body as Json;
  if (!Array.isArray(source.messages) || source.messages.length === 0) return null;

  const instructions: string[] = [];
  const input: ResponseInputItem[] = [];
  for (const message of source.messages as Json[]) {
    if (message?.role === "system" || message?.role === "developer") {
      const text = textOf(message.content);
      if (text) instructions.push(text);
    } else if (message?.role === "user") {
      input.push({ role: "user", content: userContent(message.content) });
    } else if (message?.role === "assistant") {
      const text = textOf(message.content);
      if (text) input.push({ role: "assistant", content: text });
      for (const call of (Array.isArray(message.tool_calls) ? message.tool_calls : []) as Json[]) {
        const fn = call?.function as Json | undefined;
        if (typeof call?.id !== "string" || typeof fn?.name !== "string") continue;
        input.push({
          type: "function_call",
          call_id: call.id,
          name: fn.name,
          arguments: typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
        });
      }
    } else if (message?.role === "tool" && typeof message.tool_call_id === "string") {
      input.push({ type: "function_call_output", call_id: message.tool_call_id, output: textOf(message.content) });
    }
  }

  const tools = toTools(source.tools);
  const toolChoice = toToolChoice(source.tool_choice);
  const maxTokens = source.max_completion_tokens ?? source.max_tokens;
  const effort = source.reasoning_effort;
  return {
    model,
    input,
    store: false,
    ...(instructions.length ? { instructions: instructions.join("\n\n") } : {}),
    ...(tools.length ? { tools } : {}),
    ...(tools.length && toolChoice ? { tool_choice: toolChoice } : {}),
    ...(typeof maxTokens === "number" ? { max_output_tokens: maxTokens } : {}),
    ...(typeof effort === "string" && effort !== "none"
      ? { reasoning: { effort: effort as NonNullable<Params["reasoning"]>["effort"] } }
      : {}),
  };
}

const toolCallsOf = (response: Response) =>
  response.output
    .filter((item): item is ResponseFunctionToolCall => item.type === "function_call")
    .map((item) => ({
      id: item.call_id,
      type: "function" as const,
      function: { name: item.name, arguments: item.arguments },
    }));

const finishReasonOf = (response: Response) =>
  toolCallsOf(response).length
    ? "tool_calls"
    : response.incomplete_details?.reason === "max_output_tokens"
      ? "length"
      : response.incomplete_details?.reason === "content_filter"
        ? "content_filter"
        : "stop";

export function responsesUsage(response: Response) {
  const usage = response.usage;
  return {
    prompt_tokens: usage?.input_tokens ?? 0,
    completion_tokens: usage?.output_tokens ?? 0,
    total_tokens: usage?.total_tokens ?? 0,
    prompt_tokens_details: { cached_tokens: usage?.input_tokens_details?.cached_tokens ?? 0 },
  };
}

/** Balasan lengkap format Chat Completions. */
export function responsesCompletion(response: Response, created: number) {
  const tool_calls = toolCallsOf(response);
  return {
    id: response.id,
    object: "chat.completion",
    created,
    model: response.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: response.output_text || null,
          ...(tool_calls.length ? { tool_calls } : {}),
        },
        finish_reason: finishReasonOf(response),
      },
    ],
    usage: responsesUsage(response),
  };
}

/** Potongan stream format Chat Completions; pemanggilan alat dikirim utuh di akhir. */
export function responsesChunks(id: string, model: string, created: number) {
  const chunk = (delta: Json, finish_reason: string | null = null) => ({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason }],
  });
  return {
    start: () => chunk({ role: "assistant", content: "" }),
    text: (content: string) => chunk({ content }),
    finish: (response: Response) => {
      const calls = toolCallsOf(response);
      return [
        ...(calls.length ? [chunk({ tool_calls: calls.map((call, index) => ({ index, ...call })) })] : []),
        chunk({}, finishReasonOf(response)),
        {
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [],
          usage: responsesUsage(response),
        },
      ];
    },
  };
}
