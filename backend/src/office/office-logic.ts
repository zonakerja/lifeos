/**
 * ============================================================================
 * Integrasi ONLYOFFICE Docs — logika murni (tanpa database/jaringan), diuji `office-logic.spec.ts`.
 * ----------------------------------------------------------------------------
 * Alur: backend menandatangani config editor (JWT) → browser memuat `api.js` ONLYOFFICE → ONLYOFFICE mengunduh berkas
 * dari backend (`document.url`, link bertoken) → saat disimpan ONLYOFFICE memanggil `callbackUrl` dengan link berkas
 * hasil edit → backend menyimpannya sebagai versi baru Asset. Detail: docs/ONLYOFFICE.md.
 * ============================================================================
 */
import { randomBytes } from "node:crypto";
import { extname } from "node:path";
import { OFFICE_FORMATS, type OfficeDocumentType, type OfficeEditMode } from "./office-formats";

export type { OfficeDocumentType } from "./office-formats";
export type OfficeAccess = "edit" | "comment" | "view";

/** Jenis dokumen kosong yang bisa dibuat dari templat (`backend/templates/office/`). */
export const NEW_DOCUMENT_FORMATS = ["docx", "xlsx", "pptx", "pdf"] as const;
export type NewDocumentFormat = (typeof NEW_DOCUMENT_FORMATS)[number];

/**
 * Format dokumen baru dari sebuah templat: format yang bisa dibuat (docx/xlsx/pptx/pdf) disalin apa adanya, templat
 * lain (dotx, odt, ott, xltx, ods, potx, odp, doc, …) dikonversi ke docx/xlsx/pptx. null = tidak bisa jadi templat.
 */
export function templateTarget(format: string): NewDocumentFormat | null {
  if ((NEW_DOCUMENT_FORMATS as readonly string[]).includes(format)) return format as NewDocumentFormat;
  const type = documentTypeOf(format);
  return type === "word" ? "docx" : type === "cell" ? "xlsx" : type === "slide" ? "pptx" : null;
}

/**
 * Nama keluarga font yang terpasang di ONLYOFFICE, dari `sdkjs/common/AllFonts.js` (dibuat ulang saat container start;
 * baris `["Nama",indeks,…]` di `__fonts_infos`). Urut abjad, tanpa duplikat.
 */
export function parseFontFamilies(allFontsJs: string): string[] {
  const start = allFontsJs.indexOf('window["__fonts_infos"]');
  if (start < 0) return [];
  const end = allFontsJs.indexOf("];", start);
  const block = allFontsJs.slice(start, end < 0 ? undefined : end);
  const names = new Set<string>();
  for (const match of block.matchAll(/^\["((?:[^"\\]|\\.)*)",\s*\d/gm)) {
    try {
      names.add(JSON.parse(`"${match[1]}"`) as string);
    } catch {
      names.add(match[1]);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));
}

/** MIME type per format yang bisa dibuat dari templat kosong. */
export const NEW_DOCUMENT_MIME: Record<NewDocumentFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
};

export interface OfficeFormatInfo {
  documentType: OfficeDocumentType;
  /** `edit` sunting tanpa kehilangan format · `lossy` bisa disunting, sebagian format bisa hilang · `view` baca saja */
  mode: OfficeEditMode;
  comment: boolean;
  review: boolean;
  fill: boolean;
}

/** Kemampuan ONLYOFFICE untuk satu format (daftar resmi `office-formats.ts`); null = tidak bisa dibuka. */
export function formatInfo(format: string): OfficeFormatInfo | null {
  const row = Object.hasOwn(OFFICE_FORMATS, format) ? OFFICE_FORMATS[format] : undefined;
  if (!row) return null;
  const [documentType, mode, flags] = row;
  return { documentType, mode, comment: flags.includes("c"), review: flags.includes("r"), fill: flags.includes("f") };
}

/** Bisa disunting dan disimpan kembali dalam format yang sama (termasuk format "lossy"). */
export const isEditableFormat = (format: string) => {
  const mode = formatInfo(format)?.mode;
  return mode === "edit" || mode === "lossy";
};

/** Semua format yang bisa disunting (untuk status/halaman Tools). */
export const editableFormats = () => Object.keys(OFFICE_FORMATS).filter(isEditableFormat);
/** Semua format yang bisa dibuka (lihat). */
export const viewableFormats = () => Object.keys(OFFICE_FORMATS);

/** Ekstensi berkas (huruf kecil, tanpa titik) dari nama asli. */
export const fileFormat = (name: string) => extname(name).slice(1).toLowerCase();

export const documentTypeOf = (format: string): OfficeDocumentType | null => formatInfo(format)?.documentType ?? null;

/** Jumlah versi yang disimpan per berkas, termasuk isi saat ini (keputusan user: 10 versi terakhir). */
export const MAX_VERSIONS = 10;

/** Kunci sesi edit baru (karakter aman untuk `document.key`: 0-9 a-z A-Z - . _ =). */
export const newOfficeKey = () =>
  randomBytes(9)
    .toString("base64url")
    .replace(/[^0-9a-zA-Z_-]/g, "");

