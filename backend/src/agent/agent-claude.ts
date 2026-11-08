import type Anthropic from "@anthropic-ai/sdk";
import { canonicalClaudeModel } from "../ai/ai-endpoint";
import { EFFORT_MODELS, FALLBACK_MODELS, modelMatches } from "../ai/providers/anthropic.client";

/**
 * Terjemahan proxy model agen untuk Claude (diuji di `agent-claude.spec.ts`): Hermes tetap berbicara format OpenAI chat
 * completions ke LifeOS, sedangkan ke Anthropic memakai Messages API native. Endpoint kompatibel OpenAI milik Anthropic
 * tidak dipakai karena tanpa prompt caching, tanpa blok pemikiran, dan menolak beberapa parameter pada model terbaru.
 */

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type BlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type Message = Anthropic.Beta.Messages.BetaMessage;
type Usage = Anthropic.Beta.Messages.BetaUsage;
type ContentPart = Anthropic.Beta.Messages.BetaTextBlockParam | Anthropic.Beta.Messages.BetaImageBlockParam;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);

/** Batas output bila Hermes tidak menentukannya; pemikiran ikut dihitung (permintaan selalu streaming). */
const DEFAULT_MAX_TOKENS = 64_000;
const MAX_TOKENS_LIMIT = 128_000;
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

/** Model yang menolak `tool_choice` paksa (`any`/`tool`). */
const NO_FORCED_TOOL_MODELS = /^claude-(fable-5-1|mythos-5-1|opus-5-5|sonnet-5-5)/;
/** Model yang mengikat blok pemikiran ke riwayat percakapan (riwayat diringkas Hermes tidak boleh menjadi error 400). */
const BLOCK_BINDING_MODELS = /^claude-(fable-5-1|mythos-5-1|opus-5-5|sonnet-5-5|haiku-5-5)/;

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const BINDING_BETA = "thinking-binding-controls-2026-08-01";

/** Anthropic hanya menerima huruf, angka, `_`, `-` pada ID pemanggilan alat. */
const safeToolId = (id: unknown) => String(id ?? "").replace(/[^a-zA-Z0-9_-]/g, "_") || "tool";

function parseArguments(raw: unknown): Json {
  if (isObject(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw ?? "{}")) as unknown;
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Blok jawaban asisten yang harus dikirim balik apa adanya pada giliran pemakaian alat. Format OpenAI tidak punya tempat
 * untuk tanda tangan pemikiran dan Hermes membuangnya pada rute custom, jadi disimpan di sini (satu proses backend, sama
 * seperti peta run agen). Bila hilang (backend restart) percakapan tetap jalan: API menurunkan pemikiran untuk giliran itu.
 */
export class ClaudeTurnMemory {
  private readonly turns = new Map<string, { blocks: BlockParam[]; at: number }>();

  constructor(
    private readonly maxTurns = 500,
    private readonly ttlMs = 6 * 3_600_000,
  ) {}

  remember(userId: string, blocks: BlockParam[], now = Date.now()) {
    if (!blocks.some((block) => block.type === "thinking" || block.type === "redacted_thinking")) return;
    for (const block of blocks) {
      if (block.type === "tool_use") this.turns.set(`${userId}:${block.id}`, { blocks, at: now });
    }
    // Map menjaga urutan masuk → yang tertua dibuang lebih dulu
    for (const [key, turn] of this.turns) {
      if (this.turns.size <= this.maxTurns && now - turn.at <= this.ttlMs) break;
      this.turns.delete(key);
    }
  }

  recall(userId: string, toolIds: string[], now = Date.now()): BlockParam[] | null {
    const turn = toolIds.length ? this.turns.get(`${userId}:${toolIds[0]}`) : null;
    return turn && now - turn.at <= this.ttlMs ? turn.blocks : null;
  }
}

/** Blok balasan → blok yang boleh dikirim balik: yang sebelum `fallback` terakhir diabaikan kecuali teksnya. */
export function replayableBlocks(content: Message["content"]): BlockParam[] {
  const boundary = content.map((block) => block.type).lastIndexOf("fallback");
  const blocks: BlockParam[] = [];
  content.forEach((block, index) => {
    if (block.type === "text") blocks.push({ type: "text", text: block.text });
    if (index < boundary) return;
    if (block.type === "thinking") {
      blocks.push({ type: "thinking", thinking: block.thinking, signature: block.signature });
    } else if (block.type === "redacted_thinking") {
      blocks.push({ type: "redacted_thinking", data: block.data });
    } else if (block.type === "tool_use") {
      blocks.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
    }
  });
  return blocks;
}

const textOf = (blocks: BlockParam[]) =>
  blocks
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();

/** Bagian isi format OpenAI (teks + gambar) → blok Claude. */
function contentBlocks(content: unknown): ContentPart[] {
  if (typeof content === "string") return content.trim() ? [{ type: "text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  return (content as unknown[]).flatMap((part): ContentPart[] => {
    if (!isObject(part)) return [];
    if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
      return [{ type: "text", text: part.text }];
    }
    const url = isObject(part.image_url) ? part.image_url.url : part.image_url;
    if (part.type !== "image_url" || typeof url !== "string") return [];
    const data = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/s.exec(url);
    if (data) {
      const media_type = data[1] as "image/png" | "image/jpeg" | "image/gif" | "image/webp";
      return [{ type: "image", source: { type: "base64", media_type, data: data[2] } }];
    }
    return /^https?:\/\//.test(url) ? [{ type: "image", source: { type: "url", url } }] : [];
  });
}

