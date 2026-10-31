import type {
  SrikandiLetter,
  SrikandiOutgoing,
  SrikandiOutgoingFile,
  SrikandiReference,
  SrikandiReferenceCategory,
} from "@/types/entities";

/**
 * Logika murni Register Naskah Keluar (diuji di `register-logic.test.ts`). Aturan diambil dari formulir Registrasi
 * Naskah Keluar SRIKANDI V3 (docs/AI-AGENT.md §21.11): isian wajib, format & batas lampiran, pilihan tujuan.
 */

const MB = 1024 * 1024;
/** File naskah: satu berkas DOCX atau PDF (SRIKANDI menyarankan PDF). */
export const MAIN_EXTENSIONS = ["pdf", "docx"] as const;
/** Format lampiran yang diterima SRIKANDI. */
export const ATTACHMENT_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "doc",
  "docx",
  "pdf",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "mp4",
  "wav",
];
export const MAX_ATTACHMENT_BYTES = 5 * MB;
export const MAX_ATTACHMENTS_TOTAL_BYTES = 20 * MB;

/** Saran isian (pilihan sebenarnya diatur per instansi di SRIKANDI; tetap boleh diketik bebas). */
export const DOC_TYPE_SUGGESTIONS = [
  "Nota Dinas",
  "Surat Dinas",
  "Undangan Internal",
  "Undangan Eksternal",
  "Surat Edaran",
  "Surat Tugas",
  "Memorandum",
  "Surat Keterangan",
  "Surat Pengantar",
  "Laporan",
];
export const NATURE_SUGGESTIONS = ["Biasa", "Terbatas", "Rahasia", "Sangat Rahasia"];

export const FORM_TYPE_LABELS: Record<SrikandiOutgoing["formType"], string> = {
  keluar: "Naskah Keluar",
  final: "Naskah Final",
};

export const extensionOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
};

const baseName = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? name : name.slice(0, dot);
};

