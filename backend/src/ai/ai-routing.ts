import { AiProvider } from "../generated/prisma/client";
import { AI_PROVIDER_IDS, AI_PROVIDERS, type AttachmentKind } from "./ai-providers";
import type { AiErrorKind } from "./providers/ai-client";

/**
 * Urutan provider yang dicoba untuk satu permintaan: provider aktif lebih dulu, lalu (bila cadangan otomatis menyala)
 * provider lain yang punya key sesuai urutan katalog. Provider yang tidak mendukung semua jenis lampiran dilewati.
 */
export function providerCandidates(
  active: AiProvider,
  configured: readonly AiProvider[],
  kinds: readonly AttachmentKind[],
  fallbackEnabled: boolean,
): AiProvider[] {
  const order = fallbackEnabled
    ? [active, ...AI_PROVIDER_IDS.filter((id) => id !== active && configured.includes(id))]
    : [active];
  return order.filter((id) => kinds.every((kind) => AI_PROVIDERS[id].supports[kind]));
}

/**
 * Pembagian tugas AI per user (`users.ai_routing`): provider untuk chat (asisten LifeOS & My Notebook), fitur AI umum
 * (ringkasan, Notes AI, ikon, AI di editor dokumen), model agen Hermes (lewat proxy `agent/llm`), OCR (gambar & PDF hasil
 * scan), dan embedding indeks pengetahuan.
 * Kosong = ikuti provider aktif (chat/umum) atau urutan bawaan (OCR, embedding).
 */
export type AiTask = "chat" | "general" | "agent" | "ocr";
export const AI_TASKS: readonly AiTask[] = ["chat", "general", "agent", "ocr"];

/** Provider embedding yang didukung (keduanya menghasilkan vektor 768 dimensi, kolom `ai_chunks.embedding`). */
export type EmbeddingProvider = "gemini" | "openai";
export const EMBEDDING_PROVIDERS: readonly EmbeddingProvider[] = ["gemini", "openai"];

export interface AiRouting {
  chat?: AiProvider | null;
  general?: AiProvider | null;
  agent?: AiProvider | null;
  ocr?: AiProvider | null;
  embedding?: EmbeddingProvider | null;
}

/** Baca kolom jsonb `ai_routing` dengan aman (nilai asing dibuang). */
export function parseRouting(value: unknown): AiRouting {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const routing: AiRouting = {};
  for (const task of AI_TASKS) {
    const v = raw[task];
    if (typeof v === "string" && (AI_PROVIDER_IDS as readonly string[]).includes(v)) routing[task] = v as AiProvider;
  }
  if (typeof raw.embedding === "string" && (EMBEDDING_PROVIDERS as readonly string[]).includes(raw.embedding)) {
    routing.embedding = raw.embedding as EmbeddingProvider;
  }
  return routing;
}

/** Provider utama untuk tugas chat/umum/agen: pilihan tugas bila key-nya ada, selain itu provider aktif. */
export function taskProvider(
  routing: AiRouting,
  task: Exclude<AiTask, "ocr">,
  active: AiProvider | null,
  configured: readonly AiProvider[],
): AiProvider | null {
  const chosen = routing[task];
  return chosen && configured.includes(chosen) ? chosen : active;
}

/** Urutan provider OCR: pilihan user, lalu Gemini → OpenAI → Claude; hanya yang punya key & mendukung jenis berkas. */
export function ocrCandidates(routing: AiRouting, configured: readonly AiProvider[], kind: AttachmentKind) {
  const order = [routing.ocr, AiProvider.gemini, AiProvider.openai, AiProvider.anthropic].filter(
    (p): p is AiProvider => !!p,
  );
  return [...new Set(order)].filter((p) => configured.includes(p) && AI_PROVIDERS[p].supports[kind]);
}

/** Provider embedding: pilihan user bila key-nya ada, selain itu Gemini lalu OpenAI; null = pencarian kata saja. */
export function embeddingProvider(routing: AiRouting, configured: readonly AiProvider[]): EmbeddingProvider | null {
  const order = [routing.embedding, "gemini", "openai"] as (EmbeddingProvider | null | undefined)[];
  return order.find((p): p is EmbeddingProvider => !!p && configured.includes(p as AiProvider)) ?? null;
}

/**
 * Error yang boleh dialihkan ke provider cadangan: kuota/limit habis, provider tidak terjangkau, atau key tersimpan
 * tidak bisa dibaca. Key ditolak, model tidak tersedia, permintaan tidak valid, dan penolakan filter keamanan tidak
 * dialihkan — itu masalah konfigurasi/isi yang harus terlihat oleh user.
 */
export const isFallbackError = (kind: AiErrorKind) =>
  kind === "quota" || kind === "unavailable" || kind === "credential";
