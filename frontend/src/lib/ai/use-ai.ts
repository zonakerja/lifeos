import { useCallback } from "react";
import { toast } from "sonner";
import { aiApi } from "@/lib/api/endpoints";
import { useAuthStore } from "@/stores/auth-store";

/** Pesan standar bila user belum memilih provider AI. */
export const AI_NOT_CONFIGURED = "AI belum diatur. Pilih provider dan simpan API key di Pengaturan → AI.";

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

  return { isConfigured: !!provider, provider, generate };
}
