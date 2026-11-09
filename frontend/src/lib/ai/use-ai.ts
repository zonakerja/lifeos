import { useCallback } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { aiApi } from "@/lib/api/endpoints";
import { useAuthStore } from "@/stores/auth-store";

/** Pesan standar bila user belum memilih provider AI. */
export const AI_NOT_CONFIGURED = "AI belum diatur. Pilih provider dan simpan API key di Pengaturan → Model AI.";

const TRANSCRIBE_POLL_MS = 5_000;
/** Gangguan jaringan / backend restart sesaat tidak langsung dianggap gagal (± 1 menit). */
const TRANSCRIBE_MAX_BLIPS = 12;

/** Mulai transkrip lalu pantau sampai selesai. `isActive` false = berhenti memantau, pekerjaan di server tetap jalan. */
async function waitForTranscript(uploadId: string, isActive: () => boolean) {
  let job = await aiApi.startTranscribe(uploadId);
  let blips = 0;
  while (job.status === "running") {
    await new Promise((resolve) => setTimeout(resolve, TRANSCRIBE_POLL_MS));
    if (!isActive()) return null;
    try {
      job = await aiApi.transcribeStatus(uploadId);
      blips = 0;
    } catch (error) {
      if ((error instanceof ApiError && error.status < 500) || ++blips >= TRANSCRIBE_MAX_BLIPS) throw error;
    }
  }
  if (job.status === "failed") throw new ApiError(job.httpStatus, job.message);
  return job.result;
}

/**
 * Titik masuk tunggal fitur AI di frontend. Komponen tidak boleh memanggil provider secara langsung — cukup
 * `const ai = useAi(); await ai.generate(prompt, files)`. Permintaan diproses backend (`POST /ai/generate`) memakai
 * provider, model, dan API key terenkripsi milik user; browser tidak pernah memegang API key. Bila backend memakai
 * provider cadangan (kuota habis, provider tidak terjangkau, lampiran tak didukung), user diberi tahu lewat toast.
 */
export function useAi() {
  const provider = useAuthStore((s) => s.user?.aiProvider ?? null);

  const generate = useCallback(async (prompt: string, files: Blob[] = []) => {
    const result = await aiApi.generate(prompt, files);
    if (result.fallback) toast.info("Provider AI cadangan dipakai", { description: result.fallback.message });
    return result.text;
  }, []);

  /** Transkrip audio yang sudah diunggah (tanpa batas 20 MB lampiran `generate`). */
  const transcribe = useCallback(
    (uploadId: string, isActive: () => boolean = () => true) => waitForTranscript(uploadId, isActive),
    [],
  );

  return { isConfigured: !!provider, provider, generate, transcribe };
}
