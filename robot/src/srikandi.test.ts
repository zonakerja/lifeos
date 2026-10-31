import { describe, expect, it } from "vitest";
import { isSigned, letterFileName, looksLikePdf, parseIndonesianDate, parseLetterRow } from "./srikandi.js";

describe("SRIKANDI: daftar naskah keluar", () => {
  const cells = [
    "1",
    "Kamis, 1 Oktober 2026",
    "182/SDJ.KEU/X/2026",
    "Penyampaian Laporan Hasil Studi Program Pascasarjana (S-2)",
    "Mohammad Yusuf, S.Ak. - Penelaah Teknis Kebijakan - Bagian Keuangan Setditjen Hubud",
    "1 SETUJU",
    "1 SETUJU",
    "TERKIRIM",
    "TIDAK ADA",
    "",
  ];

  it("baris tabel → naskah dengan nomor sebagai kunci", () => {
    const letter = parseLetterRow(cells, "/pembuatan-naskah-keluar/naskah-keluar/detail?id=abc");
    expect(letter).toMatchObject({
      key: "182/SDJ.KEU/X/2026",
      date: "2026-10-01",
      signStatus: "1 SETUJU",
      sendStatus: "TERKIRIM",
    });
    expect(parseLetterRow(cells, null)).toBeNull();
    expect(parseLetterRow(["Semua data telah dimuat"], "/x")).toBeNull();
  });

  it("tanggal Indonesia", () => {
    expect(parseIndonesianDate("Senin, 9 Februari 2026")).toBe("2026-02-09");
    expect(parseIndonesianDate("-")).toBe("");
  });

  it("sudah ditandatangani vs masih menunggu/ditolak", () => {
    expect(isSigned("1 SETUJU")).toBe(true);
    expect(isSigned("2 SETUJU")).toBe(true);
    expect(isSigned("1 SETUJU 1 BELUM")).toBe(false);
    expect(isSigned("MENUNGGU")).toBe(false);
    expect(isSigned("1 TOLAK")).toBe(false);
    expect(isSigned("")).toBe(false);
  });

  it("nama berkas aman & deteksi PDF", () => {
    expect(letterFileName({ number: "182/SDJ.KEU/X/2026", date: "2026-10-01" })).toBe("182-SDJ.KEU-X-2026.pdf");
    expect(letterFileName({ number: "", date: "" })).toBe("naskah-tanpa-tanggal.pdf");
    expect(looksLikePdf(new TextEncoder().encode("%PDF-1.7 ..."))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode("<html>"))).toBe(false);
  });
});

describe("SRIKANDI: lampiran naskah", async () => {
  const { attachmentName, isFileResponse, mimeForName, validFileBody } = await import("./srikandi.js");

  it("butir daftar lampiran → nama berkas; butir lain diabaikan", () => {
    expect(attachmentName("Laporan_Hasil_Studi_Akhir_Mohammad_Yusuf_Merge.pdf Lihat")).toBe(
      "Laporan_Hasil_Studi_Akhir_Mohammad_Yusuf_Merge.pdf",
    );
    expect(attachmentName("Tesis_Mohammad_Yusuf.pdf  Lihat")).toBe("Tesis_Mohammad_Yusuf.pdf");
    expect(attachmentName("Data.xlsx")).toBe("Data.xlsx");
    expect(attachmentName("Kirim")).toBeNull();
    expect(attachmentName("Daftar Penandatangan")).toBeNull();
  });

  it("jenis berkas & isi sah", () => {
    expect(mimeForName("a.PDF")).toBe("application/pdf");
    expect(mimeForName("a.xyz")).toBe("application/octet-stream");
    expect(isFileResponse("application/pdf")).toBe(true);
    expect(isFileResponse("application/json")).toBe(false);
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(validFileBody(enc("%PDF-1.4 x"), "a.pdf")).toBe(true);
    expect(validFileBody(enc("<html>x</html>"), "a.docx")).toBe(false);
    expect(validFileBody(enc("PK\u0003\u0004abc"), "a.docx")).toBe(true);
  });
});

describe("SRIKANDI: domain berkas", async () => {
  const { registrableDomain, sameSite } = await import("./srikandi.js");
  it("berkas dari s3.arsip.go.id boleh, domain lain tidak", () => {
    expect(registrableDomain("s3.arsip.go.id")).toBe("arsip.go.id");
    expect(registrableDomain("files.example.com")).toBe("example.com");
    expect(sameSite("https://s3.arsip.go.id/x.pdf", "https://srikandi.arsip.go.id/a")).toBe(true);
    expect(sameSite("https://evil.go.id/x.pdf", "https://srikandi.arsip.go.id/a")).toBe(false);
    expect(sameSite("http://s3.arsip.go.id/x.pdf", "https://srikandi.arsip.go.id/a")).toBe(false);
  });
});