/**
 * Giliran asisten format OpenAI → blok Claude. Blok tersimpan dipakai bila masih cocok dengan pesan yang dikirim Hermes,
 * agar byte-nya sama dengan aslinya (syarat cache & blok pemikiran); riwayat yang sudah diubah Hermes dibangun ulang.
 */
function assistantBlocks(message: Json, recall: (toolIds: string[]) => BlockParam[] | null): BlockParam[] {
  const calls = (Array.isArray(message.tool_calls) ? (message.tool_calls as unknown[]) : []).filter(isObject);
  const tools = calls.map((call) => {
    const fn = isObject(call.function) ? call.function : {};
    return {
      type: "tool_use" as const,
      id: safeToolId(call.id),
      name: String(fn.name ?? ""),
      input: parseArguments(fn.arguments),
    };
  });
  const text = contentBlocks(message.content).filter((block) => block.type === "text");
  const rebuilt: BlockParam[] = [...text, ...tools];

  const stored = recall(tools.map((tool) => tool.id));
  if (stored) {
    const storedTools = stored.flatMap((block) => (block.type === "tool_use" ? [block] : []));
    const same =
      textOf(stored) === textOf(rebuilt) &&
      storedTools.length === tools.length &&
      storedTools.every(
        (tool, index) =>
          tool.id === tools[index].id &&
          tool.name === tools[index].name &&
          JSON.stringify(tool.input) === JSON.stringify(tools[index].input),
      );
    if (same) return stored;
  }
  return rebuilt;
}

function toolChoice(body: Json, model: string, hasTools: boolean): Params["tool_choice"] {
  if (!hasTools) return undefined;
  const disable_parallel_tool_use = body.parallel_tool_calls === false ? true : undefined;
  const parallel = disable_parallel_tool_use ? { disable_parallel_tool_use } : {};
  const choice = body.tool_choice;
  if (choice === "none") return { type: "none" };
  const forced = choice === "required" || (isObject(choice) && choice.type === "function");
  if (forced && !NO_FORCED_TOOL_MODELS.test(canonicalClaudeModel(model))) {
    const name = isObject(choice) && isObject(choice.function) ? choice.function.name : null;
    return typeof name === "string" ? { type: "tool", name, ...parallel } : { type: "any", ...parallel };
  }
  return disable_parallel_tool_use ? { type: "auto", ...parallel } : undefined;
}

/**
 * Body `chat/completions` dari Hermes → permintaan Messages API. `temperature`/`top_p` tidak diteruskan (ditolak model
 * baru); prompt caching lewat penanda per blok (`applyCacheMode` "blocks": alat, instruksi sistem, blok terakhir) — format
 * yang dikenali API Anthropic langsung maupun router. Null bila bukan permintaan chat.
 */
