import { describe, expect, it } from "vitest";
import {
  MAX_VERSIONS,
  buildEditorConfig,
  callbackCarriesFile,
  callbackEndsSession,
  documentKey,
  documentTypeOf,
  editableFormats,
  formatInfo,
  isEditableFormat,
  viewableFormats,
  effectiveAccess,
  fileFormat,
  newDocumentName,
  newOfficeKey,
  planVersionSave,
  parseFontFamilies,
  resolveBackendUrl,
  templateTarget,
  toInternalUrl,
  versionsToPrune,
} from "./office-logic";

const history = (count: number, sessionKey: string | null = null) =>
  Array.from({ length: count }, (_, i) => ({
    version: i + 1,
    objectKey: `k${i + 1}`,
    checksum: `c${i + 1}`,
    sessionKey,
  }));

describe("format berkas", () => {
  it("mengenali ekstensi & jenis dokumen ONLYOFFICE", () => {
    expect(fileFormat("Laporan Akhir.DOCX")).toBe("docx");
    expect(documentTypeOf("xlsx")).toBe("cell");
    expect(documentTypeOf("pptx")).toBe("slide");
    expect(documentTypeOf("pdf")).toBe("pdf");
    expect(documentTypeOf("odt")).toBe("word");
    expect(documentTypeOf("vsdx")).toBe("diagram");
    expect(documentTypeOf("zip")).toBeNull();
    expect(documentTypeOf("png")).toBeNull();
    expect(documentTypeOf("constructor")).toBeNull();
  });

  it("mode sunting mengikuti daftar resmi ONLYOFFICE (edit / lossy / view)", () => {
    for (const f of ["docx", "docm", "dotx", "xlsx", "xlsm", "xlsb", "pptx", "ppsx", "pdf"]) {
      expect(formatInfo(f)?.mode, f).toBe("edit");
    }
    for (const f of ["odt", "rtf", "txt", "md", "epub", "html", "xls", "ods", "csv", "tsv", "odp"]) {
      expect(formatInfo(f)?.mode, f).toBe("lossy");
    }
    for (const f of ["doc", "ppt", "xlt", "pages", "key", "numbers", "hwp", "djvu", "xps", "vsdx"]) {
      expect(formatInfo(f)?.mode, f).toBe("view");
    }
    expect(isEditableFormat("odt")).toBe(true);
    expect(isEditableFormat("doc")).toBe(false);
    expect(editableFormats()).toContain("csv");
    expect(viewableFormats()).toContain("djvu");
    expect(formatInfo("docx")).toMatchObject({ comment: true, review: true, fill: false });
    expect(formatInfo("pdf")).toMatchObject({ comment: true, review: false, fill: true });
    expect(formatInfo("txt")).toMatchObject({ comment: false });
  });

  it("format yang tidak bisa disimpan kembali / mode lihat → baca saja", () => {
    expect(effectiveAccess({ format: "docx", permission: "edit" })).toBe("edit");
    expect(effectiveAccess({ format: "pdf", permission: "comment" })).toBe("comment");
    expect(effectiveAccess({ format: "doc", permission: "edit" })).toBe("view");
    expect(effectiveAccess({ format: "odt", permission: "edit" })).toBe("edit");
    expect(effectiveAccess({ format: "xlsm", permission: "edit" })).toBe("edit");
    // Format tanpa fitur komentar: izin Komentar → lihat saja
    expect(effectiveAccess({ format: "txt", permission: "comment" })).toBe("view");
    expect(effectiveAccess({ format: "docx", permission: "edit", requestedMode: "view" })).toBe("view");
  });
});

