import { AiProvider } from "../generated/prisma/client";

/** Jenis lampiran yang dikirim ke model AI. */
export type AttachmentKind = "image" | "pdf" | "audio" | "text";

export interface AiProviderInfo {
  id: AiProvider;
  label: string;
  /** Dipakai bila user tidak memilih model. */
  defaultModel: string;
  /** Saran di Pengaturan; user tetap boleh mengetik model lain (mis. model baru dari provider). */
  suggestedModels: string[];
  supports: Record<AttachmentKind, boolean>;
  /** Tempat user membuat API key. */
  keyUrl: string;
}

/**
 * Katalog provider AI. Model hanya default — bila provider menghentikan sebuah model, user cukup menggantinya di
 * Pengaturan → AI tanpa menunggu rilis aplikasi. Perbarui default di sini saat ada generasi model baru.
 */
export const AI_PROVIDERS: Record<AiProvider, AiProviderInfo> = {
  gemini: {
    id: AiProvider.gemini,
    label: "Google Gemini",
    defaultModel: "gemini-3.8-flash",
    // Pro saat ini hanya versi preview (bisa berubah/dihentikan Google); 2.5 tidak tersedia untuk pengguna baru
    suggestedModels: ["gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-3.5-flash-lite"],
    supports: { image: true, pdf: true, audio: true, text: true },
    keyUrl: "https://aistudio.google.com/apikey",
  },
  anthropic: {
    id: AiProvider.anthropic,
    label: "Anthropic Claude",
    defaultModel: "claude-opus-5-5",
    suggestedModels: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
    supports: { image: true, pdf: true, audio: false, text: true },
    keyUrl: "https://platform.claude.com/settings/keys",
  },
  openai: {
    id: AiProvider.openai,
    label: "OpenAI",
    defaultModel: "gpt-6.1-sol",
    suggestedModels: ["gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna"],
    supports: { image: true, pdf: true, audio: false, text: true },
    keyUrl: "https://platform.openai.com/api-keys",
  },
};

export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS) as AiProvider[];

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const TEXT_TYPES = new Set(["application/json", "application/xml", "application/yaml"]);

/** Jenis lampiran dari MIME type (tanpa parameter seperti `;codecs=opus`), atau null bila tidak didukung. */
export function attachmentKind(mimeType: string): AttachmentKind | null {
  const type = mimeType.split(";")[0].trim().toLowerCase();
  if (IMAGE_TYPES.has(type)) return "image";
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("text/") || TEXT_TYPES.has(type)) return "text";
  return null;
}
