# ONLYOFFICE — Riset & Rencana Integrasi (menu Tools → ONLYOFFICE)

Status: keputusan user ditetapkan (§4.2), **tahap 0 (infra dev), tahap 1 (backend), dan tahap 2 (frontend) selesai**
2026-10-15 (§3.1–§3.3), **tahap 3 (AI satu pintu di editor, templat, impor, font) selesai 2026-10-16** (§3.4), **lanjutan: tampilan per role,
font diunggah admin, tautan konsep ↔ dokumen final (§3.5)** dan **tahap 4 produksi (§3.6)** selesai 2026-10-16. Berikutnya
(rencana user): agen SRIKANDI (mengambil dokumen final) & agen pembuat dokumen dari templat di menu Tools (§3.7). Dokumen ini menjadi
acuan thread integrasi ONLYOFFICE: hasil riset, arsitektur, keputusan, dan daftar tugas (user & Claude).

## 1. Ringkasan riset

| Topik | Temuan | Dampak untuk LifeOS |
|---|---|---|
| Produk yang dipakai | **ONLYOFFICE Docs** (dulu "Document Server") **Community Edition**, self-hosted, image Docker resmi `onlyoffice/documentserver`. Bukan DocSpace/Workspace/Cloud (itu produk SaaS terpisah). | Cukup satu container tambahan; **tidak perlu akun ONLYOFFICE** untuk memasang & memakai. |
| Lisensi | AGPL v3 + ketentuan tambahan sejak 9.4 (versi turunan/modifikasi wajib menampilkan bagian "About" yang menyebut ONLYOFFICE sebagai pengembang asli; merek diatur kebijakan merek). | LifeOS memakai image **tanpa modifikasi** sebagai layanan terpisah lewat API → cukup jangan menghapus logo/"About" ONLYOFFICE. (Bukan nasihat hukum.) |
| Batas koneksi | Community dulu dibatasi 20 koneksi bersamaan; **dihapus sejak 9.4** (19 Mei 2026). | Tidak ada batas pemakaian untuk penggunaan pribadi/tim kecil. |
| Versi | Stabil terbaru **10.0.0** dirilis 12 Okt 2026 (3 hari lalu); **9.4** dirilis 19 Mei 2026 (patch 9.4.0.1 Juli). 9.4 menyatukan semua komponen menjadi **satu proses** dan **tanpa RabbitMQ & database**. 10.0: JWT aktif default, endpoint konversi `from-file`, sakelar AI `customization.ai.disabled`, perubahan memutus untuk token `/converter` & `/command`. | **Keputusan user: langsung `10.0`** (rilis stabil). Breaking changes 10.0 tidak mengenai alur Docs API editor + callback; diperhatikan saat memakai `/converter` atau `/command` (token wajib dibuat terpisah, tidak boleh memakai token config editor). |
| Arsitektur CPU | Tag 9.x & 10.0 tersedia **amd64 + arm64**. | Jalan native di WSL laptop (Ubuntu **aarch64**, sudah dicek) dan di VPS x86_64/ARM64. |
| Kebutuhan sumber daya | Panduan resmi: 2 core, **RAM ≥ 4 GB**, swap ≥ 4 GB, disk ≥ 40 GB (angka lama; 9.4 lebih ringan karena satu proses). | Laptop 16 GB aman. **VPS 4 GB tidak cukup** untuk LifeOS + ONLYOFFICE → rekomendasi VPS naik ke **8 GB** (lihat §5). |
| Port & volume | Container mendengar port 80 (443 bila SSL sendiri). Volume: `/var/log/onlyoffice` (log), `/var/lib/onlyoffice` (cache), `/var/www/onlyoffice/Data` (sertifikat). Font tambahan: `/usr/share/fonts/truetype/custom`. | Dev: host port **8080** (tidak bentrok dengan aturan port). Data dokumen tetap di S3 LifeOS — volume ONLYOFFICE hanya cache, tidak perlu di-backup. |
| Env penting | `JWT_ENABLED` (default true), `JWT_SECRET` (**wajib diisi sendiri**: default acak dan berubah tiap restart → integrasi rusak), `JWT_HEADER` (default `Authorization`), `JWT_IN_BODY`, `ALLOW_PRIVATE_IP_ADDRESS` (default false), `GENERATE_FONTS`, `WOPI_ENABLED`. | `ALLOW_PRIVATE_IP_ADDRESS=true` wajib: ONLYOFFICE mengunduh berkas dari backend di alamat privat (jaringan Docker / IP WSL). |
| Cara integrasi | (a) **Docs API** (JS `api.js` + `DocsAPI.DocEditor(config)`): config ditandatangani JWT HS256 **di backend**, ONLYOFFICE mengunduh berkas dari `document.url`, lalu mengirim status ke `editorConfig.callbackUrl`. (b) WOPI (untuk host WOPI seperti SharePoint) — tidak dipakai. | Pakai **Docs API**; secret JWT hanya di backend (sesuai prinsip "secret di server"). |
| Callback | POST JSON berisi `key`, `status`: 1 sedang diedit · **2 siap disimpan** (± 10 detik setelah editor terakhir ditutup) · 3 gagal simpan · 4 ditutup tanpa perubahan · **6 force save** (tombol Simpan) · 7 gagal force save. Untuk 2/3/6/7 ada `url` berkas hasil edit (+ `changesurl` riwayat). Backend wajib menjawab `{"error":0}`. | Backend mengunduh `url`, menyimpan ke S3 sebagai versi baru Asset, memicu ekstraksi teks + indeks RAG. |
| `document.key` | Unik di seluruh server ONLYOFFICE, karakter `0-9 a-z A-Z - . _ =`, maks. 128, **wajib berganti setiap kali dokumen tersimpan** (key yang sama = ONLYOFFICE membuka versi cache lama). | Key = `<assetId>-<versi>`; versi naik di setiap penyimpanan. Pengguna yang membuka key sama = **co-editing** otomatis. |
| Jenis berkas | Daftar resmi server `document-formats/onlyoffice-docs-formats.json` (74 format): **edit** (docx, docm, dotx, dotm, xlsx, xlsm, xlsb, xltx, xltm, pptx, pptm, ppsx, ppsm, potx, potm, pdf), **lossy-edit** = bisa disunting tetapi sebagian format bisa hilang (odt, ott, rtf, txt, md, html, epub, fb2, ods, ots, xls, csv, tsv, odp, otp), **view** (doc, ppt, xlt, pages, numbers, key, hwp, djvu, xps, vsdx, …). `assemblyFormatAsOrigin: true` → disimpan kembali dalam format aslinya. | Tabel disalin ke `backend/src/office/office-formats.ts` & `frontend/.../office-formats.ts` (perbarui saat upgrade ONLYOFFICE). |
| Di belakang proxy (sub-path) | Butuh header `X-Forwarded-Proto` dan `X-Forwarded-Host` **berisi path** (mis. `domain/office`) + dukungan WebSocket. | Produksi: Caddy `/office/*` → container ONLYOFFICE di domain yang sama → CSP `'self'` cukup, tanpa DNS/sertifikat tambahan. |