describe("kunci dokumen & nama", () => {
  it("kunci sesi hanya berisi karakter yang diizinkan ONLYOFFICE", () => {
    for (let i = 0; i < 50; i++) expect(newOfficeKey()).toMatch(/^[0-9a-zA-Z_-]{8,}$/);
    expect(newOfficeKey()).not.toBe(newOfficeKey());
    expect(documentKey("cm123", "abc")).toBe("cm123-abc");
    expect(documentKey("x".repeat(200), "abc")).toHaveLength(128);
  });

  it("nama dokumen baru aman & berekstensi", () => {
    expect(newDocumentName("Nota Dinas: Rapat/Okt?", "docx")).toBe("Nota Dinas Rapat Okt.docx");
    expect(newDocumentName("Anggaran.xlsx", "xlsx")).toBe("Anggaran.xlsx");
    expect(newDocumentName("  ", "pptx")).toBe("Dokumen tanpa judul.pptx");
    expect(newDocumentName(undefined, "pdf")).toBe("Dokumen tanpa judul.pdf");
  });
});

describe("alamat backend untuk ONLYOFFICE", () => {
  it("memakai nilai yang diatur (tanpa garis miring akhir)", () => {
    expect(resolveBackendUrl("http://backend:4000/", 4000, {})).toBe("http://backend:4000");
  });

  it("auto → IPv4 antarmuka WSL di Windows", () => {
    const interfaces = {
      Ethernet: [{ family: "IPv4", address: "192.168.1.5" }],
      "vEthernet (WSL (Hyper-V firewall))": [
        { family: "IPv6", address: "fe80::1" },
        { family: "IPv4", address: "172.24.224.1" },
      ],
    };
    expect(resolveBackendUrl("auto", 4000, interfaces)).toBe("http://172.24.224.1:4000");
  });

  it("auto tanpa WSL → host.docker.internal", () => {
    expect(resolveBackendUrl("auto", 4000, { eth0: [{ family: 4, address: "10.0.0.2" }] })).toBe(
      "http://host.docker.internal:4000",
    );
  });
});

describe("URL berkas hasil edit dari callback", () => {
  it("URL publik dialihkan ke URL internal", () => {
    expect(
      toInternalUrl(
        "https://lifeos.id/office/cache/files/data/x/output.docx?md5=a",
        "https://lifeos.id/office",
        "http://onlyoffice",
      ),
    ).toBe("http://onlyoffice/cache/files/data/x/output.docx?md5=a");
  });

  it("development: URL publik = internal", () => {
    const url = "http://localhost:8080/cache/files/data/x/output.docx";
    expect(toInternalUrl(url, "http://localhost:8080", "http://localhost:8080")).toBe(url);
  });

  it("menolak host lain (SSRF) dan skema aneh", () => {
    expect(() =>
      toInternalUrl("http://169.254.169.254/latest", "http://localhost:8080", "http://localhost:8080"),
    ).toThrow();
    expect(() =>
      toInternalUrl("https://lifeos.id/officex/a", "https://lifeos.id/office", "http://onlyoffice"),
    ).toThrow();
    expect(() => toInternalUrl("file:///etc/passwd", "http://localhost:8080", "http://localhost:8080")).toThrow();
    expect(() => toInternalUrl("bukan url", "http://localhost:8080", "http://localhost:8080")).toThrow();
  });
});

describe("status callback", () => {
  it("hanya status 2 & 6 dengan url yang disimpan", () => {
    expect(callbackCarriesFile({ status: 2, url: "http://x" })).toBe(true);
    expect(callbackCarriesFile({ status: 6, url: "http://x" })).toBe(true);
    expect(callbackCarriesFile({ status: 2 })).toBe(false);
    expect(callbackCarriesFile({ status: 3, url: "http://x" })).toBe(false);
    expect(callbackCarriesFile({ status: 1 })).toBe(false);
  });

  it("sesi selesai pada status 2 & 4 (bukan force save)", () => {
    expect(callbackEndsSession(2)).toBe(true);
    expect(callbackEndsSession(4)).toBe(true);
    expect(callbackEndsSession(6)).toBe(false);
    expect(callbackEndsSession(1)).toBe(false);
  });
});

