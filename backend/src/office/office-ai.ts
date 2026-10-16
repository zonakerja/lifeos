/**
 * AI di editor ONLYOFFICE lewat AI LifeOS — logika murni (diuji `office-ai.spec.ts`).
 * ----------------------------------------------------------------------------
 * Tab **AI** plugin resmi ONLYOFFICE dijalankan dalam mode "pengaturan dari server": jembatan kecil di image ONLYOFFICE
 * (`infra/onlyoffice/lifeos-ai-bridge.js`) membaca opsi plugin dari config editor bertanda tangan (token sesi AI + alamat
 * backend) lalu mendaftarkan satu provider "AI LifeOS". Semua permintaan plugin (format OpenAI Chat Completions)
 * dibungkus plugin menjadi `{ target, method, headers, data }` dan dikirim ke `POST /office/ai/proxy`; backend
 * menerjemahkannya ke `AiService.generate` dengan provider & API key milik user (Pengaturan → AI). Key tidak pernah ke
 * browser dan tidak ada pengaturan AI terpisah di editor. Detail: docs/ONLYOFFICE.md §3.4.
 */

/** GUID plugin AI resmi ONLYOFFICE (opsi `editorConfig.plugins.options` ditujukan ke GUID ini). */
export const ONLYOFFICE_AI_PLUGIN_GUID = "asc.{9DC93CDB-B576-4F0C-B55E-FCC9C48DD007}";
/** Id model yang terlihat di plugin; jawaban selalu dari provider aktif user. */
export const OFFICE_AI_MODEL_ID = "lifeos";
/** Batas isi permintaan (± 100 halaman teks) — mencegah prompt raksasa ke provider. */
export const OFFICE_AI_MAX_PROMPT = 400_000;
/** Batas gambar per permintaan (aksi OCR / Vision). */
export const OFFICE_AI_MAX_IMAGES = 4;

/** Opsi plugin AI resmi yang dibaca jembatan LifeOS (`info.options.lifeos`). */
export function officeAiPluginOptions(input: { appOrigin: string; token: string; modelName: string }) {
  const api = `${input.appOrigin.replace(/\/+$/, "")}/api/v1/office/ai`;
  return {
    lifeos: {
      token: input.token,
      // Plugin mengirim semua permintaan (non-GET) ke alamat proxy ini
      proxy: `${api}/proxy`,
      // Alamat provider (target permintaan); backend hanya melihat akhir path-nya
      url: `${api}/openai`,
      modelId: OFFICE_AI_MODEL_ID,
      modelName: input.modelName,
    },
  };
}

export type OfficeAiTarget = "chat" | "models" | "unsupported";

/** Jenis permintaan dari URL target plugin. */
export function officeAiTarget(target: unknown): OfficeAiTarget {
  if (typeof target !== "string") return "unsupported";
  let path: string;
  try {
    path = new URL(target).pathname;
  } catch {
    return "unsupported";
  }
  if (/\/chat\/completions\/?$/.test(path)) return "chat";
  if (/\/models\/?$/.test(path)) return "models";
  return "unsupported";
}

/** Token sesi AI dari header permintaan plugin (`Authorization: Bearer <token>`, kunci huruf apa pun). */
export function bearerFromHeaders(headers: unknown): string | null {
  if (!headers || typeof headers !== "object") return null;
  for (const [name, value] of Object.entries(headers as Record<string, unknown>)) {
    if (name.toLowerCase() === "authorization" && typeof value === "string") {
      const match = /^Bearer\s+(.+)$/i.exec(value.trim());
      return match ? match[1] : null;
    }
  }
  return null;
}

export interface OfficeAiImage {
  mimeType: string;
  data: Buffer;
}

type ContentPart = { type?: string; text?: string; image_url?: string | { url?: string } };
type ChatMessage = { role?: string; content?: string | ContentPart[] | null };

const ROLE_LABEL: Record<string, string> = { user: "Pengguna", assistant: "Asisten", tool: "Hasil alat" };

function decodeDataUrl(url: string): OfficeAiImage | null {
  const match = /^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/s.exec(url);
  return match ? { mimeType: match[1].toLowerCase(), data: Buffer.from(match[2], "base64") } : null;
}

/**
 * Pesan Chat Completions → satu prompt teks + gambar. Pesan `system` menjadi instruksi di awal; satu pesan user dikirim
 * apa adanya, percakapan bertingkat ditulis berlabel. Gambar data URL (aksi OCR/Vision) dijadikan lampiran.
 */
export function chatToPrompt(messages: unknown): { prompt: string; images: OfficeAiImage[] } {
  const list = (Array.isArray(messages) ? messages : []) as ChatMessage[];
  const images: OfficeAiImage[] = [];
  const textOf = (content: ChatMessage["content"]) => {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    const parts: string[] = [];
    for (const part of content) {
      if (part?.type === "text" && typeof part.text === "string") parts.push(part.text);
      const url = typeof part?.image_url === "string" ? part.image_url : part?.image_url?.url;
      if (url) {
        const image = decodeDataUrl(url);
        if (image) images.push(image);
      }
    }
    return parts.join("\n");
  };

  const system = list
    .filter((m) => m.role === "system" || m.role === "developer")
    .map((m) => textOf(m.content).trim())
    .filter(Boolean);
  const turns = list
    .filter((m) => m.role !== "system" && m.role !== "developer")
    .map((m) => ({ role: m.role ?? "user", text: textOf(m.content).trim() }))
    .filter((m) => m.text);

  const body =
    turns.length === 1 && turns[0].role === "user"
      ? turns[0].text
      : turns.map((m) => `${ROLE_LABEL[m.role] ?? m.role}:\n${m.text}`).join("\n\n");
  const prompt = [system.length ? `Instruksi:\n${system.join("\n\n")}` : "", body].filter(Boolean).join("\n\n");
  return { prompt, images };
}

/** Jawaban format OpenAI (non-streaming). */
export function chatCompletion(text: string, model: string) {
  return {
    id: `chatcmpl-lifeos-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
  };
}

/** Jawaban format OpenAI streaming (SSE): satu potongan berisi seluruh teks + penutup. */
export function chatCompletionStream(text: string, model: string) {
  const base = {
    id: `chatcmpl-lifeos-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
  };
  const chunks = [
    { ...base, choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] },
    { ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
  ];
  return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
}

/** Daftar model format OpenAI (`GET /models`). */
export function modelList(modelName: string) {
  return {
    object: "list",
    data: [{ id: OFFICE_AI_MODEL_ID, object: "model", created: 0, owned_by: "lifeos", name: modelName }],
  };
}

/** Error format OpenAI — plugin menampilkan `error.message`. */
export const openAiError = (message: string) => ({ error: { message, type: "lifeos_error" } });
