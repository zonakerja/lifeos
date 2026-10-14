import { uploadsApi } from "@/lib/api/endpoints";
import type { AssetExtractionInfo } from "@/types/api";
import { EXTRACT_PROMPT } from "./notes-logic";

const POLL_MS = 1500;
const TIMEOUT_MS = 120_000;

/** Format yang bisa dibaca langsung oleh model AI (cadangan bila ekstraksi server tidak menghasilkan teks). */
export const AI_READABLE = (mime: string) =>
  mime === "application/pdf" || mime.startsWith("image/") || mime.startsWith("text/");

/** Tipe berkas yang diterima input dokumen Notes AI (dibaca server: teks, PDF, DOCX, XLSX; gambar lewat OCR). */
export const DOCUMENT_ACCEPT = ".pdf,.txt,.md,.csv,.json,.docx,.xlsx,image/*";

const REASON_MESSAGES: Record<string, string> = {
  too_large: "Berkas lebih dari 20 MB tidak bisa dibaca.",
  unsupported_type: "Format berkas ini tidak bisa dibaca. Gunakan PDF, DOCX, XLSX, teks, atau gambar.",
  needs_gemini_key: "Gambar / PDF hasil scan perlu dibaca AI. Atur AI di Pengaturan → AI.",
  empty: "Tidak ada teks yang terbaca dari berkas ini.",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Tunggu ekstraksi teks backend selesai. null = belum selesai sampai batas waktu atau dibatalkan. */
export async function waitForExtraction(
  assetId: string,
  isCancelled: () => boolean,
): Promise<AssetExtractionInfo | null> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline && !isCancelled()) {
    const { extraction } = await uploadsApi.metadata(assetId);
    if (extraction && extraction.status !== "pending" && extraction.status !== "extracting") return extraction;
    await sleep(POLL_MS);
  }
  return null;
}

export class CancelledError extends Error {}

/**
 * Teks isi dokumen yang sudah diunggah. Utamakan ekstraksi di backend (gratis, tanpa kuota AI, mendukung DOCX/XLSX);
 * bila tidak menghasilkan teks dan formatnya bisa dibaca model, minta AI user menyalin isinya.
 */
export async function readFileText({
  assetId,
  file,
  canUseAi,
  generate,
  isCancelled,
}: {
  assetId: string;
  file: File;
  canUseAi: boolean;
  generate: (prompt: string, files: Blob[]) => Promise<string>;
  isCancelled: () => boolean;
}): Promise<{ text: string; via: "server" | "ai" }> {
  const extraction = await waitForExtraction(assetId, isCancelled);
  if (isCancelled()) throw new CancelledError();
  const text = extraction?.status === "completed" ? extraction.extractedText?.trim() : "";
  if (text) return { text, via: "server" };

  const reason = extraction?.metadata?.reason;
  if (canUseAi && AI_READABLE(file.type) && reason !== "too_large") {
    return { text: await generate(EXTRACT_PROMPT, [file]), via: "ai" };
  }
  throw new Error(
    (reason && REASON_MESSAGES[reason]) ||
      extraction?.error ||
      (extraction ? REASON_MESSAGES.empty : "Berkas belum selesai dibaca server. Coba unggah ulang nanti."),
  );
}
