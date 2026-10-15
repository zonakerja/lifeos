# Arsitektur LifeOS

Dokumen fondasi: arsitektur, tech stack beserta versinya, dan aturan yang wajib diikuti. **Versi komponen hanya
dicatat di §2** (dokumen lain merujuk ke sini). Rencana & kajian upgrade ada di [UPGRADE-PLAN.md](UPGRADE-PLAN.md).

## 1. Gambaran umum

```
Browser (React SPA)
   │  /api/v1 (JWT Bearer + cookie refresh httpOnly)   dev: Vite proxy · prod: Caddy (HTTPS)
   ▼
NestJS API ──── PostgreSQL (+pgvector)      data domain, user, aset, audit, kredensial AI, indeks RAG (ai_chunks)
   │      ├──── Redis (BullMQ + status)     antrian ekstraksi dokumen & pengindeksan RAG
   │      ├──── S3-compatible storage       berkas upload (SeaweedFS dev / S3, R2, B2 prod)
   │      └──── Provider AI (HTTPS)         Gemini / Claude / OpenAI dengan API key milik user
   └── Worker ekstraksi & indeks RAG (BullMQ, in-process)
```

Prinsip:
- **Satu kontrak data domain** `/records/:type` — frontend menulis per item (upsert/soft delete) dengan ID buatan client;
  backend menyimpannya ke tabel terstruktur per domain.
- **Data terisolasi per user** — setiap baris domain punya `user_id`; setiap user (termasuk `admin`/`super_admin`)
  hanya membaca & menulis datanya sendiri. Akses ke data user lain hanya lewat **berbagi** per item (§3.3) dengan izin
  Lihat / Komentar / Edit. Role hanya mengatur pengelolaan akun & aplikasi (admin melihat statistik, bukan isi data).
- **Secret di server** — tidak ada token/kredensial di storage browser. API key AI milik user disimpan terenkripsi
  di server dan hanya dipakai backend; browser tidak pernah memanggil provider AI secara langsung (§3.1).

## 2. Tech stack & kebijakan dependensi

### 2.1 Komponen dan versi (per 2026-10-10)

Sumber kebenaran versi: `package-lock.json` (backend/frontend), `Dockerfile`, `docker-compose*.yml`, `.nvmrc`,
`.github/workflows/ci.yml`. Tabel ini diperbarui setiap upgrade major.

| Lapisan | Komponen | Versi | Peran / alasan pemilihan |
|---|---|---|---|
| Runtime | Node.js | **24 LTS** (`.nvmrc`; image `node:24-trixie-slim`, Debian 13) | Hanya LTS di produksi; npm 11 bawaan Node |
| Bahasa | TypeScript (backend & frontend) | **6.0** | Satu versi di kedua sisi (keputusan 2026-10-09) |
| Backend | NestJS (`@nestjs/*`) + Express | **12.1** (config/jwt/passport/swagger/mapped-types 12.0, throttler 6.7) + Express 5.2 | Framework modular, DI, guard/pipe, Swagger |
| | Prisma ORM + `@prisma/adapter-pg` (driver `pg`) | **7.10** | ORM bertipe; driver adapter tanpa engine Rust (wajib untuk Windows ARM64) |
| | BullMQ / ioredis | **6.3** / **5.11** | Antrian job (ekstraksi, AI) di atas Redis |
| | class-validator / class-transformer | 0.15 / 0.5 | Validasi DTO & env |
| | nestjs-pino / pino | 5.3 / 10.4 | Log terstruktur JSON |
| | `@node-rs/argon2` | 2.2 | Hash password Argon2id, prebuilt arm64 |
| | `@aws-sdk/client-s3` | 3.x | Object storage S3-compatible |
| | `@google/genai` / `@anthropic-ai/sdk` / `openai` | 2.28 / 0.133 / 7.32 | SDK resmi provider AI (dipanggil hanya dari backend, §3.1) |
| | `unpdf` / `mammoth` / `read-excel-file` | 1.8 / 1.13 / 9.3 | Ekstraksi teks PDF / DOCX / XLSX (pure JS, aman ARM64; §3.2) |
| | `@mozilla/readability` / `linkedom` | 0.6 / 0.18 | Teks utama halaman web untuk sumber My Notebook (pure JS; §3.4) |
| | dotenv | 18.0 | Env untuk CLI Prisma & seed (aplikasi memakai `@nestjs/config`) |
| | tsx (esbuild 0.28) | 4.23 | Menjalankan seed TypeScript di development (`prisma db seed`); produksi memakai `dist/` |
| | ESLint / typescript-eslint / Vitest | 10.12 / 8.71 / 5.0 | Lint & unit test |
| Frontend | React / React DOM | **19.3** | UI |
| | Vite / `@vitejs/plugin-react` | **8.3** / 6.1 | Dev server & bundler |
| | React Router / TanStack Query / Zustand | 8.4 / 5.104 / 5.0 | Rute lazy, cache data server, state UI/sesi |
| | react-hook-form / zod | 7.89 / 4.6 | Form & validasi skema |
| | Tailwind CSS / shadcn CLI (Radix, lucide) | 4.3 / 4.21 | Design system berbasis token |
| | react-markdown / KaTeX | 10.1 / **0.18.9** | Render Markdown & matematika (dimuat malas) |
| | Tiptap (`@tiptap/*` + `@tiptap/markdown`, MIT) / perfect-freehand | **3.31** / 1.2 | Editor teks kaya + tulisan tangan stylus di Catatan Bebas (dimuat malas); Markdown → dokumen editor (salin dari My Notebook) |
| | oxlint / Vitest | 1.87 / 5.0 | Lint (0 warning) & unit test |
| Data | PostgreSQL + pgvector | **18** (18.6) + 0.8.7 (`pgvector/pgvector:0.8.7-pg18`, Debian 12; volume `postgres18-data` di `/var/lib/postgresql`) | Data relasional + vector search (RAG) |
| | Redis | **8.10** (`redis:8.10-alpine`) | Antrian BullMQ; cache/rate-limit/sesi chat (rencana) |
| | SeaweedFS | 4.48 | S3-compatible self-host (dev & default produksi) |
| Edge | Caddy / nginx | 2.11 / 1.30 (stable) | HTTPS otomatis + reverse proxy / sajian SPA + CSP |
| Backup | rclone (`rclone/rclone:1.75.1`) di image `infra/backup` (base = image postgres) | 1.75 | Cermin object storage via API S3 + salinan luar server terenkripsi (crypt) |
| CI | GitHub Actions | checkout v7, setup-node v7, setup-buildx v4, build-push v7; runner `ubuntu-24.04` | Lint, test, build, smoke, drift, image |