describe("rencana versi", () => {
  it("isi sama → tidak ada versi baru", () => {
    expect(planVersionSave({ currentChecksum: "a", newChecksum: "a", sessionKey: "s", history: [] })).toEqual({
      action: "unchanged",
    });
  });

  it("simpan pertama di sesi → isi lama masuk riwayat", () => {
    expect(
      planVersionSave({ currentChecksum: "a", newChecksum: "b", sessionKey: "s2", history: history(2, "s1") }),
    ).toEqual({
      action: "push",
      prune: [],
    });
  });

  it("simpan berikutnya di sesi yang sama → timpa (Ctrl+S berkali-kali = satu versi)", () => {
    expect(
      planVersionSave({ currentChecksum: "b", newChecksum: "c", sessionKey: "s1", history: history(3, "s1") }),
    ).toEqual({
      action: "replace",
    });
  });

  it("sesi lama setelah Pulihkan: isi yang sudah ada di riwayat diabaikan, isi baru tetap jadi versi", () => {
    // v1 dipulihkan sebagai v3; editor sesi lama (s1) ditutup dan mengirim ulang isi v2
    const hist = [
      { version: 1, objectKey: "k1", checksum: "c1", sessionKey: "s1" },
      { version: 2, objectKey: "k2", checksum: "c2", sessionKey: null },
    ];
    const stale = { currentChecksum: "c1", sessionKey: "s1", history: hist, stale: true };
    expect(planVersionSave({ ...stale, newChecksum: "c2" })).toEqual({ action: "unchanged" });
    // Isi lain dari sesi lama → hanya masuk riwayat, isi saat ini (hasil pemulihan) tidak pernah diganti
    expect(planVersionSave({ ...stale, newChecksum: "c9" })).toEqual({ action: "archive", prune: [] });
    expect(planVersionSave({ ...stale, history: [{ ...hist[1], sessionKey: "s1" }], newChecksum: "c9" }).action).toBe(
      "archive",
    );
    expect(planVersionSave({ ...stale, history: history(MAX_VERSIONS - 1), newChecksum: "c99" })).toMatchObject({
      action: "archive",
      prune: [{ version: 1 }],
    });
  });

  it("total versi (riwayat + saat ini) dibatasi MAX_VERSIONS", () => {
    const full = history(MAX_VERSIONS - 1); // 9 riwayat + 1 saat ini = 10
    const plan = planVersionSave({ currentChecksum: "a", newChecksum: "b", sessionKey: "s", history: full });
    expect(plan.action).toBe("push");
    // Setelah push: riwayat 10 → pangkas versi tertua agar riwayat 9 + saat ini 1 = 10
    expect(plan.action === "push" && plan.prune.map((v) => v.version)).toEqual([1]);
    expect(versionsToPrune(full).map((v) => v.version)).toEqual([1]);
    expect(versionsToPrune(history(3))).toEqual([]);
  });
});