/** `document.key` ONLYOFFICE: unik per isi berkas; berganti setiap kali sesi edit selesai disimpan (maks. 128). */
export const documentKey = (assetId: string, officeKey: string) => `${assetId}-${officeKey}`.slice(0, 128);

/** Judul dokumen baru yang aman sebagai nama berkas, dengan ekstensi format. */
export function newDocumentName(title: string | undefined, format: NewDocumentFormat) {
  const base =
    (title ?? "")
      // Karakter yang tidak boleh ada di nama berkas Windows/Unix + karakter kontrol
      .replace(/[\\/:*?"<>|\p{Cc}]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(new RegExp(`\\.${format}$`, "i"), "")
      .slice(0, 120) || "Dokumen tanpa judul";
  return `${base}.${format}`;
}

/** Hak akses efektif di editor: format yang tidak bisa diedit / mode lihat selalu `view`. */
export function effectiveAccess(params: {
  format: string;
  permission: OfficeAccess;
  requestedMode?: "edit" | "view";
}): OfficeAccess {
  const info = formatInfo(params.format);
  if (params.requestedMode === "view" || !info || !isEditableFormat(params.format)) return "view";
  // Izin Komentar pada format tanpa fitur komentar → hanya bisa dilihat
  if (params.permission === "comment" && !info.comment) return "view";
  return params.permission;
}

/**
 * Alamat backend yang dihubungi container ONLYOFFICE (unduh berkas + callback).
 * `auto` (development): backend berjalan di Windows, ONLYOFFICE di Docker dalam WSL → IP gateway WSL = IPv4 antarmuka
 * Windows `vEthernet (WSL …)` (berubah setelah restart, jadi dibaca saat dibutuhkan). Tanpa antarmuka WSL (Linux/macOS)
 * → `host.docker.internal`.
 */
export function resolveBackendUrl(
  configured: string,
  port: number,
  interfaces: Record<string, { family: string | number; address: string; internal?: boolean }[] | undefined>,
) {
  if (configured && configured !== "auto") return configured.replace(/\/+$/, "");
  for (const [name, addresses] of Object.entries(interfaces)) {
    if (!/wsl/i.test(name)) continue;
    const ipv4 = addresses?.find((a) => (a.family === "IPv4" || a.family === 4) && !a.internal);
    if (ipv4) return `http://${ipv4.address}:${port}`;
  }
  return `http://host.docker.internal:${port}`;
}

/**
 * Link berkas hasil edit dari callback → alamat yang dapat dijangkau backend. Hanya host ONLYOFFICE yang diterima
 * (mencegah SSRF lewat callback palsu). Link berawalan URL publik (mis. `https://domain/office/...`) dialihkan ke URL
 * internal (`http://onlyoffice/...`).
 */
export function toInternalUrl(url: string, publicUrl: string, internalUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL berkas dari ONLYOFFICE tidak valid.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Skema URL tidak didukung.");
  const pub = publicUrl.replace(/\/+$/, "");
  const internal = internalUrl.replace(/\/+$/, "");
  const href = parsed.href;
  if (href.startsWith(`${pub}/`)) return internal + href.slice(pub.length);
  if (parsed.origin === new URL(internal).origin) return href;
  throw new Error("URL berkas bukan dari server ONLYOFFICE.");
}

/** Status callback ONLYOFFICE (https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/). */
export const CALLBACK_STATUS = {
  editing: 1,
  mustSave: 2,
  saveError: 3,
  closedNoChanges: 4,
  forceSave: 6,
  forceSaveError: 7,
} as const;

export interface OfficeCallbackBody {
  key?: string;
  status?: number;
  url?: string;
  filetype?: string;
  users?: string[];
  forcesavetype?: number;
}

/** Callback yang membawa berkas untuk disimpan. Status 3/7 (gagal) tidak disimpan. */
export const callbackCarriesFile = (body: OfficeCallbackBody) =>
  (body.status === CALLBACK_STATUS.mustSave || body.status === CALLBACK_STATUS.forceSave) && !!body.url;

/** Sesi edit selesai (semua editor tertutup) → kunci sesi berganti agar pembukaan berikutnya memuat isi terbaru. */
export const callbackEndsSession = (status: number | undefined) =>
  status === CALLBACK_STATUS.mustSave || status === CALLBACK_STATUS.closedNoChanges;

export interface StoredVersion {
  version: number;
  objectKey: string;
  checksum: string;
  sessionKey: string | null;
}

/**
 * Rencana menyimpan isi baru:
 *  - isi sama dengan saat ini → `unchanged`;
 *  - sesi edit ini sudah pernah menyimpan (riwayat terakhir digantikan oleh sesi yang sama) → `replace`: isi saat ini
 *    hanyalah simpanan antara di sesi yang sama, ditimpa tanpa menambah riwayat (Ctrl+S berkali-kali = satu versi);
 *  - selain itu → `push`: isi saat ini masuk riwayat dan isi baru menjadi versi berikutnya.
 * `stale` = callback dari sesi lama (kunci dokumen sudah berganti karena versi dipulihkan): editor sesi lama yang
 * ditutup setelah "Pulihkan" mengirim ulang isinya (dibuat ulang ONLYOFFICE, jadi checksum bisa berbeda walau isinya sama)
 * dan tidak boleh membatalkan pemulihan → `archive`: isinya hanya masuk RIWAYAT (tepat di bawah versi saat ini), isi
 * saat ini tetap. Isi yang checksum-nya sudah ada di riwayat diabaikan. Tidak ada hasil edit yang hilang.
 * `prune` = versi riwayat terlama yang melebihi batas (total versi termasuk isi saat ini ≤ MAX_VERSIONS).
 */
export function planVersionSave(params: {
  currentChecksum: string;
  newChecksum: string;
  sessionKey: string;
  history: StoredVersion[];
  stale?: boolean;
  max?: number;
}):
  | { action: "unchanged" }
  | { action: "replace" }
  | { action: "push"; prune: StoredVersion[] }
  | { action: "archive"; prune: StoredVersion[] } {
  if (params.currentChecksum === params.newChecksum) return { action: "unchanged" };
  const sorted = [...params.history].sort((a, b) => b.version - a.version);
  // Riwayat bertambah satu (isi lama / isi sesi lama) + isi saat ini ≤ MAX_VERSIONS
  const prune = sorted.slice(Math.max((params.max ?? MAX_VERSIONS) - 2, 0));
  if (params.stale) {
    if (params.history.some((v) => v.checksum === params.newChecksum)) return { action: "unchanged" };
    return { action: "archive", prune };
  }
  if (sorted[0] && sorted[0].sessionKey === params.sessionKey) return { action: "replace" };
  return { action: "push", prune };
}

/** Riwayat yang dipangkas saat memulihkan versi (isi saat ini masuk riwayat). */
export const versionsToPrune = (history: StoredVersion[], max = MAX_VERSIONS) =>
  [...history].sort((a, b) => b.version - a.version).slice(Math.max(max - 2, 0));

export interface EditorConfigInput {
  asset: { id: string; originalName: string; officeKey: string };
  format: string;
  documentType: OfficeDocumentType;
  access: OfficeAccess;
  user: { id: string; name: string };
  fileUrl: string;
  callbackUrl: string;
  lang?: string;
  /** Layar kecil → tampilan seluler ONLYOFFICE */
  mobile?: boolean;
  /** Tema LifeOS saat editor dibuka (config bertanda tangan tidak boleh diubah browser, jadi ikut dikirim ke backend) */
  theme?: "light" | "dark";
  /**
   * AI di editor (sakelar user): aktif = tab AI plugin resmi ONLYOFFICE dengan opsi `pluginOptions` untuk GUID plugin itu
   * (token sesi AI + alamat backend, dibaca jembatan LifeOS); mati = tab AI tidak ada.
   */
  ai?: { enabled: boolean; guid: string; pluginOptions?: Record<string, unknown> };
}

/** Config `DocsAPI.DocEditor` (belum ditandatangani). */
export function buildEditorConfig(input: EditorConfigInput) {
  const info = formatInfo(input.format);
  const canEdit = input.access === "edit";
  const canComment = input.access !== "view" && !!info?.comment;
  // Mode edit dibutuhkan untuk menyunting atau berkomentar (izin Komentar = mode edit dengan permissions.edit = false)
  const editMode = canEdit || canComment;
  const aiOn = !!input.ai?.enabled && !!input.ai.pluginOptions && editMode;
  return {
    type: input.mobile ? "mobile" : "desktop",
    documentType: input.documentType,
    width: "100%",
    height: "100%",
    document: {
      fileType: input.format,
      key: documentKey(input.asset.id, input.asset.officeKey),
      title: input.asset.originalName,
      url: input.fileUrl,
      permissions: {
        edit: canEdit,
        comment: canComment,
        review: canEdit && !!info?.review,
        fillForms: (canEdit || canComment) && !!info?.fill,
        download: true,
        print: true,
        copy: true,
        modifyFilter: canEdit,
        modifyContentControl: canEdit,
        chat: editMode,
      },
    },
    editorConfig: {
      mode: editMode ? "edit" : "view",
      lang: input.lang ?? "id",
      region: "id-ID",
      callbackUrl: input.callbackUrl,
      user: { id: input.user.id, name: input.user.name },
      customization: {
        // Tombol Simpan langsung menyimpan versi (callback status 6), tidak menunggu editor ditutup
        forcesave: canEdit,
        compactHeader: true,
        // Tab AI hanya bila diaktifkan user; isinya memakai AI LifeOS (docs/ONLYOFFICE.md §3.4)
        ai: { disabled: !aiOn },
        help: false,
        feedback: false,
        uiTheme: input.theme === "dark" ? "default-dark" : "default-light",
      },
      ...(aiOn
        ? {
            // Opsi hanya untuk GUID plugin AI (plugin lain tidak menerima token sesi AI)
            plugins: { options: { [input.ai!.guid]: input.ai!.pluginOptions } },
          }
        : {}),
    },
  };
}
