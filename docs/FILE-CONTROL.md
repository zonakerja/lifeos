# File Control — Spesifikasi & Aturan Bisnis

Modul manajemen kearsipan sesuai kaidah kearsipan Indonesia: pemberkasan, klasifikasi, Jadwal Retensi Arsip (JRA),
penataan fisik/digital, peminjaman, dan penyusutan (pemusnahan / penyerahan statis).
Kode: `frontend/src/features/file-control/` (peta file di §9).

## 1. Data

Record type yang dipakai modul ini (nama tabel & kolom: [ARCHITECTURE.md §4.2](ARCHITECTURE.md#42-tabel-domain-20)):
`para_resource` bertipe `file` (arsip), `para_archive` bertipe file (arsip yang resource-nya diarsipkan di PARA),
`archive_classification` (klasifikasi), `archive_jra` (jadwal retensi), `archive_physical_reference` (wadah fisik),
`archive_borrowing` (peminjaman), `archive_disposition` (berita acara penyusutan), `archive_move_log` (riwayat
pemindahan). Semua perubahan data kearsipan tercatat otomatis di `archive_audit_logs` (ARCHITECTURE.md §4.4).

**Masuk File Control = pilihan user (opt-in)**: resource berkas hanya menjadi arsip bila dicentang **"Masukkan ke File
Control"** saat dibuat (form Resource Global & form lampiran Project/Action/Task/Agenda/Tandai Selesai — lampiran
otomatis menjadi Resource Global) atau saat diubah di form Resource. Centang mengisi `archivalStatus: "pending"`
(Gantung); dilepas → `"none"`; kosong/`none` = bukan arsip. Arsip fisik/digital tidak bisa dikeluarkan lewat centang.
Centang default mati, pilihan terakhir diingat per browser. Logika: `features/resources/file-control-intake.ts` (+ test).
Arsip yang sudah diberkaskan (Fisik/Digital) **tidak bisa dihapus, diganti berkasnya, atau diubah tipenya dari tab
Resources** (`archiveLockReason`): penghapusan arsip hanya lewat penyusutan (berita acara) di File Control. Arsip Gantung
masih boleh dihapus dari Resources (dialog menyebut bahwa arsip ikut keluar dari File Control).
Resource berkas lama (sebelum opt-in) dimigrasi menjadi `pending` (`20261014120000_file_control_opt_in`).

**Sumber arsip**: resource bertipe file yang masuk File Control (`isInFileControl`, `isArchived: false`) + isi snapshot
PARA Archive bertipe file yang masuk File Control (`isArchived: true`, `archiveWrapperId`). Setiap perubahan dirutekan kembali ke asalnya; field sementara
(`dynamicStatus`, `isArchived`, `archiveWrapperId`, `archivedAt`) tidak pernah disimpan.

**Field kearsipan pada resource**: `archivalStatus` (pending|physical|digital|none; kosong/none = bukan arsip), `archiveRegId`
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
Media: **fisik** mengisi lokasi simpan (gedung/rak/box/folder); **digital** mengisi aplikasi/sistem, tautan dokumen, dan
Auto-Dispose — tanpa lokasi fisik. Catatan kondisi/kearsipan tersedia untuk keduanya. Saat disimpan, isian media yang
tidak dipilih dikosongkan (arsip digital tidak pernah menyimpan lokasi fisik).

## 3. Penyusutan

- **Pemusnahan** (destroy): arsip expired, tidak vital, JRA bukan Permanen.
- **Penyerahan statis** (transfer): arsip expired dengan JRA Permanen.
- Syarat di atas + **tidak sedang dipinjam** berlaku sama untuk semua jalur (satuan, pilih banyak, BAP manual) lewat
  satu fungsi `dispositionBlockReason` (`lib/archive.ts`); penolakan menyebut alasannya (vital, Permanen/non-Permanen,
  retensi belum selesai, belum diberkaskan, final, dipinjam). Kandidat BAP manual hanya arsip yang lolos syarat.
- Eksekusi: status → destroyed/static, tag "Musnah"/"Statis", `dispositionData` dari form + `executedAt`/`type`,
  berita acara dicatat. Bisa satuan, pilih banyak per seksi, atau manual dari Transaksi (scan/cari).
- **Auto-dispose**: arsip digital dengan `isAutoDispose` yang lewat tanggal inaktif dieksekusi otomatis
  (Permanen → statis, lainnya → musnah, `legalNumber` `AUTO-SYS-<tahun>`) saat modul dibuka; idempoten. Tanggal BA =
  tanggal **lokal** hari itu; pelaksana (`user`) = user yang membuka modul, BA bertanda "Dieksekusi otomatis oleh sistem".
- **Restore** (super admin, dengan dialog konfirmasi): status kembali active, `isAutoDispose` false, tag musnah/statis
  dihapus, `dispositionData` dikosongkan; berita acara yang sudah tercatat tetap ada.

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
pagination (default 100). Detail arsip dibuka lewat `?archive=<id>` (deep link); banner & label detail mengikuti
status: Gantung (belum diberkaskan, tanpa label media/retensi), Aktif, Inaktif, Vital (retensi manual), Perlu Tindak
Lanjut (menyebut pemusnahan/penyerahan sesuai JRA), Statis, Musnah. Kartu menampilkan kode klasifikasi lengkap
`P.S.I`, jenis retensi, lokasi fisik lengkap (atau "Belum ditata"), dan penanda Dipinjam.
**Lihat Dokumen** tersedia di semua tempat yang menampilkan arsip (kartu, detail, Penataan, isi wadah, pencarian) bila
arsip punya dokumen: berkas upload (modal pratinjau), URL, atau tautan dokumen digital — `lib/archive-document.ts`.

## 5. Penataan

- Khusus **arsip fisik** yang masih dikelola (`isPhysicalArchive`): arsip digital tidak ditata, tidak dihitung sebagai isi
  wadah (hapus wadah, info box/folder, Daftar Isi), dan ditolak di pemindahan massal.
- Navigasi breadcrumb + kembali/maju; klik ganda membuka wadah. Di root tampil gedung & arsip fisik tanpa lokasi.
- Wadah yang bisa dibuat per tingkat: root → gedung → rak → box → folder (folder tidak berisi wadah).
- Hierarki pemindahan: wadah hanya ke tingkat tepat di atasnya; arsip boleh ke wadah mana saja. Arsip
  statis/musnah (fisik maupun digital) tidak ditampilkan dan tidak bisa ditata; arsip yang sedang dipinjam tidak bisa
  dipindah sampai dikembalikan.
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
  validasi (status & media); penolakan untuk hierarki salah, item sudah di tujuan, duplikat, arsip final (semua
  media), arsip yang sedang dipinjam.
- **Peminjaman**: hanya **arsip fisik** (tidak sedang dipinjam, bukan statis/musnah), peminjam wajib, tanggal pinjam &
  target kembali (target ≥ tanggal pinjam); aksi Kembalikan/Batalkan; cetak Berita Acara (watermark untuk
  dikembalikan/dibatalkan). Daftar menampilkan tanggal pinjam, target, tanggal dikembalikan, dan penanda
  **Terlambat n hari** (`borrowingOverdueDays`). Arsip yang sedang dipinjam ditandai di kartu & detail arsip.
- **Histori penyusutan**: daftar berita acara + pembuatan BAP manual + cetak.

## 7. Referensi

- Klasifikasi & JRA: CRUD, pencarian, filter, impor CSV berpemisah `|` (baris pertama header).
  Klasifikasi: `jenis|kodePokok|namaPokok|kodeSub|namaSub|kodeItem|namaItem` (kodePokok huruf besar, kodeSub dipad 2,
  kodeItem dipad 3). JRA: `kategoriUtama|subKategori|jenisArsip|retensiAktif|retensiInaktif|keterangan`.
- Keunikan: klasifikasi = kode lengkap `P.S.I`, JRA = kategori utama + sub kategori + jenis arsip (tanpa peka huruf
  besar/kecil; `classificationKey`/`jraKey`). Form menolak data kembar; impor CSV melewati baris yang sudah ada atau
  berulang di berkas dan melaporkan jumlahnya.
- Klasifikasi/JRA yang masih dirujuk arsip (termasuk statis/musnah) **tidak bisa dihapus** (`countArchivesUsing`).
- Lokasi fisik: per jenis wadah, form dengan pemilih induk bertingkat, cetak label QR, hapus berantai (ditolak bila
  berisi arsip).

## 8. Label & cetak

QR dibuat lokal. Label arsip: QR `archiveRegId` + kode klasifikasi + tanda VITAL + uraian. Label wadah: QR ID wadah
+ kode + nama + jenis. Dokumen A4 (daftar isi wadah, berita acara) dipratinjau **layar penuh** lalu dicetak lewat
jendela terpisah. Penandatangan "Pengelola Arsip" pada BA = pelaksana yang tercatat (BA penyusutan: `user`, peminjaman:
`pic`), bukan user yang sedang mencetak; tanggal BA penyusutan = tanggal eksekusi di form.

## 9. Peta kode

| File | Isi |
|---|---|
| `lib/archive.ts` | logika murni: status, retensi, syarat penyusutan, peminjaman (dipinjam/terlambat), keunikan & pemakaian referensi, ID registrasi, kode wadah, hierarki, rantai & teks lokasi, smart scan (diuji `archive.test.ts`) |
| `lib/archive-document.ts` | lihat dokumen arsip (berkas → modal pratinjau, URL / tautan digital → tab baru) |
| `lib/print.ts` | cetak elemen (label / A4) |
| `use-file-control.ts` | `useArchiveFiles` (gabung resource + PARA Archive) & `useFileControlActions` (semua mutasi) |
| `file-control-page.tsx` | halaman modul, statistik, auto-dispose, dialog detail `?archive=` |
| `components/archive-*.tsx`, `disposition-form-dialog.tsx`, `label-dialogs.tsx` | daftar, kartu, pemberkasan, detail, penyusutan, label |
| `components/arrangement/*` | Penataan |
| `components/transactions/*` | Transaksi |
| `components/references/*` | Referensi |
| `components/bulk-move-dialog.tsx`, `camera-scanner.tsx`, `container-info-dialog.tsx`, `print-documents.tsx`, `phys-ref-form-dialog.tsx`, `archive-ui.tsx` | komponen bersama |