### 1.1 Uji jaringan WSL ↔ Windows (dilakukan 2026-10-15 di laptop user)

Backend dev berjalan di **Windows** (port 4000), ONLYOFFICE akan berjalan di **Docker dalam WSL** (mode jaringan NAT,
tanpa `.wslconfig`). ONLYOFFICE harus bisa menghubungi backend (mengunduh berkas & mengirim callback):

| Alamat dari dalam container | Hasil `GET /api/v1/health/live` |
|---|---|
| `host.docker.internal` (`--add-host ...:host-gateway`) | ❌ gagal (mengarah ke VM WSL, bukan Windows) |
| IP gateway default WSL (`ip route show default`) | ✅ 200 — Windows Firewall tidak memblokir |

Kesimpulan: di dev, ONLYOFFICE menjangkau backend lewat **IP gateway WSL** = IPv4 antarmuka Windows
`vEthernet (WSL (Hyper-V firewall))` (di laptop user `172.24.224.1`). IP itu bisa berubah setiap WSL/Windows restart →
backend (berjalan di Windows) **membacanya sendiri** dari `os.networkInterfaces()` (antarmuka bernama `…WSL…`) bila
`ONLYOFFICE_BACKEND_URL=auto` — tanpa skrip tambahan. Terbukti di uji tahap 0 (§3.1). Arah sebaliknya (backend → ONLYOFFICE `http://localhost:8080`) sudah lewat
`wslrelay`, sama seperti PostgreSQL/Redis.

## 2. Arsitektur yang diusulkan

```
Browser (LifeOS SPA)
  │ 1. POST /api/v1/office/config {uploadId, mode}   (Bearer, cek akses: pemilik / berbagi Lihat|Komentar|Edit)
  │ ◄── config + token JWT (ditandatangani backend dengan ONLYOFFICE_JWT_SECRET)
  │ 2. memuat <ONLYOFFICE_PUBLIC_URL>/web-apps/apps/api/documents/api.js → new DocsAPI.DocEditor(config)
  ▼
ONLYOFFICE Docs (container) ── 3. GET  document.url   → backend /office/files/:id?token=  (link bertanda tangan, singkat)
                            └─ 4. POST callbackUrl    → backend /office/callback?token=   (JWT ONLYOFFICE diverifikasi)
                                                         status 2/6 → unduh url hasil → S3 (versi baru) → ekstraksi + RAG
```

- **Backend** modul baru `src/office/`: `POST /office/config`, `GET /office/files/:id` (publik, token bertanda tangan),
  `POST /office/callback` (publik, verifikasi JWT ONLYOFFICE + token callback), `POST /office/documents` (buat dokumen
  kosong dari templat docx/xlsx/pptx/pdf-form). Env baru (didaftarkan di `env.validation.ts`, opsional — tanpa env,
  fitur ONLYOFFICE tampil "belum diatur"): `ONLYOFFICE_PUBLIC_URL` (dibuka browser), `ONLYOFFICE_INTERNAL_URL`
  (dihubungi backend), `ONLYOFFICE_JWT_SECRET`, `ONLYOFFICE_BACKEND_URL` (alamat backend yang dihubungi ONLYOFFICE;
  dev `auto` = IP WSL, prod `http://backend:4000`).
- **Hak akses** memakai `ShareAccessService` yang ada: izin Edit → `mode: edit`; Komentar → `permissions.edit=false,
  comment=true`; Lihat → `view`. Isolasi data tetap (tanpa jalan pintas admin).
- **Penyimpanan**: berkas tetap Asset LifeOS di S3. Setiap simpan = konten Asset diganti versi baru (riwayat versi:
  keputusan U-5), `key` berganti, ekstraksi + indeks RAG diperbarui. Validasi `url` callback hanya dari host ONLYOFFICE
  (cegah SSRF).
- **Frontend**: modul baru **Tools** di sidebar (`navigation.ts`) dengan sub menu pertama **ONLYOFFICE**
  (`/tools/onlyoffice`): daftar dokumen kantor milik sendiri & dibagikan, tombol **Buat baru** (Dokumen / Spreadsheet /
  Presentasi / Formulir PDF), **edit PDF** (teks, halaman, anotasi, isi formulir), editor layar penuh `/tools/onlyoffice/:uploadId` (`api.js` dimuat dinamis; `type: desktop` — editor seluler Community hanya bisa melihat
  di layar kecil). Dokumen baru menjadi **Resource Global** (tag konteks baru, mis. `ONLYOFFICE`) dengan centang
  **"Masukkan ke File Control"** yang sudah ada. `previewFile()` untuk DOCX/XLSX/PPTX membuka ONLYOFFICE mode lihat.
  Editor punya tombol "Buka di ONLYOFFICE" dari lampiran/resource.
- **AI (keputusan user: dua pilihan)**: pengaturan per user "AI di editor ONLYOFFICE": **Mati** (default, sesuai prinsip
  data tidak keluar tanpa disadari) · **AI LifeOS** · **AI bawaan ONLYOFFICE**. Hasil riset & desain akhir: §3.4.
- **Produksi**: service `onlyoffice` di `docker-compose.prod.yml` (tanpa port terbuka, batas memori), Caddy
  `handle_path /office/*` → `onlyoffice:80` + `X-Forwarded-Host {host}/office`; CSP `nginx.conf` tetap `'self'`
  (domain sama). Backup tidak berubah (data di PostgreSQL + S3).

