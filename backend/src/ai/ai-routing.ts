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
 * Error yang boleh dialihkan ke provider cadangan: kuota/limit habis, provider tidak terjangkau, atau key tersimpan
 * tidak bisa dibaca. Key ditolak, model tidak tersedia, permintaan tidak valid, dan penolakan filter keamanan tidak
 * dialihkan — itu masalah konfigurasi/isi yang harus terlihat oleh user.
 */
export const isFallbackError = (kind: AiErrorKind) =>
  kind === "quota" || kind === "unavailable" || kind === "credential";
