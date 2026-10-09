# Arsitektur LifeOS

## 1. Gambaran umum

```
Browser (React SPA)
   │  /api/v1 (JWT Bearer + cookie refresh httpOnly)   dev: Vite proxy · prod: Caddy (HTTPS)
   ▼
NestJS API ──── PostgreSQL 16 (+pgvector)   data domain, user, aset, audit
   │      ├──── Redis 7 (BullMQ)            antrian ekstraksi dokumen (+ AI di masa depan)
   │      └──── S3-compatible storage       berkas upload (SeaweedFS dev / S3, R2, B2 prod)
   └── Worker ekstraksi (BullMQ, in-process)
```

Prinsip:
- **Satu kontrak data domain** `/records/:type` — frontend menulis per item (upsert/soft delete) dengan ID buatan client;
  backend menyimpannya ke tabel terstruktur per domain.
- **Data milik user** — setiap baris domain punya `user_id`; role `super_admin`/`admin` dapat melihat data semua user,
  `viewer` read-only.
- **Secret di server** — tidak ada token/kredensial di storage browser (kecuali API key AI milik user yang
  sementara dipakai langsung dari browser, lihat §7).

## 2. Backend (`backend/`)

NestJS 11 (CommonJS), prefix `api/v1`, port 4000.

| Modul | Tanggung jawab |
|---|---|
| `config` | validasi env saat boot (`env.validation.ts`), parsing durasi |
| `prisma` | `PrismaService` + driver adapter `pg` (engine "client", tanpa Rust) |
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

## 3. Database

Konvensi: model Prisma PascalCase, **tabel & kolom snake_case**, timestamp `timestamptz(3)` (UTC), FK ke `users`
dengan `ON DELETE CASCADE`, soft delete `deleted_at` pada tabel domain.

### 3.1 Tabel inti
`users`, `refresh_tokens`, `app_settings`, `assets`, `asset_extractions`, `archive_audit_logs`.

### 3.2 Tabel domain (20)

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
| `para_activity` | `activities` | title, area_id, deadline, status, resources |
| `para_task` | `tasks` | project_id, title, due_date, priority, weight, completed, completed_at, resources |
| `para_resource` | `resources` | title, type, url, upload_id, date, tags, ai_summary + **field kearsipan** (archival_status, archive_reg_id, classification_id, jra_id, retention_*_date, status, is_vital, is_auto_dispose, phys_*_id, digital_*, disposition_data) |
| `para_archive` | `para_archives` | original_type, original_id, data, archived_at |
| `archive_classification` | `archive_classifications` | jenis, kode_pokok/sub/item, nama_* |
| `archive_jra` | `archive_retention_schedules` | kategori_utama, sub_kategori, jenis_arsip, retensi_aktif, retensi_inaktif, keterangan |
| `archive_physical_reference` | `archive_locations` | type (location/rack/box/folder), parent_id, code, name |
| `archive_borrowing` | `archive_borrowings` | date, return_date, borrower_name, unit, purpose, items, status, returned_at, cancelled_at |
| `archive_disposition` | `archive_dispositions` | type, status_label, executed_at, form_data, items, executed_by |
| `archive_move_log` | `archive_move_logs` | date, items_count, target_name, performed_by, description, moved_items |

Setiap tabel domain juga punya `id` (cuid), `user_id`, `client_id`, `extra` (jsonb), `created_at`, `updated_at`,
`deleted_at`, `UNIQUE(user_id, client_id)`, indeks `(user_id, deleted_at)` + indeks pola query.

### 3.3 Spesifikasi sebagai sumber tunggal

`backend/src/records/record-schema.ts` mendefinisikan untuk tiap record type: model/tabel, field & jenisnya
(`string | int | float | bool | ymd | dateKey | timestamp | json`), indeks, `titleKey`/`dateKey`, dan apakah diaudit.
Dari spesifikasi ini:
- `prisma/generate-domain-models.mts` menghasilkan model Prisma (dan SQL salin data saat migrasi besar);
- `record-mapper.ts` mengonversi payload ↔ baris saat runtime.

