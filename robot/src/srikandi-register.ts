/**
 * Logika murni Registrasi Naskah Keluar SRIKANDI (diuji di `srikandi-register.test.ts`). Formulir direkam 2026-10-31 di
 * `/pembuatan-naskah-keluar/registrasi-naskah-keluar`: pilihan berupa react-select dengan pencarian ke server, opsi
 * "Nama - Jabatan[ - Instansi]" atau "KODE - Nama". Robot berhenti di SIMPAN (draf di Log Naskah Keluar) — Kirim Konsep,
 * Kirim Naskah, dan TTE tidak pernah disentuh.
 */

export const REGISTER_PATH = "/pembuatan-naskah-keluar/registrasi-naskah-keluar";
export const LOG_PATH = "/pembuatan-naskah-keluar/log-naskah-keluar";

export interface RegisterFile {
  name: string;
  mimeType: string;
  /** Isi berkas (base64) */
  data: string;
}

/** Pilihan referensi: `label` dicari di opsi SRIKANDI, `hint` (jabatan) membedakan nama kembar. */
export interface RegisterPick {
  label: string;
  hint?: string;
}

export interface RegisterForm {
  formType: "keluar" | "final";
  unit: string;
  docType: string;
  nature: string;
  classification: string;
  number?: string;
  autoNumber?: boolean;
  subject: string;
  summary: string;
  file: RegisterFile;
  attachments: RegisterFile[];
  recipientGroups: RegisterPick[];
  recipients: RegisterPick[];
  recipientsExternal: RegisterPick[];
  ccGroups: RegisterPick[];
  cc: RegisterPick[];
  ccExternal: RegisterPick[];
  verifiers: RegisterPick[];
  signer?: RegisterPick;
  signatureType: "elektronik" | "konvensional";
  visualTte: "qr" | "spesimen";
}

/** Label kolom formulir (teks label tanpa tanda bintang) untuk tiap isian react-select. */
export const SELECT_LABELS = {
  unit: "Dikirimkan melalui",
  docType: "Jenis Naskah",
  nature: "Sifat Naskah",
  classification: "Klasifikasi",
  recipientGroups: "Grup Tujuan",
  recipients: "Utama (Internal / Eksternal Srikandi)",
  recipientsExternal: "Utama Eksternal Non Srikandi",
  ccGroups: "Grup Tembusan",
  cc: "Tembusan (Internal / Eksternal Srikandi)",
  ccExternal: "Tembusan Eksternal Non Srikandi",
  verifiers: "Verifikator",
  signer: "Penandatangan",
} as const;

export type SelectKey = keyof typeof SELECT_LABELS;