### 2.2 Batasan platform (wajib dijaga)

- **Windows 11 ARM64** untuk development: hanya paket dengan prebuilt win32-arm64, pure JS, atau WASM. Prisma memakai
  driver adapter `pg` (Rust query engine tidak tersedia untuk ARM64).
- **Backend CommonJS**: paket NestJS 12 berformat ESM dimuat via `require(esm)` (Node ≥ 22.12); tsconfig
  `module/moduleResolution: nodenext`. Migrasi ke ESM tidak diperlukan.
- **Prisma Client di-generate**, tidak di-commit: generator `prisma-client` (`moduleFormat = "cjs"`,
  `importFileExtension = ""`) → `backend/src/generated/prisma`, dijalankan oleh `postinstall`. Kode mengimpor dari path
  itu (bukan `@prisma/client`). URL datasource & shadow DB di `prisma.config.ts`.
- Image produksi multi-arsitektur (x86_64/ARM64), dibangun dari source; image pihak ketiga di-pin per minor.

### 2.3 Kebijakan dependensi

- **Pemilihan versi**: hanya rilis stabil (tanpa `-rc/-beta/-next`), dirilis ≥ 2–4 minggu, ekosistem plugin sudah
  mendukung (`peerDependencies`), Node hanya LTS. Instal dengan `npm install --before=<tanggal>`.
- **Dependabot** (`.github/dependabot.yml`): ekosistem npm (backend & frontend), `docker` (Dockerfile),
  `docker-compose` (image infra di `docker-compose*.yml`), dan GitHub Actions. Aturan `ignore` tambahan: nginx minor
  ganjil (mainline) dan versi yang dijadwalkan manual (saat ini KaTeX ≥ 0.19). PR mingguan minor/patch (npm
  dikelompokkan); update **major** diabaikan dan dikerjakan terencana — satu
  keluarga paket per commit, semua test + smoke + drift + image + CI hijau (resep di CLAUDE.md §14).
