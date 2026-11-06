import OpenAI from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import {
  AI_MAX_OUTPUT_TOKENS,
  AI_TIMEOUT_MS,
  type AiClient,
  AiProviderError,
  kindFromStatus,
  textAttachmentBlock,
} from "./ai-client";

/**
 * Router / endpoint OpenAI-compatible (`POST {baseUrl}/chat/completions`) — dipakai semua provider yang diatur "lewat
 * router". Chat Completions dipilih (bukan Responses API) karena itu format yang didukung hampir semua router.
 */
export const openaiCompatibleClient: AiClient = async ({ apiKey, model, prompt, attachments, endpoint }) => {
  if (!endpoint) throw new AiProviderError("invalid", "Alamat API router belum diatur.");
  const client = new OpenAI({ apiKey, baseURL: endpoint.baseUrl, timeout: AI_TIMEOUT_MS, maxRetries: 1 });

  const content: ChatCompletionContentPart[] = [];
  for (const attachment of attachments) {
    const dataUrl = `data:${attachment.mimeType};base64,${attachment.data.toString("base64")}`;
    if (attachment.kind === "image") {
      content.push({ type: "image_url", image_url: { url: dataUrl } });
    } else if (attachment.kind === "pdf") {
      content.push({ type: "file", file: { filename: attachment.name, file_data: dataUrl } });
    } else if (attachment.kind === "text") {
      content.push({ type: "text", text: textAttachmentBlock(attachment) });
    }
  }
  content.push({ type: "text", text: prompt });

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content }],
      max_tokens: AI_MAX_OUTPUT_TOKENS,
    });
    const choice = response.choices?.[0];
    const text = (typeof choice?.message?.content === "string" ? choice.message.content : "").trim();
    if (choice?.finish_reason === "content_filter" && !text) {
      throw new AiProviderError("refusal", "Permintaan ditolak filter keamanan model.");
    }
    if (!text) throw new AiProviderError("invalid", "Router tidak memberikan jawaban.");
    return text;
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error instanceof OpenAI.APIConnectionError) throw new AiProviderError("unavailable", error.message);
    if (error instanceof OpenAI.APIError) {
      // Banyak router memakai 402 / pesan "insufficient balance" untuk saldo habis
      const kind = /insufficient|balance|saldo|credit/i.test(error.message)
        ? "quota"
        : kindFromStatus(error.status, error.message);
      throw new AiProviderError(kind, error.message);
    }
    throw new AiProviderError("unavailable", error instanceof Error ? error.message : String(error));
  }
};
