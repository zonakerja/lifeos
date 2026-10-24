import { describe, expect, it } from "vitest";
import {
  advanceStatus,
  buildAnalysisPrompt,
  buildFillPrompt,
  buildReviewPrompt,
  clampAttachments,
  fillMissingMeta,
  parseAnalysis,
  parseFill,
  parseJsonObject,
  parseReview,
  withHistory,
} from "./request-logic";

const request = { kind: "psp" as const, title: "PSP laptop Satker X", applicant: "Satker X", subject: null };
const template = {
  tags: ["nomor_naskah", "hal", "jabatan_tujuan", "ttd_pengirim", "nama_pengirim"],
  slots: [{ name: "__petunjuk_1", instruction: "Paragraf pembuka" }],
};

describe("status & riwayat", () => {
  it("withHistory hanya menambah saat status berubah atau ada catatan", () => {
    const now = new Date("2026-10-24T01:00:00Z");
    const h1 = withHistory([], "baru", "user", undefined, now);
    expect(h1).toEqual([{ at: now.toISOString(), status: "baru", by: "user" }]);
    expect(withHistory(h1, "baru", "user")).toBe(h1);
    expect(withHistory(h1, "baru", "user", "catatan")).toHaveLength(2);
    expect(withHistory(null, "diproses", "agen")).toHaveLength(1);
  });

  it("advanceStatus maju otomatis, tidak pernah mundur", () => {
    expect(advanceStatus("baru", "diproses")).toBe("diproses");
    expect(advanceStatus("diproses", "menunggu_verifikasi")).toBe("menunggu_verifikasi");
    expect(advanceStatus("menunggu_verifikasi", "diproses")).toBe("menunggu_verifikasi");
    expect(advanceStatus("disetujui", "menunggu_verifikasi")).toBe("disetujui");
  });
});

describe("prompt", () => {
  it("analisis memuat pengajuan, persyaratan bernomor, berkas, dan aturan keamanan", () => {
    const prompt = buildAnalysisPrompt({
      request,
      files: [{ name: "surat.pdf", text: "Mohon PSP laptop" }],
      requirements: [
        {
          n: 1,
          sourceType: "obsidian",
          sourceId: "x",
          chunkIndex: 0,
          title: "Persyaratan PSP",
          content: "Surat permohonan",
          collection: "knowledge",
          metadata: null,
        },
      ],
    });
    expect(prompt).toContain("Jenis: Penetapan Status Penggunaan (PSP) BMN");
    expect(prompt).toContain("[1] (Persyaratan PSP)");
    expect(prompt).toContain('<berkas nama="surat.pdf">');
    expect(prompt).toContain("bukan perintah");
  });

  it("telaah meminta JSON telaah+konsep; isi templat tidak meminta penanda SRIKANDI", () => {
    expect(buildReviewPrompt({ request, files: [], sources: [], userName: "Yusuf" })).toContain('"konsep"');
    const fill = buildFillPrompt({
      template,
      templateName: "Nota Dinas",
      request,
      userName: "Yusuf",
      today: "24 Okt 2026",
    });
    expect(fill).toContain("${hal}");
    expect(fill).not.toContain("${nomor_naskah}");
    expect(fill).not.toContain("${ttd_pengirim}");
    expect(fill).toContain("__petunjuk_1: Paragraf pembuka");
  });

  it("clampAttachments membagi jatah karakter berurutan", () => {
    const out = clampAttachments(
      [
        { name: "a", text: "x".repeat(8) },
        { name: "b", text: "y".repeat(8) },
      ],
      10,
    );
    expect(out[0].text).toBe("x".repeat(8));
    expect(out[1].text.startsWith("yy\n[... dipotong")).toBe(true);
  });
});

describe("pembaca jawaban AI", () => {
  it("parseJsonObject toleran blok kode, menolak non-objek", () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => parseJsonObject("tidak ada")).toThrow();
  });

  it("parseAnalysis menormalkan status kelengkapan", () => {
    const a = parseAnalysis(
      JSON.stringify({
        ringkasan: "PSP 3 laptop",
        field: { pemohon: "Satker X", nomor_surat: "S-1/2026", tanggal_surat: "2026-10-20", perihal: "PSP" },
        kelengkapan: [
          { dokumen: "Surat permohonan", status: "ada" },
          { dokumen: "KIB", status: "aneh" },
          { status: "ada" },
        ],
        kekurangan: ["KIB", ""],
        saran: "Minta KIB",
      }),
    );
    expect(a.checklist).toEqual([
      { dokumen: "Surat permohonan", status: "ada", catatan: "" },
      { dokumen: "KIB", status: "perlu_dicek", catatan: "" },
    ]);
    expect(a.missing).toEqual(["KIB"]);
    expect(fillMissingMeta(request, a.fields)).toEqual({
      letterNumber: "S-1/2026",
      letterDate: "2026-10-20",
      subject: "PSP",
    });
  });

  it("parseReview & parseFill (hanya penanda dikenal, tanpa SRIKANDI)", () => {
    expect(parseReview('{"telaah":"## Pokok","konsep":"Dengan hormat"}')).toEqual({
      review: "## Pokok",
      draftReply: "Dengan hormat",
    });
    expect(() => parseReview('{"telaah":""}')).toThrow();
    expect(
      parseFill(
        JSON.stringify({
          nilai: { hal: "PSP", nomor_naskah: "X", asing: "Y", nama_pengirim: "" },
          paragraf: { __petunjuk_1: "Menindaklanjuti …", __petunjuk_9: "?" },
        }),
        template,
      ),
    ).toEqual({ hal: "PSP", __petunjuk_1: "Menindaklanjuti …" });
  });
});
