import { officeEditModeOf, officeKindOf } from "./office-formats";

/** Konteks upload templat dokumen (Tools → ONLYOFFICE); sama dengan backend `OFFICE_TEMPLATE_CONTEXT`. */
export const TEMPLATE_CONTEXT = "office-template";

/** Ekstensi dokumen/spreadsheet/presentasi/PDF yang bisa jadi templat atau diimpor (format lain ditolak). */
const DOCUMENT_EXTENSIONS = [
  "docx",
  "docm",
  "dotx",
  "dotm",
  "doc",
  "dot",
  "odt",
  "ott",
  "rtf",
  "txt",
  "md",
  "html",
  "htm",
  "epub",
  "fb2",
  "xlsx",
  "xlsm",
  "xlsb",
  "xltx",
  "xltm",
  "xls",
  "xlt",
  "ods",
  "ots",
  "csv",
  "tsv",
  "pptx",
  "pptm",
  "ppsx",
  "ppsm",
  "potx",
  "potm",
  "ppt",
  "pps",
  "pot",
  "odp",
  "otp",
  "pdf",
];

/** Nilai `accept` input berkas untuk templat & impor. */
export const DOCUMENT_ACCEPT = DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`).join(",");

/** Berkas bisa dijadikan templat / diimpor sebagai dokumen ONLYOFFICE (bukan diagram, gambar, dll.). */
export function isDocumentFile(name: string, mimeType?: string | null) {
  const kind = officeKindOf(name, mimeType);
  return kind === "word" || kind === "cell" || kind === "slide" || kind === "pdf";
}

/**
 * Berkas impor yang hanya bisa dilihat ONLYOFFICE (DOC, XLS, PPT, …) dikonversi dulu ke DOCX/XLSX/PPTX agar bisa
 * langsung disunting; format yang bisa disunting dipakai apa adanya.
 */
export const importNeedsConversion = (name: string, mimeType?: string | null) =>
  officeEditModeOf(name, mimeType) === "view";