- **PostgreSQL major** bukan sekadar ganti tag image (butuh dump/restore ke volume baru), dikerjakan terpisah —
  prosedur produksi di [DEPLOYMENT.md §8](DEPLOYMENT.md#8-upgrade-major-postgresql-mis-18--19), data dev di
  [SETUP.md §7.1](SETUP.md#71-upgrade-major-postgresql-data-development). Image `postgres`/`pgvector` dipin per major
  (`-pg18`); Dependabot hanya mengusulkan minor/patch.
- **Overrides npm aktif** (menutup advisory di dependensi transitif; tinjau setiap upgrade paket induknya):

  | Lokasi | Override | Alasan | Hapus bila |
  |---|---|---|---|
  | `backend/package.json` | `prisma > mysql2` → 3.24.4 | Prisma 7.10 mem-pin `mysql2` 3.15.3 (advisory high; hanya dipakai Prisma Studio untuk MySQL) | `npm view prisma@<versi> dependencies.mysql2` ≥ 3.23.1 |
  | `frontend/package.json` | `katex: "$katex"` (langsung `^0.18.9`) | `rehype-katex`/`micromark-extension-math` masih `^0.16` (advisory prototype pollution < 0.18.2) | keduanya mendukung katex ≥ 0.18 |

## 3. Backend (`backend/`)

NestJS (CommonJS), prefix `api/v1`, port 4000.

| Modul | Tanggung jawab |
|---|---|
| `config` | validasi env saat boot (`env.validation.ts`), parsing durasi |
| `prisma` | `PrismaService` + driver adapter `pg`; client hasil generate di `src/generated/prisma` |
| `redis` | koneksi ioredis & opsi BullMQ |
| `storage` | klien S3 + pembuatan bucket |
| `auth` | login, refresh token berotasi via cookie httpOnly, profil `/auth/me`, ganti password |
| `users` | manajemen akun (admin/super_admin), statistik pemakaian tanpa isi data, direktori penerima berbagi |
| `sharing` | berbagi item antar-user + komentar; `ShareAccessService` menghitung akses untuk `records` & `uploads` (§3.3) |
| `settings` | branding aplikasi (`GET` publik) |
| `records` | API domain generik + audit kearsipan |
| `uploads` / `extraction` | upload berkas, link unduh bertanda tangan, job ekstraksi teks (§3.2) |
| `office` | editor dokumen ONLYOFFICE: config bertanda tangan, link berkas & callback simpan, riwayat 10 versi (§3.5) |
| `ai` | AI multi-provider: pengaturan provider/key/model per user, `POST /ai/generate` (§3.1); indeks pengetahuan RAG `ai/index/` (§3.2) |
| `health` | `/health` readiness (database, redis, storage) · `/health/live` liveness |
| `database/seed.ts` | seed dev (akun demo) / produksi (super admin dari env) |

Lapisan global: Helmet, CORS, `ValidationPipe` (whitelist + forbidNonWhitelisted), `PrismaExceptionFilter`
(P2002→409, P2025→404, P2003→400), Throttler (600/menit; login 10/menit; refresh 30/menit), `TRUST_PROXY` untuk
deployment di belakang reverse proxy. Swagger di `/api/docs` (non-production).

**Observabilitas**: log terstruktur `nestjs-pino` (JSON di production, pretty di development), setiap request punya
`reqId` (header `X-Request-Id`, diteruskan bila dikirim klien), header `Authorization`/`Cookie`/`Set-Cookie` dan token
unduhan disensor; health check tidak dicatat.

### 3.1 AI multi-provider (`src/ai/`)

| Endpoint | Fungsi |
|---|---|
| `GET /ai/settings` | provider aktif, `fallbackEnabled`, daftar provider (label, model default & saran, lampiran yang didukung, `configured`, `keyHint`, `model`) |
| `PUT /ai/settings/:provider` `{ apiKey?, model? }` | simpan/ganti key (kosong = pertahankan) dan model (`null` = default); provider pertama otomatis aktif |
| `DELETE /ai/settings/:provider` | hapus key; bila aktif, pindah ke provider lain yang punya key atau AI nonaktif |
| `PATCH /ai/settings` `{ activeProvider?, fallbackEnabled? }` | ganti provider aktif (harus sudah punya key) / sakelar cadangan otomatis |
| `POST /ai/settings/:provider/test` | uji key & model dengan prompt singkat (10/menit) |
| `POST /ai/generate` (multipart: `prompt` + `files[]`) | jawab prompt → `{ text, provider, model, fallback }` (30/menit) |

- **Provider** (`ai-providers.ts` = katalog, satu klien per provider di `providers/`, SDK resmi):
  Gemini `generateContent` (stateless; Interactions API menyimpan percakapan di server Google secara default),
  Claude Messages API (streaming, `effort` + `fallbacks: "default"` pada model yang mendukung), OpenAI Responses
  API (`store: false`). Model default ada di katalog, tetapi **user bisa mengganti model** di Pengaturan → AI — bila
  provider menghentikan model, tidak perlu rilis aplikasi.
- **Lampiran**: maks. 5 berkas / 20 MB total, diterima di memori lalu dikirim inline. PDF, gambar (png/jpeg/gif/webp),
  teks (dikirim sebagai teks) untuk semua provider; audio hanya Gemini.
- **Cadangan otomatis** (`users.ai_fallback`, default menyala; logika murni di `ai-routing.ts`): urutan provider =
  provider aktif lalu provider lain yang punya key (urutan katalog); provider yang tidak mendukung semua jenis lampiran
  dilewati (mis. audio saat aktif Claude → Gemini). Kuota habis, provider tidak terjangkau, atau key tidak terbaca →
  provider berikutnya dicoba; key ditolak, model tidak tersedia, permintaan tidak valid, dan penolakan filter keamanan
  **tidak** dialihkan (masalah yang harus diperbaiki user). Respons berisi `fallback: { from, reason, message }` →
  frontend menampilkan toast. Semua gagal → error provider pertama + "Provider cadangan juga gagal". Tanpa cadangan /
  tidak ada provider yang mendukung lampiran → 400 dengan saran. `/test` tidak memakai cadangan.
- **Kredensial**: tabel `ai_credentials` (`UNIQUE(user_id, provider)`), key dienkripsi AES-256-GCM dengan
  `AI_ENCRYPTION_KEY` (format `v1.<iv>.<tag>.<ciphertext>`); API hanya mengembalikan 4 karakter terakhir (`keyHint`).
  Provider aktif di `users.ai_provider`. Kunci enkripsi diganti/hilang ⇒ key tersimpan tidak terbaca (422, user
  memasukkan ulang).
- **Error provider → HTTP**: kuota/limit → 429; key ditolak, model tidak tersedia, ditolak filter keamanan, provider
  tidak terjangkau → 422 dengan pesan Indonesia yang menyebut tindakan (mis. "Ganti model di Pengaturan → AI").
  Sengaja tidak memakai 401 (memicu refresh sesi di frontend) maupun ≥ 502 (disamarkan frontend sebagai "server tidak
  dapat dihubungi"). Log mencatat provider, model, durasi, jenis error — tidak pernah key maupun isi prompt.

### 3.2 Ekstraksi dokumen & indeks pengetahuan (RAG tahap 1)

**Ekstraksi** (`extraction/`, job BullMQ `asset-extraction`, berkas ≤ 20 MB, teks ≤ 2 juta karakter): teks polos,
PDF berlapis teks (`unpdf`, penanda `[Halaman N]`), DOCX (`mammoth`), XLSX (`read-excel-file`, `[Sheet: …]`, baris
`a | b`). Gambar dan PDF hasil scan (< 10 karakter/halaman) dibaca lewat **Gemini milik pemilik berkas** (OCR); tanpa
key Gemini → `unsupported` (`metadata.reason = needs_gemini_key`). MIME `application/octet-stream` ditebak dari
ekstensi. Logika murni di `text-extractors.ts` (diuji dengan berkas PDF/DOCX/XLSX buatan test). Format kantor lain
(PPTX, ODT, ODP, RTF, DOC, PPT, EPUB, ODS, XLS, …) dibaca lewat **konversi ONLYOFFICE** ke TXT/CSV bila ONLYOFFICE diatur
(`office/office-text-converter.ts`, metode `onlyoffice`; §3.5).

**Indeks** (`ai/index/`): tabel `ai_chunks` = potongan teks (± 1.800 karakter, tumpang-tindih 200) per sumber —
record (17 tipe di `INDEXED_TYPES`, teks generik `key: nilai` dari payload sehingga field baru otomatis ikut) dan isi
berkas (`sourceType = "asset"`) — dengan embedding `gemini-embedding-2` 768 dimensi (format teks
`title: … | text: …` / `task: search result | query: …`).
- **Pemicu**: `PUT/DELETE /records/:type/:clientId` dan ekstraksi selesai → job `ai-index` (BullMQ; deduplikasi per
  sumber, jeda 3 detik, `keepLastIfActive`); hapus berkas → potongannya dihapus. Key Gemini disimpan / sakelar
  dinyalakan / `POST /ai/index/rebuild` → bangun ulang semua sumber (hash per potongan: yang tidak berubah dilewati;
  berkas yang dulu `unsupported` diekstrak ulang). Worker 1 job sekaligus; kuota habis diulang (backoff), key ditolak
  tidak diulang. Status & error terakhir di Redis `ai:index:status:<userId>` (TTL 30 hari).
- **Tanpa key Gemini** potongan tetap disimpan tanpa embedding (`model = "none"`) → pencarian kata persis tetap jalan
  dan tidak ada data dikirim ke luar; embedding dilengkapi saat key tersedia. **Sakelar `users.ai_index_enabled`**
  (default menyala) mati → semua potongan dihapus dan tidak ada yang diindeks.
- **Pencarian** `GET /ai/index/search?q=&limit=`: kemiripan makna (pgvector cosine, indeks HNSW) + kata persis
  (full-text `simple`, indeks GIN — penting untuk nomor arsip/kode) digabung **Reciprocal Rank Fusion**, duplikat isi
  (berkas yang diunggah berulang) dibuang. Gagal embedding pertanyaan → kata kunci saja. `GET /ai/index` = status.
- **Indeks khusus di migrasi SQL** (tidak bisa dinyatakan di Prisma): HNSW dibuat sebagai **indeks parsial**
  (`WHERE embedding IS NOT NULL`) agar tidak dianggap drift oleh Prisma — query vektor wajib menyertakan kondisi itu;
  GIN berupa indeks ekspresi `to_tsvector('simple', title || ' ' || content)`.
- Pencarian bisa dibatasi ke daftar sumber `(sourceType, sourceId)` (`search(userId, q, limit, only)`) — dipakai My
  Notebook (§3.4). Sumber teks/web notebook diindeks dengan `sourceType = "notebook_source"`.
- Tahap berikutnya (belum): chatbot global `POST /ai/chat` atas seluruh data user + riwayat chat permanen (My Notebook
  sudah menerapkan pola ini per notebook).

### 3.4 My Notebook (`src/notebooks/`, RAG ala NotebookLM)

Tabel `notebooks`, `notebook_sources`, `notebook_messages`, `notebook_notes` (migrasi `20261014130000_notebooks`); semua
milik satu user (tanpa berbagi — tahap berikutnya). Endpoint `/notebooks` (CRUD), `/:id/sources` (tambah/ubah aktif/
muat ulang web/hapus), `/:id/chat` + `/:id/messages` (riwayat permanen), `/:id/summary` (Studio), `/:id/notes`.
- **Sumber**: `upload` (asset + `asset_extractions`, status ikut ekstraksi), `record` (item milik sendiri: `free_note`,
  `ai_note`, `list`, `para_resource` — resource berkas ikut membaca isi berkasnya), `text` (tempel, ≤ 500 rb karakter),
  `web` (diambil server saat ditambahkan, isi disimpan di `content`).
- **Pengambilan web aman** (`web-source.ts`): http/https saja, tanpa kredensial; IP tujuan diperiksa di lookup DNS saat
  koneksi (tahan DNS rebinding) dan di setiap redirect — loopback, jaringan privat, link-local/metadata cloud, CGNAT,
  multicast ditolak (`net.BlockList`); batas 15 detik, 5 MB, 4 redirect; HTML → Readability + linkedom, PDF lewat
  ekstraktor, teks polos.
- **Chat hibrida** (`notebook-context.ts`, logika murni + test): total teks sumber aktif ≤ 150 rb karakter → semua
  potongan dikirim (mode `full`); lebih besar → 14 potongan terbaik (mode `rag`) dari gabungan RRF pencarian indeks
  (vektor + kata, dibatasi ke sumber notebook) dan peringkat kata kunci di memori (tetap jalan bila indeks dimatikan /
  tanpa key Gemini). Potongan bernomor `[n]`; AI wajib menjawab hanya dari sumber dengan sitasi; nomor yang dikutip
  disimpan sebagai `citations` (sumber + cuplikan). 8 pesan terakhir ikut sebagai riwayat.
- **Lampiran chat**: `fileIds` (maks. 4, milik sendiri): gambar (≤ 10 MB) dikirim ke AI; dokumen (≤ 20 MB) dibaca dari
  teks ekstraksi server (dibatasi 100 rb karakter, tag `<lampiran_pengguna>`), PDF tanpa teks dikirim ke AI sebagai berkas;
  lampiran tidak diberi nomor sitasi. Tersimpan di `notebook_messages.attachments` dan ikut dihapus saat chat dibersihkan /
  notebook dihapus.
- **Kepemilikan berkas sumber**: berkas yang diunggah lewat notebook (context `notebook`) ikut terhapus bersama sumber /
  notebook; berkas LifeOS lain yang dipilih sebagai sumber hanya dirujuk dan tidak pernah dihapus notebook.
- **Studio**: ringkasan JSON (`overview`, `keyPoints`, `questions`) dengan sidik jari sumber → `summaryStale` bila sumber
  ditambah/diubah/dinonaktifkan. Hapus sumber unggahan / notebook → berkasnya ikut dihapus dari storage.

### 3.3 Isolasi data & berbagi (`src/sharing/`)

- **Role**: `super_admin`, `admin`, `member` (role `viewer` dihapus di migrasi `20261011170000_sharing`; akun viewer
  menjadi member). Role tidak memberi akses ke data user lain: `/records`, `/uploads`, `/archive-audit` hanya data
  sendiri + item yang dibagikan. Admin mengelola akun dan melihat `GET /users/stats` (jumlah data, berkas & ukurannya,
  berbagi, aktif terakhir — tanpa isi). Menghapus user ikut menghapus berkasnya dari object storage.
- **Tabel**: `shares` (`owner_id`, `recipient_id`, `record_type`, `record_id` = clientId item induk, `permission`
  `view | comment | edit`, unik per item+penerima) dan `record_comments` (`owner_id` = pemilik item, `author_id`,
  `body`). `assets.uploaded_by_id` = kolaborator yang mengunggah ke ruang pemilik.
- **Item induk yang bisa dibagikan**: `para_project`, `para_area`, `para_resource` (termasuk arsip File Control),
  `free_note`, `ai_note`, `list`, `schedule`, dan item virtual **`schedule_series`** (`record_id` = `seriesId` agenda
  berulang). Akses dihitung saat request (logika murni `share-graph.ts` + test):
  1. **Turunan** ikut dengan izin yang sama: project → action & agenda; area → sub area/kegiatan/sub kegiatan, project
     di area, dan semua task & agenda-nya (`schedules.project_id`); agenda → Notes AI terhubung; seri agenda → semua
     pertemuan dengan `seriesId` itu (filter JSON `extra->seriesId`), masing-masing berstatus **root** (hanya pemilik
     yang menghapus) — pertemuan yang ditambahkan kemudian otomatis ikut. `parentRefsOf` agenda menyertakan
     `["schedule_series", seriesId]` sehingga kolaborator izin edit bisa menambah pertemuan ke ruang pemilik.
  2. **Rujukan** (catatan/resource yang dilampirkan, klasifikasi/JRA/wadah arsip beserta induk wadahnya, agenda dari
     Notes AI) ikut **baca-saja** dan tidak menurunkan turunannya.
  3. **Berkas**: semua `uploadId` (key berakhiran `uploadId`, termasuk gambar editor & berita acara) di payload item yang
     dapat diakses.
- **Records API**: `GET /records/:type` = milik sendiri + item bersama bertanda `share: { ownerId, ownerName,
  permission, root }`. Tulis ke item milik user lain wajib menyebut `userId` pemilik (atau diturunkan dari induk untuk
  item baru: task di project/kegiatan, kegiatan di sub area/area, project di area) dan butuh izin `edit`; item induk
  hanya bisa dihapus pemiliknya. Key `share` yang ikut terkirim dibuang server.
- **Uploads**: baca = pemilik, pengunggah, atau penerima yang dapat mengakses item yang merujuk berkas. Unggah dengan
  `ownerId` (izin edit dari pemilik itu) → berkas milik pemilik item; hapus hanya oleh pemilik atau pengunggahnya.
- **Endpoint**: `GET /shares?recordType=&recordId=` (penerima satu item, pemilik saja), `GET /shares/outgoing`,
  `GET /shares/incoming`, `POST /shares` `{ recordType, recordId, email, permission }`, `PATCH /shares/:id`
  `{ permission }`, `DELETE /shares/:id` (pemilik mencabut / penerima keluar), `GET|POST /comments`
  (`recordType, recordId, ownerId?`; menulis butuh `comment`/`edit`), `PATCH|DELETE /comments/:id` (penulis; pemilik
  item boleh menghapus), `GET /users/directory?q=` (min. 3 huruf, nama + email saja).
- **Cache**: akses baca disimpan 3 detik per user (beberapa koleksi dimuat bersamaan); pemeriksaan tulis selalu
  dihitung ulang; perubahan berbagi mengosongkan cache.
- **Belum**: indeks RAG/chatbot hanya mencari data milik sendiri (item bersama tidak ikut); notifikasi saat item
  dibagikan; tautan publik.

### 3.5 Editor dokumen ONLYOFFICE (`src/office/`, menu Tools → ONLYOFFICE)

Riset, keputusan user, dan tahapan: [ONLYOFFICE.md](ONLYOFFICE.md). Server ONLYOFFICE Docs = container terpisah; berkas
tetap Asset LifeOS di object storage.

| Endpoint | Fungsi |
|---|---|
| `GET /office/status` | aktif? (`ONLYOFFICE_URL` diisi), URL server ONLYOFFICE, format yang bisa diedit |
| `GET /office/diagnostics` | halaman Tools → ONLYOFFICE: server sehat (`/healthcheck`), versi (Command Service `version`); alamat teknis hanya untuk admin |
| `POST /office/documents` `{ format: docx\|xlsx\|pptx\|pdf, title?, context?, ownerId? }` | dokumen kosong dari templat `backend/templates/office/` (A4, id-ID) → Asset seperti upload lampiran (context default `office`; `ownerId` = pemilik item bersama berizin edit) |
| `POST /office/files/:id/forcesave` | simpan paksa sesi edit yang terbuka (Command Service `forcesave`) dan menunggu versi tersimpan (≤ 15 detik) → `saved \| pending \| no-changes \| no-session`; dipanggil saat modal editor ditutup |
| `POST /office/config` `{ uploadId, mode?, mobile?, theme? }` | config `DocsAPI.DocEditor` ditandatangani `ONLYOFFICE_JWT_SECRET` (HS256) |
| `GET /office/files/:id/versions` · `GET …/versions/:v` · `POST …/versions/:v/restore` | riwayat versi, unduh versi lama, pulihkan (izin edit) |
| `GET /office/files/:id/content?token=` | dipanggil ONLYOFFICE (`document.url`), token 1 hari |
| `POST /office/callback?token=` | dipanggil ONLYOFFICE saat status dokumen berubah; jawaban `{ error: 0 }` |

- **Hak akses** = akses berkas: pemilik/pengunggah → edit; penerima berbagi → izin item yang merujuk berkas (Edit / Komentar
  / Lihat). Format mengikuti daftar resmi ONLYOFFICE (`office-formats.ts`): `edit` & `lossy` bisa disunting (respons
  config membawa `lossy`), `view` & `mode: view` → baca saja; komentar/tinjau/isi formulir hanya bila format mendukung.
- **Token**: link berkas & callback memakai secret turunan `JWT_ACCESS_SECRET:office` (mengikat ke satu berkas);
  isi callback hanya dipercaya dari JWT ONLYOFFICE (header `AuthorizationJwt`, berisi `{ payload }`). Link berkas hasil
  edit hanya diterima dari host ONLYOFFICE (URL publik dialihkan ke `ONLYOFFICE_INTERNAL_URL`) → mencegah SSRF.
- **Kunci dokumen** `document.key = <assetId>-<assets.office_key>`; berganti saat sesi edit selesai (status 2/4) atau versi
  dipulihkan. Pengguna yang membuka kunci yang sama = edit bersama.
- **Versi** (`assets.version`, `version_author_id`, `versioned_at`; riwayat di `asset_versions`): simpan pertama
  dalam satu sesi (force save tombol Simpan = status 6, atau tutup = status 2) memindahkan isi lama ke riwayat; simpanan
  berikutnya di sesi yang sama menimpa (satu sesi = satu versi). Maks. 10 versi termasuk saat ini; yang lebih lama
  dihapus beserta objeknya. Isi identik tidak membuat versi. Setiap simpan → ekstraksi teks + indeks AI diulang.
  Pulihkan = salin objek versi lama sebagai versi terbaru (tidak ada yang hilang). Hapus berkas/user → objek versi ikut.
  Callback dari **sesi lama** (kunci sudah berganti karena dipulihkan — editor yang ditutup sesudahnya mengirim ulang isinya,
  dibuat ulang ONLYOFFICE sehingga checksum berbeda walau isi sama) hanya masuk **riwayat** tepat di bawah versi saat ini;
  isi saat ini (hasil pemulihan) tidak pernah diganti.
- **Alamat backend untuk ONLYOFFICE** (`ONLYOFFICE_BACKEND_URL`): `auto` (dev) = IPv4 antarmuka Windows `vEthernet (WSL…)`
  dibaca setiap membuat config; produksi `http://backend:4000`. Logika murni + test: `office-logic.ts`.

### Keamanan
- **Access token** JWT 15 menit, dikirim via header `Authorization`, hanya disimpan di memori frontend.
- **Refresh token** JWT (`jti` = `refresh_tokens.id`, DB hanya menyimpan hash SHA-256) dikirim sebagai cookie
  `lifeos_rt` — `httpOnly`, `Secure` (production), `SameSite=Strict`, path `/api/v1/auth`. Saat aplikasi dibuka,
  frontend memulihkan sesi lewat `POST /auth/refresh`.
- Rotasi setiap refresh; token hasil rotasi yang dipakai lagi setelah 30 detik (toleransi multi-tab) dianggap
  pencurian → semua sesi user dihapus. Logout, ganti password (sesi lain), dan perubahan password/role oleh admin
  menghapus sesi. Token kedaluwarsa dibersihkan saat login.
- Password Argon2id (`@node-rs/argon2`).
- Berkas upload: diterima ke disk sementara lalu di-stream ke object storage (tidak ditampung di RAM); disajikan dengan
  `Content-Security-Policy: sandbox`, konten aktif (HTML/SVG/JS) dipaksa diunduh. Link unduh memakai secret turunan
  (`JWT_ACCESS_SECRET:download`), berlaku 10 menit, tidak bisa dipakai login.

## 4. Database

Konvensi: model Prisma PascalCase, **tabel & kolom snake_case**, timestamp `timestamptz(3)` (UTC), FK ke `users`
dengan `ON DELETE CASCADE`, soft delete `deleted_at` pada tabel domain.

### 4.1 Tabel inti
`users` (+ `ai_provider`, `ai_fallback`, `ai_index_enabled`), `refresh_tokens`, `app_settings`, `assets` (+ `uploaded_by_id`,
`version`, `version_author_id`, `versioned_at`, `office_key`), `asset_versions` (§3.5), `asset_extractions`, `archive_audit_logs`, `ai_credentials` (§3.1), `ai_chunks` (pgvector, §3.2),
`shares` & `record_comments` (§3.3).

### 4.2 Tabel domain (20)

| Record type (API) | Tabel | Kolom utama |
|---|---|---|
| `agenda_type` | `agenda_types` | name, order |
| `schedule` | `schedules` | title, start_date, end_date, start_time, end_time, is_all_day, type, location, media, project_id (project / item area pemilik agenda) (di `extra`: description, resources = dasar pelaksanaan, results + outcome = hasil agenda — format lampiran PARA, seriesId + recurrence = agenda berulang, satu record per pertemuan; reschedules = riwayat jadwal ulang; `media` = link dipisah baris baru) |
| `routine` | `routines` | title, frequency, days, interval, interval_type, month_dates, start_date, active, archived, freeze_periods |
| `todo` | `todos` | title, completed, date, priority |
| `completion` | `routine_completions` | routine_id, date, actual_date, note, completed_at |
| `free_note` | `free_notes` | title, content, color |
| `ai_note` | `ai_notes` | title, date, content, ai_summary, audio_transcript, file_context, audio_upload_id, file_attachment |
| `list` | `note_lists` | title, archived, items |
| `para_area` | `areas` | title, description, color |
| `para_project` | `projects` | title, area_id, start_date, deadline, status, progress, linked_notes, resources |
| `para_activity` | `activities` | title, area_id, parent_id (kosong = Sub Area; induk berantai → Kegiatan → Sub Kegiatan), deadline, status, resources |
| `para_task` | `tasks` | project_id, title, due_date, priority, weight, completed, completed_at, resources |
| `para_resource` | `resources` | title, type, url, upload_id, date, tags, ai_summary + **field kearsipan** (archival_status, archive_reg_id, classification_id, jra_id, retention_*_date, status, is_vital, is_auto_dispose, phys_*_id, digital_*, disposition_data) |
| `para_archive` | `para_archives` | original_type, original_id, data, archived_at (turunan yang ikut diarsipkan — `related` — di `extra`) |
| `para_archive_log` | `para_archive_logs` | action (archived/restored), original_type, original_id, archive_id, title, summary, actor_name, at — riwayat arsip & pemulihan PARA (append-only) |
| `archive_classification` | `archive_classifications` | jenis, kode_pokok/sub/item, nama_* |
| `archive_jra` | `archive_retention_schedules` | kategori_utama, sub_kategori, jenis_arsip, retensi_aktif, retensi_inaktif, keterangan |
| `archive_physical_reference` | `archive_locations` | type (location/rack/box/folder), parent_id, code, name |
| `archive_borrowing` | `archive_borrowings` | date, return_date, borrower_name, unit, purpose, items, status, returned_at, cancelled_at |
| `archive_disposition` | `archive_dispositions` | type, status_label, executed_at, form_data, items, executed_by |
| `archive_move_log` | `archive_move_logs` | date, items_count, target_name, performed_by, description, moved_items |

Setiap tabel domain juga punya `id` (cuid), `user_id`, `client_id`, `extra` (jsonb), `created_at`, `updated_at`,
`deleted_at`, `UNIQUE(user_id, client_id)`, indeks `(user_id, deleted_at)` + indeks pola query.

### 4.3 Spesifikasi sebagai sumber tunggal

`backend/src/records/record-schema.ts` mendefinisikan untuk tiap record type: model/tabel, field & jenisnya
(`string | int | float | bool | ymd | dateKey | timestamp | json`), indeks, `titleKey`/`dateKey`, dan apakah diaudit.
Dari spesifikasi ini:
- `prisma/generate-domain-models.mts` menghasilkan model Prisma;
- `record-mapper.ts` mengonversi payload ↔ baris saat runtime.

**Lossless**: nilai yang lolos validasi jenis disimpan di kolom bertipe; nilai lain (format tak terduga, `null`
eksplisit, key tak dikenal) disimpan apa adanya di `extra`. Payload yang dibaca kembali identik dengan yang ditulis.
Format tanggal di API (`YYYY-MM-DD`, `Date.toDateString()`, ISO) tetap seperti yang dipakai frontend, tetapi disimpan
sebagai `date`/`timestamptz` sehingga bisa diindeks & difilter.

**Relasi antar entitas** (mis. `tasks.project_id`) sengaja tidak memakai FK: ID dibuat client, ditulis per item secara
asinkron (urutan tulis tidak dijamin) dan sebagian polimorfik (task → project atau activity). Kolomnya diindeks.

### 4.4 Audit kearsipan

`archive_audit_logs` mencatat `created | updated | deleted` untuk data kearsipan (tabel `archive_*` kecuali move log,
resource yang memiliki `archivalStatus`, dan snapshot PARA berisi file): pemilik, pelaku (`actor_id`), dan
`changes` (`{field: {from, to}}` untuk update, snapshot untuk create/delete). Dicatat dalam transaksi yang sama dengan
perubahan data. API: `GET /api/v1/archive-audit?entityType=&entityId=&take=`.

### 4.5 API records

| Endpoint | Fungsi |
|---|---|
| `GET /records/:type?userId&from&to` | daftar aktif (`from/to` memfilter kolom `dateKey`) |
| `PUT /records/:type/:clientId` `{ payload, userId? }` | upsert idempotent (juga membatalkan soft delete) |
| `DELETE /records/:type/:clientId?userId=` | soft delete |

Respons: `{ id, clientId, type, userId, title, date, payload, createdAt, updatedAt }`.

## 5. Frontend (`frontend/`)

React SPA (komponen & versi di §2.1): Tailwind + shadcn/ui (Radix, ikon lucide), React Router (rute lazy per modul),
TanStack Query, Zustand (sesi & UI), react-hook-form + zod, sonner.

```
src/
  app/          router (rute lazy), providers, query client
  config/       navigation.ts — sumber tunggal modul, path, tab, ikon, role
  types/        tipe API & entitas domain
  lib/          api client (refresh token otomatis), tanggal, deep link, AI (useAi → POST /ai/generate), paket ikon (icons/)
  data/         useCollection + hook koleksi bertipe (collections.ts)
  stores/       auth-store, ui-store
  hooks/        useSearchParam, useToday, usePermissions, useRetained
  components/   ui/ (shadcn), layout/ (AppShell, ModulePage), common/ (komponen bersama)
  features/     overview, planner, notes, productivity, resources, file-control, tools (ONLYOFFICE), settings, assistant,
                focus, auth
```

### Data layer
`useCollection<T>(recordType)` membaca koleksi via TanStack Query dan menulis **per item**: `setItems(updater)` bekerja
seperti `setState`, menghitung diff lalu `PUT`/`DELETE` per item (debounce 500 ms, diserialkan per item, optimistis,
rollback + toast bila gagal). Komponen memakai hook bertipe di `data/collections.ts`.

### Pola UI wajib
- Setiap halaman modul memakai `<ModulePage module="...">` (hero gradient + tab URL `/modul/:tab`).
- Dialog edit/detail yang perlu deep link dikendalikan query string (`?edit=`, `?project=`, `?archive=`, ...).
- Form dialog: state di komponen dalam yang di-mount saat terbuka (tanpa sinkronisasi `useEffect`).
- Konten berat dimuat malas: rute, halaman login, renderer Markdown/KaTeX, pemindai kamera `html5-qrcode`, editor
  Catatan Bebas (Tiptap + kanvas stylus, chunk `free-note-editor`).
- Cetak dokumen (label/A4/berita acara) lewat `printElement` (jendela baru + stylesheet aplikasi); QR dibuat lokal.

### Design system
Token warna OKLCH di `src/index.css` (terang & gelap via class `.dark`). Warna modul lewat atribut
`data-module` → utility `bg-module`, `text-module`, `bg-module-soft`, `bg-module-gradient`; status
`success | warning | info | destructive`. Dilarang warna hardcoded atau ternary dark mode per elemen
(pengecualian: lembar cetak hitam-putih dan gambar tulisan tangan yang dikirim ke AI). Isi editor Tiptap distyle lewat
kelas `.rich-text` di `index.css`; warna tinta disimpan sebagai ID dan dipetakan ke token. Styling KaTeX hanya menarget class publik (`.katex`, `.katex-display`).

## 6. Deployment & kualitas

```
Internet ─► Caddy :443 (TLS otomatis, HSTS) ─┬─ /api/* ─► backend (non-root, migrasi saat start)
                                             └─ lainnya ─► frontend (nginx: SPA + CSP)
jaringan internal: postgres · redis (password) · SeaweedFS S3 · backup harian (pg_dump + cermin S3 → luar server terenkripsi)
```

- `docker-compose.yml` = infrastruktur development saja; `docker-compose.prod.yml` = stack produksi (operasional di
  DEPLOYMENT.md).
- Image di-pin versinya (§2.1); rotasi log Docker; secret hanya dari `.env`; batas memori per container.
- Backup: dump tervalidasi + berkas lewat API S3, salinan luar server terenkripsi, heartbeat pemantauan
  (DEPLOYMENT.md §4–§5). SeaweedFS `-volume.max=0` agar kapasitas mengikuti disk.
- Pengujian: unit test Vitest (logika murni: record mapper, aturan kearsipan), smoke test end-to-end (±50 skenario
  terhadap server nyata, membuat & menghapus user sementara). CI GitHub Actions menjalankan semuanya + cek drift skema
  + build image; Dependabot untuk pembaruan dependensi (§2.3).

## 7. Konvensi kode

- Bahasa: identifier & commit Inggris; teks UI, pesan error, dan komentar Indonesia.
- Prettier tunggal di root (`printWidth 120`), LF, UTF-8. Lint: oxlint (frontend, 0 warning), ESLint (backend).
- Sebelum commit: `lint` + `typecheck`/`build` + `npm test` di bagian yang diubah; backend: `npm run test:smoke`.

## 8. Rencana berikutnya

- RAG tahap 2: chatbot di backend (`POST /ai/chat`) memakai pencarian indeks (§3.2), riwayat chat permanen di
  PostgreSQL; tahap 3: Redis untuk cache embedding pertanyaan, batas pemakaian harian, penyimpanan throttler.
- Upgrade tech stack yang masih tertunda: lihat [UPGRADE-PLAN.md](UPGRADE-PLAN.md).
