import { createHash } from "node:crypto";

/**
 * Logika murni sinkron naskah keluar SRIKANDI → record `srikandi_letter` (diuji di `srikandi-sync.spec.ts`).
 * Kunci = nomor naskah (alamat detail SRIKANDI memakai id terenkripsi acak).
 */

export interface SyncedLetter {
  key: string;
  dateText: string;
  date: string;
  number: string;
  subject: string;
  origin: string;
  verifyStatus: string;
  signStatus: string;
  sendStatus: string;
  fileStatus: string;
}

export interface FetchedLetter {
  key: string;
  name: string;
  /** PDF base64; null = tidak tertangkap */
  pdf: string | null;
  attachments?: FetchedAttachment[];
  pages: string[];
}

export const letterClientId = (key: string) => `sk-${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;

const clip = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

export function cleanLetter(value: unknown): SyncedLetter | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const key = clip(v.key, 300).trim();
  if (!key) return null;
  const date = clip(v.date, 10);
  return {
    key,
    dateText: clip(v.dateText, 80),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    number: clip(v.number, 200),
    subject: clip(v.subject, 2000),
    origin: clip(v.origin, 500),
    verifyStatus: clip(v.verifyStatus, 80),
    signStatus: clip(v.signStatus, 80),
    sendStatus: clip(v.sendStatus, 80),
    fileStatus: clip(v.fileStatus, 80),
  };
}

/** Nama berkas aman (robot sudah membersihkan; diperiksa ulang di server). */
export const safePdfName = (name: unknown) => {
  const base = clip(name, 150)
    .replace(/[^\w.\- ]+/g, "")
    .trim();
  return base.toLowerCase().endsWith(".pdf") && base.length > 4 ? base : "naskah-srikandi.pdf";
};

export const MAX_LETTER_PDF = 25 * 1024 * 1024;

/** Base64 → Buffer PDF yang sah (diawali "%PDF") dan tidak melebihi batas; selain itu null. */
export function decodePdf(base64: unknown): Buffer | null {
  if (typeof base64 !== "string" || !base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0 || buffer.length > MAX_LETTER_PDF) return null;
  return buffer.subarray(0, 4).toString("latin1") === "%PDF" ? buffer : null;
}

export interface FetchedAttachment {
  name: string;
  data: string | null;
  mimeType: string;
}

/** Lampiran tersimpan di record naskah: berkas LifeOS, atau `uploadId` kosong bila belum tertangkap. */
export interface LetterAttachment {
  name: string;
  uploadId?: string;
}

const ATTACHMENT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  zip: "application/zip",
};

/** Nama lampiran aman + jenisnya (hanya ekstensi yang dikenal); selain itu null. */
export function safeAttachment(name: unknown): { name: string; mimeType: string } | null {
  const clean = clip(name, 180)
    .replace(/[^\w.\- ()]+/g, "")
    .trim();
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = ATTACHMENT_MIME[ext];
  return mimeType && clean.length > ext.length + 1 ? { name: clean, mimeType } : null;
}

/** Isi lampiran base64 → Buffer bila sah (PDF diawali "%PDF", lainnya bukan HTML/JSON) dan ≤ batas. */
export function decodeAttachment(data: unknown, name: string): Buffer | null {
  if (typeof data !== "string" || !data) return null;
  const buffer = Buffer.from(data, "base64");
  if (buffer.length < 5 || buffer.length > MAX_LETTER_PDF) return null;
  if (name.toLowerCase().endsWith(".pdf")) return buffer.subarray(0, 4).toString("latin1") === "%PDF" ? buffer : null;
  return buffer[0] === 0x3c || buffer[0] === 0x7b ? null : buffer;
}

/** Gabung lampiran lama & baru per nama: berkas yang sudah tersimpan tidak diunggah ulang. */
export function mergeAttachments(current: LetterAttachment[], next: LetterAttachment[]): LetterAttachment[] {
  const result = [...current];
  for (const item of next) {
    const found = result.find((r) => r.name === item.name);
    if (!found) result.push(item);
    else if (!found.uploadId && item.uploadId) found.uploadId = item.uploadId;
  }
  return result;
}

/** ID Resource Global untuk berkas naskah (stabil → sinkron ulang tidak membuat ganda). */
export const letterResourceId = (uploadId: string) => `res-sk-${uploadId}`;
