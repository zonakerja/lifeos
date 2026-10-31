/**
 * Logika murni Register Naskah Keluar → job robot Registrasi SRIKANDI (diuji di `srikandi-register.spec.ts`): entri
 * `srikandi_outgoing` + referensi `srikandi_reference` → isian formulir (tanpa isi berkas). Aturan isian & batas berkas
 * mengikuti formulir SRIKANDI yang direkam 2026-10-31 (docs/AI-AGENT.md §21.11).
 */

export interface OutgoingPick {
  id: string;
  label: string;
}

export interface OutgoingFile {
  uploadId: string;
  name: string;
}

/** Bagian entri `srikandi_outgoing` yang dipakai robot (salinan bentuk `SrikandiOutgoing` frontend). */
export interface OutgoingEntry {
  id: string;
  formType?: "keluar" | "final";
  unit?: string;
  docType?: string;
  nature?: string;
  classification?: string;
  number?: string;
  autoNumber?: boolean;
  subject?: string;
  summary?: string;
  file?: OutgoingFile;
  attachments?: OutgoingFile[];
  recipientGroups?: OutgoingPick[];
  recipients?: OutgoingPick[];
  recipientsExternal?: OutgoingPick[];
  ccGroups?: OutgoingPick[];
  cc?: OutgoingPick[];
  ccExternal?: OutgoingPick[];
  verifiers?: OutgoingPick[];
  signer?: OutgoingPick;
  signatureType?: "elektronik" | "konvensional";
  visualTte?: "qr" | "spesimen";
  status?: string;
}

export interface ReferenceLite {
  id: string;
  label: string;
  fields?: Record<string, string>;
}

export interface RegisterPick {
  label: string;
  hint?: string;
}

/** Nama lampiran yang diterima SRIKANDI: deretan titik, koma, dan simbol !@#$%^&*() → "_" (ekstensi tetap). */
export function cleanAttachmentName(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
  const base = (dot < 0 ? name : name.slice(0, dot)).replace(/[.,!@#$%^&*()]+/g, "_");
  return ext ? `${base || "lampiran"}.${ext}` : base || "lampiran";
}

/** Pilihan entri → label + jabatan dari referensi (membedakan nama kembar di opsi SRIKANDI "Nama - Jabatan"). */
export function toPicks(picks: OutgoingPick[] | undefined, refs: Map<string, ReferenceLite>): RegisterPick[] {
  return (picks ?? []).map((p) => {
    const hint = refs.get(p.id)?.fields?.["Jabatan"];
    return hint ? { label: p.label, hint } : { label: p.label };
  });
}

/** Alasan entri belum bisa didaftarkan; kosong = siap. */
export function registerBlockers(entry: OutgoingEntry): string[] {
  const blank = (v?: string) => !v?.trim();
  const keluar = (entry.formType ?? "keluar") === "keluar";
  return [
    blank(entry.unit) && "Dikirimkan melalui",
    blank(entry.docType) && "Jenis naskah",
    blank(entry.nature) && "Sifat naskah",
    blank(entry.classification) && "Klasifikasi",
    blank(entry.number) && !entry.autoNumber && "Nomor naskah",
    blank(entry.subject) && "Hal",
    blank(entry.summary) && "Isi ringkas",
    !entry.file && "File naskah",
    !entry.recipients?.length && !entry.recipientGroups?.length && !entry.recipientsExternal?.length && "Tujuan utama",
    keluar && !entry.verifiers?.length && "Verifikator",
    keluar && !entry.signer && "Penandatangan",
  ].filter((v): v is string => !!v);
}

/** Isian formulir tanpa berkas (berkas ditambahkan service setelah dibaca dari object storage). */
export function buildRegisterFields(entry: OutgoingEntry, references: ReferenceLite[]) {
  const refs = new Map(references.map((r) => [r.id, r]));
  const formType = entry.formType === "final" ? "final" : "keluar";
  return {
    formType,
    unit: entry.unit?.trim() ?? "",
    docType: entry.docType?.trim() ?? "",
    nature: entry.nature?.trim() ?? "",
    classification: entry.classification?.trim() ?? "",
    number: entry.autoNumber ? undefined : entry.number?.trim(),
    autoNumber: !!entry.autoNumber,
    subject: entry.subject?.trim() ?? "",
    summary: entry.summary?.trim() ?? "",
    recipientGroups: toPicks(entry.recipientGroups, refs),
    recipients: toPicks(entry.recipients, refs),
    recipientsExternal: toPicks(entry.recipientsExternal, refs),
    ccGroups: toPicks(entry.ccGroups, refs),
    cc: toPicks(entry.cc, refs),
    ccExternal: toPicks(entry.ccExternal, refs),
    verifiers: formType === "keluar" ? toPicks(entry.verifiers, refs) : [],
    signer: formType === "keluar" && entry.signer ? toPicks([entry.signer], refs)[0] : undefined,
    signatureType: entry.signatureType === "konvensional" ? "konvensional" : "elektronik",
    visualTte: entry.visualTte === "spesimen" ? "spesimen" : "qr",
  } as const;
}
