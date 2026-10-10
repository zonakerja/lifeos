import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractDocumentText, isExtractable, normalizeMimeType } from "./text-extractors";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** PDF satu halaman minimal dengan lapisan teks (offset xref dihitung agar valid). */
function makePdf(text: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

async function makeDocx(paragraphs: string[]) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function makeXlsx(rows: string[][]) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Daftar" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  const col = (i: number) => String.fromCharCode(65 + i);
  const sheetRows = rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row.map((v, c) => `<c r="${col(c)}${r + 1}" t="inlineStr"><is><t>${v}</t></is></c>`).join("")}</row>`,
    )
    .join("");
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("extractDocumentText", () => {
  it("teks polos", async () => {
    expect(await extractDocumentText(Buffer.from("halo"), "text/plain")).toEqual({ text: "halo", method: "plain" });
  });

  it("PDF berlapis teks", async () => {
    const text = "Surat Keputusan Nomor 12 tentang Pengangkatan Pegawai Tahun 2026";
    const result = await extractDocumentText(makePdf(text), "application/pdf");
    expect(result).toMatchObject({ method: "pdf", pages: 1 });
    expect(result !== "ocr" && result?.text).toContain("Surat Keputusan Nomor 12");
  });

  it("PDF tanpa teks (hasil scan) → OCR", async () => {
    expect(await extractDocumentText(makePdf(""), "application/pdf")).toBe("ocr");
  });

  it("DOCX", async () => {
    const result = await extractDocumentText(await makeDocx(["Notulen rapat", "Keputusan: lanjut"]), DOCX);
    expect(result).toMatchObject({ method: "docx" });
    expect(result !== "ocr" && result?.text).toMatch(/Notulen rapat[\s\S]*Keputusan: lanjut/);
  });

  it("XLSX", async () => {
    const result = await extractDocumentText(
      await makeXlsx([
        ["Kode", "Nama"],
        ["ARC-1", "Arsip A"],
      ]),
      XLSX,
    );
    expect(result).toMatchObject({ method: "xlsx" });
    expect(result !== "ocr" && result?.text).toBe("[Sheet: Daftar]\nKode | Nama\nARC-1 | Arsip A");
  });

  it("gambar → OCR, audio tidak didukung", async () => {
    expect(await extractDocumentText(Buffer.from("x"), "image/png")).toBe("ocr");
    expect(await extractDocumentText(Buffer.from("x"), "audio/webm")).toBeNull();
    expect(isExtractable("audio/webm")).toBe(false);
  });
});

describe("normalizeMimeType", () => {
  it("menebak dari ekstensi bila browser mengirim octet-stream", () => {
    expect(normalizeMimeType("application/octet-stream", "laporan.DOCX")).toBe(DOCX);
    expect(normalizeMimeType("", "data.xlsx")).toBe(XLSX);
    expect(normalizeMimeType("application/pdf; charset=binary", "x")).toBe("application/pdf");
  });
});
