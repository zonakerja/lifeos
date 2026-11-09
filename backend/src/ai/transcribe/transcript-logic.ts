/** Instruksi transkrip audio (satu sumber untuk semua fitur). */
export const TRANSCRIBE_PROMPT = [
  "Transkripkan audio ini secara lengkap dan apa adanya (verbatim) dalam bahasa aslinya, dari awal sampai akhir.",
  "- Bila ada lebih dari satu pembicara, awali setiap giliran bicara dengan label 'Pembicara 1:', 'Pembicara 2:', dst.",
  "- Beri tanda baca dan paragraf agar mudah dibaca; jangan meringkas atau menerjemahkan.",
  "- Bagian yang tidak terdengar jelas ditandai [tidak jelas].",
  "- Keluarkan HANYA teks biasa tanpa Markdown (tanpa tanda bintang) dan tanpa tanda kutip pembungkus, tanpa komentar lain.",
].join("\n");

/**
 * Model kadang menulis catatan kerjanya sendiri sebelum transkrip ("Correctly labeled speakers. Output directly.").
 * Hanya pembuka pendek berisi kata-kata instruksi sebelum label pembicara pertama yang dibuang.
 */
export function stripMetaPreamble(text: string) {
  const first = text.search(/Pembicara \d+\s*:/);
  if (first <= 0 || first > 400) return text;
  const preamble = text.slice(0, first);
  return /\b(verbatim|labeled|output|outline|transcri|speakers?)\b/i.test(preamble) ? text.slice(first) : text;
}

export const CONTINUE_PROMPT = [
  "Transkrip di atas terpotong karena batas panjang jawaban.",
  "Lanjutkan tepat dari kata terakhir sampai audio selesai, dengan aturan yang sama.",
  "Jangan mengulang teks yang sudah ditulis dan jangan menambah komentar.",
].join(" ");

const minuteOf = (ms: number) => Math.floor(ms / 60_000);

/** Instruksi untuk satu potongan rekaman panjang. */
export const segmentPrompt = (index: number, total: number, startMs: number) =>
  total <= 1
    ? TRANSCRIBE_PROMPT
    : [
        TRANSCRIBE_PROMPT,
        `- Ini potongan ${index + 1} dari ${total} sebuah rekaman, mulai menit ke-${minuteOf(startMs)}. Awal dan akhirnya bisa terpotong di tengah kalimat: tulis apa adanya tanpa melengkapinya.`,
        "- Bila potongan ini tidak berisi ucapan sama sekali, tulis hanya [tidak ada ucapan].",
      ].join("\n");

export interface SegmentResult {
  text: string;
  truncated: boolean;
  passes: number;
}

/** Penanda bagian yang gagal di dalam teks transkrip (juga dikenali frontend untuk menawarkan pengulangan). */
export const failedSegmentMark = (minute: number) => `[Menit ${minute}: gagal ditranskrip]`;

/**
 * Transkrip potongan dengan jumlah paralel terbatas, lalu gabung berurutan dengan penanda menit. Potongan yang gagal
 * diulang satu per satu setelah semua selesai (biasanya batas laju sesaat). Yang tetap gagal diberi tanda dan yang lain
 * tetap dipakai. `done` menyimpan hasil per waktu mulai: pengulangan tidak membayar lagi bagian yang sudah berhasil.
 * Semua gagal, atau kegagalan `isFatal`, dilempar.
 */