## 3. Tahapan implementasi (dikerjakan Claude)

| Tahap | Isi | Selesai bila |
|---|---|---|
| 0. Infra dev | Service `onlyoffice` (`onlyoffice/documentserver:10.0`) di `docker-compose.yml` dengan **profile `office`** (tidak ikut `up -d` biasa agar RAM hemat), port 8080, JWT secret dev, `ALLOW_PRIVATE_IP_ADDRESS=true`, volume cache; deteksi IP WSL; dokumentasi SETUP (port 8080, menyalakan/mematikan). | Container sehat di laptop ARM64, `api.js` terbuka di browser, container menjangkau backend. |
| 1. Backend | Modul `office`: config bertanda tangan, unduh bertoken, callback (status 2/6 → versi baru → ekstraksi/RAG), buat dokumen kosong dari templat, hak akses berbagi, **riwayat 10 versi + pulihkan**; unit test + smoke test (callback disimulasikan). | Lint, typecheck, test, smoke lulus. |
| 2. Frontend | Menu **Tools → ONLYOFFICE**, daftar & buat baru, editor layar penuh, integrasi `previewFile` + tombol buka dari lampiran/resource, Resource Global + File Control. | Uji browser: buat → edit → simpan → buka ulang (versi baru), berbagi Lihat/Edit (co-editing dua akun), HP. |
| 3. Lanjutan | AI bawaan ONLYOFFICE + penyedia kustom "AI LifeOS" (U-7), templat instansi (kop surat, nota dinas), font tambahan, konversi (mis. DOCX → PDF untuk File Control). | Sesuai keputusan user. |
| 4. Produksi | Compose prod + Caddy sub-path (blokir `/office/welcome`, `/office/example`, `/office/admin`, `/office/info`) + batas memori + uji stack prod lokal (`lifeos-upgradetest`), DEPLOYMENT.md. | Smoke lewat `http://localhost`, editor terbuka lewat `/office/`. |

### 3.1 Hasil tahap 0 (2026-10-15)

- `docker-compose.yml` service `onlyoffice` (container `lifeos-onlyoffice`, profile `office`, port 8080, volume
  `lifeos-onlyoffice-cache` & `lifeos-onlyoffice-logs`, healthcheck `/healthcheck`). `docker compose up -d` biasa
  **tidak** menyalakannya; nyalakan dengan `docker compose --profile office up -d --wait onlyoffice` (SETUP §4 langkah 6).
- Env dev: `JWT_SECRET` tetap (`lifeos-dev-onlyoffice-jwt-secret-…`, nanti = `ONLYOFFICE_JWT_SECRET` backend),
  `JWT_HEADER=AuthorizationJwt` (terpisah dari Bearer LifeOS), `ALLOW_PRIVATE_IP_ADDRESS=true`.
- Terverifikasi: versi **10.0.0-169**, image **arm64** native (± 950 MB), sehat ± 1 menit setelah start, RAM diam
  **± 390 MB**, `api.js` termuat di browser (`DocsAPI.DocEditor.version()` = 10.0.0), JWT & private IP aktif di
  `local.json`, container → backend Windows lewat IP WSL = 200.
- **Uji pulang-pergi**: skrip di Windows menandatangani JWT HS256 dengan secret dev, meminta `/converter` mengonversi
  berkas txt yang disajikan dari Windows (IP diambil dari antarmuka WSL seperti rencana backend) → ONLYOFFICE mengunduh
  berkas, mengembalikan DOCX yang dapat diunduh dari Windows (`http://localhost:8080/cache/...`, 200).
- `/welcome/` terbuka (halaman info); `/admin/` 404 dan `/example/` 502 (tidak berjalan) — tetap diblokir di Caddy
  produksi (tahap 4).

### 3.2 Hasil tahap 1 — backend (2026-10-15)

Modul `backend/src/office/` (rincian endpoint & aturan: [ARCHITECTURE.md §3.5](ARCHITECTURE.md)), migrasi
`20261015120000_asset_versions`, templat kosong `backend/templates/office/new.{docx,xlsx,pptx,pdf}` (disalin dari
image ONLYOFFICE, locale id-ID; ikut ke image Docker backend). Env baru (opsional; kosong = fitur nonaktif):

| Env | Development | Produksi |
|---|---|---|
| `ONLYOFFICE_URL` | `http://localhost:8080` | `https://<domain>/office` |
| `ONLYOFFICE_INTERNAL_URL` | (kosong = sama) | `http://onlyoffice` |
| `ONLYOFFICE_JWT_SECRET` | secret dev di `docker-compose.yml` | `openssl rand -hex 32` (= `JWT_SECRET` container) |
| `ONLYOFFICE_BACKEND_URL` | `auto` | `http://backend:4000` |

`backend/.env` yang sudah ada **perlu ditambah** empat baris itu (salin dari `backend/.env.example`), lalu restart backend.

Terverifikasi:
- Unit test `office-logic.spec.ts` (18): format, kunci, nama dokumen, alamat backend WSL, penolakan URL asing (SSRF),
  status callback, rencana versi (tetap/timpa/tambah + pangkas 10), config per izin.
- Smoke test (+23 skenario, otomatis SKIP bila ONLYOFFICE mati): buat dokumen, config & tanda tangan, link berkas
  bertoken, isolasi user lain, berbagi Lihat → baca saja, JWT callback salah → 401, URL asing ditolak, simpan lewat
  callback (berkas dibuat ONLYOFFICE `/converter`) → versi 2, simpan ulang di sesi sama tidak menambah versi, kunci
  berganti setelah sesi selesai, pulihkan v1 → v3 (isi = v1), hapus berkas beserta versinya.
- **Editor sungguhan** di browser (api.js + config dari backend): dokumen terbuka, antarmuka Bahasa Indonesia, tab AI
  tidak muncul, ketik + Ctrl+S → versi 2 tersimpan & teks hasil edit terbaca ekstraksi, editor ditutup → kunci sesi berganti
  tanpa versi ganda.

### 3.3 Hasil tahap 2 — frontend (2026-10-15, direvisi sesuai arahan user di hari yang sama)

