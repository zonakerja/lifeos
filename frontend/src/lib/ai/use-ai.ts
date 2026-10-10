import { useCallback } from "react";
import { callGemini, fileToGenerativePart } from "@/lib/ai/gemini";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Titik masuk tunggal fitur AI di frontend. Komponen tidak boleh memanggil provider
 * secara langsung — cukup `const ai = useAi(); await ai.generate(prompt, files)`.
 * Rencana: implementasi ini diganti ke endpoint AI backend.
 */
export function useAi() {
  const apiKey = useAuthStore((s) => s.user?.apiKey ?? "");

  const generate = useCallback(
    async (prompt: string, files: Blob[] = []) => {
      const parts = await Promise.all(files.map(fileToGenerativePart));
      return callGemini(apiKey, prompt, parts);
    },
    [apiKey],
  );

  return { isConfigured: !!apiKey, generate };
}
