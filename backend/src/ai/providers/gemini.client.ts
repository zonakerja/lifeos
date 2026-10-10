import { ApiError, FinishReason, GoogleGenAI, type Part } from "@google/genai";
import {
  AI_MAX_OUTPUT_TOKENS,
  AI_TIMEOUT_MS,
  type AiClient,
  AiProviderError,
  kindFromStatus,
  textAttachmentBlock,
} from "./ai-client";

const BLOCKED: ReadonlySet<FinishReason | undefined> = new Set([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.RECITATION,
]);

/**
 * Google Gemini lewat endpoint generateContent (stateless: tidak ada percakapan yang disimpan di server Google,
 * berbeda dengan Interactions API yang menyimpan interaksi secara default).
 */
export const geminiClient: AiClient = async ({ apiKey, model, prompt, attachments }) => {
  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: AI_TIMEOUT_MS } });
  const parts: Part[] = [{ text: prompt }];
  for (const attachment of attachments) {
    parts.push(
      attachment.kind === "text"
        ? { text: textAttachmentBlock(attachment) }
        : { inlineData: { mimeType: attachment.mimeType, data: attachment.data.toString("base64") } },
    );
  }

  try {
    const response = await client.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: { maxOutputTokens: AI_MAX_OUTPUT_TOKENS },
    });
    const text = response.text?.trim();
    if (text) return text;

    const blocked = response.promptFeedback?.blockReason ?? BLOCKED.has(response.candidates?.[0]?.finishReason);
    throw new AiProviderError(
      blocked ? "refusal" : "invalid",
      blocked ? "Permintaan ditolak filter keamanan Gemini." : "Gemini tidak memberikan jawaban.",
    );
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error instanceof ApiError)
      throw new AiProviderError(kindFromStatus(error.status, error.message), error.message);
    throw new AiProviderError("unavailable", error instanceof Error ? error.message : String(error));
  }
};
