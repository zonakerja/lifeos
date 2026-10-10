import Anthropic from "@anthropic-ai/sdk";
import {
  AI_MAX_OUTPUT_TOKENS,
  AI_TIMEOUT_MS,
  type AiClient,
  AiProviderError,
  kindFromStatus,
  textAttachmentBlock,
} from "./ai-client";

/** Model yang mendukung `output_config.effort` (Haiku 4.5 & model lebih lama menolaknya). */
const EFFORT_MODELS = /^claude-(opus-5|sonnet-5-5|haiku-5-5|fable-5)/;
/** Model yang menerima `fallbacks: "default"` (dijalankan ulang di model lain bila ditolak filter keamanan). */
const FALLBACK_MODELS = /^claude-(opus-5|sonnet-5-5|fable-5)/;

type ContentBlock = Anthropic.Beta.Messages.BetaContentBlockParam;

/** Anthropic Claude lewat Messages API (streaming agar jawaban panjang tidak terkena timeout HTTP). */
export const anthropicClient: AiClient = async ({ apiKey, model, prompt, attachments }) => {
  const client = new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 1 });

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
    const message = await client.beta.messages
      .stream({
        model,
        max_tokens: AI_MAX_OUTPUT_TOKENS,
        messages: [{ role: "user", content }],
        ...(EFFORT_MODELS.test(model) ? { output_config: { effort: "medium" as const } } : {}),
        ...(FALLBACK_MODELS.test(model)
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      })
      .finalMessage();

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
