import { useState } from "react";
import { toast } from "sonner";
import { AI_NOT_CONFIGURED, useAi } from "@/lib/ai/use-ai";
import { ApiError, errorMessage } from "@/lib/api/client";
import { HANDWRITING_PROMPT } from "../lib/notes-logic";
import type { InkData } from "./ink-logic";
import { inkToPngPages } from "./ink-to-image";

/** Jumlah gambar per permintaan `POST /ai/generate` (backend menerima maks. 5 berkas). */
const PAGES_PER_REQUEST = 5;

/** Ubah tulisan tangan menjadi teks memakai provider AI user (lewat backend). */
export function useHandwritingRecognition() {
  const ai = useAi();
  const [recognizing, setRecognizing] = useState(false);

  const recognize = async (ink: InkData): Promise<string | null> => {
    if (!ink.strokes.length) {
      toast.error("Belum ada tulisan tangan.");
      return null;
    }
    if (!ai.isConfigured) {
      toast.error("AI belum diatur", { description: AI_NOT_CONFIGURED });
      return null;
    }
    setRecognizing(true);
    try {
      const pages = await inkToPngPages(ink);
      const parts: string[] = [];
      for (let i = 0; i < pages.length; i += PAGES_PER_REQUEST) {
        parts.push((await ai.generate(HANDWRITING_PROMPT, pages.slice(i, i + PAGES_PER_REQUEST))).trim());
      }
      const text = parts.filter(Boolean).join("\n\n");
      if (!text) toast.info("Tidak ada tulisan yang terbaca.");
      return text || null;
    } catch (error) {
      const quota = error instanceof ApiError && error.status === 429;
      toast.error(quota ? "Limit API Tercapai ⚠️" : "Gagal membaca tulisan tangan", {
        description: errorMessage(error),
      });
      return null;
    } finally {
      setRecognizing(false);
    }
  };

  return { recognize, recognizing, isConfigured: ai.isConfigured };
}