**Prinsip (keputusan user)**: ONLYOFFICE **bukan menu dokumen** — ia dipanggil di menu mana pun yang memiliki berkas.
Menu **Tools → ONLYOFFICE** hanya berisi **pengaturan/status** editor.

- **Menu Tools** (modul `tools`, warna sendiri) di kategori **Sistem** sidebar bersama Pengaturan (keputusan user),
  ber-sub-menu (`ModuleDef.sidebarSubmenu`, `sidebarGroup: "system"`); sub menu **ONLYOFFICE** (`/tools/onlyoffice`) = status server (Terhubung / Tidak
  terhubung / Belum diatur, versi, Community Edition, tombol Periksa ulang), format yang bisa disunting/dilihat, batas
  versi, JWT; admin juga melihat alamat browser/backend/ONLYOFFICE untuk diagnosis; kartu "Cara memakai". Pilihan AI di
  editor (U-7) akan ditambahkan di halaman ini (tahap 3).
- **Membuka & menyunting** di semua fitur lewat pratinjau berkas bersama (`previewFile`, dipakai lampiran
  Productivity/Planner/Notes, Resource Global, File Control): DOCX/XLSX/PPTX/ODT/… tampil lewat ONLYOFFICE mode lihat; PDF
  tetap penampil browser; berkas yang bisa diedit (DOCX/XLSX/PPTX/PDF) punya tombol **Edit di ONLYOFFICE**.
- **Buat dokumen baru = pilihan Tipe "Buat Dokumen (ONLYOFFICE)"** (revisi user: tombol di samping "Pilih File" sulit
  ditemukan) di `AttachmentForm` (Project, Action/Task, Tandai Selesai, Agenda: dasar pelaksanaan & hasil) dan form Resource
  Global (resource baru). Isian lain **sama dengan resource berkas**: Nomor, Nama Resource (= judul dokumen), Tanggal, Tag,
  Deskripsi, "Masukkan ke File Control", "Ringkas dengan AI". Pilih jenis (Dokumen / Spreadsheet / Presentasi /
  PDF-Formulir) → dokumen dibuat dengan konteks & pemilik sama seperti upload lampiran → editor langsung terbuka. Disimpan
  sebagai tipe `file` biasa; diperlakukan seperti upload yang belum disimpan (dibuang bila form dibatalkan / tab ditutup).
  **Ringkas dengan AI** untuk dokumen ini dijalankan setelah editor ditutup (tersimpan), dari teks ekstraksi server
  (`useFileSummarizer().summarizeUpload`) — juga setiap kali "Edit di ONLYOFFICE" dari form ditutup.
  Diuji: Resource "[UJI] Notulen Rapat Koordinasi" → ketik isi → tutup → "AI Ready" → Simpan: tipe file, File Control
  Gantung, tag "Global Resource" + "Notulen", ringkasan AI, dokumen versi 2.
- **Batal / hapus dokumen yang belum ditambahkan** (permintaan user): Batal, ganti Tipe, atau tutup dialog Tambah
  Resource (X/Esc) saat dokumen ONLYOFFICE yang dibuat **sudah berisi** (pernah disimpan, versi > 1) → modal konfirmasi
  "Buang dokumen yang sudah berisi?" (Kembali / Buang dokumen); dokumen kosong dibuang tanpa tanya. Tombol **Hapus
  dokumen** di form (setelah dokumen dibuat) → selalu konfirmasi "Hapus dokumen ini?", lalu jenis dokumen lain bisa dipilih.
  Hook `useOfficeDiscardConfirm`. Diuji: Resource (Batal & X → konfirmasi, Kembali → form tetap, Hapus dokumen → berkas
  terhapus, dokumen kosong → langsung tertutup) dan lampiran Project (Hapus dokumen).
  **Dialog induk** (Project, Action/Task, Tandai Selesai, Agenda, Ubah task cepat) juga dijaga: X / Esc / klik luar dan
  tombol Batal induk menanyakan dulu bila form lampiran di dalamnya memegang dokumen berisi (penjaga tutup generik di
  `components/ui/dialog.tsx` + `useDialogCloseGuard` / `useGuardedClose`). Diuji: X & Batal dialog Project.
- **Semua format resmi ONLYOFFICE** (permintaan user, menggantikan batas 4 format): pratinjau & "Edit di ONLYOFFICE" untuk
  semua format edit/lossy-edit; format lossy menampilkan badge "Sebagian format bisa hilang saat disimpan"; izin
  komentar/tinjau/isi formulir mengikuti kemampuan format; Visio (vsdx, …) dibuka sebagai diagram (lihat). Halaman Tools
  menampilkan tiga kelompok format. Diuji: ODT dibuka dari pratinjau Resource → Edit → ketik → tutup → versi 2 tetap
  `.odt` (isi berkas benar-benar ODT).
- **Ekstraksi teks via ONLYOFFICE**: format yang tidak dibaca ekstraktor bawaan (PPTX, ODT, ODP, RTF, DOC, PPT, EPUB, ODS,
  XLS, …) dikonversi ONLYOFFICE ke TXT (dokumen/presentasi) atau CSV (spreadsheet) → Ringkas AI & indeks pengetahuan ikut
  membaca isinya (`OfficeTextConverter`, metode `onlyoffice`). ONLYOFFICE mati → status tetap "format tidak didukung".
  Diuji: ODT hasil edit → `completed` via `onlyoffice`; smoke +2 (ekstraksi ODT, ODT bisa disunting & ditandai lossy).
