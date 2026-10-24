import { describe, expect, it } from "vitest";
import {
  buildAssistantPrompt,
  chatCitations,
  type ChatSource,
  conversationTitle,
  metaLabel,
  numberSources,
  searchQuery,
} from "./ai-chat-context";

const source = (over: Partial<ChatSource>): ChatSource => ({
  sourceType: "obsidian",
  sourceId: "n1",
  chunkIndex: 0,
  title: "Pengetahuan: Sewa BMN",
  content: "Sewa paling lama 5 tahun.",
  collection: "knowledge",
  metadata: { jenis: "faq", status: "berlaku", diperbarui: "2026-10-18" },
  ...over,
});

describe("searchQuery", () => {
  it("pertanyaan lanjutan pendek digabung dengan pertanyaan sebelumnya", () => {
    const history = [
      { role: "user", content: "Berapa lama jangka waktu sewa BMN?" },
      { role: "assistant", content: "5 tahun." },
    ];
    expect(searchQuery("Kalau KSP?", history)).toBe("Berapa lama jangka waktu sewa BMN?\nKalau KSP?");
    expect(searchQuery("Kalau KSP?", [])).toBe("Kalau KSP?");
    const long = "Jelaskan prosedur penetapan status penggunaan BMN untuk satker vertikal secara lengkap ya";
    expect(searchQuery(long, history)).toBe(long);
  });
});

describe("numberSources", () => {
  it("gabung tanpa duplikat, nomor berurutan", () => {
    const a = source({});
    const b = source({ sourceId: "n2" });
    const numbered = numberSources([
      [a, b],
      [source({}), source({ collection: "workspace", sourceType: "todo" })],
    ]);
    expect(numbered.map((s) => [s.sourceId, s.n])).toEqual([
      ["n1", 1],
      ["n2", 2],
      ["n1", 3],
    ]);
  });
});

describe("buildAssistantPrompt", () => {
  it("memisahkan pengetahuan, data kerja, data aplikasi, profil & riwayat", () => {
    const sources = numberSources([
      [source({}), source({ sourceId: "n2", linked: true })],
      [
        source({
          collection: "workspace",
          sourceType: "free_note",
          sourceId: "f1",
          title: "Catatan: Rapat",
          metadata: null,
        }),
      ],
    ]);
    const prompt = buildAssistantPrompt({
      userName: "Yusuf",
      profile: "Analis BMN di Biro Umum.",
      today: "Sabtu, 24 Oktober 2026",
      sources,
      snapshot: "--- AGENDA ---\n- ID: app:schedule:1 | Rapat",
      history: [{ role: "user", content: "Halo" }],
      question: "Berapa lama sewa?",
    });
    expect(prompt).toContain("Hari ini: Sabtu, 24 Oktober 2026.");
    expect(prompt).toContain("<profil_kerja_pengguna>\nAnalis BMN di Biro Umum.");
    expect(prompt).toContain("[1] (Pengetahuan: Sewa BMN — faq · berlaku · diperbarui 2026-10-18)");
    expect(prompt).toContain("[2] (Pengetahuan: Sewa BMN — faq · berlaku · diperbarui 2026-10-18 · catatan tertaut)");
    const knowledge = prompt.slice(prompt.indexOf("<pengetahuan>"), prompt.indexOf("</pengetahuan>"));
    expect(knowledge).not.toContain("Catatan: Rapat");
    expect(prompt.slice(prompt.indexOf("<data_kerja>"))).toContain("[3] (Catatan: Rapat)");
    expect(prompt).toContain("<data_aplikasi>\n--- AGENDA ---");
    expect(prompt).toContain("Pengguna: Halo");
    expect(prompt.endsWith("Pertanyaan: Berapa lama sewa?")).toBe(true);
  });

  it("tanpa sumber & profil tetap menghasilkan prompt yang jelas", () => {
    const prompt = buildAssistantPrompt({ userName: "A", sources: [], history: [], question: "Q" });
    expect(prompt).toContain("(tidak ada kutipan basis pengetahuan yang relevan)");
    expect(prompt).not.toContain("<profil_kerja_pengguna>");
    expect(prompt).not.toContain("<data_aplikasi>\n");
  });
});

describe("chatCitations", () => {
  it("hanya nomor yang dipakai & dalam jangkauan, cuplikan dipotong", () => {
    const sources = numberSources([[source({ content: "x ".repeat(400) }), source({ sourceId: "n2", linked: true })]]);
    const citations = chatCitations("Jawab [2] dan [1][9].", sources);
    expect(citations.map((c) => c.n)).toEqual([1, 2]);
    expect(citations[0].excerpt.endsWith("…")).toBe(true);
    expect(citations[1]).toMatchObject({ sourceId: "n2", collection: "knowledge", linked: true });
  });
});

describe("label & judul", () => {
  it("metaLabel dan conversationTitle", () => {
    expect(metaLabel({ jenis: "faq", status: "draf" })).toBe("faq · draf");
    expect(metaLabel(null)).toBe("");
    expect(conversationTitle("  Berapa   lama sewa?  ")).toBe("Berapa lama sewa?");
    expect(conversationTitle("a".repeat(100))).toHaveLength(58);
  });
});
