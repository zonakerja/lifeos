/**
 * Referensi SRIKANDI (menu Pengguna) untuk formulir Register Naskah Keluar: penandatangan, tujuan, verifikator, tembusan,
 * dan grup-grupnya. Logika murni (diuji di `srikandi-reference.test.ts`); robot hanya membaca tabel & berpindah halaman
 * tabel — tombol Tambah Baru / Edit / Sync / Hapus tidak pernah disentuh.
 */

export const REFERENCE_PAGES = [
  { category: "signer", path: "/pengguna/daftar-penandatangan" },
  { category: "recipient", path: "/pengguna/daftar-tujuan-naskah" },
  { category: "recipient_group", path: "/pengguna/grup-tujuan-naskah" },
  { category: "verifier", path: "/pengguna/daftar-verifikator" },
  { category: "cc", path: "/pengguna/daftar-tembusan" },
  { category: "cc_group", path: "/pengguna/daftar-grup-tembusan" },
  { category: "disposition_group", path: "/pengguna/grup-tujuan-disposisi" },
  // Klasifikasi arsip (Instrumen Kearsipan): ±1.000 baris → diambil terpisah lewat `categories`
  { category: "classification", path: "/klasifikasi-arsip/klasifikasi" },
] as const;

export type ReferenceCategory = (typeof REFERENCE_PAGES)[number]["category"];

/** Kategori yang diambil "Ambil referensi" bila tidak disebut (klasifikasi punya tombol sendiri karena lama). */
export const DEFAULT_REFERENCE_CATEGORIES: ReferenceCategory[] = REFERENCE_PAGES.map((p) => p.category).filter(
  (c) => c !== "classification",
);

/** Batas halaman tabel per kategori (10 baris/halaman; klasifikasi ±105 halaman). */
export const maxReferencePages = (category: ReferenceCategory) => (category === "classification" ? 160 : 60);

/** Kategori yang diminta backend → kategori yang dikenal (kosong / tidak dikenal = bawaan). */
export function requestedCategories(value: unknown): ReferenceCategory[] {
  const known: ReferenceCategory[] = REFERENCE_PAGES.map((p) => p.category);
  const list = Array.isArray(value) ? known.filter((c) => value.includes(c)) : [];
  return list.length ? list : DEFAULT_REFERENCE_CATEGORIES;
}

export interface ReferenceItem {
  category: ReferenceCategory;
  /** Teks utama untuk dipilih di formulir (nama / kepada / nama grup) */
  label: string;
  /** Kolom lain: header → nilai (tanpa #, Aksi, kolom kosong) */
  fields: Record<string, string>;
}

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Judul kolom dinormalkan ("JABATAN" → "Jabatan", "UNIT KERJA / INSTANSI" → "Unit Kerja / Instansi"): `innerText` ikut
 * gaya huruf kapital CSS di tabel tertentu, padahal kuncinya dipakai untuk membedakan orang yang sama berjabatan beda.
 */
export const headerName = (text: string) =>
  tidy(text)
    .toLowerCase()
    .replace(/(^|[\s/(])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
const SKIP = /^(#|aksi)$/i;
const MAIN = /^(nama penandatangan|nama verifikator|kepada|nama grup)$/i;

/**
 * Baris tabel → item referensi. Baris filter ("Cari …") dan baris kosong dilewati; kolom utama = Nama/Kepada/Nama Grup.
 */
export function parseReferenceRows(category: ReferenceCategory, headers: string[], rows: string[][]): ReferenceItem[] {
  const all = headers.map(headerName);
  const items: ReferenceItem[] = [];
  for (const cells of rows) {
    if (cells.length < 2 || cells.length > all.length + 1) continue;
    // Sel diselaraskan ke header dari kanan: penandatangan punya kotak centang ekstra di depan, tabel tujuan/tembusan tidak
    // punya sel untuk kolom "#"
    const names = cells.length >= all.length ? all : all.slice(all.length - cells.length);
    const aligned = cells.length > all.length ? cells.slice(cells.length - all.length) : cells;
    const main = names.findIndex((h) => MAIN.test(h));
    const fields: Record<string, string> = {};
    aligned.forEach((value, i) => {
      const header = names[i];
      const text = tidy(value);
      if (!header || SKIP.test(header) || !text || text === "-") return;
      fields[header] = text;
    });
    // Klasifikasi: label "KODE - Nama" seperti pilihan formulir Registrasi ("KU.204 - Laporan Keuangan")
    if (category === "classification") {
      const code = (fields["Kode"] ?? "").replace(/\.+$/, "");
      const name = fields["Nama Klasifikasi"] ?? "";
      if (!code || !name || /^cari\b/i.test(code)) continue;
      items.push({ category, label: `${code} - ${name}`, fields });
      continue;
    }
    const label = main >= 0 ? fields[names[main]] : Object.values(fields)[0];
    if (!label || /^cari\b/i.test(label)) continue;
    if (main >= 0) delete fields[names[main]];
    items.push({ category, label, fields });
  }
  return items;
}

/** Kunci unik item (untuk menggabung halaman tabel & ID record yang stabil). */
export const referenceKey = (item: Pick<ReferenceItem, "category" | "label" | "fields">) =>
  [
    item.category,
    item.label,
    item.fields["Jabatan"] ?? item.fields["Jenis Tujuan"] ?? item.fields["Jenis Tembusan"] ?? "",
  ]
    .join("|")
    .toLowerCase();

/** Gabung item dari beberapa halaman tabel tanpa ganda (urutan pertama muncul dipertahankan). */
export function mergeReferenceItems(pages: ReferenceItem[][]): ReferenceItem[] {
  const seen = new Set<string>();
  const result: ReferenceItem[] = [];
  for (const item of pages.flat()) {
    const key = referenceKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/**
 * Teks navigasi tabel setelah "Hitung Total" → jumlah data. Format SRIKANDI: "Total Penandatangan: 22"; juga "1-10 dari
 * 1.234" / "Total: 18 data". Tidak ada angka → null.
 */
export function parseTotal(text: string): number | null {
  const t = text.replace(/\s+/g, " ");
  const m =
    /total[^:\d]*:\s*([\d.]+)/i.exec(t) ??
    /(?:dari|of)\s*([\d.]+)/i.exec(t) ??
    /([\d.]+)\s*(?:data|baris|item)/i.exec(t);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ""));
  return Number.isFinite(n) ? n : null;
}