export async function runSegments(
  startMs: number[],
  transcribe: (index: number) => Promise<SegmentResult>,
  options: {
    concurrency: number;
    isFatal?: (error: unknown) => boolean;
    onError?: (index: number, error: unknown) => void;
    done?: Map<number, SegmentResult>;
    retryDelayMs?: number;
  },
) {
  const done = options.done ?? new Map<number, SegmentResult>();
  const errors = new Map<number, unknown>();
  let fatal: { error: unknown } | null = null;

  const attempt = async (index: number) => {
    try {
      done.set(startMs[index], await transcribe(index));
      errors.delete(index);
    } catch (error) {
      errors.set(index, error);
      options.onError?.(index, error);
      if (options.isFatal?.(error)) fatal = { error };
    }
  };

  const pending = startMs.map((_, index) => index).filter((index) => !done.has(startMs[index]));
  let next = 0;
  const worker = async () => {
    while (next < pending.length && !fatal) await attempt(pending[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency, pending.length) }, worker));

  for (const index of [...errors.keys()].sort((a, b) => a - b)) {
    if (fatal) break;
    await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 20_000));
    await attempt(index);
  }

  if (fatal) throw (fatal as { error: unknown }).error;
  if (done.size === 0) throw [...errors.values()][0];

  const resultOf = (index: number) => done.get(startMs[index]);
  const single = startMs.length === 1;
  const text = startMs
    .map((ms, index) => {
      const result = resultOf(index);
      if (!result) return failedSegmentMark(minuteOf(ms));
      return single ? result.text : `[Menit ${minuteOf(ms)}]\n${result.text}`;
    })
    .join("\n\n");
  const failed = startMs.map((_, index) => index).filter((index) => !resultOf(index));
  const cutMinutes = startMs.filter((_, index) => resultOf(index)?.truncated).map(minuteOf);
  const reason = failed.length ? String((errors.get(failed[0]) as Error | undefined)?.message ?? "").slice(0, 200) : "";
  const warnings = [
    failed.length
      ? `Bagian menit ${failed.map((index) => minuteOf(startMs[index])).join(", ")} gagal ditranskrip${reason ? ` (${reason})` : ""}.`
      : "",
    cutMinutes.length ? `Bagian menit ${cutMinutes.join(", ")} mungkin belum lengkap.` : "",
  ].filter(Boolean);
  return {
    text,
    truncated: failed.length > 0 || cutMinutes.length > 0,
    passes: [...done.values()].reduce((sum, r) => sum + r.passes, 0),
    warning: warnings.length ? warnings.join(" ") : null,
  };
}

/** Batas sambungan: audio berjam-jam pun selesai jauh sebelum ini; mencegah perulangan tanpa akhir. */
export const MAX_TRANSCRIPT_PASSES = 8;
/** Satu bagian transkrip yang gagal karena provider sibuk dicoba ulang sekian kali. */
export const MAX_PASS_RETRIES = 2;

export interface TranscriptPass {
  text: string;
  /** true = berhenti karena batas token, audio belum selesai ditranskrip. */
  truncated: boolean;
}

/** Sambungkan bagian baru; awal bagian yang mengulang akhir teks sebelumnya dibuang. */
export function joinTranscript(previous: string, next: string) {
  const head = next.trimStart();
  if (!head) return previous;
  if (!previous) return head;
  const maxOverlap = Math.min(previous.length, head.length, 2_000);
  for (let size = maxOverlap; size >= 20; size--) {
    if (previous.endsWith(head.slice(0, size))) return previous + head.slice(size);
  }
  // Jawaban terpotong di tengah kalimat tidak diberi baris baru agar kalimatnya tetap utuh
  const separator = /[.!?:;"”)\]]\s*$/.test(previous) ? "\n" : " ";
  return previous.trimEnd() + separator + head;
}

/**
 * Jalankan transkrip bagian demi bagian sampai model selesai. `generate` menerima teks sejauh ini. Kegagalan sementara
 * diulang tanpa membuang bagian yang sudah selesai; `truncated` = batas bagian tercapai sebelum audio selesai.
 */
export async function runTranscript(
  generate: (soFar: string) => Promise<TranscriptPass>,
  options: {
    maxPasses?: number;
    maxRetries?: number;
    isRetryable?: (error: unknown) => boolean;
    wait?: (attempt: number) => Promise<void>;
  } = {},
) {
  const { maxPasses = MAX_TRANSCRIPT_PASSES, maxRetries = MAX_PASS_RETRIES, isRetryable = () => false } = options;
  const wait = options.wait ?? ((attempt: number) => new Promise<void>((r) => setTimeout(r, 5_000 * attempt)));

  let text = "";
  let passes = 0;
  while (passes < maxPasses) {
    let result: TranscriptPass | undefined;
    for (let attempt = 0; !result; attempt++) {
      try {
        result = await generate(text);
      } catch (error) {
        if (attempt >= maxRetries || !isRetryable(error)) throw error;
        await wait(attempt + 1);
      }
    }
    passes++;
    const before = text;
    text = joinTranscript(text, result.text);
    if (!result.truncated) return { text: text.trim(), truncated: false, passes };
    // Bagian lanjutan tidak menambah apa pun: berhenti daripada membayar panggilan yang sia-sia
    if (text === before) break;
  }
  return { text: text.trim(), truncated: true, passes };
}
