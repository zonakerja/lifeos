import type { ApiScope } from "../integrations/api-token-logic";
import { API_SCOPES } from "../integrations/api-token-logic";

/**
 * Logika murni penyiapan agen Hermes & proxy model (diuji di `agent-llm.spec.ts`).
 *
 * Hermes tidak menyimpan API key model: provider model Hermes = endpoint OpenAI-compatible LifeOS (`/api/v1/agent/llm/v1`)
 * yang meneruskan permintaan ke provider pilihan user (Pengaturan → Model AI → Pembagian tugas → Agen) dengan key
 * tersimpan. Hermes ↔ LifeOS memakai satu kunci bersama `HERMES_API_KEY` (= `API_SERVER_KEY` container) di dua arah:
 * backend → API server Hermes, dan Hermes → LifeOS (MCP + model) sebagai token akses "Agen Hermes" milik pemilik agen.
 */

/** Nama model yang dilihat Hermes; model sungguhan dipilih LifeOS dari pengaturan user. */
export const AGENT_MODEL_ID = "lifeos-agent";

/** Nama & awalan token akses agen di Pengaturan → Integrasi (dibuat tombol "Siapkan agen"). */
export const AGENT_TOKEN_NAME = "Agen Hermes (otomatis)";
export const AGENT_TOKEN_PREFIX = "hermes";

/** Cakupan bawaan token agen: semua izin (bisa dikurangi user saat menyiapkan / dicabut di Integrasi). */
export const DEFAULT_AGENT_SCOPES: ApiScope[] = [...API_SCOPES];

/** Endpoint OpenAI-compatible resmi (tanpa `/chat/completions`); Claude lewat Messages API native (`agent-claude.ts`). */
export const OPENAI_COMPAT_BASE: Record<"gemini" | "openai", string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openai: "https://api.openai.com/v1",
};

/**
 * Panjang konteks yang dilaporkan ke Hermes (dipakai Hermes untuk memutuskan kapan meringkas riwayat). Sengaja
 * konservatif: lebih kecil dari batas model = ringkasan lebih awal, tidak pernah ditolak provider.
 */
export const CONTEXT_LENGTH: Record<"gemini" | "openai" | "anthropic", number> = {
  gemini: 1_000_000,
  openai: 200_000,
  anthropic: 200_000,
};

/** Respons `GET /models` untuk Hermes: satu model `lifeos-agent`. */
export function modelsResponse(provider: keyof typeof CONTEXT_LENGTH | null, model: string | null) {
  return {
    object: "list",
    data: [
      {
        id: AGENT_MODEL_ID,
        object: "model",
        created: 0,
        owned_by: "lifeos",
        context_length: provider ? CONTEXT_LENGTH[provider] : 128_000,
        ...(model ? { upstream_model: model } : {}),
      },
    ],
  };
}

/** Kunci yang tidak diteruskan ke provider (khusus OpenAI / tidak dikenal endpoint kompatibel Gemini). */
const DROPPED_KEYS = ["store", "metadata", "service_tier", "prompt_cache_key", "safety_identifier", "user"];

/**
 * Body `chat/completions` dari Hermes → body untuk provider: model diganti model user, kunci khusus OpenAI dibuang untuk
 * provider lain (termasuk router). Null bila bentuknya bukan permintaan chat (tanpa `messages`).
 */
export function prepareChatBody(body: unknown, provider: keyof typeof OPENAI_COMPAT_BASE | "router", model: string) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.messages) || input.messages.length === 0) return null;
  const out: Record<string, unknown> = { ...input, model };
  if (provider !== "openai") for (const key of DROPPED_KEYS) delete out[key];
  return out;
}

/** Ringkasan error provider untuk log & status (tanpa isi permintaan). */
export function upstreamErrorSummary(status: number, text: string) {
  let message = text;
  try {
    const parsed = JSON.parse(text) as unknown;
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    const error = (first as { error?: { message?: unknown } | string })?.error;
    if (typeof error === "string") message = error;
    else if (error && typeof error.message === "string") message = error.message;
  } catch {
    // bukan JSON → teks apa adanya
  }
  return `${status}: ${message.replace(/\s+/g, " ").trim().slice(0, 300) || "tanpa keterangan"}`;
}

/**
 * Status error model agen yang boleh dialihkan ke provider cadangan: kuota/limit (429), saldo habis (402), waktu habis
 * (408), dan provider bermasalah / sibuk (5xx, 529). Key ditolak (401/403), model tidak ada (404), dan permintaan tidak
 * valid (400/422) tidak dialihkan — itu konfigurasi yang harus diperbaiki user.
 */
export const isFallbackStatus = (status: number) => status === 429 || status === 402 || status === 408 || status >= 500;
