import { describe, expect, it } from "vitest";
import {
  cleanLetter,
  decodeAttachment,
  decodePdf,
  letterClientId,
  letterResourceId,
  mergeAttachments,
  safeAttachment,
  safePdfName,
} from "./srikandi-sync";

describe("sinkron naskah SRIKANDI", () => {
  it("ID record stabil dari nomor naskah", () => {
    expect(letterClientId("182/SDJ.KEU/X/2026")).toBe(letterClientId("182/SDJ.KEU/X/2026"));
    expect(letterClientId("182/SDJ.KEU/X/2026")).toMatch(/^sk-[0-9a-f]{16}$/);
  });

  it("validasi data naskah dari robot", () => {
    expect(cleanLetter({ key: " " })).toBeNull();
    expect(cleanLetter({ key: "1/A", date: "1 Okt" })?.date).toBe("");
    expect(cleanLetter({ key: "1/A", date: "2026-10-01", subject: 5 })).toMatchObject({
      date: "2026-10-01",
      subject: "",
    });
  });

  it("PDF hanya bila isinya PDF sungguhan; nama berkas aman", () => {
    expect(decodePdf(Buffer.from("%PDF-1.7 x").toString("base64"))?.length).toBe(10);
    expect(decodePdf(Buffer.from("<html>").toString("base64"))).toBeNull();
    expect(decodePdf(null)).toBeNull();
    expect(safePdfName("182-SDJ.KEU-X-2026.pdf")).toBe("182-SDJ.KEU-X-2026.pdf");
    expect(safePdfName("../../x.exe")).toBe("naskah-srikandi.pdf");
  });
});

describe("lampiran naskah SRIKANDI", () => {
  it("nama & jenis lampiran aman", () => {
    expect(safeAttachment("Tesis_Mohammad_Yusuf.pdf")).toEqual({
      name: "Tesis_Mohammad_Yusuf.pdf",
      mimeType: "application/pdf",
    });
    expect(safeAttachment("../../x.exe")).toBeNull();
    expect(safeAttachment(".pdf")).toBeNull();
  });

  it("isi lampiran sah", () => {
    expect(decodeAttachment(Buffer.from("%PDF-1.7 x").toString("base64"), "a.pdf")).not.toBeNull();
    expect(decodeAttachment(Buffer.from("<html>x</html>").toString("base64"), "a.pdf")).toBeNull();
    expect(decodeAttachment(Buffer.from("PK\u0003\u0004abc").toString("base64"), "a.docx")).not.toBeNull();
    expect(decodeAttachment(null, "a.pdf")).toBeNull();
  });

  it("gabung lampiran tanpa unggah ulang", () => {
    expect(
      mergeAttachments(
        [{ name: "A.pdf", uploadId: "u1" }, { name: "B.pdf" }],
        [{ name: "A.pdf", uploadId: "u9" }, { name: "B.pdf", uploadId: "u2" }, { name: "C.pdf" }],
      ),
    ).toEqual([{ name: "A.pdf", uploadId: "u1" }, { name: "B.pdf", uploadId: "u2" }, { name: "C.pdf" }]);
  });
});

describe("resource naskah", () => {
  it("ID resource stabil", () => {
    expect(letterResourceId("u1")).toBe("res-sk-u1");
  });
});
