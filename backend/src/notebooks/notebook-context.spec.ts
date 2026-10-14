import { describe, expect, it } from "vitest";
import {
  buildChatPrompt,
  buildSummaryPrompt,
  chunkKey,
  clampContext,
  citationsFor,
  citedNumbers,
  type ContextChunk,
  keywordRank,
  MAX_ATTACHMENT_TEXT_CHARS,
  numberChunks,
  parseSummary,
  partChunks,
  sampleParts,
  selectChunks,
  type SourcePart,
  sourcesFingerprint,
  tokenize,
} from "./notebook-context";

const part = (id: string, text: string, title = `Sumber ${id}`): SourcePart => ({
  notebookSourceId: id,
  sourceTitle: title,
  ref: { sourceType: "notebook_source", sourceId: id },
  text,
});

const chunk = (id: string, index: number, content: string): ContextChunk => ({
  notebookSourceId: id,
  sourceTitle: `Sumber ${id}`,
  ref: { sourceType: "notebook_source", sourceId: id },
  chunkIndex: index,
  content,
});

describe("potongan sumber", () => {
  it("memotong tiap bagian dengan aturan indeks dan menyimpan asalnya", () => {
    const chunks = partChunks([part("a", "x".repeat(4000)), part("b", "pendek")]);
    expect(chunks.filter((c) => c.notebookSourceId === "a").length).toBeGreaterThan(1);
    expect(chunks.find((c) => c.notebookSourceId === "b")).toMatchObject({ chunkIndex: 0, content: "pendek" });
  });
});

describe("peringkat kata kunci", () => {
  it("mengabaikan kata umum dan mengurutkan menurut relevansi", () => {
    expect(tokenize("Apa keputusan rapat anggaran 2027?")).toEqual(["keputusan", "rapat", "anggaran", "2027"]);
    const chunks = [
      chunk("a", 0, "Notulen rapat koordinasi tanpa angka."),
      chunk("b", 0, "Anggaran 2027 naik 10 persen. Rapat memutuskan anggaran baru."),
      chunk("c", 0, "Cuaca hari ini cerah."),
    ];
    expect(keywordRank(chunks, "anggaran rapat 2027")).toEqual([1, 0]);
    expect(keywordRank(chunks, "apa itu")).toEqual([]);
  });
});

describe("pemilihan potongan (RAG)", () => {
  const chunks = [chunk("a", 0, "pendahuluan umum"), chunk("a", 1, "detail anggaran"), chunk("b", 0, "lampiran foto")];

  it("menggabungkan hasil vektor & kata kunci", () => {
    const picked = selectChunks(chunks, "anggaran", [chunkKey(chunks[2].ref, 0)], 2);
    expect(picked.map((c) => c.content).sort()).toEqual(["detail anggaran", "lampiran foto"]);
  });

  it("tanpa kecocokan: potongan awal tiap sumber bergiliran", () => {
    const picked = selectChunks(chunks, "ringkas", [], 2);
    expect(picked.map((c) => c.content)).toEqual(["pendahuluan umum", "lampiran foto"]);
  });

  it("mengabaikan kunci vektor yang bukan milik notebook", () => {
    expect(selectChunks(chunks, "zzz", ["asset|lain|0"], 1)).toHaveLength(1);
  });

  it("nomor sitasi mengikuti urutan sumber lalu urutan potongan", () => {
    const numbered = numberChunks([chunks[2], chunks[1], chunks[0]], ["a", "b"]);
    expect(numbered.map((c) => [c.n, c.content])).toEqual([
      [1, "pendahuluan umum"],
      [2, "detail anggaran"],
      [3, "lampiran foto"],
    ]);
  });
});

describe("prompt chat", () => {
  it("memuat sumber bernomor, riwayat, mode, dan pertanyaan", () => {
    const prompt = buildChatPrompt({
      notebookTitle: "Riset",
      chunks: numberChunks([chunk("a", 0, "isi A")], ["a"]),
      history: [
        { role: "user", content: "halo" },
        { role: "assistant", content: "hai" },
      ],
      question: "Apa isi A?",
      mode: "rag",
    });
    expect(prompt).toContain("[1] (Sumber: Sumber a)\nisi A");
    expect(prompt).toContain("Pengguna: halo\n\nAsisten: hai");
    expect(prompt).toContain("paling relevan");
    expect(prompt.endsWith("Pertanyaan: Apa isi A?")).toBe(true);
  });
});