/** Karakter yang dilarang SRIKANDI pada nama lampiran: titik, koma, dan simbol !@#$%^&*(). */
const FORBIDDEN_NAME_CHARS = /[.,!@#$%^&*()]+/g;

/** Nama lampiran yang aman untuk SRIKANDI (deretan karakter terlarang → "_", ekstensi dipertahankan). */
export function cleanAttachmentName(name: string) {
  const ext = extensionOf(name);
  const base = baseName(name).replace(FORBIDDEN_NAME_CHARS, "_");
  return ext ? `${base || "lampiran"}.${ext}` : base || "lampiran";
}

/** Alasan file naskah ditolak; null = boleh. */
export function mainFileError(file: Pick<SrikandiOutgoingFile, "name">) {
  const ext = extensionOf(file.name);
  return (MAIN_EXTENSIONS as readonly string[]).includes(ext) ? null : "File naskah harus PDF atau DOCX.";
}

/** Alasan satu lampiran ditolak SRIKANDI; null = boleh. */
export function attachmentError(file: Pick<SrikandiOutgoingFile, "name" | "size">) {
  const ext = extensionOf(file.name);
  if (!ATTACHMENT_EXTENSIONS.includes(ext)) return "Format lampiran tidak diterima SRIKANDI.";
  if (file.size !== undefined && file.size > MAX_ATTACHMENT_BYTES) return "Lebih dari 5 MB.";
  if (cleanAttachmentName(file.name) !== file.name)
    return "Nama memuat titik, koma, atau simbol — akan diganti saat didaftarkan.";
  return null;
}

/** Nama lampiran hanya peringatan (robot akan mengganti namanya); format & ukuran = penghalang. */
const isBlockingAttachmentError = (file: SrikandiOutgoingFile) => {
  const error = attachmentError(file);
  return !!error && !error.startsWith("Nama ");
};

export const formatSize = (bytes?: number) =>
  bytes === undefined
    ? ""
    : bytes < MB
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / MB).toFixed(1)} MB`;

export const attachmentsTotal = (files: SrikandiOutgoingFile[] = []) =>
  files.reduce((sum, f) => sum + (f.size ?? 0), 0);

/** Kekurangan isian agar entri siap didaftarkan ke SRIKANDI (kosong = lengkap). */
export function registerIssues(entry: SrikandiOutgoing): string[] {
  const issues: string[] = [];
  const blank = (v?: string) => !v?.trim();
  if (blank(entry.unit)) issues.push("Dikirimkan melalui");
  if (blank(entry.docType)) issues.push("Jenis naskah");
  if (blank(entry.nature)) issues.push("Sifat naskah");
  if (blank(entry.classification)) issues.push("Klasifikasi");
  if (blank(entry.number) && !entry.autoNumber) issues.push("Nomor naskah");
  if (blank(entry.subject)) issues.push("Hal");
  if (blank(entry.summary)) issues.push("Isi ringkas");
  if (!entry.file) issues.push("File naskah");
  else if (mainFileError(entry.file)) issues.push("File naskah harus PDF/DOCX");
  if (!entry.recipients?.length && !entry.recipientGroups?.length && !entry.recipientsExternal?.length)
    issues.push("Tujuan utama");
  if (entry.formType === "keluar") {
    if (!entry.verifiers?.length) issues.push("Verifikator");
    if (!entry.signer) issues.push("Penandatangan");
  }
  const attachments = entry.attachments ?? [];
  if (attachments.some(isBlockingAttachmentError)) issues.push("Lampiran tidak sesuai format/ukuran");
  if (attachmentsTotal(attachments) > MAX_ATTACHMENTS_TOTAL_BYTES) issues.push("Total lampiran lebih dari 20 MB");
  return issues;
}

export type RegisterStatus = "incomplete" | "ready" | "submitted" | "done";

export const REGISTER_STATUS_LABELS: Record<RegisterStatus, string> = {
  incomplete: "Belum lengkap",
  ready: "Siap didaftarkan",
  submitted: "Terdaftar di SRIKANDI",
  done: "Naskah final tertaut",
};

/** Status tampilan: tahap yang disimpan + kelengkapan isian untuk draf. */
export function registerStatus(entry: SrikandiOutgoing): RegisterStatus {
  if (entry.letterId) return "done";
  if (entry.status === "submitted" || entry.status === "done") return "submitted";
  return registerIssues(entry).length ? "incomplete" : "ready";
}

/** Jenis tujuan/tembusan referensi: SRIKANDI (internal/eksternal) atau eksternal non SRIKANDI. */
export const isNonSrikandi = (ref: SrikandiReference) =>
  /non\s*srikandi/i.test(ref.fields?.["Jenis Tujuan"] ?? ref.fields?.["Jenis Tembusan"] ?? "");

/** Pilihan referensi satu kategori; `nonSrikandi` menyaring jenis tujuan/tembusan. */
export function referenceChoices(
  refs: SrikandiReference[],
  category: SrikandiReferenceCategory,
  nonSrikandi?: boolean,
): SrikandiReference[] {
  return refs
    .filter((r) => r.category === category && (nonSrikandi === undefined || isNonSrikandi(r) === nonSrikandi))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Pilihan Klasifikasi formulir: klasifikasi berstatus Aktif (yang Non-Aktif tidak dipakai untuk naskah baru), urut kode.
 * Bila status belum terbaca (tidak ada yang Aktif), semua ditampilkan.
 */
export function classificationChoices(refs: SrikandiReference[]) {
  const all = refs.filter((r) => r.category === "classification");
  const active = all.filter((r) => /^aktif$/i.test(r.fields?.["Status"] ?? ""));
  return (active.length ? active : all).sort((a, b) =>
    a.label.localeCompare(b.label, "id", { numeric: true, sensitivity: "base" }),
  );
}

/** Keterangan singkat satu referensi (jabatan / unit) untuk daftar pilihan. */
export function referenceHint(ref: SrikandiReference) {
  const f = ref.fields ?? {};
  return [
    f["Jabatan"],
    f["Unit Kerja / Instansi"] ?? f["Instansi / Unit Kerja"],
    f["Jenis Tujuan"] ?? f["Jenis Tembusan"],
  ]
    .filter(Boolean)
    .join(" · ");
}

const normalize = (v?: string) =>
  (v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Calon naskah final (Daftar Naskah Keluar) untuk satu entri register, terbaik dulu: nomor sama, atau hal sama /
 * saling memuat. Hanya saran — tautan tetap dipilih user (nomor bisa berubah saat TTE, hal bisa mirip naskah lain).
 */
export function finalLetterCandidates(entry: SrikandiOutgoing, letters: SrikandiLetter[], takenIds: Set<string>) {
  const subject = normalize(entry.subject);
  const number = normalize(entry.number);
  return letters
    .filter((l) => !takenIds.has(l.id) || l.id === entry.letterId)
    .map((l) => {
      const ls = normalize(l.subject);
      let score = 0;
      if (number && normalize(l.number) === number) score += 3;
      if (subject && ls === subject) score += 2;
      else if (subject && ls && (ls.includes(subject) || subject.includes(ls))) score += 1;
      return { letter: l, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || (b.letter.date ?? "").localeCompare(a.letter.date ?? ""))
    .map((c) => c.letter);
}

/** File naskah DOCX bisa menjadi "konsep" bagi PDF final (tautan konsep ↔ final; PDF tidak bisa menjadi konsep). */
export const canLinkAsDraft = (entry: Pick<SrikandiOutgoing, "file">) =>
  !!entry.file && extensionOf(entry.file.name) === "docx";

/** Berkas yang ikut dihapus saat entri dihapus / dibuang (hanya yang diunggah lewat register). */
export const ownedUploadIds = (entry: Pick<SrikandiOutgoing, "file" | "attachments">) =>
  [entry.file, ...(entry.attachments ?? [])]
    .filter((f): f is SrikandiOutgoingFile => !!f?.owned)
    .map((f) => f.uploadId);

/** Entri baru kosong (tipe Naskah Keluar, TTE elektronik + QR seperti bawaan SRIKANDI). */
export function emptyOutgoing(id: string): SrikandiOutgoing {
  return {
    id,
    formType: "keluar",
    subject: "",
    status: "draft",
    signatureType: "elektronik",
    visualTte: "qr",
    attachments: [],
  };
}