describe("config editor", () => {
  const base = {
    asset: { id: "cmA", originalName: "Notulen.docx", officeKey: "k1" },
    format: "docx",
    documentType: "word" as const,
    user: { id: "u1", name: "Yusuf" },
    fileUrl: "http://172.24.224.1:4000/api/v1/office/files/cmA/content?token=t",
    callbackUrl: "http://172.24.224.1:4000/api/v1/office/callback?token=c",
  };

  it("izin edit → mode edit + force save, AI bawaan mati, bahasa Indonesia", () => {
    const config = buildEditorConfig({ ...base, access: "edit" });
    expect(config.document.key).toBe("cmA-k1");
    expect(config.document.permissions.edit).toBe(true);
    expect(config.editorConfig.mode).toBe("edit");
    expect(config.editorConfig.lang).toBe("id");
    expect(config.editorConfig.customization.forcesave).toBe(true);
    expect(config.editorConfig.customization.ai).toEqual({ disabled: true });
  });

  it("izin tinjau & isi formulir mengikuti kemampuan format", () => {
    expect(buildEditorConfig({ ...base, access: "edit" }).document.permissions).toMatchObject({
      review: true,
      fillForms: false,
    });
    const pdf = buildEditorConfig({ ...base, format: "pdf", documentType: "pdf", access: "edit" });
    expect(pdf.document.permissions).toMatchObject({ review: false, fillForms: true });
    const csv = buildEditorConfig({ ...base, format: "csv", documentType: "cell", access: "edit" });
    expect(csv.document.permissions).toMatchObject({ edit: true, comment: false, review: false });
    expect(csv.editorConfig.mode).toBe("edit");
  });

  it("izin komentar → mode edit tanpa hak mengubah; izin lihat → mode lihat", () => {
    const comment = buildEditorConfig({ ...base, access: "comment" });
    expect(comment.editorConfig.mode).toBe("edit");
    expect(comment.document.permissions).toMatchObject({ edit: false, comment: true, review: false });
    const view = buildEditorConfig({ ...base, access: "view", mobile: true, theme: "dark" });
    expect(view.editorConfig.mode).toBe("view");
    expect(view.document.permissions.comment).toBe(false);
    expect(view.type).toBe("mobile");
    expect(view.editorConfig.customization.uiTheme).toBe("default-dark");
  });

  it("AI di editor mengikuti sakelar user", () => {
    const pluginOptions = { lifeos: { token: "t" } };
    const off = buildEditorConfig({ ...base, access: "edit", ai: { enabled: false, guid: "asc.{AI}" } });
    expect(off.editorConfig.customization.ai).toEqual({ disabled: true });
    expect("plugins" in off.editorConfig).toBe(false);

    const on = buildEditorConfig({ ...base, access: "edit", ai: { enabled: true, guid: "asc.{AI}", pluginOptions } });
    // Tab AI aktif dan token sesi hanya untuk GUID plugin AI
    expect(on.editorConfig.customization.ai).toEqual({ disabled: false });
    expect(on.editorConfig).toMatchObject({ plugins: { options: { "asc.{AI}": pluginOptions } } });
    expect("pluginsData" in (on.editorConfig as { plugins: object }).plugins).toBe(false);

    // Mode lihat: tanpa AI (tidak bisa menyisipkan hasil)
    const view = buildEditorConfig({ ...base, access: "view", ai: { enabled: true, guid: "asc.{AI}", pluginOptions } });
    expect(view.editorConfig.customization.ai).toEqual({ disabled: true });
    expect("plugins" in view.editorConfig).toBe(false);
  });
});

describe("font ONLYOFFICE", () => {
  it("membaca nama keluarga dari AllFonts.js", () => {
    const js = [
      'window["__fonts_files"] = [\n"000"\n];',
      'window["__fonts_infos"] = [',
      '["Times New Roman",1,0,-1,-1,-1,-1,-1,-1],',
      '["Arial",0,0,-1,-1,-1,-1,-1,-1],',
      '["Bookman \\"Old\\" Style",2,0,-1,-1,-1,-1,-1,-1],',
      '["Arial",3,0,-1,-1,-1,-1,-1,-1]',
      "];",
      'window["__fonts_ranges"] = [1,2];',
    ].join("\n");
    expect(parseFontFamilies(js)).toEqual(["Arial", 'Bookman "Old" Style', "Times New Roman"]);
    expect(parseFontFamilies("tidak ada")).toEqual([]);
  });
});

describe("templat dokumen", () => {
  it("format templat menentukan jenis dokumen baru", () => {
    expect(templateTarget("docx")).toBe("docx");
    expect(templateTarget("pdf")).toBe("pdf");
    expect(templateTarget("dotx")).toBe("docx");
    expect(templateTarget("odt")).toBe("docx");
    expect(templateTarget("xltx")).toBe("xlsx");
    expect(templateTarget("ods")).toBe("xlsx");
    expect(templateTarget("potx")).toBe("pptx");
    expect(templateTarget("vsdx")).toBeNull();
    expect(templateTarget("png")).toBeNull();
  });
});