/** Bentuk pembanding: huruf kecil, tanpa penanda "[ PERLU PEMBARUAN ]", spasi & tanda baca ujung dirapikan. */
export function normalizeOption(text: string) {
  return text
    .replace(/\[\s*perlu pembaruan\s*\]/gi, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Bagian pertama opsi/label ("Nama" pada "Nama - Jabatan", "KODE" pada "KODE - Nama"), tanpa titik di ujung. */
const head = (text: string) =>
  normalizeOption(text)
    .split(" - ")[0]
    .replace(/[.\s]+$/, "")
    .trim();

/**
 * Istilah pencarian yang dikirim ke kotak pencarian SRIKANDI: bagian sebelum " - " dan sebelum koma gelar. Pencarian
 * teks lengkap ("KU.204 - Laporan Keuangan") tidak selalu menemukan opsi.
 */
export function searchTerm(label: string) {
  const first = label.replace(/\[\s*perlu pembaruan\s*\]/gi, " ").split(" - ")[0];
  return first.split(",")[0].replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * Indeks opsi yang sesuai dengan pilihan LifeOS; -1 = tidak ada. Urutan: sama persis → bagian pertama (nama/kode)
 * sama (bila beberapa, yang memuat `hint` jabatan) → satu-satunya opsi yang memuat label utuh.
 */
export function pickOption(options: string[], wanted: RegisterPick): number {
  const target = normalizeOption(wanted.label);
  const norm = options.map(normalizeOption);
  const exact = norm.indexOf(target);
  if (exact >= 0) return exact;
  const wantedHead = head(wanted.label);
  const sameHead = norm.map((o, i) => ({ o, i })).filter(({ o }) => head(o) === wantedHead);
  if (sameHead.length === 1) return sameHead[0].i;
  if (sameHead.length > 1) {
    const hint = wanted.hint ? normalizeOption(wanted.hint) : "";
    const byHint = hint ? sameHead.find(({ o }) => o.includes(hint)) : undefined;
    return (byHint ?? sameHead[0]).i;
  }
  const containing = norm.map((o, i) => ({ o, i })).filter(({ o }) => o.includes(target));
  return containing.length === 1 ? containing[0].i : -1;
}

/** Baris Log Naskah Keluar (dibaca dari tabel). */
export interface LogRow {
  number: string;
  subject: string;
  sendStatus: string;
  detailId: string | null;
}

/** Draf di Log yang sama dengan entri (hal sama, belum terkirim) — dipakai agar pendaftaran tidak ganda. */
export function findDraft(rows: LogRow[], subject: string) {
  const want = normalizeOption(subject);
  return rows.find((r) => normalizeOption(r.subject) === want && !/terkirim/i.test(r.sendStatus)) ?? null;
}

/** ID detail dari tautan `…/detail?id=<terenkripsi>`. */
export function detailIdOf(href: string | null | undefined) {
  if (!href) return null;
  try {
    return new URL(href, "https://srikandi.local").searchParams.get("id");
  } catch {
    return null;
  }
}

const MB = 1024 * 1024;
export const MAX_MAIN_BYTES = 5 * MB;
export const MAX_ATTACHMENT_BYTES = 5 * MB;
export const MAX_ATTACHMENTS_BYTES = 20 * MB;

const str = (v: unknown, max = 2_000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : "");
const bytesOf = (base64: string) => Math.floor((base64.length * 3) / 4);

function file(v: unknown): RegisterFile | null {
  const f = v as Record<string, unknown> | null;
  if (!f || typeof f !== "object") return null;
  const name = str(f.name, 200);
  const data = typeof f.data === "string" ? f.data : "";
  if (!name || !data) return null;
  return { name, mimeType: str(f.mimeType, 200) || "application/octet-stream", data };
}

function picks(v: unknown): RegisterPick[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((p) => {
      const o = p as Record<string, unknown> | null;
      const label = str(o?.label, 300);
      return label ? { label, ...(str(o?.hint, 300) ? { hint: str(o?.hint, 300) } : {}) } : null;
    })
    .filter((p): p is RegisterPick => !!p)
    .slice(0, 100);
}

/** Validasi masukan job (alasan ditolak, atau formulir yang sudah dirapikan). */
export function parseRegisterForm(body: unknown): { form: RegisterForm } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const formType = b.formType === "final" ? "final" : "keluar";
  const main = file(b.file);
  if (!main) return { error: "File naskah wajib." };
  if (!/\.(pdf|docx)$/i.test(main.name)) return { error: "File naskah harus PDF atau DOCX." };
  if (bytesOf(main.data) > MAX_MAIN_BYTES) return { error: "File naskah lebih dari 5 MB." };
  const attachments = Array.isArray(b.attachments) ? b.attachments.map(file).filter((f): f is RegisterFile => !!f) : [];
  if (attachments.some((a) => bytesOf(a.data) > MAX_ATTACHMENT_BYTES))
    return { error: "Ada lampiran lebih dari 5 MB." };
  if (attachments.reduce((s, a) => s + bytesOf(a.data), 0) > MAX_ATTACHMENTS_BYTES) {
    return { error: "Total lampiran lebih dari 20 MB." };
  }
  const signerList = picks(b.signer ? [b.signer] : []);
  const form: RegisterForm = {
    formType,
    unit: str(b.unit, 300),
    docType: str(b.docType, 200),
    nature: str(b.nature, 100),
    classification: str(b.classification, 300),
    number: str(b.number, 200) || undefined,
    autoNumber: b.autoNumber === true,
    subject: str(b.subject, 1_000),
    summary: str(b.summary, 4_000),
    file: main,
    attachments: attachments.slice(0, 20),
    recipientGroups: picks(b.recipientGroups),
    recipients: picks(b.recipients),
    recipientsExternal: picks(b.recipientsExternal),
    ccGroups: picks(b.ccGroups),
    cc: picks(b.cc),
    ccExternal: picks(b.ccExternal),
    verifiers: picks(b.verifiers),
    signer: signerList[0],
    signatureType: b.signatureType === "konvensional" ? "konvensional" : "elektronik",
    visualTte: b.visualTte === "spesimen" ? "spesimen" : "qr",
  };
  const missing = [
    !form.unit && "Dikirimkan melalui",
    !form.docType && "Jenis naskah",
    !form.nature && "Sifat naskah",
    !form.classification && "Klasifikasi",
    !form.number && !form.autoNumber && "Nomor naskah",
    !form.subject && "Hal",
    !form.summary && "Isi ringkas",
    !form.recipients.length && !form.recipientGroups.length && !form.recipientsExternal.length && "Tujuan utama",
    formType === "keluar" && !form.verifiers.length && "Verifikator",
    formType === "keluar" && !form.signer && "Penandatangan",
  ].filter(Boolean);
  if (missing.length) return { error: `Isian belum lengkap: ${missing.join(", ")}.` };
  return { form };
}
