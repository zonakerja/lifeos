import { readFile } from "node:fs/promises";
import {
  ApiError,
  createPartFromUri,
  FileState,
  FinishReason,
  GoogleGenAI,
  type Content,
  type Part,
} from "@google/genai";
import { Logger } from "@nestjs/common";
import {
  CONTINUE_PROMPT,
  runSegments,
  runTranscript,
  type SegmentResult,
  segmentPrompt,
  stripMetaPreamble,
  TRANSCRIBE_PROMPT,
} from "../transcribe/transcript-logic";
import { splitWebm } from "../transcribe/webm-split";
import { AiProviderError, kindFromStatus } from "./ai-client";

const logger = new Logger("Transkrip");

/** Satu jawaban bisa berjalan beberapa menit. */
const TRANSCRIBE_TIMEOUT_MS = 20 * 60_000;
/** Lebih besar dari jawaban biasa agar transkrip tidak sering perlu disambung. */
const TRANSCRIBE_MAX_OUTPUT_TOKENS = 60_000;
const FILE_READY_TIMEOUT_MS = 5 * 60_000;
const FILE_POLL_MS = 3_000;
/** Model sering berhenti lebih awal pada audio sangat panjang; potongan ± 10 menit jauh lebih andal. */
const SEGMENT_MAX_MS = 10 * 60_000;
/** Dikirim inline (batas Gemini 20 MB termasuk base64). */
const SEGMENT_MAX_BYTES = 14 * 1024 * 1024;
const SEGMENT_CONCURRENCY = 3;
/** Audio yang tidak bisa dipotong (bukan rekaman WebM) dan sebesar ini mungkin tidak tertranskrip sampai akhir. */
const UNSPLIT_WARNING_BYTES = 30 * 1024 * 1024;

/**
 * Gemini Flash menolak sebagian potongan audio dengan `blockReason: OTHER` tanpa penjelasan, konsisten pada potongan yang
 * sama dan walau filter keamanan dimatikan; model Pro menerima potongan yang sama.
 */
const REJECTED_FALLBACK_MODELS = ["gemini-3.1-pro-preview"];

const toProviderError = (error: unknown) => {
  if (error instanceof AiProviderError) return error;
  if (error instanceof ApiError) return new AiProviderError(kindFromStatus(error.status, error.message), error.message);
  return new AiProviderError("unavailable", error instanceof Error ? error.message : String(error));
};

const isRetryable = (error: unknown) => ["unavailable", "quota"].includes(toProviderError(error).kind);
/** Key/model salah akan gagal di semua potongan: hentikan segera daripada mencoba semuanya. */
const isFatal = (error: unknown) => ["auth", "credential", "model"].includes(toProviderError(error).kind);

/** Transkrip satu audio, jawaban yang terpotong batas token disambung otomatis. */
function transcribeAudio(client: GoogleGenAI, model: string, audio: Part, prompt: string, label: string) {
  return runTranscript(
    async (soFar) => {
      const contents: Content[] = [{ role: "user", parts: [audio, { text: prompt }] }];
      if (soFar) {
        contents.push(
          { role: "model", parts: [{ text: soFar }] },
          { role: "user", parts: [{ text: CONTINUE_PROMPT }] },
        );
      }
      const stream = await client.models.generateContentStream({
        model,
        contents,
        config: { maxOutputTokens: TRANSCRIBE_MAX_OUTPUT_TOKENS },
      });
      // Streaming: sambungan panjang tanpa data rawan diputus jaringan di tengah jalan
      let text = "";
      let finish: FinishReason | undefined;
      let promptTokens: number | undefined;
      let blockReason: string | undefined;
      for await (const chunk of stream) {
        text += chunk.text ?? "";
        finish = chunk.candidates?.[0]?.finishReason ?? finish;
        promptTokens = chunk.usageMetadata?.promptTokenCount ?? promptTokens;
        blockReason = chunk.promptFeedback?.blockReason ?? blockReason;
      }
      logger.log(
        `${label} [${model}]: selesai=${finish ?? "-"}, ditolak=${blockReason ?? "-"}, ${text.length} karakter, token masukan ${promptTokens ?? "?"}`,
      );
      if (blockReason) {
        throw new AiProviderError("refusal", `Model ${model} menolak memproses audio ini (${blockReason}).`);
      }
      // Aliran yang berakhir tanpa alasan selesai belum tentu lengkap: jangan pernah dianggap sukses
      if (!finish) throw new AiProviderError("unavailable", "Sambungan ke Gemini terputus sebelum transkrip selesai.");
      if (finish !== FinishReason.STOP && finish !== FinishReason.MAX_TOKENS) {
        throw new AiProviderError("refusal", `Gemini menghentikan transkrip (${finish}).`);
      }
      if (finish === FinishReason.STOP && !text.trim()) {
        throw new AiProviderError("invalid", "Gemini tidak memberikan transkrip.");
      }
      return { text, truncated: finish === FinishReason.MAX_TOKENS };
    },
    { isRetryable },
  );
}

