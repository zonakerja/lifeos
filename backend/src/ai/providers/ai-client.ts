import { AttachmentKind } from "../ai-providers";

/** Batas waktu satu panggilan ke provider (model dengan reasoning bisa butuh beberapa menit). */
export const AI_TIMEOUT_MS = 180_000;
/** Batas token output per jawaban. */
export const AI_MAX_OUTPUT_TOKENS = 16_000;

export interface AiAttachment {
  kind: AttachmentKind;
  mimeType: string;
  name: string;
  data: Buffer;
}

export interface AiGenerateInput {
  apiKey: string;
  model: string;
  prompt: string;
  attachments: AiAttachment[];
}

/** Satu fungsi per provider: kirim prompt + lampiran, kembalikan teks jawaban. */
export type AiClient = (input: AiGenerateInput) => Promise<string>;

/** `credential` = key tersimpan tidak bisa didekripsi (kunci enkripsi server berubah). */
export type AiErrorKind = "auth" | "quota" | "model" | "refusal" | "invalid" | "unavailable" | "credential";

/** Error dari provider yang sudah diklasifikasikan; diterjemahkan ke HTTP oleh AiService. */
export class AiProviderError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    readonly providerMessage: string,
  ) {
    super(providerMessage);
    this.name = "AiProviderError";
  }
}

/** Klasifikasi umum berdasarkan status HTTP provider. */
export function kindFromStatus(status: number | undefined, message = ""): AiErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "model";
  if (status === 429) return "quota";
  if (status === 402) return "quota";
  if (status !== undefined && status >= 400 && status < 500) {
    return /api[ _-]?key/i.test(message) ? "auth" : "invalid";
  }
  return "unavailable";
}

/** Lampiran teks dikirim sebagai teks biasa (semua provider mendukung). */
export const textAttachmentBlock = (attachment: AiAttachment) =>
  `--- LAMPIRAN: ${attachment.name} ---\n${attachment.data.toString("utf8")}`;
