# File Control — Spesifikasi & Aturan Bisnis

Modul manajemen kearsipan sesuai kaidah kearsipan Indonesia: pemberkasan, klasifikasi, Jadwal Retensi Arsip (JRA),
penataan fisik/digital, peminjaman, dan penyusutan (pemusnahan / penyerahan statis).
Kode: `frontend/src/features/file-control/` (peta file di §9).

## 1. Data

| Record type (API) | Tabel | Isi |
|---|---|---|
| `para_resource` (type `file`) | `resources` | arsip = resource bertipe file + field kearsipan |
| `para_archive` (`originalType: resource`, `data.type: file`) | `para_archives` | arsip yang resource-nya diarsipkan di PARA |
| `archive_classification` | `archive_classifications` | kode klasifikasi |
| `archive_jra` | `archive_retention_schedules` | jadwal retensi |
| `archive_physical_reference` | `archive_locations` | wadah fisik (lokasi/rak/box/folder) |
| `archive_borrowing` | `archive_borrowings` | transaksi peminjaman |
| `archive_disposition` | `archive_dispositions` | berita acara penyusutan |
| `archive_move_log` | `archive_move_logs` | riwayat pemindahan |

Semua perubahan data kearsipan tercatat otomatis di `archive_audit_logs` (lihat ARCHITECTURE.md §3.4).

**Sumber arsip**: resource bertipe file (`isArchived: false`) + isi snapshot PARA Archive bertipe file
(`isArchived: true`, `archiveWrapperId`). Setiap perubahan dirutekan kembali ke asalnya; field sementara
(`dynamicStatus`, `isArchived`, `archiveWrapperId`, `archivedAt`) tidak pernah disimpan.

**Field kearsipan pada resource**: `archivalStatus` (pending|physical|digital|none), `archiveRegId`
(`ARC-<tahun dokumen>-<6 karakter>`), `classificationId`, `jraId`, `retentionActiveDate`, `retentionInactiveDate`,
`status` (active|inactive|static|destroyed), `isVital`, `isAutoDispose`, `physLocationId/physRackId/physBoxId/physFolderId`,
`digitalApp`, `digitalLink`, `notes`, `dispositionData` (`legalNumber, date, description, userNote, executedAt, type`,
opsional berkas SK/BA `uploadId, fileName`).

**Bentuk referensi**
- Klasifikasi: `jenis` (Fasilitatif|Substantif), `kodePokok` (≤2, huruf besar), `namaPokok`, `kodeSub` (2), `namaSub`,
  `kodeItem` (≤4), `namaItem`. Kode lengkap `P.S.I`.
- JRA: `kategoriUtama`, `subKategori`, `jenisArsip`, `retensiAktif` & `retensiInaktif` (tahun), `keterangan`
  (Musnah | Permanen | Dinilai Kembali).
- Wadah: `type` (location|rack|box|folder), `parentId` ("" = root), `code`, `name`, `description`.
  Kode otomatis `LOC|RAK|BOX|MAP-<tahun>-<urut>` (folder 4 digit), urut = maks+1 di tahun berjalan.
- Peminjaman: `id` `BAP-PINJAM-<ts>`, `date`, `returnDate`, `borrowerName`, `unit`, `purpose`,
  `items` [{id, title, number, archiveRegId}], `status` active|returned|cancelled, `pic`, `returnedAt`, `cancelledAt`.
- Berita acara: `type` destroy|transfer, `statusLabel`, `executedAt`, `formData`, `items`, `user`. ID: `BAP-<ts>`
  (dari daftar arsip), `BAP-MSN-<ts>`/`BAP-SRH-<ts>` (manual), `BAP-AUTO-<ts>-<id>` (otomatis).
- Log pemindahan: `MV-LOG` (1 arsip), `MV-CTR` (1 wadah), `MV-BLK` (massal, dengan `movedItems`); deskripsi diawali
  `ARSIP | `, `WADAH | `, atau `MASSAL | ` (menentukan warna log); `targetName` = wadah tujuan atau "ROOT".

## 2. Siklus status (dihitung terhadap hari ini, 00:00)

1. `status` destroyed/static → final.
2. Bila ada tanggal retensi aktif & inaktif dan `archivalStatus ≠ none`:
   hari ini > inaktif → `expired` (**Perlu Tindak Lanjut**), kecuali arsip vital → `inactive`;
   hari ini > aktif → `inactive`; selain itu `active`.

Pemberkasan: tanggal retensi = tanggal dokumen + retensi aktif (tahun), lalu + retensi inaktif (tahun); dihitung ulang
dari JRA setiap form dibuka. Arsip vital mengisi tanggal retensi manual (JRA tidak dipakai).

## 3. Penyusutan

- **Pemusnahan** (destroy): arsip expired, tidak vital, JRA bukan Permanen.
- **Penyerahan statis** (transfer): arsip expired dengan JRA Permanen.
- Eksekusi: status → destroyed/static, tag "Musnah"/"Statis", `dispositionData` dari form + `executedAt`/`type`,
  berita acara dicatat. Bisa satuan, pilih banyak per seksi, atau manual dari Transaksi (scan/cari arsip yang
  masa inaktifnya selesai).