describe("prompt chat berlampiran", () => {
  it("menyebut lampiran berkas & dokumen, memuat teks dokumen, tetap jalan tanpa sumber aktif", () => {
    const withFiles = buildChatPrompt({
      notebookTitle: "Riset",
      chunks: [],
      history: [],
      question: "Apa isi lampiran ini?",
      mode: "full",
      fileCount: 2,
      attachedTexts: [{ name: 'laporan "final".docx', text: "Isi laporan tahunan." }],
    });
    expect(withFiles).toContain("melampirkan 2 berkas/gambar dan 1 dokumen");
    expect(withFiles).toContain("(belum ada sumber aktif");
    expect(withFiles).toContain(
      `<lampiran_pengguna nama="laporan 'final'.docx">\nIsi laporan tahunan.\n</lampiran_pengguna>`,
    );
    const plain = buildChatPrompt({
      notebookTitle: "Riset",
      chunks: numberChunks([chunk("a", 0, "isi")], ["a"]),
      history: [],
      question: "?",
      mode: "full",
    });
    expect(plain).not.toContain("lampiran_pengguna");
    expect(plain).not.toContain("melampirkan");
  });

  it("teks lampiran yang sangat panjang dipotong", () => {
    expect(clampContext("abc")).toBe("abc");
    const long = clampContext("x".repeat(MAX_ATTACHMENT_TEXT_CHARS + 5));
    expect(long.length).toBeLessThan(MAX_ATTACHMENT_TEXT_CHARS + 100);
    expect(long).toContain("dipotong");
  });
});

describe("sitasi", () => {
  it("membaca [1], [1, 3], [2-4], [1][2] dan membuang nomor di luar rentang", () => {
    expect(citedNumbers("A [1]. B [1, 3]. C [2-4]. D [5][9]. E [0]", 5)).toEqual([1, 2, 3, 4, 5]);
    expect(citedNumbers("tanpa sitasi", 3)).toEqual([]);
  });

  it("sitasi membawa sumber & cuplikan", () => {
    const numbered = numberChunks([chunk("a", 0, "isi   panjang\n".repeat(60))], ["a"]);
    const [citation] = citationsFor("Jawaban [1]", numbered);
    expect(citation).toMatchObject({ n: 1, sourceId: "a", title: "Sumber a" });
    expect(citation.excerpt.endsWith("…")).toBe(true);
    expect(citation.excerpt).not.toMatch(/\s{2}/);
  });
});

describe("ringkasan Studio", () => {
  it("membagi jatah karakter: sumber pendek utuh, sumber panjang dipotong", () => {
    const sampled = sampleParts([part("a", "x".repeat(100)), part("b", "y".repeat(10_000))], 1_000);
    expect(sampled[0].text).toBe("x".repeat(100));
    expect(sampled[1].text.startsWith("y".repeat(900))).toBe(true);
    expect(sampled[1].text).toContain("dipotong");
  });

  it("prompt meminta JSON dan memuat sumber", () => {
    const prompt = buildSummaryPrompt("Riset", [part("a", "isi", 'Judul "kutip"')]);
    expect(prompt).toContain('"keyPoints"');
    expect(prompt).toContain(`judul="Judul 'kutip'"`);
  });

  it("membaca JSON dari jawaban AI (toleran blok kode)", () => {
    const summary = parseSummary('```json\n{"overview":"Ikhtisar","keyPoints":["a",""," b "],"questions":["q?"]}\n```');
    expect(summary).toEqual({ overview: "Ikhtisar", keyPoints: ["a", "b"], questions: ["q?"] });
    expect(() => parseSummary("bukan json")).toThrow();
    expect(() => parseSummary('{"overview":""}')).toThrow();
  });

  it("sidik jari tidak bergantung urutan dan berubah bila versi berubah", () => {
    const a = sourcesFingerprint([
      { id: "1", version: "x" },
      { id: "2", version: "y" },
    ]);
    expect(
      sourcesFingerprint([
        { id: "2", version: "y" },
        { id: "1", version: "x" },
      ]),
    ).toBe(a);
    expect(sourcesFingerprint([{ id: "1", version: "x" }])).not.toBe(a);
  });
});
