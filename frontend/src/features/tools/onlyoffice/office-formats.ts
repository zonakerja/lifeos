import type { OfficeFormat } from "@/types/api";

/**
 * Jenis berkas untuk editor ONLYOFFICE (logika murni, diuji `office-formats.test.ts`). Tabel = daftar resmi ONLYOFFICE
 * Docs 10.0 (`document-formats/onlyoffice-docs-formats.json`), sama dengan backend `src/office/office-formats.ts`:
 * `edit` = sunting tanpa kehilangan format · `lossy` = bisa disunting, sebagian format bisa hilang · `view` = baca saja.
 * Backend tetap penentu akhir hak akses (`POST /office/config`).
 */

export type OfficeKind = "word" | "cell" | "slide" | "pdf" | "diagram";
export type OfficeEditMode = "edit" | "lossy" | "view";

const FORMATS: Record<string, [OfficeKind, OfficeEditMode]> = {
  doc: ["word", "view"],
  docm: ["word", "edit"],
  docx: ["word", "edit"],
  dot: ["word", "view"],
  dotm: ["word", "edit"],
  dotx: ["word", "edit"],
  epub: ["word", "lossy"],
  fb2: ["word", "lossy"],
  fodt: ["word", "view"],
  gdoc: ["word", "view"],
  hml: ["word", "view"],
  htm: ["word", "view"],
  html: ["word", "lossy"],
  hwp: ["word", "view"],
  hwpx: ["word", "view"],
  md: ["word", "lossy"],
  mht: ["word", "view"],
  mhtml: ["word", "view"],
  odt: ["word", "lossy"],
  ott: ["word", "lossy"],
  pages: ["word", "view"],
  rtf: ["word", "lossy"],
  stw: ["word", "view"],
  sxw: ["word", "view"],
  txt: ["word", "lossy"],
  wps: ["word", "view"],
  wpt: ["word", "view"],
  xml: ["word", "view"],
  csv: ["cell", "lossy"],
  et: ["cell", "view"],
  ett: ["cell", "view"],
  fods: ["cell", "view"],
  gsheet: ["cell", "view"],
  numbers: ["cell", "view"],
  ods: ["cell", "lossy"],
  ots: ["cell", "lossy"],
  tsv: ["cell", "lossy"],
  sxc: ["cell", "view"],
  xls: ["cell", "lossy"],
  xlsb: ["cell", "edit"],
  xlsm: ["cell", "edit"],
  xlsx: ["cell", "edit"],
  xlt: ["cell", "view"],
  xltm: ["cell", "edit"],
  xltx: ["cell", "edit"],
  dps: ["slide", "view"],
  dpt: ["slide", "view"],
  fodp: ["slide", "view"],
  gslides: ["slide", "view"],
  key: ["slide", "view"],
  odg: ["slide", "view"],
  odp: ["slide", "lossy"],
  otp: ["slide", "lossy"],
  pot: ["slide", "view"],
  potm: ["slide", "edit"],
  potx: ["slide", "edit"],
  pps: ["slide", "view"],
  ppsm: ["slide", "edit"],
  ppsx: ["slide", "edit"],
  ppt: ["slide", "view"],
  pptm: ["slide", "edit"],
  pptx: ["slide", "edit"],
  sxi: ["slide", "view"],
  djvu: ["pdf", "view"],
  oxps: ["pdf", "view"],
  pdf: ["pdf", "edit"],
  xps: ["pdf", "view"],
  ofd: ["pdf", "view"],
  vsdx: ["diagram", "view"],
  vsdm: ["diagram", "view"],
  vssm: ["diagram", "view"],
  vssx: ["diagram", "view"],
  vstm: ["diagram", "view"],
  vstx: ["diagram", "view"],
};

/** MIME → ekstensi, untuk berkas yang namanya tidak berekstensi (mis. judul resource). */
const EXT_BY_MIME: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-word.document.macroenabled.12": "docm",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": "dotx",
  "application/msword": "doc",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.oasis.opendocument.text-template": "ott",
  "application/rtf": "rtf",
  "text/rtf": "rtf",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/html": "html",
  "application/epub+zip": "epub",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel.sheet.macroenabled.12": "xlsm",
  "application/vnd.ms-excel.sheet.binary.macroenabled.12": "xlsb",
  "application/vnd.ms-excel": "xls",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "text/csv": "csv",
  "text/tab-separated-values": "tsv",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow": "ppsx",
  "application/vnd.ms-powerpoint.presentation.macroenabled.12": "pptm",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/pdf": "pdf",
  "image/vnd.djvu": "djvu",
  "application/vnd.ms-xpsdocument": "xps",
  "application/oxps": "oxps",
  "application/vnd.ms-visio.drawing": "vsdx",
};

export const extensionOf = (name?: string | null) => {
  const match = /\.([a-z0-9]+)$/i.exec(name ?? "");
  return match ? match[1].toLowerCase() : "";
};

/** Format ONLYOFFICE berkas: ekstensi nama (bila dikenal ONLYOFFICE), selain itu dari MIME; null = tidak bisa dibuka. */
export function officeFormatOf(name?: string | null, mimeType?: string | null): string | null {
  const ext = extensionOf(name);
  if (ext && Object.hasOwn(FORMATS, ext)) return ext;
  const fromMime = EXT_BY_MIME[(mimeType ?? "").split(";")[0].trim().toLowerCase()];
  return fromMime ?? null;
}

/** Jenis dokumen ONLYOFFICE; null = tidak bisa dibuka di ONLYOFFICE. */
export function officeKindOf(name?: string | null, mimeType?: string | null): OfficeKind | null {
  const format = officeFormatOf(name, mimeType);
  return format ? FORMATS[format][0] : null;
}

/** Mode sunting ONLYOFFICE (`edit` / `lossy` / `view`); null = tidak bisa dibuka. */
export function officeEditModeOf(name?: string | null, mimeType?: string | null): OfficeEditMode | null {
  const format = officeFormatOf(name, mimeType);
  return format ? FORMATS[format][1] : null;
}

/** Bisa disunting & disimpan kembali dalam format yang sama (termasuk format "lossy"). */
export function isOfficeEditable(name?: string | null, mimeType?: string | null) {
  const mode = officeEditModeOf(name, mimeType);
  return mode === "edit" || mode === "lossy";
}

export const OFFICE_KIND_LABELS: Record<OfficeKind, string> = {
  word: "Dokumen",
  cell: "Spreadsheet",
  slide: "Presentasi",
  pdf: "PDF",
  diagram: "Diagram",
};

/** Pilihan "Buat baru" — urutan tampil di menu. */
export const NEW_DOCUMENT_TYPES: Record<OfficeFormat, { kind: OfficeKind; label: string; hint: string }> = {
  docx: { kind: "word", label: "Dokumen", hint: "Surat, nota dinas, laporan (.docx)" },
  xlsx: { kind: "cell", label: "Spreadsheet", hint: "Tabel, anggaran, rekap data (.xlsx)" },
  pptx: { kind: "slide", label: "Presentasi", hint: "Bahan paparan (.pptx)" },
  pdf: { kind: "pdf", label: "PDF / Formulir", hint: "Dokumen PDF atau formulir isian (.pdf)" },
};

/** Ekstensi per mode sunting (halaman Tools → ONLYOFFICE). */
export function officeFormatsByMode(): Record<OfficeEditMode, string[]> {
  const result: Record<OfficeEditMode, string[]> = { edit: [], lossy: [], view: [] };
  for (const [ext, [, mode]] of Object.entries(FORMATS)) result[mode].push(ext);
  return result;
}
