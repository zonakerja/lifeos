import { describe, expect, it } from "vitest";
import { detailIdOf, findDraft, parseRegisterForm, pickOption, searchTerm } from "./srikandi-register.js";

describe("pencocokan opsi formulir Registrasi", () => {
  it("istilah cari = nama / kode tanpa gelar dan jabatan", () => {
    expect(searchTerm("KU.204 - Laporan Keuangan")).toBe("KU.204");
    expect(searchTerm("Krisna Dia Pranata, S.Si.T., M.T")).toBe("Krisna Dia Pranata");
    expect(searchTerm("[ PERLU PEMBARUAN ] Joko Murdyono, S.E., MBA - Kepala Biro Keuangan")).toBe("Joko Murdyono");
    expect(searchTerm("Bagian Keuangan Setditjen Hubud")).toBe("Bagian Keuangan Setditjen Hubud");
  });

  it("memilih opsi persis, lalu nama sama (dibedakan jabatan), tanpa penanda PERLU PEMBARUAN", () => {
    const options = [
      "Krisna Dia Pranata, S.Si.T., M.T. - Kepala Bagian Perencanaan",
      "Krisna Dia Pranata, S.Si.T., M.T. - Plh. Sekretaris Direktorat Jenderal Perhubungan Udara",
      "Arif Priyo Utomo - Kepala Bagian Keuangan",
    ];
    expect(pickOption(options, { label: "Arif Priyo Utomo - Kepala Bagian Keuangan" })).toBe(2);
    expect(pickOption(options, { label: "Arif Priyo Utomo" })).toBe(2);
    expect(
      pickOption(options, { label: "Krisna Dia Pranata, S.Si.T., M.T", hint: "Plh. Sekretaris Direktorat Jenderal" }),
    ).toBe(1);
    expect(
      pickOption(["[ PERLU PEMBARUAN ] Joko Murdyono - Kepala Biro"], { label: "Joko Murdyono - Kepala Biro" }),
    ).toBe(0);
    expect(pickOption(["KU.204 - Laporan Keuangan", "KU.2 - Belanja"], { label: "KU.204 - Laporan Keuangan" })).toBe(0);
    expect(pickOption(["KU.201 - Pembayaran"], { label: "KU.204 - Laporan Keuangan" })).toBe(-1);
  });
});

describe("log & masukan job", () => {
  it("draf sama (hal sama, belum terkirim) dikenali; yang terkirim tidak", () => {
    const rows = [
      { number: "1/X", subject: "Hal A", sendStatus: "TERKIRIM", detailId: "a" },
      { number: "XXX/KEU/ND/2026", subject: "hal  a", sendStatus: "BELUM", detailId: "b" },
    ];
    expect(findDraft(rows, "Hal A")?.detailId).toBe("b");
    expect(findDraft(rows.slice(0, 1), "Hal A")).toBeNull();
    expect(detailIdOf("/pembuatan-naskah-keluar/log-naskah-keluar/detail?id=U2F%2Bx%3D")).toBe("U2F+x=");
  });

  it("menolak isian tidak lengkap & file salah, menerima Naskah Final tanpa verifikator", () => {
    const base = {
      unit: "Bagian Keuangan Setditjen Hubud",
      docType: "Nota Dinas",
      nature: "Biasa",
      classification: "KU.204 - Laporan Keuangan",
      autoNumber: true,
      subject: "Hal",
      summary: "Ringkas",
      file: { name: "konsep.pdf", mimeType: "application/pdf", data: "JVBERi0=" },
      recipients: [{ label: "Enie Kurniawati - TU" }],
    };
    expect(parseRegisterForm({ ...base })).toEqual({ error: "Isian belum lengkap: Verifikator, Penandatangan." });
    expect(parseRegisterForm({ ...base, file: { name: "a.xlsx", data: "eA==" } })).toEqual({
      error: "File naskah harus PDF atau DOCX.",
    });
    const final = parseRegisterForm({ ...base, formType: "final" });
    expect("form" in final && final.form.formType).toBe("final");
  });
});
