import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { analyzeTemplate, fillTemplate, instructionOf, isSrikandiTag, unfilledFields } from "./template-engine";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/** Docx minimal: setiap paragraf = daftar run (teks), opsional tebal untuk run pertama. */
function makeDocx(paragraphs: { runs: string[]; bold?: boolean; style?: string }[]) {
  const body = paragraphs
    .map(({ runs, bold, style }) => {
      const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
      const rs = runs
        .map(
          (t, i) => `<w:r>${i === 0 && bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${t}</w:t></w:r>`,
        )
        .join("");
      return `<w:p>${pPr}${rs}</w:p>`;
    })
    .join("");
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`,
  );
  return zip.generate({ type: "nodebuffer" });
}

const documentText = (buffer: Buffer) =>
  [
    ...new PizZip(buffer)
      .file("word/document.xml")!
      .asText()
      .matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g),
  ]
    .map((m) => m[1])
    .join("|");

const SAMPLE = makeDocx([
  { runs: ["Nomor : ${nomor_naskah}"] },
  { runs: ["Hal : $", "{h", "al}"] },
  { runs: ["Kepada : ${jabatan_tujuan}"] },
  { runs: ["[Paragraf pembuka: ", "sebutkan dasar surat.]"], bold: true, style: "Isi" },
  { runs: ["${ttd_pengirim}"] },
  { runs: ["${nama_pengirim}"] },
]);

describe("template engine", () => {
  it("penanda SRIKANDI & paragraf petunjuk dikenali", () => {
    expect(isSrikandiTag("nomor_naskah")).toBe(true);
    expect(isSrikandiTag("ttd_pengirim")).toBe(true);
    for (const tag of [
      "jabatan_tujuan",
      "jabatan_tujuan5",
      "jabatan_pengirim",
      "nama_pengirim",
      "nama_pengirim2",
      "nip_pengirim1",
    ])
      expect(isSrikandiTag(tag)).toBe(true);
    expect(isSrikandiTag("hal")).toBe(false);
    expect(isSrikandiTag("nama_satker")).toBe(false);
    expect(instructionOf("  [Paragraf isi: uraian]  ")).toBe("Paragraf isi: uraian");
    expect(instructionOf("Lampiran [1] berkas")).toBeNull();
  });

  it("analyzeTemplate: penanda unik (termasuk yang terbelah antar-run) + paragraf petunjuk", () => {
    const { tags, slots } = analyzeTemplate(SAMPLE);
    expect(tags).toEqual(["nomor_naskah", "hal", "jabatan_tujuan", "ttd_pengirim", "nama_pengirim"]);
    expect(slots).toEqual([{ name: "__petunjuk_1", instruction: "Paragraf pembuka: sebutkan dasar surat." }]);
  });

  it("fillTemplate: isi nilai, pertahankan penanda SRIKANDI & tanpa nilai, ganti petunjuk dengan format asli", () => {
    const out = fillTemplate(SAMPLE, {
      hal: "Penetapan Status Penggunaan BMN",
      nomor_naskah: "TIDAK BOLEH",
      jabatan_tujuan: "TIDAK BOLEH",
      __petunjuk_1: "Menindaklanjuti surat Saudara.",
    });
    const text = documentText(out);
    expect(text).toContain("Hal : Penetapan Status Penggunaan BMN");
    expect(text).toContain("${nomor_naskah}");
    expect(text).toContain("${ttd_pengirim}");
    expect(text).toContain("${jabatan_tujuan}");
    expect(text).toContain("Menindaklanjuti surat Saudara.");
    expect(text).not.toContain("Paragraf pembuka");
    const xml = new PizZip(out).file("word/document.xml")!.asText();
    expect(xml).toMatch(/<w:pStyle w:val="Isi"\/><\/w:pPr><w:r><w:rPr><w:b\/><\/w:rPr><w:t[^>]*>Menindaklanjuti/);
  });

  it("petunjuk tanpa teks tetap ditampilkan dalam kurung siku; baris baru jadi ganti baris", () => {
    const text = documentText(fillTemplate(SAMPLE, { hal: "Mohammad Yusuf\nAnalis" }));
    expect(text).toContain("[Paragraf pembuka: sebutkan dasar surat.]");
    expect(new PizZip(fillTemplate(SAMPLE, { hal: "A\nB" })).file("word/document.xml")!.asText()).toContain("<w:br/>");
  });

  it("isian paragraf beberapa baris → beberapa paragraf bergaya sama", () => {
    const xml = new PizZip(fillTemplate(SAMPLE, { __petunjuk_1: "1. Pertama\n\n2. Kedua" }))
      .file("word/document.xml")!
      .asText();
    expect(xml).not.toContain("<w:br/>");
    expect(xml.match(/<w:pStyle w:val="Isi"\/>/g)).toHaveLength(2);
    expect(xml).toMatch(/1\. Pertama<\/w:t><\/w:r><\/w:p><w:p[^>]*><w:pPr><w:pStyle w:val="Isi"\/>/);
    expect(xml).toContain("2. Kedua");
  });

  it("unfilledFields: penanda & petunjuk kosong, penanda SRIKANDI tidak dihitung", () => {
    const doc = makeDocx([
      { runs: ["${nomor_naskah} ${ttd_pengirim} ${hal} ${tujuan}"] },
      { runs: ["[Isi paragraf]"] },
    ]);
    expect(unfilledFields(doc)).toEqual(["hal", "tujuan", "[Isi paragraf]"]);
    const filled = fillTemplate(doc, { hal: "A", tujuan: "B", __petunjuk_1: "Isi" });
    expect(unfilledFields(filled)).toEqual([]);
  });

  it("berkas bukan DOCX ditolak", () => {
    expect(() => analyzeTemplate(Buffer.from("bukan zip"))).toThrow();
  });
});