- **Simpan otomatis saat modal ditutup (permintaan user)**: tombol X / Esc → `POST /office/files/:id/forcesave` →
  editor menampilkan "Menyimpan dokumen ke LifeOS…" sampai versi tersimpan, baru modal tertutup (toast "Dokumen
  tersimpan"). Gagal / server lambat → toast peringatan; ONLYOFFICE tetap menyimpan sendiri ± 10 detik setelah ditutup.
- **Editor** = modal hampir layar penuh dari `openOfficeEditor({ uploadId, name?, mode? })` (`OfficeEditorHost` di
  AppShell, editor dimuat malas). Riwayat versi (unduh, pulihkan) dari header editor.
- Ditemukan & diperbaiki saat uji: memulihkan versi saat editor terbuka → sesi lama mengirim ulang isinya → kini hanya masuk
  riwayat (ARCHITECTURE §3.5).
- Terverifikasi di browser: halaman Tools (status Terhubung, versi 10.0.0.169); Project → Tambah Resource → Upload File →
  Buat dokumen → Word terbuka dengan judul dari Nama Resource → ketik → tutup tanpa Ctrl+S → versi 2 tersimpan (konteks
  `project`, teks terbaca ekstraksi) → Tambahkan → Simpan Project (lampiran tersimpan); Agenda baru → Buat dokumen
  Spreadsheet → Batal → berkas dibersihkan; pratinjau DOCX via ONLYOFFICE; editor PDF. Smoke +6 skenario (konteks
  lampiran, larangan menaruh dokumen di ruang user lain, diagnosis tanpa detail untuk member, simpan paksa).
- Catatan data dev: empat resource [UJI] PDF (RAB 2026, Renstra 2010-2014, SK Mutasi, Surat Undangan) menunjuk ke satu berkas
  sintetis `SK-Uji-Arsip.pdf` (401 byte) yang strukturnya tidak lengkap — ONLYOFFICE menolaknya ("Terjadi kesalahan saat
  membuka file"); berkas PDF/DOCX normal terbuka.

### 3.4 Hasil tahap 3 — AI di editor, templat, font, impor (2026-10-16)

Keputusan awal user: plugin AI LifeOS sendiri, AI bawaan dengan key di editor, templat dari Resource bertag Templat, font
dari folder server. **Direvisi user di hari yang sama** setelah mencoba (lihat U-9 s.d. U-13):

- **AI satu pintu**: tab **AI bawaan ONLYOFFICE** (Chatbot, Summarization, Translation, Grammar & Spelling, asisten
  kustom, OCR PDF, …) dipakai apa adanya, tetapi **provider & API key = Pengaturan → AI LifeOS**; tidak ada pengaturan AI
  di editor; plugin panel "AI LifeOS" buatan sendiri dihapus.
- **Templat diunggah di Tools → ONLYOFFICE** (bukan lewat tag Resource).
- **Impor berkas** DOCX/XLSX/PPTX/… saat Buat Dokumen.

**Riset plugin AI resmi** (`asc.{9DC93CDB-B576-4F0C-B55E-FCC9C48DD007}`, 3.x, tidak ikut image Community):
- Tanpa pengaturan server, provider & key disimpan plugin di localStorage browser (origin ONLYOFFICE).
- Mode **pengaturan server** (`Asc.plugin.info.aiPluginSettings` → `AI.serverSettings`) menetapkan provider, model, dan
  aksi dari luar, **menyembunyikan tombol Settings**, dan mengirim semua permintaan non-GET ke **satu alamat proxy**
  `{ target, method, headers, data }` (body JSON **tanpa** Content-Type).
- Server ONLYOFFICE (`aiSettings`) hanya mengisi mode ini untuk seluruh server, dan proxy-nya tidak meneruskan identitas
  user ke provider → tidak bisa memakai key per user. Karena itu mode ini diisi **per user** oleh jembatan kecil.

**Rancangan yang diterapkan**:
- Pilihan per user `users.office_ai` (boolean, default **mati**; migrasi `20261016120000_office_ai`),
  `GET/PATCH /office/preferences { ai }` (+ `aiReady`, `provider { label, model }`). Kartu **AI di editor** (sakelar) di
  Tools → ONLYOFFICE; berlaku saat dokumen dibuka berikutnya.
- Image ONLYOFFICE dev dibangun sendiri (`infra/onlyoffice/Dockerfile`): image resmi + plugin AI
  (`documentserver-pluginsmanager.sh --install="ai"`, butuh internet saat build) + **jembatan**
  `infra/onlyoffice/lifeos-ai-bridge.js` disisipkan ke `index.html` & awal `Asc.plugin.init` (build gagal bila struktur
  plugin berubah). Jembatan membaca `info.options.lifeos` dan mengisi `info.aiPluginSettings`: provider **"AI LifeOS"**
  (url `<origin>/api/v1/office/ai/openai`, key = token sesi AI), satu model `lifeos` (Chat + Vision, 128k), semua aksi →
  model itu kecuali ImageGeneration (belum didukung).
- Config editor (bertanda tangan): `customization.ai.disabled = !aktif`; bila aktif + mode edit/komentar,
  `editorConfig.plugins.options["asc.{9DC9…}"] = { lifeos: { token, proxy, url, modelId, modelName } }` (token sesi AI
  12 jam, purpose `office-ai`; origin = origin browser bila terdaftar di `CORS_ORIGIN`, selain itu yang pertama).
- `POST /office/ai/proxy` (tanpa token login; 60/menit): body dibaca sebagai teks (`main.ts`), token sesi dari
  `headers.Authorization` isi permintaan; `…/chat/completions` → pesan OpenAI → satu prompt + gambar data URL
  (`office-ai.ts` + test) → `AiService.generate` milik user (cadangan otomatis ikut); jawaban format OpenAI biasa atau
  SSE (`stream: true`); `…/models` → daftar satu model; lainnya 400. Error selalu `{ error: { message } }`. Sakelar
  dimatikan → token lama 403. CORS: jalur `/api/v1/office/ai/` menerima origin apa pun **tanpa credentials** (iframe
  plugin ber-origin server ONLYOFFICE); endpoint lain tetap origin aplikasi + cookie.
- Keterbatasan: pembuatan gambar & mode agen (tool calling) tidak didukung — jawaban selalu teks. Menu plugin resmi
  berbahasa Inggris. Bahasa hasil ringkasan/terjemahan dipilih di jendela fiturnya (Target language).

**Templat** (keputusan user: unggah di Tools): kartu **Templat dokumen** — Unggah (DOCX/DOTX/ODT, XLSX/XLTX, PPTX/POTX,
PDF, …; berkas lain ditolak), lihat, **Sunting** templat di ONLYOFFICE, hapus (konfirmasi). Disimpan sebagai berkas milik
user dengan konteks `office-template` (tanpa tabel baru); `GET /office/templates` = templat milik sendiri yang formatnya
bisa jadi dokumen. "Buat Dokumen" → **Dari templat** → `POST /office/documents { templateId }` menyalin isinya (DOTX/ODT/…
dikonversi ke DOCX/XLSX/PPTX, `templateTarget`); judul kosong → nama templat.

**Impor berkas**: tombol **Impor berkas** di pilihan "Buat Dokumen" → berkas dari komputer diunggah dengan konteks &
pemilik lampiran lalu langsung dibuka di editor. Format yang hanya bisa dilihat (DOC, PPT, …) dikonversi ke DOCX/PPTX
(berkas asli dibuang); format lain dipakai apa adanya (`office-templates.ts`: `isDocumentFile`, `importNeedsConversion` +
test).

**Font**: folder `infra/onlyoffice/fonts` (berkas font di-`.gitignore`, README berisi panduan) di-mount ke
`/usr/share/fonts/truetype/custom`; daftar font dibuat ulang setiap start → salin `.ttf/.otf` lalu
`docker compose --profile office restart onlyoffice`. `GET /office/fonts` membaca `sdkjs/common/AllFonts.js` → kartu
**Font** (cari; panduan menambah hanya untuk admin). Image membawa 152 keluarga (Arial, Times New Roman, Calibri, Cambria,
Tahoma, Verdana, Georgia, …); belum ada antara lain Bookman Old Style, Century Gothic, Garamond, Segoe UI.

Terverifikasi:
- Unit backend `office-ai.spec.ts` (opsi plugin, target, token, pesan → prompt + gambar, jawaban biasa & SSE) +
  `office-logic.spec.ts` (config AI, templat, font); frontend `office-templates.test.ts`.
- Smoke: sakelar default/valid/tidak valid, config AI aktif memuat opsi untuk GUID plugin AI (origin asing diabaikan),
  proxy tanpa token / token login 401, endpoint tak didukung 400, prompt kosong 400, daftar model, tanpa key provider →
  "AI belum diatur" (tanpa biaya), CORS origin editor tanpa credentials, sakelar mati → 403, templat (daftar milik
  sendiri saja, PNG diabaikan, terisolasi per user, dokumen baru dari templat), templat ODT → DOCX.
- Browser:
  - Sakelar aktif → editor: tab **AI** tanpa tombol Settings.
  - Pilih teks → **Summarization** → Summarize: dijawab Gemini akun admin dev lewat proxy LifeOS.
    Ditemukan & diperbaiki saat uji: plugin mengirim body tanpa Content-Type → body kosong (401) → parser teks khusus jalur proxy.
  - Kartu Templat: unggah DOCX + PNG (PNG ditolak) → muncul di "Dari templat" form Tambah Resource.
  - **Impor berkas** DOCX → langsung terbuka di editor → Batal tanpa perubahan → dokumen dibuang.
  - Font: salin `BOOKOS.TTF` (uji, lalu dihapus) → restart → "Bookman Old Style" terdaftar.

### 3.5 Lanjutan tahap 3 — role, font admin, konsep ↔ dokumen final (2026-10-16)

**Tampilan per role** (keputusan user): Tools → ONLYOFFICE untuk **user** hanya berisi **AI di editor**, **Templat
dokumen**, dan **Cara memakai**; **admin** juga melihat **Status server** (format, alamat teknis) dan **Font**.
`GET /office/diagnostics` dan `/office/fonts` kini khusus admin (403 untuk member).

**Font diunggah admin** (menggantikan "salin ke folder + restart"): kartu Font → **Unggah font** (.ttf/.otf/.ttc ≤ 30 MB;
isi berkas divalidasi, nama dibersihkan) / hapus (konfirmasi). Backend menulis ke folder bersama `ONLYOFFICE_FONTS_DIR`
(dev `../infra/onlyoffice/fonts`, produksi volume `onlyoffice-fonts` → `/app/office-fonts`). Image ONLYOFFICE punya
entrypoint `infra/onlyoffice/lifeos-entrypoint.sh`: pemantau folder font (tiap 30 detik) menjalankan
`documentserver-generate-allfonts.sh` bila isinya berubah → daftar font terbarui ± 30 detik–2 menit tanpa restart
manual (layanan dokumen di-restart oleh skrip itu → editor yang terbuka tersambung ulang sebentar). Diuji: unggah
Bookman Old Style → terdaftar ± 30 detik; berkas palsu ditolak; member 403; hapus di luar folder 404.

**Konsep ↔ dokumen final** (kebutuhan user: konsep surat/nota dinas di ONLYOFFICE tidak perlu diberkaskan, tetapi
PDF hasil tanda tangan manual/elektronik perlu disimpan dan tertaut ke konsepnya agar mudah ditelusuri). Keputusan:
- Tautan bisa dibuat **dari konsep** (unggah final / tautkan berkas yang ada) **dan dari final** (tautkan ke konsep).
- Final menjadi **Resource Global** bertag asal "Dokumen Final" dengan "Masukkan ke File Control" **tercentang
  otomatis** (bisa dilepas).
- Konsep **tetap opsional** untuk File Control.

Rancangan:
- Kolom `assets.draft_id` (final → konsep, FK `ON DELETE SET NULL`; migrasi `20261016130000_asset_draft_link`).
  Satu tingkat: konsep (dokumen/spreadsheet/presentasi, `isDraftFormat`) boleh punya beberapa final; final tidak boleh
  menjadi konsep; konsep tidak boleh menjadi final (`finalLinkError` + test). Hapus konsep → final tetap, tautan lepas.
- Endpoint: `GET /office/files/:id/links` (konsep + final yang boleh dibaca), `PUT /office/files/:id/draft
  { draftId | null }` (izin edit atas final & konsep; lepas = izin edit salah satunya), `GET /office/links?ids=` (penanda
  tabel), `GET /office/link-candidates?role=draft|final&q=` (berkas milik user, kecuali templat & berkas notebook).
  Jalur yang sama nanti dipakai **agen SRIKANDI** untuk menautkan PDF final yang diambilnya.
- UI (`features/tools/onlyoffice/document-links.tsx`): tombol **Dokumen final** / **Konsep** di header pratinjau berkas
  dan editor → popover (daftar tertaut, lihat = pratinjau berpindah ke berkas itu, lepas tautan) + dialog **Unggah
  dokumen final** (berkas, Nama Resource "<konsep> (final)", centang File Control) dan **Tautkan berkas / Tautkan ke
  konsep** (cari berkas). Penanda di tabel lampiran & Resources: konsep "Final" (× n), final "Dari konsep".
- Diuji: dari konsep DOCX unggah PDF bertanda tangan → Resource Global + File Control + tautan; penanda di tabel; dari
  pratinjau final → konsep → pratinjau berpindah ke DOCX; smoke +11 (tautan, penanda, aturan, akses, kandidat, lepas,
  konsep dihapus).

**Templat instansi dari user** (2026-10-16): 29 templat DOCX (Berita Acara, Instruksi, Keputusan, Laporan, Memorandum,
Nota Dinas, Peraturan, Surat Dinas/Edaran/Keterangan/Kuasa/Pengantar/Tugas/Undangan, …) diunggah ke akun admin dev sebagai
templat (konteks `office-template`). Templat per user → user lain perlu mengunggah sendiri (atau nanti dibuat templat
bersama). Karena jumlahnya banyak (permintaan user): "Buat Dokumen" → tombol **Dari templat (n)** membuka **modal pemilih**
(`template-browser.tsx`: cari per kata, filter jenis, paginasi 10/25/50, lihat templat, klik = dokumen baru); kartu Templat
dokumen di Tools memakai daftar yang sama (Lihat / Sunting / Hapus).

### 3.6 Hasil tahap 4 — produksi (2026-10-16)

- `docker-compose.prod.yml`: service `onlyoffice` (image `infra/onlyoffice`, **profile `office`** → aktif dengan
  `COMPOSE_PROFILES=office`), JWT dari `ONLYOFFICE_JWT_SECRET`, `ALLOW_PRIVATE_IP_ADDRESS`, volume cache/log/font,
  healthcheck, batas memori `ONLYOFFICE_MEM_LIMIT` (default 2560m). Backend: `ONLYOFFICE_URL` dari `.env`,
  `ONLYOFFICE_INTERNAL_URL=http://onlyoffice` & `ONLYOFFICE_FONTS_DIR=/app/office-fonts` otomatis bila URL diisi,
  `ONLYOFFICE_BACKEND_URL=http://backend:4000`, volume font bersama (folder dibuat di image backend milik user `node`).
- `infra/caddy/Caddyfile`: `handle_path /office/*` → `onlyoffice:80` dengan `X-Forwarded-Host {host}/office`; `/office/welcome`,
  `/office/example`, `/office/admin`, `/office/info` → 404. Satu domain → CSP aplikasi tetap `'self'`; tab AI memanggil
  `/api/v1/office/ai/proxy` di origin yang sama (origin `ONLYOFFICE_URL` diterima sebagai origin aplikasi).
- Panduan: [DEPLOYMENT.md §9](DEPLOYMENT.md); `.env.example` root punya blok ONLYOFFICE.
- **Uji stack produksi lokal** (`lifeos-upgradetest`, `APP_DOMAIN=http://localhost`, profile office): semua container
  healthy; rute `/office/healthcheck` & `api.js` 200, halaman bawaan 404; **smoke test penuh lulus lewat Caddy**
  (`API_URL=http://localhost/api/v1`, termasuk callback ONLYOFFICE ⇄ backend di jaringan internal, konversi, versi, AI
  proxy, templat, font, tautan); UI: pratinjau & editor dimuat dari `/office/` (plugin AI + jembatan ikut), dokumen bisa
  disunting. Stack uji dibongkar (`down -v`) setelahnya.
- **Ditemukan saat uji**: di layar sempit editor memakai tampilan seluler, yang pada **Community hanya bisa melihat**
  ("editor web mobile butuh lisensi komersial") → frontend kini selalu meminta tampilan **desktop** (tetap bisa dipakai di
  layar kecil). Smoke test memetakan link berkas internal (`http://backend:4000/...`) ke `API_URL` saat diunduh dari host.

### 3.6.1 Review celah (2026-10-16)

Code review menyeluruh atas lanjutan tahap 3 + tahap 4 → 8 temuan, semuanya diperbaiki & diuji (unit + smoke):
- **Kritis**: compose produksi mengirim `ONLYOFFICE_URL=""` / `ONLYOFFICE_JWT_SECRET=""` saat ONLYOFFICE nonaktif → validasi
  env menolak string kosong → backend gagal start. Kini string kosong = tidak diisi (`emptyToUndefined`, `env.validation.spec.ts`).
- Kandidat tautan (konsep/final) disaring jenis berkas di database (sebelumnya hanya 120 berkas terbaru → berkas lama tak
  ditemukan); respons tautan membawa `ownerId` → dokumen final dari kolaborator (berbagi Edit) disimpan di ruang pemilik
  konsep; upload final dihapus lagi bila penautan ditolak; penanda tautan hanya menghitung berkas yang boleh dibaca
  (konsisten dengan popover, tanpa membocorkan berkas user lain) dan izin hanya dicek untuk berkas milik user lain;
  modal "Dari templat" tetap terbuka bila pembuatan gagal; opsi `mobile` dihapus dari API config (selalu desktop).

### 3.7 Rencana berikutnya (dari user, teknologi dibahas nanti — mis. n8n / OpenClaw)

- **Agen SRIKANDI**: mengambil dokumen final (PDF bertanda tangan elektronik) dari SRIKANDI lalu menautkannya ke konsep
  di LifeOS lewat `/uploads` + `PUT /office/files/:id/draft`.
- **Agen pembuat dokumen**: membuat dokumen bertemplat (output DOCX/XLSX/…) — memakai templat Tools → ONLYOFFICE dan
  `POST /office/documents { templateId }` sebagai titik awal.
- Keduanya dikelompokkan di menu **Tools** (sub menu baru).

## 4. To-do untuk user

### 4.1 Akun — tidak ada yang wajib

- [ ] **Tidak perlu membuat akun ONLYOFFICE** untuk Community Edition self-hosted. Image diunduh dari Docker Hub tanpa
  login. *Jangan* mendaftar DocSpace/Workspace/Cloud — itu layanan SaaS lain yang tidak dipakai.
- [ ] (Opsional) Akun di **community.onlyoffice.com** (forum resmi) bila nanti ingin bertanya ke komunitas/staf.
- [ ] (Opsional) Akun **GitHub** sudah ada (`zonakerja`) — cukup untuk memantau rilis/issue `ONLYOFFICE/DocumentServer`.

### 4.2 Keputusan (ditetapkan user 2026-10-15)

| ID | Keputusan |
|---|---|
| U-1 | **Community Edition** (gratis, tanpa akun, tanpa batas koneksi). |
| U-2 | **Langsung 10.0** (image `onlyoffice/documentserver:10.0`). |
| U-3 | Tahap pertama: (a) buka/edit DOCX/XLSX/PPTX yang sudah ada, (b) buat dokumen baru dari menu Tools, (c) pratinjau modal memakai ONLYOFFICE, **(d) edit PDF** (PDF yang sudah ada di LifeOS & PDF/formulir baru). |
| U-4 | Dokumen baru menjadi **Resource Global** (tag `ONLYOFFICE`) + centang "Masukkan ke File Control". |
| U-5 | **10 versi terakhir** per dokumen disimpan dan bisa dipulihkan (versi lebih lama dihapus dari storage). |
| U-6 | Edit bersama mengikuti berbagi LifeOS (Edit / Komentar / Lihat). |
| U-7 | **User memilih**: AI LifeOS (lewat backend) **atau** AI bawaan ONLYOFFICE (atau mati) — lihat §2 butir AI. |
| U-8 | Bahasa Indonesia, nama sesuai akun LifeOS. |
| U-9 | (2026-10-16, revisi) **AI satu pintu**: tab AI bawaan ONLYOFFICE apa adanya, provider & key = Pengaturan → AI LifeOS; tanpa pengaturan AI di editor; sakelar per user (default mati). |
| U-10 | (2026-10-16, revisi) Pilihan "AI bawaan dengan key diisi di editor" dan plugin panel AI LifeOS sendiri **dihapus**. |
| U-11 | (2026-10-16, revisi) Templat instansi **diunggah di Tools → ONLYOFFICE** (bukan tag Resource). |
| U-12 | (2026-10-16) Font tambahan = **folder font di server** (`infra/onlyoffice/fonts`) + restart container. |
| U-13 | (2026-10-16) **Impor berkas** DOCX/XLSX/PPTX/… dari komputer saat Buat Dokumen. |
| U-14 | (2026-10-16) Font tambahan **diunggah admin** dari Tools (menggantikan salin folder + restart). |
| U-15 | (2026-10-16) Tools → ONLYOFFICE per role: user = AI di editor, Templat, Cara memakai; admin = semua. |
| U-16 | (2026-10-16) **Konsep ↔ dokumen final**: tautan dari dua arah; final = Resource Global + File Control tercentang otomatis; konsep tetap opsional untuk File Control. |

### 4.3 Bahan yang disiapkan user (opsional, untuk tahap 3)

- [ ] **Templat dokumen** (kop surat, nota dinas, laporan, notulen) dalam DOCX/XLSX/PPTX (atau DOTX/XLTX/POTX): unggah di
  **Tools → ONLYOFFICE → Templat dokumen** — langsung muncul di "Buat Dokumen" → Dari templat.
- [ ] **Font** yang belum ada di server (Arial, Times New Roman, Calibri, Cambria, Tahoma sudah ada; yang belum: mis.
  Bookman Old Style, Century Gothic, Garamond, Segoe UI, font kop instansi). Font Microsoft berlisensi — pakai berkas
  font yang memang boleh Anda pakai (mis. dari Windows/Office berlisensi Anda untuk server pribadi). Salin `.ttf/.otf`
  lewat **Tools → ONLYOFFICE → Font → Unggah font** (admin).
- [ ] 2–3 **dokumen contoh** asli (tanpa data sensitif) untuk uji tampilan & tata letak.

### 4.4 Laptop (development)

- [ ] Koneksi internet saat tahap 0: image ONLYOFFICE berukuran besar (± 1–2 GB unduhan).
- [ ] Ruang disk WSL kosong ≥ 10 GB.
- [ ] Tidak perlu `.wslconfig`: WSL default memakai ± 50% RAM (± 8 GB dari 16 GB) — cukup. Bila laptop terasa berat,
  ONLYOFFICE hanya dinyalakan saat dibutuhkan (profile `office`).
- [ ] Bila Windows menampilkan **dialog Firewall** untuk Node.js saat uji pertama → pilih izinkan untuk jaringan
  **Private** saja.

### 4.5 Produksi (saat membeli VPS — DEPLOYMENT.md §0)

- [ ] Pilih **VPS 8 GB RAM / 4 vCPU** (LifeOS ± 3,3 GB + ONLYOFFICE ± 2–3 GB + ruang OS). VPS 4 GB hanya bisa bila
  ONLYOFFICE dimatikan.
- [ ] Disk ≥ 60 GB (image ONLYOFFICE + cache).
- [ ] Tidak perlu subdomain/DNS tambahan: ONLYOFFICE disajikan di `https://<APP_DOMAIN>/office/`.
- [ ] Simpan `ONLYOFFICE_JWT_SECRET` (`openssl rand -hex 32`) di password manager bersama isi `.env` lainnya.

## 5. Sumber

- Instalasi Docker Community: https://helpcenter.onlyoffice.com/installation/docs-community-install-docker.aspx
- Di belakang proxy (virtual path): https://helpcenter.onlyoffice.com/installation/docs-community-proxy.aspx
- Docs API: konsep, config, `document` (aturan `key`), callback, JWT:
  https://api.onlyoffice.com/docs/docs-api/get-started/basic-concepts/ ·
  https://api.onlyoffice.com/docs/docs-api/usage-api/config/document/ ·
  https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/ ·
  https://api.onlyoffice.com/docs/docs-api/additional-api/signature/
- Changelog (9.4, 10.0): https://github.com/ONLYOFFICE/DocumentServer/blob/master/CHANGELOG.md
- Tag image & arsitektur: https://hub.docker.com/r/onlyoffice/documentserver/tags
- 9.4 tanpa batas 20 koneksi & ketentuan lisensi tambahan:
  https://www.it-connect.tech/onlyoffice-docs-9-4-drops-the-20-connection-limit-and-updates-its-open-source-license/
