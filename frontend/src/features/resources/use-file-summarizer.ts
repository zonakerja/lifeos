import { useState } from "react";
import { toast } from "sonner";
import { useAi } from "@/lib/ai/use-ai";
import { ApiError, errorMessage } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";

export type SummaryStatus = "idle" | "processing" | "done" | "error";

const FILE_SUMMARY_PROMPT =
  "Ekstrak dan buat ringkasan komprehensif dari dokumen ini untuk keperluan knowledge-base AI masa depan. Gunakan format Markdown yang rapi dan sertakan poin-poin penting. Gunakan delimiter $$ untuk blok rumus matematika.";

/** Tunggu ekstraksi teks server selesai (maks. ±60 detik). */
async function extractedText(uploadId: string) {
  for (let i = 0; i < 40; i++) {
    const { extraction } = await uploadsApi.metadata(uploadId);
    if (extraction && extraction.status !== "pending" && extraction.status !== "extracting") {
      return extraction.status === "completed" ? (extraction.extractedText ?? "").trim() : "";
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return "";
}

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
    return run(() => ai.generate(FILE_SUMMARY_PROMPT, [file]));
  };

  /**
   * Ringkas berkas yang sudah tersimpan di server dari teks hasil ekstraksi backend (DOCX/XLSX/PPTX/PDF, dsb.) — dipakai
   * dokumen yang dibuat/diedit di ONLYOFFICE (isinya ada di server, bukan berkas lokal).
   */
  const summarizeUpload = async (uploadId: string): Promise<string | undefined> => {
    if (!ai.isConfigured) {
      setStatus("error");
      return undefined;
    }
    setStatus("processing");
    const text = await extractedText(uploadId).catch(() => "");
    if (!text) {
      setStatus("error");
      toast.info("Belum ada isi untuk diringkas", {
        description: "Tulis isi dokumen lalu tutup editor untuk meringkas.",
      });
      return undefined;
    }
    const prompt = [FILE_SUMMARY_PROMPT, "<dokumen>", text.slice(0, 150_000), "</dokumen>"].join("\n");
    return run(() => ai.generate(prompt, []));
  };

  const run = async (generate: () => Promise<string>): Promise<string | undefined> => {
    setStatus("processing");
    try {
      const summary = await generate();
      setStatus("done");
      return summary;
    } catch (error) {
      setStatus("error");
      const msg = errorMessage(error);
      if (error instanceof ApiError && error.status === 429) {
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

  return { status, setStatus, summarize, summarizeUpload };
}
