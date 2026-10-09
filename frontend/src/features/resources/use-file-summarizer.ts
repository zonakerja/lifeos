import { useState } from "react";
import { toast } from "sonner";
import { useAi } from "@/lib/ai/use-ai";
import { errorMessage } from "@/lib/api/client";

export type SummaryStatus = "idle" | "processing" | "done" | "error";

const FILE_SUMMARY_PROMPT =
  "Ekstrak dan buat ringkasan komprehensif dari dokumen ini untuk keperluan knowledge-base AI masa depan. Gunakan format Markdown yang rapi dan sertakan poin-poin penting. Gunakan delimiter $$ untuk blok rumus matematika.";

const isAiReadable = (mime?: string) =>
  !!mime && (mime === "application/pdf" || mime.startsWith("image/") || mime === "text/plain");

/**
 * Ringkasan AI otomatis untuk file yang baru diunggah (form task/project/resource).
 * Status: processing → done ("AI Ready") / error ("No AI").
 */
export function useFileSummarizer() {
  const ai = useAi();
  const [status, setStatus] = useState<SummaryStatus>("idle");

  const summarize = async (file: File): Promise<string | undefined> => {
    if (!ai.isConfigured) {
      setStatus("error");
      return undefined;
    }
    if (!isAiReadable(file.type)) {
      setStatus("error");
      toast.error("Format tidak didukung", { description: "Gunakan PDF, gambar, atau teks untuk ekstraksi AI." });
      return undefined;
    }
    setStatus("processing");
    try {
      const summary = await ai.generate(FILE_SUMMARY_PROMPT, [file]);
      setStatus("done");
      return summary;
    } catch (error) {
      setStatus("error");
      const msg = errorMessage(error);
      if (/quota|429|exceeded/i.test(msg)) {
        toast.error("Limit API Tercapai ⚠️", {
          description:
            "File tetap terlampir dengan status 'No AI'. Simpan dulu, lalu gunakan ikon robot pada tabel untuk mengekstrak ulang nanti.",
        });
      } else {
        toast.error("Ekstraksi AI gagal", { description: msg });
      }
      return undefined;
    }
  };

  return { status, setStatus, summarize };
}
