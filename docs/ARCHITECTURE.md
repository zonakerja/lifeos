# Arsitektur LifeOS

Dokumen fondasi: arsitektur, tech stack beserta versinya, dan aturan yang wajib diikuti. **Versi komponen hanya
dicatat di §2** (dokumen lain merujuk ke sini). Rencana & kajian upgrade ada di [UPGRADE-PLAN.md](UPGRADE-PLAN.md).

## 1. Gambaran umum

```
Browser (React SPA)
   │  /api/v1 (JWT Bearer + cookie refresh httpOnly)   dev: Vite proxy · prod: Caddy (HTTPS)
   ▼
NestJS API ──── PostgreSQL (+pgvector)      data domain, user, aset, audit
   │      ├──── Redis (BullMQ)              antrian ekstraksi dokumen (+ AI di masa depan)
   │      └──── S3-compatible storage       berkas upload (SeaweedFS dev / S3, R2, B2 prod)
   └── Worker ekstraksi (BullMQ, in-process)
```

Prinsip:
- **Satu kontrak data domain** `/records/:type` — frontend menulis per item (upsert/soft delete) dengan ID buatan client;
  backend menyimpannya ke tabel terstruktur per domain.
- **Data milik user** — setiap baris domain punya `user_id`; role `super_admin`/`admin` dapat melihat data semua user,
  `viewer` read-only.
- **Secret di server** — tidak ada token/kredensial di storage browser (kecuali API key AI milik user yang
  sementara dipakai langsung dari browser, lihat §8).

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
| | dotenv | 18.0 | Env untuk CLI Prisma & seed (aplikasi memakai `@nestjs/config`) |
| | tsx (esbuild 0.28) | 4.23 | Menjalankan seed TypeScript di development (`prisma db seed`); produksi memakai `dist/` |
| | ESLint / typescript-eslint / Vitest | 10.12 / 8.71 / 5.0 | Lint & unit test |
| Frontend | React / React DOM | **19.3** | UI |
| | Vite / `@vitejs/plugin-react` | **8.3** / 6.1 | Dev server & bundler |
| | React Router / TanStack Query / Zustand | 8.4 / 5.104 / 5.0 | Rute lazy, cache data server, state UI/sesi |
| | react-hook-form / zod | 7.89 / 4.6 | Form & validasi skema |
| | Tailwind CSS / shadcn CLI (Radix, lucide) | 4.3 / 4.21 | Design system berbasis token |
| | react-markdown / KaTeX | 10.1 / **0.18.9** | Render Markdown & matematika (dimuat malas) |
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
| `users` | manajemen user (admin/super_admin) |
| `settings` | branding aplikasi (`GET` publik) |
| `records` | API domain generik + audit kearsipan |
| `uploads` / `extraction` | upload berkas, link unduh bertanda tangan, job ekstraksi teks |
| `health` | `/health` readiness (database, redis, storage) · `/health/live` liveness |
| `database/seed.ts` | seed dev (akun demo) / produksi (super admin dari env) |

Lapisan global: Helmet, CORS, `ValidationPipe` (whitelist + forbidNonWhitelisted), `PrismaExceptionFilter`
(P2002→409, P2025→404, P2003→400), Throttler (600/menit; login 10/menit; refresh 30/menit), `TRUST_PROXY` untuk
deployment di belakang reverse proxy. Swagger di `/api/docs` (non-production).

**Observabilitas**: log terstruktur `nestjs-pino` (JSON di production, pretty di development), setiap request punya
`reqId` (header `X-Request-Id`, diteruskan bila dikirim klien), header `Authorization`/`Cookie`/`Set-Cookie` dan token
unduhan disensor; health check tidak dicatat.

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
`users`, `refresh_tokens`, `app_settings`, `assets`, `asset_extractions`, `archive_audit_logs`.

### 4.2 Tabel domain (20)

| Record type (API) | Tabel | Kolom utama |
|---|---|---|
| `agenda_type` | `agenda_types` | name, order |
| `schedule` | `schedules` | title, start_date, end_date, start_time, end_time, is_all_day, type, location, media |
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
  lib/          api client (refresh token otomatis), tanggal, deep link, AI (useAi)
  data/         useCollection + hook koleksi bertipe (collections.ts)
  stores/       auth-store, ui-store
  hooks/        useSearchParam, useToday, usePermissions, useRetained
  components/   ui/ (shadcn), layout/ (AppShell, ModulePage), common/ (komponen bersama)
  features/     overview, planner, notes, productivity, resources, file-control, settings, assistant, focus, auth
```

### Data layer
`useCollection<T>(recordType)` membaca koleksi via TanStack Query dan menulis **per item**: `setItems(updater)` bekerja
seperti `setState`, menghitung diff lalu `PUT`/`DELETE` per item (debounce 500 ms, diserialkan per item, optimistis,
rollback + toast bila gagal). Komponen memakai hook bertipe di `data/collections.ts`.

### Pola UI wajib
- Setiap halaman modul memakai `<ModulePage module="...">` (hero gradient + tab URL `/modul/:tab`).
- Dialog edit/detail yang perlu deep link dikendalikan query string (`?edit=`, `?project=`, `?archive=`, ...).
- Form dialog: state di komponen dalam yang di-mount saat terbuka (tanpa sinkronisasi `useEffect`).
- Konten berat dimuat malas: rute, halaman login, renderer Markdown/KaTeX, pemindai kamera `html5-qrcode`.
- Cetak dokumen (label/A4/berita acara) lewat `printElement` (jendela baru + stylesheet aplikasi); QR dibuat lokal.

### Design system
Token warna OKLCH di `src/index.css` (terang & gelap via class `.dark`). Warna modul lewat atribut
`data-module` → utility `bg-module`, `text-module`, `bg-module-soft`, `bg-module-gradient`; status
`success | warning | info | destructive`. Dilarang warna hardcoded atau ternary dark mode per elemen
(pengecualian: lembar cetak hitam-putih). Styling KaTeX hanya menarget class publik (`.katex`, `.katex-display`).

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

- AI multi-provider di backend (Gemini/Claude/OpenAI, key terenkripsi), sehingga browser tidak lagi memanggil Gemini langsung.
- Ekstraksi PDF/DOCX/XLSX/OCR, embedding **pgvector** + chatbot RAG atas arsip & resource (Redis untuk antrian, cache,
  memori sesi chat).
- Upgrade tech stack yang masih tertunda: lihat [UPGRADE-PLAN.md](UPGRADE-PLAN.md).