export function claudeRequest(
  body: unknown,
  model: string,
  recall: (toolIds: string[]) => BlockParam[] | null,
): { params: Params; betas: string[] } | null {
  if (!isObject(body) || !Array.isArray(body.messages) || body.messages.length === 0) return null;

  const system: string[] = [];
  const messages: MessageParam[] = [];
  const push = (role: MessageParam["role"], blocks: BlockParam[]) => {
    if (!blocks.length) return;
    const last = messages[messages.length - 1];
    // Hasil alat dari satu giliran wajib satu pesan; pesan peran sama digabung
    if (last?.role === role) (last.content as BlockParam[]).push(...blocks);
    else messages.push({ role, content: blocks });
  };

  for (const message of (body.messages as unknown[]).filter(isObject)) {
    if (message.role === "system" || message.role === "developer") {
      const text = contentBlocks(message.content).flatMap((block) => (block.type === "text" ? [block.text] : []));
      system.push(...text);
    } else if (message.role === "assistant") {
      push("assistant", assistantBlocks(message, recall));
    } else if (message.role === "tool") {
      const parts = contentBlocks(message.content);
      const content = parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts;
      push("user", [{ type: "tool_result", tool_use_id: safeToolId(message.tool_call_id), content }]);
    } else if (message.role === "user") {
      push("user", contentBlocks(message.content));
    }
  }
  if (!messages.length) return null;

  const tools = (Array.isArray(body.tools) ? (body.tools as unknown[]) : []).flatMap((tool) => {
    const fn = isObject(tool) ? tool.function : null;
    if (!isObject(fn) || typeof fn.name !== "string") return [];
    const input_schema = isObject(fn.parameters) ? fn.parameters : { type: "object", properties: {} };
    return [
      {
        name: fn.name,
        ...(typeof fn.description === "string" ? { description: fn.description } : {}),
        input_schema: input_schema as Anthropic.Beta.Messages.BetaTool.InputSchema,
      },
    ];
  });

  const requested = Number(body.max_completion_tokens ?? body.max_tokens);
  const max_tokens =
    Number.isFinite(requested) && requested > 0
      ? Math.min(Math.floor(requested), MAX_TOKENS_LIMIT)
      : DEFAULT_MAX_TOKENS;
  const stops = [body.stop].flat().filter((stop): stop is string => typeof stop === "string" && !!stop.trim());
  const choice = toolChoice(body, model, tools.length > 0);
  const canonical = canonicalClaudeModel(model);

  // Bawaan Opus 5.5 = medium, tetapi tidak semua model sama → selalu eksplisit agar biaya bisa diperkirakan
  const effort = EFFORTS.find((level) => level === body.reasoning_effort) ?? "medium";
  const format = isObject(body.response_format) ? body.response_format : null;
  const schema = format?.type === "json_schema" && isObject(format.json_schema) ? format.json_schema.schema : null;
  const output_config = {
    ...(modelMatches(EFFORT_MODELS, model) ? { effort } : {}),
    ...(isObject(schema) ? { format: { type: "json_schema" as const, schema } } : {}),
  };

  const binding = BLOCK_BINDING_MODELS.test(canonical);
  const fallback = FALLBACK_MODELS.test(canonical);
  const betas = [...(binding ? [BINDING_BETA] : []), ...(fallback ? [FALLBACK_BETA] : [])];

  return {
    betas,
    params: applyCacheMode(
      {
        model,
        max_tokens,
        messages,
        ...(system.length ? { system: system.join("\n\n") } : {}),
        ...(tools.length ? { tools } : {}),
        ...(choice ? { tool_choice: choice } : {}),
        ...(stops.length ? { stop_sequences: stops } : {}),
        ...(Object.keys(output_config).length ? { output_config } : {}),
        ...(binding
          ? { thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } } }
          : {}),
        ...(fallback ? { fallbacks: "default" as const } : {}),
      } as Params,
      "blocks",
    ),
  };
}

/**
 * Permintaan dasar tanpa fitur beta (fallback sisi server, pengikat blok pemikiran) — dipakai bila router menolak
 * fitur itu. Cache, effort, alat, dan pemikiran adaptif tetap dikirim.
 */
export function basicClaudeRequest(request: NonNullable<ReturnType<typeof claudeRequest>>) {
  const params = { ...request.params } as Record<string, unknown>;
  delete params.fallbacks;
  if (params.thinking) params.thinking = { type: "adaptive" };
  return { betas: [] as string[], params: params as unknown as Params };
}

const FINISH_REASONS: Partial<Record<NonNullable<Message["stop_reason"]>, string>> = {
  tool_use: "tool_calls",
  max_tokens: "length",
  refusal: "content_filter",
};

