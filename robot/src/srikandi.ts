/**
 * Logika murni SRIKANDI (diuji di `srikandi.test.ts`): membaca tabel Daftar Naskah Keluar
 * (`/pembuatan-naskah-keluar/naskah-keluar`) dan menentukan naskah yang sudah ditandatangani. Robot hanya **membaca**
 * dan membuka halaman detail untuk menangkap PDF naskah yang dimuat penampil — tidak pernah menekan Kirim, Setujui,
 * Tandatangani, atau mengubah metadata.
 */

export interface OutgoingLetter {
  /** Kunci stabil = nomor naskah (parameter `id` alamat detail terenkripsi acak, tidak bisa dijadikan kunci) */
  key: string;
  dateText: string;
  /** YYYY-MM-DD (dari "Kamis, 1 Oktober 2026"), kosong bila tidak terbaca */
  date: string;
  number: string;
  subject: string;
  origin: string;
  verifyStatus: string;
  signStatus: string;
  sendStatus: string;
  fileStatus: string;
  /** Alamat halaman detail (relatif / absolut) */
  detailUrl: string;
}

const MONTHS = [
  "januari",
  "februari",
  "maret",
  "april",
  "mei",
  "juni",
  "juli",
  "agustus",
  "september",
  "oktober",
  "november",
  "desember",
];

/** "Kamis, 1 Oktober 2026" → "2026-10-01". */
export function parseIndonesianDate(text: string): string {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(text);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) + 1 : 0;
  if (!m || !month) return "";
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Satu baris tabel (10 kolom: No, Tanggal, Nomor, Hal, Asal, Status Verifikator, Status Penandatanganan, Status Kirim,
 * Status Berkas, Aksi) + tautan "Lihat". Baris filter/keterangan (tanpa nomor & tautan detail) → null.
 */
export function parseLetterRow(cells: string[], detailUrl: string | null): OutgoingLetter | null {
  if (cells.length < 9 || !detailUrl) return null;
  const [, dateText, number, subject, origin, verifyStatus, signStatus, sendStatus, fileStatus] = cells.map(tidy);
  if (!number && !subject) return null;
  return {
    key: number || `${dateText}|${subject}`.slice(0, 200),
    dateText,
    date: parseIndonesianDate(dateText),
    number,
    subject,
    origin,
    verifyStatus,
    signStatus,
    sendStatus,
    fileStatus,
    detailUrl,
  };
}

const PENDING = /belum|tolak|menunggu|proses|revisi|kembali|draf/i;

/** Sudah ditandatangani: status penandatanganan berisi SETUJU/SELESAI/SUDAH dan tidak ada yang masih tertunda/ditolak. */
export const isSigned = (signStatus: string) =>
  /setuju|selesai|sudah|ditandatangani/i.test(signStatus) && !PENDING.test(signStatus);

/** Nama berkas PDF yang aman dari nomor naskah, mis. "182-SDJ.KEU-X-2026.pdf". */
export function letterFileName(letter: Pick<OutgoingLetter, "number" | "date">): string {
  const base = (letter.number || `naskah-${letter.date || "tanpa-tanggal"}`)
    .replace(/[\\/]+/g, "-")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .slice(0, 120);
  return `${base || "naskah"}.pdf`;
}

/** Isi berkas benar-benar PDF (bukan halaman galat yang kebetulan bertipe octet-stream). */
export const looksLikePdf = (bytes: Uint8Array) =>
  bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;

const FILE_NAME = /^(.+?\.(pdf|docx?|xlsx?|pptx?|odt|ods|jpe?g|png|zip|rar))\s*(Lihat)?$/i;

/**
 * Teks butir daftar lampiran di detail naskah ("Laporan_Hasil.pdf Lihat") → nama berkas. Hanya butir yang berupa nama
 * berkas yang dianggap lampiran — robot hanya mengklik "Lihat" pada butir ini (melihat, bukan mengubah).
 */
export function attachmentName(text: string): string | null {
  const m = FILE_NAME.exec(text.replace(/\s+/g, " ").trim());
  return m ? m[1].trim() : null;
}

const MIME: Record<string, string> = {
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
  rar: "application/vnd.rar",
};

export const mimeForName = (name: string) =>
  MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

/** Respons jaringan yang mungkin berisi berkas (bukan halaman/JSON/skrip). */
export const isFileResponse = (contentType: string) =>
  /pdf|octet-stream|officedocument|msword|ms-excel|ms-powerpoint|opendocument|zip|rar|image\/(jpe?g|png)/i.test(
    contentType,
  );

/** Isi respons berkas yang sah: PDF diawali "%PDF", jenis lain bukan teks HTML/JSON. */
export function validFileBody(bytes: Uint8Array, expectedName: string): boolean {
  if (bytes.length < 5) return false;
  if (expectedName.toLowerCase().endsWith(".pdf")) return looksLikePdf(bytes);
  return bytes[0] !== 0x3c && bytes[0] !== 0x7b; // "<" (HTML) atau "{" (JSON)
}

const SECOND_LEVEL = new Set(["go", "co", "ac", "or", "web", "sch", "mil", "net", "my", "biz", "ponpes", "desa"]);

/** Domain terdaftar: "s3.arsip.go.id" → "arsip.go.id", "a.b.example.com" → "example.com". */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().split(".").filter(Boolean);
  const n = parts.length >= 3 && SECOND_LEVEL.has(parts[parts.length - 2]) ? 3 : 2;
  return parts.slice(-n).join(".");
}

/** Berkas lampiran boleh diambil ulang hanya dari domain yang sama dengan sistem (mis. s3.arsip.go.id untuk SRIKANDI). */
export function sameSite(url: string, baseUrl: string): boolean {
  try {
    const a = new URL(url);
    const b = new URL(baseUrl);
    return a.protocol === "https:" && registrableDomain(a.hostname) === registrableDomain(b.hostname);
  } catch {
    return false;
  }
}
