import { describe, expect, it } from "vitest";
import type { SrikandiLetter, SrikandiOutgoing, SrikandiReference } from "@/types/entities";
import {
  attachmentError,
  classificationChoices,
  cleanAttachmentName,
  emptyOutgoing,
  finalLetterCandidates,
  mainFileError,
  ownedUploadIds,
  referenceChoices,
  registerIssues,
  registerStatus,
} from "./register-logic";

const MB = 1024 * 1024;

const complete = (over: Partial<SrikandiOutgoing> = {}): SrikandiOutgoing => ({
  ...emptyOutgoing("o1"),
  unit: "Bagian Keuangan",
  docType: "Nota Dinas",
  nature: "Biasa",
  classification: "KU.01",
  number: "12/SDJ.KEU/X/2026",
  subject: "Penyampaian laporan",
  summary: "Ringkas",
  file: { uploadId: "u1", name: "konsep.docx" },
  recipients: [{ id: "r1", label: "Kepala Biro Keuangan" }],
  verifiers: [{ id: "v1", label: "Kabag" }],
  signer: { id: "s1", label: "Sesditjen" },
  ...over,
});

describe("lampiran & file naskah", () => {
  it("mengganti titik, koma, dan simbol pada nama lampiran tanpa menyentuh ekstensi", () => {
    expect(cleanAttachmentName("Laporan v1.2, final (rev).pdf")).toBe("Laporan v1_2_ final _rev_.pdf");
    expect(cleanAttachmentName("Tesis_Mohammad_Yusuf.pdf")).toBe("Tesis_Mohammad_Yusuf.pdf");
  });

  it("menolak format & ukuran di luar batas SRIKANDI", () => {
    expect(attachmentError({ name: "data.zip", size: 1 })).toMatch(/Format/);
    expect(attachmentError({ name: "foto.png", size: 6 * MB })).toMatch(/5 MB/);
    expect(attachmentError({ name: "a.b.pdf", size: 1 })).toMatch(/Nama/);
    expect(attachmentError({ name: "Tesis.pdf", size: 4 * MB })).toBeNull();
    expect(mainFileError({ name: "konsep.DOCX" })).toBeNull();
    expect(mainFileError({ name: "konsep.xlsx" })).toMatch(/PDF/);
  });
});

describe("kelengkapan register", () => {
  it("entri lengkap = siap; tanpa isian wajib = daftar kekurangan", () => {
    expect(registerIssues(complete())).toEqual([]);
    expect(registerStatus(complete())).toBe("ready");
    const issues = registerIssues(emptyOutgoing("x"));
    expect(issues).toContain("Hal");
    expect(issues).toContain("Verifikator");
    expect(issues).toContain("Tujuan utama");
    expect(registerStatus(emptyOutgoing("x"))).toBe("incomplete");
  });

  it("Naskah Final tidak butuh verifikator & penandatangan; Ambil Nomor menggantikan nomor", () => {
    expect(registerIssues(complete({ formType: "final", verifiers: [], signer: undefined }))).toEqual([]);
    expect(registerIssues(complete({ number: "", autoNumber: true }))).toEqual([]);
    expect(registerIssues(complete({ number: "" }))).toContain("Nomor naskah");
  });

  it("nama lampiran hanya peringatan, ukuran total > 20 MB menghalangi", () => {
    expect(registerIssues(complete({ attachments: [{ uploadId: "a", name: "a.b.pdf", size: MB }] }))).toEqual([]);
    const five = Array.from({ length: 5 }, (_, i) => ({ uploadId: `a${i}`, name: `l${i}.pdf`, size: 4.5 * MB }));
    expect(registerIssues(complete({ attachments: five }))).toContain("Total lampiran lebih dari 20 MB");
  });

  it("status tersimpan & naskah final mengalahkan kelengkapan", () => {
    expect(registerStatus({ ...emptyOutgoing("x"), status: "submitted" })).toBe("submitted");
    expect(registerStatus(complete({ status: "submitted", letterId: "L1" }))).toBe("done");
  });
});

describe("referensi & naskah final", () => {
  const ref = (id: string, category: SrikandiReference["category"], jenis?: string, order = 0): SrikandiReference => ({
    id,
    category,
    label: id,
    order,
    fields: jenis ? { "Jenis Tujuan": jenis } : {},
  });

  it("memisahkan tujuan SRIKANDI dan eksternal non SRIKANDI", () => {
    const refs = [
      ref("a", "recipient", "Internal SRIKANDI", 2),
      ref("b", "recipient", "Eksternal Non SRIKANDI"),
      ref("c", "recipient", "Eksternal SRIKANDI", 1),
      ref("d", "signer"),
    ];
    expect(referenceChoices(refs, "recipient", false).map((r) => r.id)).toEqual(["c", "a"]);
    expect(referenceChoices(refs, "recipient", true).map((r) => r.id)).toEqual(["b"]);
    expect(referenceChoices(refs, "signer").map((r) => r.id)).toEqual(["d"]);
  });

  it("mengusulkan naskah final dari nomor / hal, tanpa naskah yang sudah tertaut ke entri lain", () => {
    const letter = (id: string, number: string, subject: string): SrikandiLetter => ({
      id,
      key: number,
      number,
      subject,
    });
    const letters = [
      letter("L1", "99/X/2026", "Undangan rapat"),
      letter("L2", "12/SDJ.KEU/X/2026", "Lain"),
      letter("L3", "13/X/2026", "Penyampaian Laporan"),
      letter("L4", "14/X/2026", "Penyampaian laporan keuangan"),
    ];
    const ids = finalLetterCandidates(complete(), letters, new Set(["L4"])).map((l) => l.id);
    expect(ids).toEqual(["L2", "L3"]);
  });

  it("pilihan klasifikasi hanya yang Aktif, urut kode alami; semua bila status belum terbaca", () => {
    const klas = (label: string, status?: string): SrikandiReference => ({
      id: label,
      category: "classification",
      label,
      fields: status ? { Status: status } : {},
    });
    const refs = [
      klas("KU.204 - Laporan Keuangan", "Aktif"),
      klas("SR - Sertifikat", "Non-Aktif"),
      klas("KU.21 - Belanja", "Aktif"),
      ref("x", "signer"),
    ];
    expect(classificationChoices(refs).map((r) => r.label)).toEqual(["KU.21 - Belanja", "KU.204 - Laporan Keuangan"]);
    expect(classificationChoices([klas("B"), klas("A")]).map((r) => r.label)).toEqual(["A", "B"]);
  });

  it("hanya berkas yang diunggah lewat register ikut dihapus", () => {
    expect(
      ownedUploadIds({
        file: { uploadId: "u1", name: "a.pdf" },
        attachments: [
          { uploadId: "u2", name: "b.pdf", owned: true },
          { uploadId: "u3", name: "c.pdf" },
        ],
      }),
    ).toEqual(["u2"]);
  });
});
