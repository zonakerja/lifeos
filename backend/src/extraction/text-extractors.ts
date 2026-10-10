import mammoth from "mammoth";
import readXlsxFile from "read-excel-file/node";
import { extractText as extractPdfText } from "unpdf";

export type ExtractionMethod = "plain" | "pdf" | "docx" | "xlsx" | "ocr";

/** Hasil: teks, `"ocr"` (perlu dibaca AI: gambar / PDF hasil scan), atau null (format tidak didukung). */
export type ExtractionOutcome = { text: string; method: ExtractionMethod; pages?: number } | "ocr" | null;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const OCR_IMAGES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const PLAIN = new Set(["application/json", "application/xml", "application/yaml", "application/x-yaml"]);

/** Browser kadang mengirim `application/octet-stream`; tebak dari ekstensi nama berkas. */
const BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: DOCX,
  xlsx: XLSX,
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function normalizeMimeType(mimeType: string, fileName: string) {
  const type = mimeType.split(";")[0].trim().toLowerCase();
  if (type && type !== "application/octet-stream") return type;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[ext] ?? type;
}

/** Apakah jenis berkas ini bisa diekstrak (langsung atau lewat OCR). */
export const isExtractable = (mimeType: string) =>
  mimeType.startsWith("text/") ||
  PLAIN.has(mimeType) ||
  mimeType === "application/pdf" ||
  mimeType === DOCX ||
  mimeType === XLSX ||
  OCR_IMAGES.has(mimeType);

export const isOcrImage = (mimeType: string) => OCR_IMAGES.has(mimeType);

/** Rata-rata karakter per halaman di bawah ini dianggap PDF hasil scan (tanpa lapisan teks; nomor halaman saja). */
const MIN_PDF_CHARS_PER_PAGE = 10;
/** Batas baris per sheet agar spreadsheet raksasa tidak membanjiri indeks. */
const MAX_SHEET_ROWS = 5000;

const cellText = (cell: unknown) =>
  cell === null || cell === undefined ? "" : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell);

export async function extractDocumentText(buffer: Buffer, mimeType: string): Promise<ExtractionOutcome> {
  if (mimeType.startsWith("text/") || PLAIN.has(mimeType)) {
    return { text: buffer.toString("utf8"), method: "plain" };
  }
  if (OCR_IMAGES.has(mimeType)) return "ocr";

  if (mimeType === "application/pdf") {
    const { totalPages, text } = await extractPdfText(new Uint8Array(buffer), { mergePages: false });
    const pages = text.map((page) => page.trim());
    const chars = pages.reduce((sum, page) => sum + page.replace(/\s/g, "").length, 0);
    if (chars < MIN_PDF_CHARS_PER_PAGE * Math.max(totalPages, 1)) return "ocr";
    return {
      text: pages.map((page, i) => (totalPages > 1 ? `[Halaman ${i + 1}]\n${page}` : page)).join("\n\n"),
      method: "pdf",
      pages: totalPages,
    };
  }

  if (mimeType === DOCX) {
    const { value } = await mammoth.extractRawText({ buffer });
    return { text: value, method: "docx" };
  }

  if (mimeType === XLSX) {
    const sheets = await readXlsxFile(buffer);
    const text = sheets
      .map(({ sheet, data }) => {
        const rows = data
          .slice(0, MAX_SHEET_ROWS)
          .map((row) => row.map(cellText).join(" | "))
          .filter((row) => row.replace(/[\s|]/g, ""));
        return `[Sheet: ${sheet}]\n${rows.join("\n")}`;
      })
      .join("\n\n");
    return { text, method: "xlsx" };
  }

  return null;
}