/** Audio yang ditolak model utama dicoba dengan model cadangan; kegagalan lain diteruskan apa adanya. */
async function transcribeWithFallback(client: GoogleGenAI, model: string, audio: Part, prompt: string, label: string) {
  const models = [model, ...REJECTED_FALLBACK_MODELS.filter((m) => m !== model)];
  let rejected: AiProviderError | undefined;
  for (const candidate of models) {
    try {
      const result = await transcribeAudio(client, candidate, audio, prompt, label);
      return { ...result, text: stripMetaPreamble(result.text) };
    } catch (error) {
      const failure = toProviderError(error);
      // Model cadangan tidak tersedia di akun ini: yang perlu dilihat user tetap penolakan model utama
      if (rejected && failure.kind === "model") throw rejected;
      if (failure.kind !== "refusal") throw failure;
      rejected ??= failure;
    }
  }
  throw rejected!;
}

/** Berkas utuh lewat Files API (sampai 2 GB); dihapus dari Google begitu selesai, juga saat gagal. */
async function transcribeWholeFile(client: GoogleGenAI, model: string, filePath: string, mimeType: string) {
  let fileName: string | undefined;
  try {
    let file = await client.files.upload({ file: filePath, config: { mimeType } });
    fileName = file.name;
    const deadline = Date.now() + FILE_READY_TIMEOUT_MS;
    while (file.state === FileState.PROCESSING) {
      if (Date.now() > deadline) {
        throw new AiProviderError("unavailable", "Gemini terlalu lama memproses berkas audio.");
      }
      await new Promise((resolve) => setTimeout(resolve, FILE_POLL_MS));
      file = await client.files.get({ name: fileName! });
    }
    if (file.state === FileState.FAILED || !file.uri) {
      throw new AiProviderError("invalid", file.error?.message || "Gemini tidak dapat membaca berkas audio ini.");
    }
    const audio = createPartFromUri(file.uri, file.mimeType || mimeType);
    return await transcribeWithFallback(client, model, audio, TRANSCRIBE_PROMPT, "berkas utuh");
  } finally {
    if (fileName) await client.files.delete({ name: fileName }).catch(() => undefined);
  }
}

/**
 * Transkrip berkas audio di disk. Rekaman WebM (MediaRecorder) dipotong per ± 10 menit tanpa encode ulang, tiap potongan
 * ditranskrip sendiri lalu digabung berurutan; format lain dikirim utuh.
 */
export async function transcribeWithGemini(input: {
  apiKey: string;
  model: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  /** Hasil potongan yang sudah berhasil, dipakai ulang saat transkrip diulang. */
  segments?: Map<number, SegmentResult>;
}) {
  const client = new GoogleGenAI({ apiKey: input.apiKey, httpOptions: { timeout: TRANSCRIBE_TIMEOUT_MS } });
  try {
    const pieces =
      input.mimeType === "audio/webm"
        ? splitWebm(await readFile(input.filePath), { maxMs: SEGMENT_MAX_MS, maxBytes: SEGMENT_MAX_BYTES })
        : null;

    if (!pieces) {
      const result = await transcribeWholeFile(client, input.model, input.filePath, input.mimeType);
      return {
        ...result,
        warning:
          input.sizeBytes > UNSPLIT_WARNING_BYTES
            ? "Audio besar ini ditranskrip sekaligus dan mungkin tidak sampai akhir. Periksa kelengkapannya."
            : null,
      };
    }

    logger.log(`${pieces.length} potongan dari ${input.sizeBytes} byte`);
    return await runSegments(
      pieces.map((p) => p.startMs),
      (index) => {
        const piece = pieces[index];
        const audio: Part = { inlineData: { mimeType: input.mimeType, data: piece.data.toString("base64") } };
        const prompt = segmentPrompt(index, pieces.length, piece.startMs);
        return transcribeWithFallback(client, input.model, audio, prompt, `potongan ${index + 1}/${pieces.length}`);
      },
      {
        concurrency: SEGMENT_CONCURRENCY,
        isFatal,
        done: input.segments,
        onError: (index, error) =>
          logger.warn(`potongan ${index + 1}/${pieces.length} gagal: ${toProviderError(error).providerMessage}`),
      },
    );
  } catch (error) {
    throw toProviderError(error);
  }
}
