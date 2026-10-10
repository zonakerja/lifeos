import OpenAI from "openai";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import {
  AI_MAX_OUTPUT_TOKENS,
  AI_TIMEOUT_MS,
  type AiClient,
  AiProviderError,
  kindFromStatus,
  textAttachmentBlock,
} from "./ai-client";

/** OpenAI lewat Responses API; `store: false` agar percakapan tidak disimpan di server OpenAI. */
export const openaiClient: AiClient = async ({ apiKey, model, prompt, attachments }) => {
  const client = new OpenAI({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 1 });

  const content: ResponseInputContent[] = [];
  for (const attachment of attachments) {
    const dataUrl = `data:${attachment.mimeType};base64,${attachment.data.toString("base64")}`;
    if (attachment.kind === "pdf") {
      content.push({ type: "input_file", filename: attachment.name, file_data: dataUrl });
    } else if (attachment.kind === "image") {
      content.push({ type: "input_image", image_url: dataUrl, detail: "auto" });
    } else if (attachment.kind === "text") {
      content.push({ type: "input_text", text: textAttachmentBlock(attachment) });
    }
  }
  content.push({ type: "input_text", text: prompt });

  try {
    const response = await client.responses.create({
      model,
      input: [{ role: "user", content }],
      max_output_tokens: AI_MAX_OUTPUT_TOKENS,
      store: false,
    });
    const text = response.output_text.trim();
    if (!text) throw new AiProviderError("invalid", "OpenAI tidak memberikan jawaban.");
    return text;
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error instanceof OpenAI.APIConnectionError) throw new AiProviderError("unavailable", error.message);
    if (error instanceof OpenAI.APIError)
      throw new AiProviderError(kindFromStatus(error.status, error.message), error.message);
    throw new AiProviderError("unavailable", error instanceof Error ? error.message : String(error));
  }
};
