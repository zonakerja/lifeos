import { ApiError, GoogleGenAI } from "@google/genai";
import { AI_TIMEOUT_MS, AiProviderError, kindFromStatus } from "../providers/ai-client";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./index-text";

/** Jumlah teks per permintaan embedding. */
const BATCH_SIZE = 50;

/**
 * Embedding teks dengan `gemini-embedding-2` (768 dimensi, sudah dinormalisasi oleh Gemini). Setiap teks dibungkus
 * `Content` sendiri agar menghasilkan embedding terpisah (beberapa part dalam satu Content digabung jadi satu).
 */
export async function embedTexts(apiKey: string, texts: string[]): Promise<number[][]> {
  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: AI_TIMEOUT_MS } });
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const response = await client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: batch.map((text) => ({ role: "user", parts: [{ text }] })),
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      });
      const values = (response.embeddings ?? []).map((e) => e.values ?? []);
      if (values.length !== batch.length || values.some((v) => v.length !== EMBEDDING_DIMENSIONS)) {
        throw new AiProviderError("invalid", "Jumlah/dimensi embedding dari Gemini tidak sesuai.");
      }
      vectors.push(...values);
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (error instanceof ApiError) {
        throw new AiProviderError(kindFromStatus(error.status, error.message), error.message);
      }
      throw new AiProviderError("unavailable", error instanceof Error ? error.message : String(error));
    }
  }
  return vectors;
}