- **Auto-dispose**: arsip digital dengan `isAutoDispose` yang lewat tanggal inaktif dieksekusi otomatis
  (Permanen → statis, lainnya → musnah, `legalNumber` `AUTO-SYS-<tahun>`) saat modul dibuka; idempoten.
- **Restore** (super admin): status kembali active, `isAutoDispose` false, tag musnah/statis dihapus,
  `dispositionData` dikosongkan.

## 4. Tab

| Tab | Isi |
|---|---|
| Gantung | arsip belum diberkaskan → "Proses Pemberkasan" |
| Fisik / Digital | sub-tab Semua · Aktif · Inaktif · Vital. Sub-tab Inaktif dibagi: Siap Dimusnahkan, Siap Diserahkan, Menunggu Masa Retensi |
| Penataan | explorer wadah & arsip (§5) |
| Transaksi | `?sub=` search · move · borrow · disposition (§6) |
| Statis / Musnah | sub-tab Semua · Fisik · Digital |
| Referensi | `?ref=` klasifikasi · jra · lokasi (§7) |

Daftar: cari judul/nomor/kode, filter waktu (semua/tahun/bulan/rentang) pada tanggal dokumen, urut terbaru,
pagination (default 100). Detail arsip dibuka lewat `?archive=<id>` (deep link).

## 5. Penataan

- Navigasi breadcrumb + kembali/maju; klik ganda membuka wadah. Di root tampil gedung & arsip tanpa lokasi.
- Wadah yang bisa dibuat per tingkat: root → gedung → rak → box → folder (folder tidak berisi wadah).
- Hierarki pemindahan: wadah hanya ke tingkat tepat di atasnya; arsip boleh ke wadah mana saja. Arsip fisik
  statis/musnah tidak ditampilkan dan tidak bisa ditata.
- Interaksi: pilih (Ctrl/⌘ untuk banyak), drag-drop, menu klik kanan, pintasan Ctrl+C/X/V/A/N dan Delete.
- Salin wadah: kode baru berurutan, nama + " (Copy)" (sub-wadah tidak ikut). Potong-tempel = pindah.
- Memindah arsip mengisi rantai lokasi lengkap dari wadah tujuan ke atas.
- Hapus: wadah ditolak bila (sub-)wadahnya berisi arsip; wadah dihapus bersama turunannya; arsip hanya dilepas
  dari lokasinya.
- Info box/folder + cetak A4 **Daftar Isi Arsip** (QR wadah, status per tanggal cetak, tanda tangan).

## 6. Transaksi

- **Pencarian global & smart scan**: cari arsip/wadah; Enter/scan mencocokkan ID, kode wadah, lalu ID registrasi
  arsip dan langsung membuka detail/isi wadah. Scanner USB (keyboard) dan kamera (QR).
- **Pemindahan massal**: pilih wadah tujuan (atau ROOT), tambah item lewat cari/scan/kamera dengan filter
  validasi (status & media); penolakan untuk hierarki salah, item sudah di tujuan, duplikat, arsip final.
- **Peminjaman**: pilih arsip (tidak sedang dipinjam, bukan statis/musnah), peminjam wajib, tanggal pinjam &
  target kembali; aksi Kembalikan/Batalkan; cetak Berita Acara (watermark untuk dikembalikan/dibatalkan).
  Arsip yang sedang dipinjam ditandai di detail arsip.
- **Histori penyusutan**: daftar berita acara + pembuatan BAP manual + cetak.

## 7. Referensi

- Klasifikasi & JRA: CRUD, pencarian, filter, impor CSV berpemisah `|` (baris pertama header).
  Klasifikasi: `jenis|kodePokok|namaPokok|kodeSub|namaSub|kodeItem|namaItem` (kodeSub dipad 2, kodeItem dipad 3).
  JRA: `kategoriUtama|subKategori|jenisArsip|retensiAktif|retensiInaktif|keterangan`.
- Lokasi fisik: per jenis wadah, form dengan pemilih induk bertingkat, cetak label QR, hapus berantai (ditolak bila
  berisi arsip).

## 8. Label & cetak

QR dibuat lokal. Label arsip: QR `archiveRegId` + kode klasifikasi + tanda VITAL + uraian. Label wadah: QR ID wadah
+ kode + nama + jenis. Dokumen A4 (daftar isi wadah, berita acara) dicetak lewat jendela terpisah.

## 9. Peta kode

| File | Isi |
|---|---|
| `lib/archive.ts` | logika murni: status, retensi, ID registrasi, kode wadah, hierarki, rantai lokasi, smart scan (diuji `archive.test.ts`) |
| `lib/print.ts` | cetak elemen (label / A4) |
| `use-file-control.ts` | `useArchiveFiles` (gabung resource + PARA Archive) & `useFileControlActions` (semua mutasi) |
| `file-control-page.tsx` | halaman modul, statistik, auto-dispose, dialog detail `?archive=` |
| `components/archive-*.tsx`, `disposition-form-dialog.tsx`, `label-dialogs.tsx` | daftar, kartu, pemberkasan, detail, penyusutan, label |
| `components/arrangement/*` | Penataan |
| `components/transactions/*` | Transaksi |
| `components/references/*` | Referensi |
| `components/bulk-move-dialog.tsx`, `camera-scanner.tsx`, `container-info-dialog.tsx`, `print-documents.tsx`, `phys-ref-form-dialog.tsx`, `archive-ui.tsx` | komponen bersama |
