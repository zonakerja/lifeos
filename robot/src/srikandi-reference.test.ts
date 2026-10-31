import { describe, expect, it } from "vitest";
import { mergeReferenceItems, parseReferenceRows, referenceKey } from "./srikandi-reference.js";

describe("referensi SRIKANDI", () => {
  it("penandatangan: kotak centang & baris filter dilewati, nama jadi label", () => {
    const headers = ["#", "Nama Penandatangan", "Jabatan", "Unit Kerja / Instansi", "Pangkat", "Status", "Aksi"];
    const items = parseReferenceRows("signer", headers, [
      ["", "Cari Nama", "Cari Jabatan", "Cari Instansi", "Cari Pangkat", "Cari Status", "", ""],
      [
        "",
        "Arif Priyo Utomo",
        "Plt. Kepala Bagian Sumber Daya Manusia",
        "Bagian SDM Setditjen Hubud - Kementerian Perhubungan",
        "",
        "Aktif",
        "Edit View Sync Hapus",
      ],
      [
        "",
        "Soekarjo, SH.,MH.",
        "Kepala Kantor",
        "UPBU - Kementerian Perhubungan",
        "Penata Tingkat I (IIId)",
        "Aktif",
        "",
      ],
    ]);
    expect(items).toEqual([
      {
        category: "signer",
        label: "Arif Priyo Utomo",
        fields: {
          Jabatan: "Plt. Kepala Bagian Sumber Daya Manusia",
          "Unit Kerja / Instansi": "Bagian SDM Setditjen Hubud - Kementerian Perhubungan",
          Status: "Aktif",
        },
      },
      {
        category: "signer",
        label: "Soekarjo, SH.,MH.",
        fields: {
          Jabatan: "Kepala Kantor",
          "Unit Kerja / Instansi": "UPBU - Kementerian Perhubungan",
          Pangkat: "Penata Tingkat I (IIId)",
          Status: "Aktif",
        },
      },
    ]);
  });

  it("tujuan & grup: kolom Kepada / Nama Grup jadi label", () => {
    const tujuan = parseReferenceRows(
      "recipient",
      ["#", "Jenis Tujuan", "Kepada", "Aksi"],
      [["Internal SRIKANDI", "Wahyu Ikwandono, A.Md - Plh. Kepala Bagian Keuangan", "Sync Hapus"]],
    );
    expect(tujuan[0]).toMatchObject({ label: "Wahyu Ikwandono, A.Md - Plh. Kepala Bagian Keuangan" });
    expect(tujuan[0].fields["Jenis Tujuan"]).toBe("Internal SRIKANDI");
    const grup = parseReferenceRows(
      "disposition_group",
      ["Nama Grup", "Deskripsi", "Jumlah Tujuan", "Dibuat pada", "Aksi"],
      [["Tim BMN", "Daftar Anggota Tim BMN", "20", "Selasa, 22 Juli 2025", "Ubah Lihat Hapus"]],
    );
    expect(grup[0]).toMatchObject({ label: "Tim BMN", fields: { "Jumlah Tujuan": "20" } });
  });

  it("gabung halaman tanpa ganda", () => {
    const a = { category: "verifier" as const, label: "Suci", fields: { Jabatan: "Ketua Tim" } };
    expect(mergeReferenceItems([[a], [a, { ...a, label: "David" }]]).map((i) => i.label)).toEqual(["Suci", "David"]);
    expect(referenceKey(a)).toBe("verifier|suci|ketua tim");
  });
});

describe("total dari Hitung Total", async () => {
  const { parseTotal } = await import("./srikandi-reference.js");
  it("berbagai format", () => {
    expect(parseTotal("Total: 18 data")).toBe(18);
    expect(parseTotal("Total Penandatangan: 22")).toBe(22);
    expect(parseTotal("Total Tujuan Naskah:\n1.050")).toBe(1050);
    expect(parseTotal("Menampilkan 1-10 dari 1.234")).toBe(1234);
    expect(parseTotal("Hitung Total")).toBeNull();
  });
});

describe("judul kolom huruf kapital", async () => {
  const { headerName, parseReferenceRows, mergeReferenceItems } = await import("./srikandi-reference.js");
  it("dinormalkan & orang sama berjabatan beda tidak digabung", () => {
    expect(headerName("UNIT KERJA / INSTANSI")).toBe("Unit Kerja / Instansi");
    expect(headerName("NAMA PENANDATANGAN")).toBe("Nama Penandatangan");
    const items = parseReferenceRows(
      "signer",
      ["#", "NAMA PENANDATANGAN", "JABATAN", "AKSI"],
      [
        ["", "Krisna", "Plh. Sekretaris", ""],
        ["", "Krisna", "Kepala Bagian Perencanaan", ""],
      ],
    );
    expect(items[0].fields).toEqual({ Jabatan: "Plh. Sekretaris" });
    expect(mergeReferenceItems([items])).toHaveLength(2);
  });
});

describe("klasifikasi arsip", async () => {
  const { parseReferenceRows, requestedCategories, DEFAULT_REFERENCE_CATEGORIES } =
    await import("./srikandi-reference.js");
  it("label KODE - Nama tanpa titik akhir; baris filter dilewati; status disimpan", () => {
    const items = parseReferenceRows(
      "classification",
      ["KODE", "NAMA KLASIFIKASI", "STATUS", "AKSI"],
      [
        ["Cari Kode", "Cari Nama", "Cari Status", ""],
        ["SR.", "Sertifikat", "Non-Aktif", "Lihat"],
        ["KU.204", "Laporan Keuangan", "Aktif", "Lihat"],
      ],
    );
    expect(items.map((i) => i.label)).toEqual(["SR - Sertifikat", "KU.204 - Laporan Keuangan"]);
    expect(items[1].fields).toEqual({ Kode: "KU.204", "Nama Klasifikasi": "Laporan Keuangan", Status: "Aktif" });
  });

  it("klasifikasi tidak ikut Ambil referensi bawaan, hanya bila diminta", () => {
    expect(DEFAULT_REFERENCE_CATEGORIES).not.toContain("classification");
    expect(requestedCategories(undefined)).toEqual(DEFAULT_REFERENCE_CATEGORIES);
    expect(requestedCategories(["classification", "x"])).toEqual(["classification"]);
  });
});
