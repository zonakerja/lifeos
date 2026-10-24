import { ApiError, GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { EmbeddingProvider } from "../ai-routing";
import { AI_TIMEOUT_MS, AiProviderError, kindFromStatus } from "../providers/ai-client";
import { documentEmbeddingText, EMBEDDING_DIMENSIONS, queryEmbeddingText } from "./index-text";

/**
 * Embedding indeks pengetahuan dengan Gemini atau OpenAI. Keduanya diminta 768 dimensi (kolom `ai_chunks.embedding`),
 * tetapi ruang vektornya berbeda: potongan menyimpan nama model, dan pencarian hanya membandingkan vektor dari model yang
 * sama — ganti provider ⇒ indeks dibangun ulang.
 */
export const EMBEDDING_MODELS: Record<EmbeddingProvider, string> = {
  gemini: "gemini-embedding-2",
  openai: "text-embedding-3-small",
};

/** Jumlah teks per permintaan embedding. */
const BATCH_SIZE = 50;

export interface EmbeddingDocument {
  title: string;
  content: string;
}

const checkDimensions = (vectors: number[][], expected: number, provider: string) => {
  if (vectors.length !== expected || vectors.some((v) => v.length !== EMBEDDING_DIMENSIONS)) {
    throw new AiProviderError("invalid", `Jumlah/dimensi embedding dari ${provider} tidak sesuai.`);
  }
};

/**
 * Gemini (`gemini-embedding-2`, sudah dinormalisasi): tugas ditulis di teks (`title: … | text: …` /
 * `task: search result | query: …`). Setiap teks dibungkus `Content` sendiri agar menghasilkan embedding terpisah.
 */
async function geminiEmbed(apiKey: string, texts: string[]) {
  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: AI_TIMEOUT_MS } });
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const response = await client.models.embedContent({
        model: EMBEDDING_MODELS.gemini,
        contents: batch.map((text) => ({ role: "user", parts: [{ text }] })),
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      });
      const values = (response.embeddings ?? []).map((e) => e.values ?? []);
      checkDimensions(values, batch.length, "Gemini");
      vectors.push(...values);
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (error instanceof ApiError)
        throw new AiProviderError(kindFromStatus(error.status, error.message), error.message);
      throw new AiProviderError("unavailable", error instanceof Error ? error.message : String(error));
    }
  }
  return vectors;
}

/** OpenAI (`text-embedding-3-small`, dinormalisasi) dipotong ke 768 dimensi lewat parameter `dimensions`. */
async function openaiEmbed(apiKey: string, texts: string[]) {
  const client = new OpenAI({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 1 });
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODELS.openai,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      });
      const values = [...response.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
      checkDimensions(values, batch.length, "OpenAI");
      vectors.push(...values);
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (error instanceof OpenAI.APIConnectionError) throw new AiProviderError("unavailable", error.message);
      if (error instanceof OpenAI.APIError) {
        throw new AiProviderError(kindFromStatus(error.status, error.message), error.message);
      }
      throw new AiProviderError("unavailable", error instanceof Error ? error.message : String(error));
    }
  }
  return vectors;
}

/** Teks dokumen sesuai format masing-masing provider. */
export const documentText = (provider: EmbeddingProvider, doc: EmbeddingDocument) =>
  provider === "gemini" ? documentEmbeddingText(doc.title, doc.content) : `${doc.title}\n${doc.content}`;
export const queryText = (provider: EmbeddingProvider, query: string) =>
  provider === "gemini" ? queryEmbeddingText(query) : query;

export function embedDocuments(provider: EmbeddingProvider, apiKey: string, docs: EmbeddingDocument[]) {
  const texts = docs.map((doc) => documentText(provider, doc));
  return provider === "gemini" ? geminiEmbed(apiKey, texts) : openaiEmbed(apiKey, texts);
}

export async function embedQuery(provider: EmbeddingProvider, apiKey: string, query: string) {
  const text = queryText(provider, query);
  const [vector] = provider === "gemini" ? await geminiEmbed(apiKey, [text]) : await openaiEmbed(apiKey, [text]);
  return vector;
}