/** Pemakaian token format OpenAI: `prompt_tokens` mencakup bagian cache (Claude melaporkannya terpisah). */
export function openAiUsage(usage: Usage) {
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const prompt = usage.input_tokens + cacheRead + cacheWrite;
  return {
    prompt_tokens: prompt,
    completion_tokens: usage.output_tokens,
    total_tokens: prompt + usage.output_tokens,
    prompt_tokens_details: { cached_tokens: cacheRead },
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: cacheWrite,
  };
}

const refusalText = (message: Message) =>
  message.stop_reason === "refusal"
    ? (message.stop_details?.explanation ?? "Permintaan ditolak filter keamanan Claude.")
    : "";

const openAiToolCalls = (blocks: BlockParam[]) =>
  blocks.flatMap((block) =>
    block.type === "tool_use"
      ? [
          {
            id: block.id,
            type: "function" as const,
            function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
          },
        ]
      : [],
  );

const finishReason = (message: Message) => (message.stop_reason && FINISH_REASONS[message.stop_reason]) || "stop";

/** Balasan lengkap (Hermes meminta non-streaming, mis. tugas pendamping). */
export function chatCompletion(message: Message, created: number) {
  const blocks = replayableBlocks(message.content);
  const tool_calls = openAiToolCalls(blocks);
  const content = textOf(blocks) || refusalText(message) || null;
  return {
    id: message.id,
    object: "chat.completion",
    created,
    model: message.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content, ...(tool_calls.length ? { tool_calls } : {}) },
        finish_reason: finishReason(message),
      },
    ],
    usage: openAiUsage(message.usage),
  };
}

/** Potongan stream format OpenAI. Pemanggilan alat dikirim di akhir: yang sebelum `fallback` tidak boleh dijalankan. */
export function chunkFactory(id: string, model: string, created: number) {
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
    finish: (message: Message) => {
      const chunks: Json[] = [];
      const refusal = refusalText(message);
      if (refusal) chunks.push(chunk({ content: refusal }));
      const calls = openAiToolCalls(replayableBlocks(message.content));
      if (calls.length) chunks.push(chunk({ tool_calls: calls.map((call, index) => ({ index, ...call })) }));
      chunks.push(chunk({}, finishReason(message)));
      chunks.push({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [],
        usage: openAiUsage(message.usage),
      });
      return chunks;
    },
  };
}

/** Jalankan satu permintaan lewat SDK (selalu streaming agar jawaban panjang tidak terkena timeout HTTP). */
export function runClaude(
  client: Anthropic,
  request: NonNullable<ReturnType<typeof claudeRequest>>,
  signal: AbortSignal,
  onConnect: () => void,
  onText: (text: string) => void,
): Promise<Message> {
  const { betas, params } = request;
  const stream = client.beta.messages.stream({ ...params, ...(betas.length ? { betas } : {}) }, { signal });
  stream.on("connect", onConnect);
  stream.on("text", onText);
  return stream.finalMessage();
}

/**
 * Cara memasang penanda prompt caching: `top` = satu penanda tingkat atas (cache otomatis Anthropic API langsung), `blocks` =
 * penanda per blok (alat terakhir, instruksi sistem, blok terakhir pesan terakhir — dipakai: dikenali semua jalur, termasuk router
 * yang memasang penanda sendiri bila belum ada), `none` = tanpa penanda. Maks. 3 penanda (batas Anthropic 4).
 */
export type CacheMode = "top" | "blocks" | "none";

export function applyCacheMode(params: Params, mode: CacheMode): Params {
  const next = { ...params } as Params & { cache_control?: unknown };
  delete next.cache_control;
  if (mode === "top") return { ...next, cache_control: { type: "ephemeral" } } as Params;
  if (mode === "none") return next;
  const mark = { type: "ephemeral" as const };
  if (next.tools?.length) {
    const tools = [...next.tools];
    tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: mark } as (typeof tools)[number];
    next.tools = tools;
  }
  if (typeof next.system === "string" && next.system) {
    next.system = [{ type: "text", text: next.system, cache_control: mark }];
  }
  const messages = [...next.messages];
  const last = messages[messages.length - 1];
  if (last && Array.isArray(last.content) && last.content.length) {
    const content = [...last.content];
    content[content.length - 1] = { ...content[content.length - 1], cache_control: mark } as (typeof content)[number];
    messages[messages.length - 1] = { ...last, content };
    next.messages = messages;
  }
  return next;
}