**Lossless**: nilai yang lolos validasi jenis disimpan di kolom bertipe; nilai lain (format tak terduga, `null`
eksplisit, key tak dikenal) disimpan apa adanya di `extra`. Payload yang dibaca kembali identik dengan yang ditulis.
Format tanggal di API (`YYYY-MM-DD`, `Date.toDateString()`, ISO) tetap seperti yang dipakai frontend, tetapi disimpan
sebagai `date`/`timestamptz` sehingga bisa diindeks & difilter.

**Relasi antar entitas** (mis. `tasks.project_id`) sengaja tidak memakai FK: ID dibuat client, ditulis per item secara
asinkron (urutan tulis tidak dijamin) dan sebagian polimorfik (task → project atau activity). Kolomnya diindeks.

### 3.4 Audit kearsipan

`archive_audit_logs` mencatat `created | updated | deleted` untuk data kearsipan (tabel `archive_*` kecuali move log,
resource yang memiliki `archivalStatus`, dan snapshot PARA berisi file): pemilik, pelaku (`actor_id`), dan
`changes` (`{field: {from, to}}` untuk update, snapshot untuk create/delete). Dicatat dalam transaksi yang sama dengan
perubahan data. API: `GET /api/v1/archive-audit?entityType=&entityId=&take=`.

### 3.5 API records

| Endpoint | Fungsi |
|---|---|
| `GET /records/:type?userId&from&to` | daftar aktif (`from/to` memfilter kolom `dateKey`) |
| `PUT /records/:type/:clientId` `{ payload, userId? }` | upsert idempotent (juga membatalkan soft delete) |
| `DELETE /records/:type/:clientId?userId=` | soft delete |

Respons: `{ id, clientId, type, userId, title, date, payload, createdAt, updatedAt }`.

## 4. Frontend (`frontend/`)

Vite + React 19 + TypeScript strict, Tailwind v4 + shadcn/ui (Radix, ikon lucide), React Router (rute lazy per modul),
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
(pengecualian: lembar cetak hitam-putih).

## 5. Deployment & kualitas

```
Internet ─► Caddy :443 (TLS otomatis, HSTS) ─┬─ /api/* ─► backend (non-root, migrasi saat start)
                                             └─ lainnya ─► frontend (nginx: SPA + CSP)
jaringan internal: postgres · redis (password) · SeaweedFS S3 · backup harian (pg_dump + arsip berkas)
```

- `docker-compose.yml` = infrastruktur development saja; `docker-compose.prod.yml` = stack produksi (lihat DEPLOYMENT.md).
- Image di-pin versinya; rotasi log Docker; secret hanya dari `.env`.
- Pengujian: unit test Vitest (logika murni: record mapper, aturan kearsipan), smoke test end-to-end (±50 skenario
  terhadap server nyata, membuat & menghapus user sementara). CI GitHub Actions menjalankan semuanya + cek drift skema
  + build image; Dependabot untuk pembaruan dependensi.

## 6. Konvensi kode

- Bahasa: identifier & commit Inggris; teks UI, pesan error, dan komentar Indonesia.
- Prettier tunggal di root (`printWidth 120`), LF, UTF-8. Lint: oxlint (frontend, 0 warning), ESLint (backend).
- Sebelum commit: `lint` + `typecheck`/`build` + `npm test` di bagian yang diubah; backend: `npm run test:smoke`.

## 7. Rencana berikutnya

- AI multi-provider di backend (Gemini/Claude/OpenAI, key terenkripsi) — menggantikan pemanggilan Gemini dari browser.
- Ekstraksi PDF/DOCX/XLSX/OCR, embedding **pgvector** + chatbot RAG atas arsip & resource (Redis untuk antrian, cache,
  memori sesi chat).
