import Anthropic from "@anthropic-ai/sdk";
import {
  AI_MAX_OUTPUT_TOKENS,
  AI_TIMEOUT_MS,
  type AiClient,
  AiProviderError,
  kindFromStatus,
  textAttachmentBlock,
} from "./ai-client";
import { anthropicBaseUrl, canonicalClaudeModel } from "../ai-endpoint";

/** Model yang mendukung `output_config.effort` (Haiku 4.5 & model lebih lama menolaknya). */
export const EFFORT_MODELS = /^claude-(opus-5|sonnet-5-5|haiku-5-5|fable-5)/;
/** Model yang menerima `fallbacks: "default"` (dijalankan ulang di model lain bila ditolak filter keamanan). */
export const FALLBACK_MODELS = /^claude-(opus-5|sonnet-5-5|fable-5)/;
/** Uji kemampuan model dengan nama yang dinormalkan (router bisa memakai `claude-opus-5.5` / `anthropic/…`). */
export const modelMatches = (pattern: RegExp, model: string) => pattern.test(canonicalClaudeModel(model));

/** Router menolak fitur beta → permintaan diulang sekali tanpa fitur itu (status 400 dengan pesan beta/fallbacks/…). */
export const isUnsupportedFeatureError = (error: unknown) =>
  error instanceof Anthropic.APIError &&
  error.status === 400 &&
  /beta|fallback|output_config|effort|block_binding|thinking|unknown|unsupported|not supported|extra/i.test(
    error.message,
  );

type ContentBlock = Anthropic.Beta.Messages.BetaContentBlockParam;

/** Anthropic Claude lewat Messages API (streaming agar jawaban panjang tidak terkena timeout HTTP). */
export const anthropicClient: AiClient = async ({ apiKey, model, prompt, attachments, endpoint }) => {
  const client = new Anthropic({
    apiKey,
    timeout: AI_TIMEOUT_MS,
    maxRetries: 1,
    ...(endpoint ? { baseURL: anthropicBaseUrl(endpoint.baseUrl) } : {}),
  });

  // Dokumen & gambar diletakkan sebelum instruksi teks
  const content: ContentBlock[] = [];
  for (const attachment of attachments) {
    const data = attachment.data.toString("base64");
    if (attachment.kind === "pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
    } else if (attachment.kind === "image") {
      const mediaType = attachment.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp";
      content.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
    } else if (attachment.kind === "text") {
      content.push({ type: "text", text: textAttachmentBlock(attachment) });
    }
  }
  content.push({ type: "text", text: prompt });

  try {
    const send = (full: boolean) =>
      client.beta.messages
        .stream({
          model,
          max_tokens: AI_MAX_OUTPUT_TOKENS,
          messages: [{ role: "user", content }],
          ...(full && modelMatches(EFFORT_MODELS, model) ? { output_config: { effort: "medium" as const } } : {}),
          ...(full && modelMatches(FALLBACK_MODELS, model)
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {}),
        })
        .finalMessage();
    let message: Awaited<ReturnType<typeof send>>;
    try {
      message = await send(true);
    } catch (error) {
      // Lewat router: fitur khusus API Anthropic bisa belum didukung → ulangi dengan permintaan dasar
      if (!endpoint || !isUnsupportedFeatureError(error)) throw error;
      message = await send(false);
    }

    if (message.stop_reason === "refusal") {
      throw new AiProviderError(
        "refusal",
        message.stop_details?.explanation ?? "Permintaan ditolak filter keamanan Claude.",
      );
    }
    const text = message.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    if (!text) throw new AiProviderError("invalid", "Claude tidak memberikan jawaban.");
    return text;
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error instanceof Anthropic.APIConnectionError) throw new AiProviderError("unavailable", error.message);
    if (error instanceof Anthropic.APIError) {
      // Saldo kredit habis dikembalikan sebagai 400 invalid_request_error
      const kind = /credit balance/i.test(error.message) ? "quota" : kindFromStatus(error.status, error.message);
      throw new AiProviderError(kind, error.message);
    }
    throw new AiProviderError("unavailable", error instanceof Error ? error.message : String(error));
  }
};
