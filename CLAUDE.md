# CLAUDE.md — LifeOS

Knowledge base utama untuk Claude Code di proyek LifeOS. **Baca seluruh file ini di awal setiap chat/thread.**
Dokumen ini menggantikan memori percakapan: keputusan, konteks user, status, dan pola wajib tercatat di sini.
Perbarui **§11 Status** dan **§12 Log Keputusan** setiap selesai satu langkah berarti.
Dokumentasi untuk manusia ada di `docs/` (SETUP, DEPLOYMENT, ARCHITECTURE = fondasi + tech stack & versi, UPGRADE-PLAN, FILE-CONTROL,
ONLYOFFICE = riset & rencana integrasi editor dokumen).

## 0. Memulai Thread Baru (checklist wajib)

1. Baca file ini sampai habis (terutama §11 Status, §14 Resep, §15 Jebakan). Untuk modul File Control baca juga
   `docs/FILE-CONTROL.md`; untuk deploy `docs/DEPLOYMENT.md`; untuk arsitektur & versi tech stack
   `docs/ARCHITECTURE.md` (fondasi); untuk upgrade dependensi `docs/UPGRADE-PLAN.md`; untuk menu Tools → ONLYOFFICE
   `docs/ONLYOFFICE.md`.
2. Cek kondisi repo: `git status`, `git log --oneline -10` (commit terakhir = pekerjaan terakhir).
3. **Cek status lingkungan dulu (§2a)** — jangan menyalakan yang sudah aktif. Yang belum aktif: nyalakan (lihat §2):
   `wsl -e sh -c "sleep infinity"` (background) →
   `wsl -e sh -c "cd /mnt/d/Development/Application/LifeOS && docker compose up -d"` → preview `backend` & `frontend`
   (`.claude/launch.json`). Login `admin@lifeos.com` / `123`.
4. Pastikan baseline sehat sebelum mengubah apa pun: `npm test` (backend & frontend), `npm run test:smoke` (backend).
5. Tanyakan/konfirmasi ruang lingkup thread ke user bila belum jelas; catat keputusan di §12.
6. **Sebelum thread berakhir**: perbarui §11 Status, §12 Log Keputusan, pola baru di §8/§8b/§14, jebakan baru di §15,
   dan dokumen `docs/` yang terdampak — lalu tawarkan commit (commit hanya atas perintah user). Knowledge yang hanya ada di percakapan akan hilang.

---

## 1. Tentang User & Cara Kerja

- Pemilik proyek: Mohammad Yusuf (GitHub `zonakerja`). Aplikasi produktivitas pribadi & pekerjaan.
- **Komunikasi dalam Bahasa Indonesia.** Teks UI, pesan error, dan komentar kode juga Indonesia. Identifier, nama file,
  dan commit message dalam Bahasa Inggris.
- User bukan programmer full-time: jelaskan langkah & perintah dengan jelas; beri rekomendasi tegas bila user ragu.
- Pengembangan dibagi per thread dengan ruang lingkup jelas (fitur, infrastruktur, upgrade). Thread non-fitur tidak
  boleh mengubah perilaku fitur.
- **Commit hanya bila user memerintahkan** (perubahan dibiarkan di working tree sampai diminta).
  **Push ke GitHub juga hanya bila user meminta.**
- Aplikasi ini berdiri sendiri: jangan menambahkan rujukan, kompatibilitas, atau impor dari aplikasi lain/versi lama.
- **Setiap selesai mengerjakan pekerjaan/task, akhiri jawaban dengan "Status lingkungan" (§2a)**: port mana yang
  aktif/tidak, siapa yang menjalankan, dan cara menghentikannya — agar user tidak menyalakan ulang yang sudah aktif dan
  bisa meminta "matikan semua" sebelum menutup laptop.

## 2. Lingkungan Development (laptop user)

- **Windows 11 ARM64**. Node `24` arm64 via **nvm-windows** (`.nvmrc`), npm 11. nvm-windows memasang **x64** secara
  default (jalan diam-diam lewat emulasi) → selalu `nvm install 24 arm64` / `nvm use <versi> arm64`; cek
  `node -p "process.arch"` = `arm64`. Panduan bercabang ARM64/x64: `docs/SETUP.md` §1 & §3 langkah 0.
  - Paket native tanpa prebuilt win32-arm64 gagal dipasang (tidak ada Python/Build Tools) → pilih paket dengan
    prebuilt arm64 / pure JS / WASM (contoh: `@node-rs/argon2`, Prisma 7 tanpa engine Rust + adapter `pg`).
  - npm 11 memblokir install script yang belum disetujui: daftar di field `allowScripts` (`backend/package.json`).
    Paket baru yang butuh postinstall → `npm approve-scripts <pkg>` lalu `npm rebuild <pkg>`.
- **Docker Engine di WSL Ubuntu** (tanpa Docker Desktop); CLI `docker` tidak ada di PATH Windows:
  `wsl -e sh -c "cd /mnt/d/Development/Application/LifeOS && docker compose up -d"`. WSL berhenti saat idle →
  jalankan `wsl -e sh -c "sleep infinity"` di background selama bekerja.
  - Perintah docker yang memakai kutip rumit: tulis skrip `.sh` (PowerShell `Set-Content -Encoding ascii`) lalu
    `wsl -e sh /mnt/d/.../script.sh`.
- Shell Claude: Git Bash & PowerShell 5.1. **Heredoc / `node -e` di Bash bisa memakan backslash** (regex `\b`, `\(`)
  → tulis skrip bantu dengan tool Write ke scratchpad lalu jalankan dengan node.
- Setelah banyak perubahan beruntun, Vite HMR bisa menyimpan modul rusak → restart dev server frontend.
- Folder kerja: `D:\Development\Application\LifeOS`. `.claude/launch.json` berisi konfigurasi `backend` & `frontend`
  untuk preview browser Claude. Panel browser Claude sering tersembunyi → uji UI lewat `javascript_tool`.
- **Aturan port (semua thread sama, tidak boleh diganti)**: frontend 5173, backend 4000, PostgreSQL 5432, Redis 6379,
  SeaweedFS 8333/8888, ONLYOFFICE 8080 (profile `office`) (opsional: Prisma Studio 5555, Vite preview 4173, stack prod uji 80/443). Satu komponen = satu
  proses: cek §2a dulu; bila port sudah dipakai (mis. user menjalankan dev server di terminalnya), **pakai yang ada**
  — jangan `preview_start {name}` lagi; untuk melihat UI cukup `preview_start {url: "http://localhost:5173"}`. Vite
  `strictPort: true` → gagal alih-alih pindah ke 5174. Panduan user: `docs/SETUP.md` §2–§6.
- lazydocker terpasang di WSL (`wsl -e lazydocker`); jendela lazydocker yang terbuka juga menjaga WSL tetap hidup.

## 2a. Status Lingkungan (wajib dilaporkan) & Mematikan Semua

**Kapan**: di akhir setiap jawaban yang mengerjakan pekerjaan/task (bukan untuk jawaban tanya-jawab murni), dan setiap
kali user bertanya status atau meminta "matikan semua". Selalu **cek ulang** sebelum melapor — jangan menebak dari
ingatan percakapan.

**Format laporan** (tabel ringkas, Bahasa Indonesia):

| Komponen | Port | Status | Dijalankan oleh | Catatan |
|---|---|---|---|---|
| Frontend (Vite) | 5173 | 🟢 aktif / ⚪ mati | preview Claude / terminal user / — | http://localhost:5173 (login `admin@lifeos.com` / `123`) |
| Backend (NestJS) | 4000 | … | … | http://localhost:4000/api/v1/health · Swagger `/api/docs` |
| PostgreSQL (Docker) | 5432 | … | Docker (WSL) | DB `lifeos` + `lifeos_shadow` |
| Redis (Docker) | 6379 | … | Docker (WSL) | |
| SeaweedFS S3 / filer (Docker) | 8333 / 8888 | … | Docker (WSL) | filer UI http://localhost:8888 |
| ONLYOFFICE (Docker, opsional) | 8080 | … | Docker (WSL), profile `office` | http://localhost:8080/healthcheck |
| WSL | — | berjalan / berhenti | — | proses penjaga `sleep infinity` milik Claude (bila ada) |

Tambahkan baris lain bila relevan (mis. stack produksi uji `lifeos-*test` di port 80/443, proses latar belakang Claude).
Akhiri dengan satu kalimat: apa yang masih menyala dan apakah aman menutup laptop.

**Cara mengecek** (PowerShell; tidak menyalakan apa pun):

```powershell
# Port yang sedang dipakai + prosesnya (wslrelay.exe = port container Docker)
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 80,443,4000,5173,5432,6379,8080,8333,8888 } |
  ForEach-Object { "{0} pid={1} {2}" -f $_.LocalPort, $_.OwningProcess, (Get-Process -Id $_.OwningProcess).ProcessName }
# Proses node milik LifeOS (dev server frontend/backend, termasuk dari terminal user)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*LifeOS*' } |
  Select-Object ProcessId, CommandLine
# Apakah WSL berjalan? (bila tidak ada distro berjalan → semua container pasti mati; jangan panggil docker)
wsl --list --running
```

Bila WSL berjalan: `wsl -e sh -c "docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'"`. Dev server yang dijalankan
Claude terlihat di `preview_list`.

**"Matikan semua"** (data tetap aman; urutan):
1. Frontend & backend: `preview_stop` untuk server yang dijalankan Claude; yang dijalankan user di terminal → minta
   user menekan `Ctrl+C`, atau (dengan persetujuan) `Stop-Process -Id <pid>` untuk proses node LifeOS di atas.
2. Docker: `wsl -e sh -c "cd /mnt/d/Development/Application/LifeOS && docker compose --profile office stop"` — **`stop`, bukan
   `down -v`** (volume/data tetap ada). Stack uji lain (`docker compose -p <nama> ...`) ikut dihentikan.
3. Hentikan proses latar belakang Claude (mis. `wsl -e sh -c "sleep infinity"`) dengan TaskStop.
4. Opsional (membebaskan RAM): `wsl --shutdown`.
5. Cek ulang dengan perintah di atas, lalu laporkan tabel status (semua ⚪) — aman menutup laptop.

## 3. Repo & Git

- `origin` = `https://github.com/zonakerja/lifeos.git`, branch `main`. Aplikasi ini berdiri sendiri (tidak terikat
  repo/aplikasi lain). Dokumen tidak merujuk hash commit.
- Identitas git user sudah terkonfigurasi. Akhiri commit dengan baris `Co-Authored-By` sesuai instruksi sistem.

## 4. Visi Produk

LifeOS = "personal operating system" web: **Planner** (agenda, jadwal, rutinitas, todo), **Notes** (+AI),
**Productivity** metode **PARA**, dan **File Control** (manajemen kearsipan sesuai kaidah kearsipan Indonesia).
Ke depan: **chatbot AI untuk bertanya tentang arsip & hasil pekerjaan** (RAG).

## 5. Keputusan Teknis

| Area | Keputusan |
|---|---|
| Frontend | TypeScript 6 strict, React 19, Vite 8, React Router 8, TanStack Query 5, Zustand 5, react-hook-form + zod 4 |
| UI | shadcn/ui + Tailwind v4, tampilan colorful per modul lewat design token; dark mode via token |
| Backend | NestJS 12 (CommonJS) + TypeScript 6 + Prisma 7 + PostgreSQL 18; Node 24 LTS (versi lengkap: `docs/ARCHITECTURE.md` §2) |
| Database | 21 tabel domain terstruktur dari satu spesifikasi + kolom `extra` jsonb (lossless), snake_case, timestamptz |
| Auth | access JWT 15 menit di memori + refresh token di cookie httpOnly berotasi |
| AI provider | Multi-provider dipilih user: Gemini, Claude, OpenAI — dipanggil **hanya dari backend** (SDK resmi), API key milik user terenkripsi AES-256-GCM, model bisa diganti user |
| AI data/RAG | **pgvector** di PostgreSQL (embedding & semantic search); **Redis** untuk antrian BullMQ, cache, rate-limit, memori sesi chat |
| Object storage | S3-compatible: SeaweedFS (dev & default prod), bisa S3/R2/B2 lewat env `S3_*` |
| Deployment | Docker Compose di VPS; Caddy (HTTPS otomatis) → backend & frontend (nginx); backup harian |
| Password hash | `@node-rs/argon2` |
| Repo | Monorepo: `frontend/` + `backend/` + infra di root |

## 6. Struktur Repo

```
LifeOS/
├── CLAUDE.md · README.md · .nvmrc · .prettierrc.json (Prettier tunggal, printWidth 120)
├── docker-compose.yml        infra DEVELOPMENT (postgres 5432, redis 6379, SeaweedFS 8333/8888)
├── docker-compose.prod.yml   stack PRODUKSI (caddy, frontend, backend, postgres, redis, storage, backup)
├── .env.example              variabel produksi (disalin ke .env di VPS)
├── .github/                  workflows/ci.yml + dependabot.yml
├── infra/                    caddy/Caddyfile · backup/{Dockerfile,backup.sh} (image backup) · seaweedfs/s3.json (S3 dev)
├── backend/                  NestJS (Dockerfile, prisma/, src/, templates/office/ = dokumen kosong ONLYOFFICE, test/smoke.mjs)
├── frontend/                 React SPA (Dockerfile, nginx.conf, src/)
└── docs/                     SETUP.md · DEPLOYMENT.md · ARCHITECTURE.md · UPGRADE-PLAN.md · FILE-CONTROL.md · ONLYOFFICE.md
```

## 7. Infrastruktur

**Development** (`docker compose up -d`, image di-pin sama dengan produksi):

| Service | Container | Host port | Kredensial |
|---|---|---|---|
| PostgreSQL 18 + pgvector 0.8.7 | lifeos-postgres | 5432 | db `lifeos`, `postgres/postgres`; DB tambahan `lifeos_shadow` (cek drift); volume `lifeos-postgres18-data` |
| Redis 8.10 | lifeos-redis | 6379 | tanpa password |
| SeaweedFS 4.48 (S3) | lifeos-storage | 8333 (S3), 8888 (filer UI) | `lifeos` / `lifeos-secret`, bucket `lifeos-assets` (dibuat otomatis) |
| ONLYOFFICE Docs 10.0 (opsional, profile `office`) | lifeos-onlyoffice | 8080 | image `lifeos-onlyoffice:10.0` dibangun dari `infra/onlyoffice/Dockerfile` (+ plugin AI resmi + jembatan AI + pemantau font); font tambahan diunggah admin ke `infra/onlyoffice/fonts` (`ONLYOFFICE_FONTS_DIR`, daftar font dibuat ulang otomatis); JWT secret dev di compose, header `AuthorizationJwt`; nyala: `docker compose --profile office up -d --wait onlyoffice` |

Seed development: `admin@lifeos.com` / `123` (super_admin), `user@lifeos.com` / `123` (member, untuk uji berbagi).
Akun `viewer@lifeos.com` lama (dev) kini member ("Tamu Viewer") — boleh dihapus.
Volume PostgreSQL memuat nomor major (`lifeos-postgres18-data`, prod `postgres18-data`) dan di-mount ke
`/var/lib/postgresql`. Data dev hanya dummy: boleh direset kapan saja (`docker compose down -v` → `up -d --wait` →
`CREATE DATABASE lifeos_shadow` → `npx prisma migrate deploy` → `npm run prisma:seed`).

**Produksi** (`docker compose -f docker-compose.prod.yml up -d --build`, project `lifeos-prod`, volume terpisah dari
dev): hanya Caddy membuka 80/443; Redis berpassword; kredensial S3 SeaweedFS dirender dari env; batas memori per
service + tuning PostgreSQL/Redis/Node (env `*_MEM_LIMIT`, `PG_*`, `BACKEND_HEAP_MB`, `REDIS_MAXMEMORY`; DEPLOYMENT
§1.1); log Docker dirotasi. **Backup** = image sendiri `infra/backup/` (base = image postgres + rclone + curl):
`db-*.dump` tervalidasi + cermin bucket via API S3 (`storage/current` + `storage/changed/<waktu>`) di `./backups`,
salinan luar server terenkripsi rclone crypt (`OFFSITE_S3_*`, `BACKUP_ENCRYPTION_PASSWORD`), heartbeat
`BACKUP_HEALTHCHECK_URL` (healthchecks.io), healthcheck Docker; perintah `backup.sh --once | --health | rclone …`
(remote `src`, `offsite`, `offsiteraw`). Pengamanan VPS (SSH key, fail2ban, unattended-upgrades): DEPLOYMENT §1.2. Seed produksi:
`exec backend node dist/database/seed.js` (super admin dari `SEED_ADMIN_*`). Uji lokal: `APP_DOMAIN=localhost`
(sertifikat internal Caddy; browser panel menolak → pakai `APP_DOMAIN=http://localhost` untuk uji UI).
Diverifikasi end-to-end 2026-10-09 (smoke test lulus lewat HTTPS). Panduan: `docs/DEPLOYMENT.md`.
**ONLYOFFICE produksi** (opsional, `COMPOSE_PROFILES=office` + `ONLYOFFICE_URL=https://<domain>/office` +
`ONLYOFFICE_JWT_SECRET`): service `onlyoffice`, Caddy `/office/*` (halaman bawaan 404), volume font bersama backend;
diuji stack lokal 2026-10-16 (smoke penuh lewat Caddy). Panduan: DEPLOYMENT §9.

## 8. Backend (`backend/`)

- NestJS 12 (proyek **CommonJS**; paket Nest berformat ESM dimuat via `require(esm)` Node 24) + TypeScript 6
  (`module/moduleResolution: nodenext`) + Prisma 7 + adapter `@prisma/adapter-pg` (`src/prisma/prisma-adapter.ts`).
  Versi lengkap, batasan platform & overrides: `docs/ARCHITECTURE.md` §2; yang ditunda: `docs/UPGRADE-PLAN.md`.
- **Prisma 7**: generator `prisma-client` (`moduleFormat = "cjs"`, `importFileExtension = ""`) → `src/generated/prisma`
  (dibuat `postinstall`, **tidak di-commit**, di-ignore ESLint & Docker). Import `PrismaClient`, `Prisma`, enum, dan tipe
  model dari path relatif `../generated/prisma/client` — **bukan** `@prisma/client`. URL datasource & shadow DB ada di
  `prisma.config.ts` (`DATABASE_URL`, `SHADOW_DATABASE_URL`), bukan di `schema.prisma`. Tanpa engine Rust (cocok ARM64).
- Prefix `api/v1`, port 4000. Swagger `/api/docs` & `/api/docs-json` (non-production).
- Env divalidasi saat boot (`src/config/env.validation.ts`). Env baru → daftarkan di sana + `backend/.env.example`
  (+ `docker-compose.prod.yml` & root `.env.example` bila perlu di produksi). Tanpa fallback secret.
  Env opsional penting: `TRUST_PROXY`, `COOKIE_SECURE` (default true di production), `LOG_LEVEL`, `REDIS_PASSWORD`.
  Env wajib `AI_ENCRYPTION_KEY` (64 hex) — mengganti nilainya membuat API key AI tersimpan tidak terbaca.
- Global: Helmet, CORS, ValidationPipe whitelist + forbidNonWhitelisted, `PrismaExceptionFilter`, Throttler
  (600/menit; login 10/menit; refresh 30/menit), log `nestjs-pino` (`src/config/logger.config.ts`: JSON di production,
  `reqId`/`X-Request-Id`, header & token disensor), shutdown hooks, body JSON 5 MB.
- **Auth** (`src/auth/`): `POST /auth/login` → body `{ user, accessToken }` + cookie `lifeos_rt` (httpOnly, SameSite=Strict,
  path `/api/v1/auth`, `refresh-cookie.ts`). `POST /auth/refresh` (cookie) merotasi; toleransi reuse 30 detik untuk
  refresh paralel; reuse setelahnya → semua sesi user dihapus. `POST /auth/logout`, `GET/PATCH /auth/me`,
  `POST /auth/change-password` (hapus sesi lain). Pencabutan eksplisit = hapus baris; `revokedAt` hanya untuk rotasi.
  Admin mengubah password/role user → sesi user itu dihapus.
- **Isolasi data** (detail: `docs/ARCHITECTURE.md` §3.3): role `super_admin | admin | member` (viewer dihapus). Setiap
  user — termasuk admin — hanya membaca/menulis datanya sendiri + item yang **dibagikan** kepadanya. Role hanya untuk
  pengelolaan akun & aplikasi. **Jangan** menambah jalan pintas "admin melihat semua data" di endpoint mana pun.
- **Users**: list/get (admin, super_admin), create/update/delete (super_admin; admin hanya kelola non-super-admin),
  `GET /users/stats` (admin: jumlah data/berkas/ukuran/berbagi/aktif terakhir, tanpa isi), `GET /users/directory?q=`
  (semua user: cari penerima berbagi, min. 3 huruf, nama+email). Hapus user → berkasnya ikut dihapus dari storage.
- **Berbagi & komentar** (`src/sharing/`): tabel `shares` (item induk `para_project | para_area | para_resource |
  free_note | ai_note | list | schedule` + virtual `schedule_series` = seluruh pertemuan agenda berulang, `recordId` =
  `seriesId`), izin `view | comment | edit`) + `record_comments`. Akses dihitung saat request
  oleh `ShareAccessService` dari logika murni `share-graph.ts` (+ test): turunan ikut dengan izin root, rujukan
  (catatan/resource terlampir, klasifikasi/JRA/wadah arsip) baca-saja, berkas = semua key `*uploadId` di payload item
  yang dapat diakses. Turunan baru menambah relasi → ubah `expandDescendants`/`parentRefsOf`; rujukan baru →
  `referencesOf`. Endpoint `/shares`, `/shares/outgoing|incoming`, `/comments`.
- **My Notebook** (`src/notebooks/`, detail: `docs/ARCHITECTURE.md` §3.4): notebook milik user berisi sumber (`upload`,
  `record`, `text`, `web`), chat RAG bersitasi dengan riwayat permanen (`POST /notebooks/:id/chat`, hibrida: ≤ 150 rb
  karakter dikirim utuh, lebih besar → potongan relevan), ringkasan Studio, catatan notebook. Logika murni di
  `notebook-context.ts`, pengambilan web aman di `web-source.ts` (keduanya + test). Item sumber hanya milik sendiri.
  `AiIndexService.search(..., only)` membatasi pencarian ke sumber tertentu. Sumber `upload` bisa berkas baru (context
  `notebook` → **ikut terhapus** bersama sumber/notebook) atau **berkas yang sudah ada di LifeOS** (lampiran, dsb. →
  hanya dirujuk, tidak pernah dihapus); respons sumber membawa `mimeType` & `ownedByNotebook`. Chat menerima `fileIds`
  (maks. 4 milik sendiri, context `notebook_chat`; gambar ≤ 10 MB dikirim ke AI, dokumen ≤ 20 MB dibaca dari teks
  ekstraksi server — PDF tanpa teks dikirim ke AI sebagai berkas; masih diproses / tak terbaca → 400); disimpan di
  `notebook_messages.attachments`; bersihkan chat / hapus notebook ikut menghapus lampirannya.
- **Settings**: `GET /settings/app` publik (branding login; **tanpa** data logo, hanya `logoVersion`); `GET /settings/app/logo`
  publik = gambar logo (data URL di kolom `app_logo` didekode; `Cache-Control: immutable` karena URL memuat `?v=`,
  `CSP: sandbox`); `PATCH` admin (`appLogo`: tidak dikirim = tetap, `""` = hapus, data URL PNG/JPG/WEBP/GIF/SVG = ganti).
- **AI** (`src/ai/`, detail: `docs/ARCHITECTURE.md` §3.1): `GET/PATCH /ai/settings`, `PUT/DELETE /ai/settings/:provider`,
  `POST /ai/settings/:provider/test`, `POST /ai/generate` (multipart `prompt` + `files[]`, maks. 5 / 20 MB). Katalog
  provider & model default di `ai-providers.ts`; satu klien per provider di `providers/` (Gemini `generateContent`
  stateless, Claude Messages streaming + `effort`/`fallbacks`, OpenAI Responses `store:false`). Kredensial di
  `ai_credentials` (terenkripsi, API hanya mengembalikan `keyHint`), provider aktif di `users.ai_provider`, sakelar
  **cadangan otomatis** `users.ai_fallback` (`ai-routing.ts`: lampiran tak didukung / kuota / tak terjangkau → provider
  lain yang punya key; respons `fallback`). Error
  provider → 429 (kuota) / 422 (lainnya) — **jangan** 401 atau ≥ 502 (lihat §15). Semua role boleh memakai AI.
- **Indeks pengetahuan / RAG** (`src/ai/index/`, detail: `docs/ARCHITECTURE.md` §3.2): tabel `ai_chunks` (pgvector 768,
  `gemini-embedding-2` dengan key Gemini pemilik data; tanpa key → tanpa embedding, pencarian kata saja), antrian BullMQ
  `ai-index` dipicu `RecordsService` & ekstraksi, sakelar `users.ai_index_enabled`, `GET /ai/index`,
  `POST /ai/index/rebuild`, `GET /ai/index/search` (vektor + full-text, RRF). Tipe yang diindeks: `INDEXED_TYPES`.
- **Database**: tabel & kolom snake_case (`@@map/@map`), timestamptz(3), FK `users` cascade. 21 tabel domain
  (agenda_types, schedules, routines, todos, routine_completions, free_notes, ai_notes, note_lists, areas, projects,
  activities, tasks, resources, para_archives, para_archive_logs, archive_classifications, archive_retention_schedules,
  archive_locations, archive_borrowings, archive_dispositions, archive_move_logs) dengan kolom sistem
  `id, user_id, client_id, extra, created_at, updated_at, deleted_at` + `UNIQUE(user_id, client_id)`.
  - **Sumber tunggal** `src/records/record-schema.ts` (type → model/tabel, field & jenis
    string|int|float|bool|ymd|dateKey|timestamp|json, indeks, `audit`). Blok model di `schema.prisma` antara marker
    `<generated:...>` dibuat `npm run db:generate-models` — jangan edit manual.
  - `record-mapper.ts`: nilai valid → kolom bertipe; tak valid / null eksplisit / key asing → `extra` ⇒ payload dibaca
    kembali identik. Diuji `record-mapper.spec.ts`.
  - Tanpa FK antar entitas (ID buatan client, tulis per item asinkron, relasi polimorfik) — cukup diindeks.
  - **Audit kearsipan** `archive_audit_logs` (created/updated/deleted, diff `{field:{from,to}}`, actor) untuk tipe
    `audit: true` (resource hanya bila punya `archivalStatus`; snapshot PARA hanya berisi file). `GET /archive-audit`.
  - Migrasi: baseline `20261009120000_init` + `20261011120000_activity_parent` +
    `20261011130000_para_archive_log` + `20261011140000_ai_credentials` +
    `20261011150000_ai_fallback` + `20261011160000_ai_chunks` + `20261011170000_sharing` (viewer → member, `shares`,
    `record_comments`, `assets.uploaded_by_id`) + `20261011180000_schedule_project` (`schedules.project_id`, data lama dari
    `extra` dipindah) + `20261014120000_file_control_opt_in` (resource berkas lama → `archival_status = 'pending'`) +
  `20261014130000_notebooks` (My Notebook) + `20261014140000_notebook_message_attachments` (gambar di pesan chat) +
  `20261015120000_asset_versions` (versi berkas ONLYOFFICE) + `20261016120000_office_ai` (sakelar AI editor) +
  `20261016130000_asset_draft_link` (konsep ↔ dokumen final). Migrasi baru → lihat docs/SETUP.md §10
    (`prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`, lalu cek
    drift dengan `--exit-code`; shadow DB dari `SHADOW_DATABASE_URL`).
- **Records API**: `GET /records/:type?from&to` (milik sendiri + item bersama bertanda `share`), `PUT
  /records/:type/:clientId` `{ payload, userId? }` (upsert, juga undelete; `userId` = pemilik item bersama, butuh izin
  edit; item baru di dalam item bersama otomatis milik pemilik induknya), `DELETE /records/:type/:clientId?userId=`
  (soft delete; item induk bersama hanya oleh pemiliknya). `share` di payload dibuang server.
- **Uploads** (`ownerId` opsional = unggah ke item bersama berizin edit → berkas milik pemilik, `uploaded_by_id` =
  pengunggah; baca: pemilik/pengunggah/penerima item yang merujuk berkas; hapus: pemilik/pengunggah): multer diskStorage (tmp) → SHA-256 streaming → S3 `<userId>/<yyyy>/<mm>/<ts>-<uuid><ext>` → `assets` +
  `asset_extractions` → job BullMQ `asset-extraction` (≤ 20 MB: teks, PDF, DOCX, XLSX; format kantor lain → konversi
  ONLYOFFICE ke TXT/CSV bila diatur (`OfficeTextConverter`); gambar/PDF scan → OCR Gemini milik
  pemilik berkas; selesai → indeks RAG). `GET /uploads/:id` (Bearer), `POST /uploads/:id/link`
  → `/uploads/:id/download?token=` 10 menit. Respons berkas: `CSP: sandbox`, konten aktif dipaksa attachment.
- **ONLYOFFICE** (`src/office/`, detail: `docs/ARCHITECTURE.md` §3.5 & `docs/ONLYOFFICE.md`): `GET /office/status`,
  `POST /office/documents` (dokumen kosong dari `templates/office/`), `POST /office/config` (config editor ditandatangani
  `ONLYOFFICE_JWT_SECRET`; tema & seluler ikut dikirim ke backend karena config bertanda tangan **tidak boleh** diubah
  browser), riwayat/unduh/pulihkan versi, dan endpoint untuk server ONLYOFFICE `files/:id/content?token=` +
  `callback?token=` (JWT ONLYOFFICE di header `AuthorizationJwt`; link berkas hasil edit hanya dari host ONLYOFFICE).
  Akses = akses berkas (`UploadsService.findWithPermission`: pemilik/pengunggah edit, berbagi sesuai izin). Format =
  daftar resmi ONLYOFFICE (`office-formats.ts`, 74 format edit/lossy/view, disalin dari
  `document-formats/onlyoffice-docs-formats.json` di container — perbarui saat upgrade ONLYOFFICE; salinan frontend sama). Versi: satu
  sesi edit = satu versi, maks. 10 (`asset_versions`), `document.key = <assetId>-<office_key>` berganti saat sesi selesai.
  Env opsional `ONLYOFFICE_URL`, `ONLYOFFICE_INTERNAL_URL`, `ONLYOFFICE_JWT_SECRET`, `ONLYOFFICE_BACKEND_URL` (`auto` =
  IP WSL). Logika murni + test: `office-logic.ts`. Hapus berkas/user menghapus objek versinya juga.
  **AI di editor = satu pintu** (tahap 3, detail `docs/ONLYOFFICE.md` §3.4): sakelar per user `users.office_ai` (boolean,
  default mati, `GET/PATCH /office/preferences`). Aktif → tab AI **plugin resmi ONLYOFFICE** apa adanya; jembatan
  `infra/onlyoffice/lifeos-ai-bridge.js` (disisipkan saat build image) mengisi mode "pengaturan server" plugin dari
  `editorConfig.plugins.options[GUID AI].lifeos` (token sesi AI + alamat) → semua permintaan ke `POST /office/ai/proxy`
  (body teks tanpa Content-Type, CORS khusus di `main.ts`) → `office-ai.ts` (+ test) → `AiService.generate` milik user.
  **Templat**: berkas konteks `office-template` (`GET /office/templates`) → `POST /office/documents { templateId }`
  menyalin/mengonversi (`templateTarget`). **Font** (admin): `GET/POST /office/fonts`, `DELETE /office/fonts/:name` → folder
  `ONLYOFFICE_FONTS_DIR` (validasi `fontKind`/`safeFontFileName`); `diagnostics` juga khusus admin. **Konsep ↔ dokumen
  final**: `assets.draft_id` (final → konsep, SetNull), `GET /office/files/:id/links`, `PUT /office/files/:id/draft`,
  `GET /office/links?ids=`, `GET /office/link-candidates` (aturan `isDraftFormat`/`finalLinkError` + test).
- **Health**: `/health` (readiness, 503 bila dependensi down), `/health/live` (liveness).
- **Seed**: `src/database/seed.ts` (dev: akun demo via `prisma db seed` → `tsx`; production: super admin dari env,
  `node dist/database/seed.js`).
- **Test**: `npm test` (Vitest unit), `npm run test:smoke` (end-to-end ±95 skenario termasuk isolasi admin & berbagi;
  membuat & menghapus dua user member sementara; env `API_URL`, `SMOKE_ADMIN_EMAIL`, `SMOKE_ADMIN_PASSWORD`).
- Perintah: `dev | build | start | lint | typecheck | test | test:smoke | prisma:generate | prisma:deploy |
  prisma:seed | db:generate-models`.

## 8b. Frontend (`frontend/`)

- Vite 8 + React 19 + TypeScript 6 strict + Tailwind v4 + shadcn/ui (`radix-maia`, lucide, `cn`) + React Router 8
  (rute `lazy`) + TanStack Query 5 + Zustand 5 + react-hook-form + zod 4 + sonner. Lint **oxlint** (0 warning,
  `components/ui/**` di-ignore). Test: Vitest (`npm test`).
- Dev server 5173 (`strictPort`), proxy `/api` → localhost:4000; frontend memakai base relatif `/api/v1` (`VITE_API_BASE_URL`).
- Struktur: `app/` (router, providers), `config/navigation.ts` (sumber tunggal modul/tab/role), `types/`, `lib/api/`
  (client + endpoints), `data/` (useCollection + hook bertipe), `stores/`, `hooks/`, `components/{ui,layout,common}`,
  `features/<modul>/` (`<modul>-page.tsx` mengekspor `Component`).
- **Sesi**: `stores/auth-store.ts` hanya di memori (`status: unknown|authenticated|anonymous`, `user`, `accessToken`).
  `main.tsx` memanggil `bootstrapSession()` (refresh via cookie); `RequireAuth` menunggu status. **Jangan menyimpan
  token/user di localStorage.** `lib/api/client.ts`: `credentials: "include"`, refresh single-flight saat 401.
- **Data domain**: `useCollection<T>(recordType, { getId? })` → `{ items, setItems, upsert, remove, isLoading }`.
  `setItems(updater)` = diff prev/next → PUT/DELETE per item (debounce 500 ms, diserialkan per item, optimistis,
  rollback + toast). `flushPendingWrites()` saat logout. Koleksi berisi data sendiri + item bersama (bertanda `share`,
  dibuang saat menulis; respons upsert memperbarui `userId` item baru). Opsi `ownOnly` = hanya milik sendiri (dipakai
  referensi File Control: `useClassifications/useJraList/usePhysRefs({ includeShared })`).
- **Design system (wajib)**: token OKLCH di `src/index.css`; dilarang warna hardcoded / ternary dark mode. Warna modul
  via `data-module` → `bg-module`, `text-module`, `bg-module-soft`, `bg-module-gradient`, `text-module-foreground`;
  status `success | warning | info | destructive`. Font Figtree. Setiap halaman memakai `<ModulePage module="...">`.
  Pakai komponen shadcn; jangan membuat modal/tombol custom.
- **Bundle**: rute, halaman login, `Markdown` (react-markdown + KaTeX, `markdown-renderer.tsx`), `html5-qrcode`, dan
  editor Catatan Bebas (Tiptap + tinta, chunk `free-note-editor` ±485 kB) dimuat malas. Chunk utama ±440 kB (termasuk host editor ONLYOFFICE; sejak tahap 3 floating-ui/popper ikut chunk utama —
  sebelumnya chunk terpisah yang tetap dimuat saat start); tanpa
  peringatan ukuran chunk. Tab My Notebook = chunk `notebook-tab` (±42 kB).
- **CSP produksi** (`nginx.conf`): `script-src 'self'`, `connect-src 'self'` (AI lewat backend), `style-src 'self'
  'unsafe-inline'`, `img/media blob: data:`. Domain eksternal baru → tambahkan di sini (lebih baik lewat backend).

### Pola implementasi frontend (WAJIB)
- **Koleksi data**: pakai hook bertipe di `src/data/collections.ts`; tipe entitas di `src/types/entities.ts`.
- **Dialog form**: state di komponen *dalam* yang di-mount saat dialog terbuka (`useState(() => dariProps)`), atau
  `key` pada inner. **Jangan** sinkronisasi props→state dengan `useEffect`.
- **Deep link via URL** (`useSearchParam`): `?edit=`, `?todo=`, `?date=`, `?agenda=<id>|new` (lihat/buat agenda di Overview, Harian, Jadwal), `?schedule=<id>` (Notes AI baru dari agenda),
  `?project=`, `?area=`, `?task=`, `?resource=`, `?note=<id>|new` (Catatan & Notes AI, `links.note(tab, id)`; Catatan juga `new-ink` = tulis tangan), `?archive=`,
  sub-tab/filter `?sub=`/`?ref=`. Peta di `src/lib/deep-links.ts`. Mengubah **lebih dari satu** param
  sekaligus → `useSetSearchParams()({ a: null, b: null })`, jangan dua setter `useSearchParam` berturut-turut.
- **Waktu di render**: `useToday()`. **Hak akses**: `usePermissions()` → `canEdit` (data sendiri selalu true; di dalam
  `<AccessScope item>` mengikuti izin berbagi item) + `uploadOwnerId` (upload lampiran di item bersama).
- **Berbagi (pola wajib untuk item yang bisa dibagikan)** — `lib/sharing.ts` (`itemAccess(item)` → `canEdit`,
  `canComment`, `isOwner`; `isMine`; label izin; `sharedItemPath`), komponen di `features/sharing/`:
  - Bungkus dialog/editor satu item dengan `<AccessScope item={x}>` (`components/common/access-scope.tsx`) agar kontrol
    ubah otomatis tersembunyi untuk izin Lihat/Komentar dan upload diarahkan ke pemilik.
  - Kartu/daftar: `<SharedBadge item recordType?>` ("Pemilik · Izin" / "Dibagikan · n"); tombol ubah butuh
    `itemAccess(x).canEdit`; **hapus, arsipkan, sematkan, bagikan hanya `!x.share`** (pemilik).
  - `<ShareButton item recordType title iconOnly?>` (hanya tampil untuk pemilik; dialog email + izin, daftar
    penerima). `<CommentsPanel recordType item>` / `<CommentsButton>` (hanya tampil bila item sedang dibagikan).
  - Item baru di dalam item bersama: set `userId` = pemilik induk bila diketahui (server juga menurunkannya).
  - Pengaturan → **Berbagi** (`sharing-tab.tsx`): Dibagikan dengan saya / oleh saya (ubah izin, cabut, keluar).
  - File Control: pengelolaan (daftar, penataan, transaksi, auto-dispose) hanya arsip milik sendiri
    (`useArchiveFiles()`); tab **Dibagikan** + detail memakai `useArchiveFiles({ includeShared: true })`.
- **AI**: hanya via `useAi()` (`src/lib/ai/use-ai.ts`) → `aiApi.generate(prompt, files)` (`POST /ai/generate`);
  `isConfigured` dari `user.aiProvider`; bila backend memakai provider cadangan, `useAi` menampilkan toast (fitur tidak
  perlu menangani). Pesan belum diatur: `AI_NOT_CONFIGURED`; kuota habis = `ApiError` status 429.
  Pengaturan: `features/settings/ai-settings-tab.tsx` + hook `src/data/use-ai-settings.ts` (tab URL tetap `/settings/api`).
- **Editor dengan simpan eksplisit** (mis. Notes AI): cegah perubahan hilang dengan `useBlocker` (React Router; abaikan
  navigasi yang disengaja lewat ref `leavingRef`) + listener `beforeunload` selama ada perubahan/proses berjalan, dan
  dialog Simpan / Buang / Batal. Editor tanpa proses berat (Catatan) cukup **simpan otomatis** lewat `setItems` — antrian
  tulis `useCollection` tetap terkirim walau komponen sudah unmount.
- **Notes** (`features/notes/`): logika murni + test di `lib/notes-logic.ts` (urutan, pencarian, prompt ringkasan,
  progres list, berkas yang aman dihapus); baca isi dokumen lewat `lib/read-file-text.ts` (ekstraksi backend
  `GET /uploads/:id/metadata`, cadangan AI). Berkas audio/dokumen Notes AI dihapus dari storage saat diganti, perubahan
  dibuang, atau catatan dihapus (`removeUploads`).
- **Catatan Bebas: editor kaya & tulisan tangan** (chunk malas `components/free-note-editor.tsx`):
  - `kind`: `text` (default) = Tiptap 3 (`editor/rich-text-editor.tsx`: StarterKit, Highlight, TaskList, TableKit,
    Placeholder + node sendiri `inkBlock` & `image`), `handwriting` = halaman tulis tangan penuh (`ink/ink-canvas.tsx`).
  - Data: `doc` (JSON Tiptap) / `ink` (goresan) di kolom `extra`; `content` **selalu teks biasa** (isi editor tanpa
    format, atau teks hasil "Ubah ke teks") — dipakai pencarian, pratinjau, chatbot, RAG (backend melewati `doc`/`ink`).
    Catatan lama tanpa `doc` dibuka lewat `plainTextToDoc(content)`.
  - Tinta: koordinat logis lebar 1000 (`ink/ink-logic.ts`, logika murni + test), render SVG + perfect-freehand,
    warna = ID → token (`INK_COLOR_VAR`). Mode pena (otomatis saat stylus pertama dipakai): hanya stylus menulis, jari
    menggulir (`touch-action: none` + gulir manual). Tombol samping S Pen / ujung penghapus = penghapus.
  - Gambar di editor: hanya `uploadId` disimpan (link bertanda tangan dibuat saat tampil, `useAssetUrl`); gambar yang
    dihapus dari dokumen dibersihkan dari storage saat editor ditutup.
  - Pengenalan tulisan tangan: `useHandwritingRecognition` → PNG per halaman (`ink-to-image.ts`, maks. 10) →
    `useAi().generate(HANDWRITING_PROMPT, gambar)`.
  - Node view Tiptap interaktif: `ReactNodeViewRenderer(View, { stopEvent: () => true, ignoreMutation: () => true })`.
- **My Notebook** (`features/notes/notebook/`, tab ke-4 Notes Space, `?notebook=<id>`, `links.notebook(id)`):
  hook di `src/data/use-notebooks.ts`, API `notebooksApi`. Tata letak (keputusan user): **2 kolom mulai 1024 px** —
  kiri dua panel terpisah **Sumber** (atas) dan **Studio** = catatan notebook (bawah), masing-masing dengan scroll sendiri,
  dibuat **padat** (header 1 baris berikon; item 1 baris ± 34 px: ikon jenis · judul terpotong · status sumber / tanggal catatan;
  jumlah karakter terbaca tidak ditampilkan ke user; **klik sumber = buka dokumen aslinya**: berkas → modal pratinjau,
  web → tab baru, item LifeOS → menu asalnya (resource berkas/link langsung dibuka), hanya teks tempelan tampil di dialog; kolom grid wajib `min-w-0` agar judul panjang tidak melebarkan kolom)
  (`fill`, baris grid 11:9) dan tinggi area kerja `100svh − 8.75rem` + gulir otomatis ke judul notebook
  (`scroll-mt-[4.25rem]` = tepat di bawah header aplikasi, satu-satunya elemen sticky) sehingga area kerja memenuhi
  layar laptop 1366×768; chat bisa **diperbesar ke modal** (tombol ⤢; kolom chat menjadi penanda, isi prompt & lampiran
  dipegang induk lewat `useChatComposer` agar tidak hilang saat panel di-mount ulang); kanan **Chat lebar**
  dengan **kartu Ringkasan** di atas percakapan (`SummaryCard` di `notebook-panels.tsx`, bisa dilipat, terbuka otomatis
  saat chat kosong; saran pertanyaan hanya di kartu ini). Di bawah 1024 px: tab Chat | Sumber & Catatan (`useMediaQuery`)
  — **hanya satu tata letak yang dirender** (panel chat tidak boleh terpasang dua kali). Pertanyaan dikirim lewat satu
  `useNotebookAsker` (kotak chat & klik saran ringkasan). Lampiran chat = gambar **dan berkas** (PDF, DOCX, XLSX, teks):
  tombol 📎, **tempel (Ctrl+V)**, seret-lepas (`chat-attachments.tsx`: `useChatAttachments` mengunggah segera +
  `trackPendingUpload`, dokumen ditunggu sampai teksnya dibaca server lewat `waitForExtraction`, baki pratinjau, lampiran
  di gelembung pesan → modal pratinjau). Baris input: kotak prompt satu baris setinggi tombol (36 px, placeholder pendek,
  bantuan pintasan di baris kecil di bawahnya) + ruang kanan untuk tombol chatbot melayang. **Salin jawaban** (tombol &
  Ctrl+C) membuang nomor rujukan `[n]` (`stripCitations`). Tab Item LifeOS juga menampilkan **berkas LifeOS** (`GET
  /uploads`, kecuali upload notebook & berkas milik resource yang sudah terwakili resource-nya). Sitasi `[n]` tampil sebagai chip berisi
  cuplikan; "Sorot sumber" menandai sumbernya. Simpan jawaban/ringkasan → catatan notebook (Markdown); "Salin ke Catatan
  Bebas" mengubah Markdown menjadi dokumen Tiptap (`editor/markdown-to-doc.ts`, `@tiptap/markdown`, dimuat dinamis;
  extension editor bersama di `editor/note-extensions.ts`). Upload sumber dicatat `trackPendingUpload` sampai menjadi sumber.
- **Pratinjau berkas (modal, bersama semua fitur)**: `previewFile({ uploadId, name, mimeType })` dari
  `components/common/file-preview.tsx` (`FilePreviewHost` dipasang di `AppShell`). PDF (iframe) & gambar ditampilkan
  dari blob lokal (header `CSP: sandbox` berkas tidak menghalangi penampil PDF; CSP produksi `frame-src blob:`), SVG tidak
  dipratinjau; dokumen kantor (DOCX/XLSX/PPTX/ODT, …) tampil lewat **ONLYOFFICE mode lihat** bila server aktif, dan berkas
  yang bisa diedit (DOCX/XLSX/PPTX/PDF) punya tombol "Edit di ONLYOFFICE"; jenis lain menampilkan Unduh/Tab baru.
  Dipakai semua fitur: `openAttachment()` (lampiran Productivity/Planner/Notes AI, Resource Global, File Control) membuka
  berkas di modal ini — nama/jenis yang tidak dibawa lampiran dilengkapi dari `GET /uploads/:id/metadata`; web link tetap
  di tab baru. Tata letak (keputusan user 2026-10-14): bingkai tipis (padding 6 px, header satu baris 28 px: ikon · nama ·
  jenis · Unduh · Tab baru · tutup), modal `96svh` × maks. `min(96vw, 1400px)` agar dokumen tampil selebar mungkin.
- **Lampiran** (dipakai bersama **Productivity** dan **Planner** — ubah dengan hati-hati, kedua thread bergantung):
  `features/resources/` (`AttachmentForm`, `AttachmentTable`, `ResourceAiDialog`, `openAttachment()`,
  `mergeIntoGlobalResources()`, `noteAttachmentPath()`, `useFileSummarizer()`). Format data tunggal
  `AttachedResource` (`types/entities.ts`): jenis `link | file | note | existing`, file = `uploadId` (Asset backend),
  catatan = `noteId` `free-<id> | ai-<id> | list-<id>`, `addToGlobal` → disalin/di-tag ke Resource global dengan tag
  konteks. Opsi tambahan (default tidak mengubah perilaku lama): `AttachmentForm types={[...]}` membatasi jenis (jenis
  pertama = pilihan awal), `AddAttachmentButton label`. `AttachmentTable` membuka lampiran **catatan** di dalam aplikasi
  (Notes Space), bukan tab baru.
  - **Buat dokumen ONLYOFFICE** = pilihan Tipe UI `"office"` ("Buat Dokumen (ONLYOFFICE)", `OFFICE_ATTACHMENT_TYPE`) yang
    disimpan sebagai tipe `file` (state `fileSource`): `NewOfficeDocumentPicker` (4 jenis, judul = Nama Resource,
    `uploadContext`/`uploadOwnerId` sama dengan upload) → `acceptAsset` (pending + dibuang bila batal) → `editInOffice`
    membuka editor; `onClosed` → bila "Ringkas dengan AI" dicentang, `summarizer.summarizeUpload(uploadId)` (teks ekstraksi
    server). Tag, File Control, tanggal, deskripsi sama dengan berkas biasa. Berkas DOCX/XLSX/PPTX/PDF di form punya tombol
    "Edit di ONLYOFFICE". Form Resource Global sama (hanya untuk resource baru). Membuang dokumen yang dibuat di form
    (Batal, ganti Tipe, X/Esc dialog Tambah Resource lewat `closeGuardRef`) → `useOfficeDiscardConfirm().confirm(id)`:
    konfirmasi hanya bila dokumen sudah berisi (versi > 1); tombol "Hapus dokumen" → `confirm(id, { explicit: true })`
    (selalu konfirmasi).
  - **Ringkasan AI saat upload = opsional** (keputusan user): `AttachmentForm offerAiSummary` (form Project/Action/Task) dan
    form Resource menampilkan centang **"Ringkas dengan AI"** — default mati, pilihan terakhir diingat per browser
    (`resources/ai-summary-preference.ts`). AI hanya dipanggil bila dicentang (centang setelah upload → langsung diringkas);
    "Tambahkan"/"Simpan" tidak menunggu AI (bila masih berjalan, ringkasan dilewati → buat nanti lewat ikon robot); hasil
    untuk berkas yang sudah diganti diabaikan.
  - **Masukkan ke File Control = opt-in** (keputusan user 2026-10-14): centang **"Masukkan ke File Control"** di form
    Resource Global dan `AttachmentForm` (khusus berkas; default mati, diingat per browser) → `archivalStatus: "pending"`.
    Pada lampiran, centang ini memaksa `addToGlobal` (`AttachedResource.toFileControl` → `mergeIntoGlobalResources`), karena
    File Control bersumber dari Resource Global. Tanpa centang berkas **tidak** masuk File Control. Helper:
    `resources/file-control-intake.ts` (`isInFileControl`, `fileControlStatus`, preferensi). Detail: docs/FILE-CONTROL.md §1.
  - **Tag Resource Global** (`resources/resource-tags.ts` + test): dua macam di satu array `tags` — **tag konteks** otomatis
    (asal: `Global Resource`, `Project Basis`, `Project`, `Project Action`, `Area`, `Area Task`, `Agenda` = `CONTEXT_TAGS`;
    diberikan `contextTag` saat resource dibuat dari lampiran/penghapusan, tidak bisa diubah user) dan **tag bebas**
    (kategori isi, mis. Regulasi, SOP) yang diketik di form Resource lewat `<TagInput>` (`components/common/tag-input.tsx`:
    Enter/koma/+, Backspace, saran `datalist` dari tag yang sudah dipakai). `addFreeTag` mencegah duplikat tanpa peka huruf
    besar/kecil & mengikuti penulisan yang sudah ada. Pencarian tab Resources mencocokkan nama atau tag. Context tag baru →
    tambahkan ke `CONTEXT_TAGS`. **Form lampiran** (`AttachmentForm`: Project, Action/Task, Tandai Selesai, Agenda dasar &
    hasil) juga punya input **Tag** yang **selalu tampil** (Dasar Pelaksanaan, Hasil, lampiran Project/Action/Task); tag disimpan
    di `AttachedResource.tags` dan, bila lampiran masuk Resource Global (centang global, File Control, atau jenis Resource
    Global), **ditambahkan** (tanpa duplikat, tidak pernah menghapus) ke resource oleh `mergeIntoGlobalResources`. Semua form lampiran menawarkan "Ringkas dengan AI"
    (`offerAiSummary`). Handler tag wajib pembaruan fungsional (`setX(prev => …)`): menempel "a, b" memanggil `onAdd`
    beberapa kali dalam satu event.
  - **Upload yang belum tersimpan** dicatat di `lib/pending-uploads.ts` (localStorage per user: `uploadId`, instans
    halaman, detak) lewat `trackPendingUpload` / `untrackPendingUpload`: `AttachmentForm` (sebelum "Tambahkan"; diserahkan
    ke form pemakai saat ditambahkan), `useAttachmentEdits` (sampai form disimpan) dan form Resource. `usePendingUploadsJanitor`
    (di `AppShell`): saat tab di-reload/ditutup (`pagehide`) berkas dihapus dengan fetch `keepalive`; sapuan tiap menit di
    tab mana pun menghapus catatan halaman lain yang ditinggalkan atau tidak berdetak > 24 jam. Hanya berkas yang belum
    pernah tersimpan yang dicatat → sapuan tidak menyentuh berkas yang dipakai. Form lain yang menampung lampiran dari
    `AttachmentForm` (mis. agenda Planner) belum mencatat berkas sesi-nya → bila ingin ikut, panggil track saat
    ditambahkan dan untrack saat disimpan/dibuang.
  - **Hapus item / lampiran berkas (aturan seragam Planner & Productivity)**: berkas milik item (punya `uploadId`, bukan
    rujukan Resource Global) **ikut dihapus dari storage** agar tidak jadi sampah/duplikat. Konfirmasi lewat
    `<DeleteWithFilesDialog files shared onConfirm={(keepIds) => …}>` (default semua berkas dihapus; user bisa
    "Pertahankan" satu/lebih berkas → dipindah menjadi **Resource Global** dengan tag konteks), lalu eksekusi
    `useAttachmentCleanup().release(files, keepIds, { contextTag, exclude?, ownerId?, excludeResourceIds? })`. Berkas yang masih dirujuk
    Resource global, lampiran item lain, atau snapshot arsip PARA **tidak pernah dihapus** (`referenced(exclude)` → tampil
    "Dipakai"). Logika murni + test: `attachment-cleanup.ts` (`ownedFiles`, `referencedUploadIds`,
    `planAttachmentCleanup`). Upload yang batal: `AttachmentForm` menghapus berkas yang diunggah lalu dibatalkan/diganti/
    ditinggal sebelum "Tambahkan"; form yang menampung lampiran harus membuang berkas yang ditambahkan di sesi itu bila
    ditutup tanpa disimpan (`discardUploads`, pola di `planner/components/schedule-form.tsx`: picu saat dialog ditutup —
    jangan hanya mengandalkan unmount). Melepas lampiran berkas di form yang disimpan eksplisit → keputusan dicatat dan
    dieksekusi **setelah** disimpan (Batal = tidak ada yang terhapus).
  - **Productivity** menerapkan aturan yang sama (2026-10-11): hapus Project (lampiran project + action, tag "Project"),
    item Area Sub Area/Kegiatan/Sub Kegiatan (lampiran item + turunan + task, tag "Area") lewat
    `useParaActions().deleteAttachments/deleteProject(p, keepIds)/deleteActivity(a, keepIds)`; hapus Action/Task
    (`task-manager.tsx`, tag "Project Action" / "Area Task"). Form berlampiran (form Action/Task, `TaskQuickDialog`,
    form Project) memakai `useAttachmentEdits({ contextTag, ownerId })` (`features/productivity/use-attachment-edits.tsx`:
    `trackAdded`, `requestRemove(att, drop)`, `commit()` setelah simpan, `discard()`, `dialog`); dialog induk memasang
    `<DiscardScope register>` + `discardAll()` saat ditutup (`useDiscardScope`, `useDiscardOnClose`). Hapus **Resource
    Global** (tab Resources) ikut menghapus berkasnya bila tidak dipakai di tempat lain (`excludeResourceIds`); "Ganti
    File" di form Resource membuang upload sesi & berkas lama setelah disimpan (`replacedUploadId`). Mengarsipkan TIDAK
    menghapus berkas (snapshot arsip melindunginya); belum ada hapus arsip permanen di UI.
  - **Dialog form: `key` per sesi buka** — `useOpenSession(open)` (`hooks/use-retained.ts`) sebagai `key` konten form
    agar dibuka ulang selalu mulai dari props. Tanpa ini, isi dialog yang belum di-unmount (animasi tutup) memakai ulang
    state lama → lampiran yang berkasnya sudah dibuang saat Batal ikut tersimpan lagi.
  - Pemakai: Productivity — `resources` di Project/Activity/Action/Task (tag global "Project Action" / "Area Task"); Planner —
    **agenda** `Schedule.resources` = *Dasar Pelaksanaan* (opsional; upload context `schedule`) dan `Schedule.results` =
    *Hasil Agenda* (catatan Notes Space / upload / web link / resource global; context `schedule-result`), tag global
    "Agenda". Karena formatnya sama, lampiran agenda bisa dipindah/disalin ke Action apa adanya (rencana integrasi user).
- **Paket ikon bersama** (`src/lib/icons/`, untuk semua modul): `icon-registry.ts` = sumber tunggal ±140 ikon lucide
  berkategori (`APP_ICONS`, `ICON_CATEGORIES`, `getAppIcon(key)`, `resolveIconKey` + alias key lama, `searchIcons`);
  ikon disimpan di data sebagai **key string** (nama lucide kebab-case, mis. `"briefcase"`). UI: `<IconPicker value onChange
  aiSubject? aiContext? />` (tombol → dialog cari + kategori + "Sarankan dengan AI") dan `<AiIconButton subject onPick />`
  (AI langsung memasang ikon terbaik) di `components/common/icon-picker.tsx`. Saran AI: `useIconSuggestion(context)`
  (`icon-ai.ts`; prompt memuat seluruh key + label + kata kunci, jawaban JSON divalidasi ke registry). Menambah ikon =
  entri baru di registry (impor ikon dari `lucide-react`; jangan impor `Map` tanpa alias — menimpa `Map` bawaan).
- **Selesai terlambat (todo & task di Planner)**: centang mencatat `completedAt` (`completionPatch()` /
  `completionChangePatch()` di `src/lib/completion.ts`, bersama Planner & Productivity; batal centang menghapusnya). Item yang diselesaikan setelah tanggalnya tampil **tercentang/tercoret di
  bagian Terlambat pada tanggal penyelesaian**, sedangkan di tanggal asalnya tampil **tidak tercentang + "Selesai <tgl>"**
  (klik → buka tanggal itu). Data tanpa `completedAt` dianggap selesai di tanggalnya. Productivity mengisinya juga:
  centang di `task-manager.tsx` dan "Tandai Selesai" di `TaskQuickDialog` (`onSave` sudah membawa `completedAt`).
  Centang action/task (Productivity **dan** Planner Harian) membuka `CompleteTaskDialog` (tanggal, prioritas, bobot
  terisi otomatis — `completionDefaults`); batal centang langsung; "Ubah" tetap `TaskQuickDialog`.
- **Overview** (`features/overview/`, logika murni + test di `lib/overview-logic.ts` & `lib/notifications.ts`):
  kartu **Rutinitas Hari Ini** (warna Planner, bisa dicentang langsung), **Agenda Hari Ini** (status Akan datang /
  Berlangsung / Selesai dari `agendaStatus` + `useNow()` yang berdetak tiap menit, tombol Gabung, + agenda baru lewat
  `?agenda=new`), **To-do Hari Ini** (todo + task/action jatuh tempo hari ini), **Tugas Mendesak** (`urgentTasks`:
  semua yang terlambat + prioritas tinggi s.d. 7 hari ke depan / tanpa tenggat; yang jatuh tempo hari ini hanya di To-do
  Hari Ini), **Proyek Berjalan** (`runningProjects`: status bukan completed/on-hold/archived, deadline terdekat dulu).
  Centang task/action = dialog Tandai Selesai (sama dengan Planner). Angka di hero = jumlah penuh (bukan yang tampil).
  Lonceng notifikasi: agenda 3 hari, **Tugas Terlambat**, pengingat deadline project berjalan, **Baru Dibagikan**
  (`GET /shares/incoming` 7 hari terakhir). Label jam agenda berbahasa Indonesia: `agendaTimeLabel` ("Sepanjang hari").
  **Item dibuka sebagai modal di Overview** (keputusan user, tanpa pindah menu): task/action `?task=`, proyek `?project=`,
  todo `?todo=<id>|new` (`TodoDialog`, di-`key` `useOpenSession`); hanya tombol "Lihat Semua" / "+n lainnya di Planner"
  yang berpindah menu. Modal Project/Area = komponen bersama `ParaDetailDialogs`
  (`features/productivity/components/para-detail-dialogs.tsx`, dipasang di Productivity & Overview).
- **Kalender Harian** (`planner-calendar.tsx`): sel tinggi tetap 56–64 px (bukan persegi); penanda dari `summarizeDay()`
  (`planner-logic.ts`, sumber sama dengan daftar Harian) — titik penuh = ada yang belum selesai, lingkaran = semua
  selesai (todo/task/rutinitas yang sudah selesai tetap ditandai); hover tanggal → tooltip ringkasan agenda, rutinitas,
  to-do (maks. 4 per bagian).
- **Agenda (Planner)**: dibuka lewat `<ScheduleDialogs defaultDate?>` (`features/planner/components/schedule-dialogs.tsx`),
  dipasang di Overview, Planner Harian, dan Jadwal; dikendalikan URL: `?agenda=<id>` = **tampilan lihat** (link meeting
  bisa diklik/disalin, keterangan, dasar pelaksanaan, hasil agenda: ringkasan `outcome`, Notes AI terhubung otomatis
  lewat `AiNote.linkedScheduleId`, lampiran hasil), `?agenda=new` = agenda baru, `?edit=<id>` = form ubah (agenda bersama
  tanpa izin edit → tampilan lihat). Link dari modul lain: `links.schedule(id)` (lihat), `links.scheduleEdit(id)` (ubah),
  `links.newAiNoteForSchedule(id)` → `/notes/ai?note=new&schedule=<id>` (Notes AI baru terisi judul/tanggal/agenda).
  Form agenda: `schedule-form.tsx` (`ScheduleFormDialog`, `emptySchedule`, `MediaLink`).
  - **Agenda milik Project / item Area**: `Schedule.projectId` (Project atau Sub Area/Kegiatan/Sub Kegiatan, sama seperti
    `ProjectTask.projectId`; kolom `schedules.project_id`). `?agenda=new&agendaParent=<id>` membuat agenda baru milik item
    itu (di item bersama izin edit → `userId` pemilik item);
    tampilan lihat menampilkan "Bagian dari <Project/tingkat>" (`paraParentOf`, tautan ke project/area).
    `ScheduleDialogs` juga dipasang di halaman Productivity. Di `TaskManager` action/task dan agenda **satu daftar
    berurutan tanggal** dengan **tag** pembeda (`ITEM_TAG_STYLE`: Action/Task hijau, Agenda biru) + filter tag (Semua /
    Action|Task / Agenda) + tombol "+ Action|Task" & "+ Agenda" (di baris judul). **Header TaskManager sengaja ringkas**
    (judul 1 baris, progres satu baris `ProgressLine`, Dasar & turunan item area = satu baris geser horizontal, toolbar
    satu baris, tanpa footer) agar ruang daftar luas; di layar < md header ikut tergulir (tidak dibekukan) dan sidebar
    dialog Area dibatasi `max-h-[30svh]` — jangan menambah blok tinggi di header. Baris agenda & dialog hapusnya di
    `features/productivity/components/agenda-item.tsx` (status, rentang tanggal, dasar pelaksanaan, penanda Hasil).
    Agenda ikut diarsipkan (`related.schedules`) / dipulihkan / dihapus berantai bersama induknya, dan **ikut dibagikan**
    sebagai turunan project/item area (`share-graph.ts`; Notes AI terhubung ikut). Di Productivity agenda multi-hari tampil
    **sekali** dengan rentang tanggal (`scheduleDateRangeLabel`: "14 Okt – 16 Okt 2026"), juga di tampilan **Timeline**
    (`TimelineView`: dasar + action/task + agenda, klik agenda → tampilan lihat); di Planner tetap tampil per hari.
  - `scheduleTimeLabel`: jam kosong → "Tanpa jam" (bukan "??:??"); hanya jam selesai → "s.d. HH:mm".
  - **Agenda berulang** (`features/planner/lib/recurrence.ts` + test): setiap pertemuan = **agenda tersendiri** dengan
    `seriesId` + `recurrence` (`{ frequency: daily|weekly|monthly, interval, days?, until? | count? }`, maks. 200
    pertemuan) — agar tiap pertemuan punya Hasil, Notes AI, lampiran, dan berbagi sendiri; semua konsumen agenda (Harian,
    kalender, Overview, notifikasi, Productivity) bekerja tanpa logika khusus. Lampiran dasar disalin ke tiap pertemuan
    dengan ID unik (`cloneAttachments`, `<id>~<idPertemuan>`) sehingga berkas yang sama terlindung saat satu pertemuan
    dihapus. Simpan lewat `planSeriesSave(edited, original, members, scope)` → `{ upsert, remove }`; cakupan
    `this | following | all` dipilih user (`SeriesScopePicker`) saat mengubah/menghapus pertemuan; perubahan pola
    menghitung ulang tanggal dari jangkar & memasangkan pertemuan lama berurutan (hasil tetap); berkas hasil pertemuan
    yang terhapus karena pola berubah disimpan ke Resource Global. Tab Jadwal menggabungkan seri (`collapseSeries`, bisa
    dimatikan) dengan badge "i/n"; tampilan lihat menampilkan "Pertemuan i dari n" + navigasi sebelumnya/berikutnya. Seri bisa dibagikan sekaligus
    (`schedule_series`, lihat §8 Berbagi).
    Hapus agenda (tab Jadwal & Productivity `AgendaDeleteDialog`) lewat satu komponen `ScheduleDeleteDialog`
    (`planner/components/schedule-delete-dialog.tsx`: cakupan seri + pembersihan berkas); hapus berantai induk menghapus
    semua pertemuan miliknya. Daftar agenda Productivity menampilkan badge seri "i/n" & "Dijadwal ulang".
    **Berbagi seri**: tampilan lihat pertemuan seri punya "Bagikan Pertemuan" + "Bagikan Seri" (`ShareButton
    recordType="schedule_series" item={{ id: seriesId, share }} label`); tautan `links.series(id)` →
    `/planner/schedule?series=<id>` membuka pertemuan terdekat (dipakai Pengaturan → Berbagi).
  - **Jadwal ulang** (`lib/reschedule.ts` + test, `components/reschedule-dialog.tsx`): agenda biasa maupun satu
    pertemuan seri bisa dimajukan/dimundurkan dari tampilan lihat (tanggal + jam baru, tombol cepat ±1 hari/minggu, alasan,
    daftar agenda lain di tanggal tujuan + penanda bentrok jam). Tanggal/jam agenda diganti langsung (semua konsumen ikut);
    riwayat di `Schedule.reschedules` (entri pertama = jadwal semula, `applyReschedule` / `revertReschedule` /
    `originalSlot`). Tampilan: badge "Dijadwal ulang", kotak "Jadwal semula" + alasan + tombol **Kembalikan**; Harian di
    tanggal asal menampilkan baris samar "Dipindah ke …" (`movedAwayFrom`). Seri: pertemuan baru tidak mewarisi riwayat;
    ubah field bersama mempertahankan pemindahan; perubahan pola menghitung ulang tanggal & menghapus riwayat pertemuan yang
    tanggalnya berubah. Productivity (`agenda-item.tsx`) belum menampilkan badge jadwal ulang (data sudah tersedia).
  - **Banyak link meeting**: tetap kolom `media`, dipisah baris baru; baca **selalu** lewat `scheduleLinks(s)`, tulis
    `joinLinks()`, label `linkLabel()` (host). Input `<LinkListInput>` (`components/common/link-list-input.tsx`, reusable):
    Enter/+ menambah, Backspace di input kosong menghapus terakhir, tempel beberapa link sekaligus dipecah. Harian: tombol
    Gabung = link pertama + "+n".
  - **Pencarian** tab Jadwal, Rutinitas, Referensi (`lib/planner-search.ts` + test): per kata, tanpa huruf besar/kecil
    & aksen (`queryWords`/`matchesWords`). Agenda: judul, tipe, lokasi, keterangan, ringkasan hasil, link, nama hari &
    tanggal ("Selasa, 13 Oktober 2026"), pola berulang, "dijadwal ulang"; chip filter waktu menghitung hasil pencarian.
    Rutinitas: judul + pola frekuensi. Referensi: nama tipe + label ikon. Mengetik → halaman paginasi kembali ke 1.
  - Form agenda: mengubah Tanggal Mulai menggeser Tanggal Selesai (durasi tetap); konten form di-`key` per sesi buka &
    per agenda (`useOpenSession`).
- **Layout & Pengaturan** (keputusan user 2026-10-15): sidebar = modul Workspace + grup Sistem berisi **Tools** dan **Pengaturan**
  (`ModuleDef.sidebarGroup: "system"`, keduanya menu ber-sub-menu `SubmenuModuleItem`); Pengaturan
  (sub menu berurutan **Aplikasi, Manajemen User, Berbagi, AI** — urutan tab di `navigation.ts` sama dengan sub menu).
  **Profil Saya bukan bagian Pengaturan**: halaman sendiri `/profile` (`features/profile/`, modul `profile` dengan
  `hiddenInSidebar`, warna = Pengaturan) dibuka dari menu user kiri bawah. **Tema** hanya diatur dari tombol tema di header
  (dropdown Terang / Gelap / Ikuti sistem). Tombol sidebar saat diciutkan = 32 px: logo ikut 32 px, ikon modul memakai
  `COLLAPSIBLE_ITEM_CLASS` (tanpa padding) agar tepat di tengah. Logo aplikasi dibaca lewat `appLogoUrl(settings)`
  (`use-app-settings.ts`). Dialog yang punya kontrol di pojok kanan atas (mis. pencarian global) memakai
  `showCloseButton={false}` + `DialogClose` sendiri di baris kontrolnya agar tidak bertumpuk.
- **Tools → ONLYOFFICE** (`features/tools/`, detail: `docs/ONLYOFFICE.md` §3.3): modul `tools` ber-sub-menu di sidebar
  (`ModuleDef.sidebarSubmenu` → `SubmenuModuleItem`, juga dipakai Pengaturan; sub menu baru = tab baru di `navigation.ts`).
  Editor dibuka dari mana saja lewat `openOfficeEditor({ uploadId, name?, mode? })` (`OfficeEditorHost` di AppShell, editor
  `office-editor.tsx` dimuat malas; placeholder dibuat di luar React karena ONLYOFFICE menggantinya dengan iframe). Config
  dari `officeApi.config` dipakai **apa adanya** (hanya `events` ditambah) — opsi tampilan (tema, seluler) dikirim ke
  backend. Jenis berkas: `office-formats.ts` (+ test). **Keputusan user: Tools hanya halaman pengaturan/status**
  (`onlyoffice-settings.tsx`, `GET /office/diagnostics`), bukan daftar dokumen — ONLYOFFICE dipanggil dari fitur yang
  punya berkas: pratinjau (`previewFile`), tombol "Edit di ONLYOFFICE", dan tipe "Buat Dokumen (ONLYOFFICE)" di
  `AttachmentForm` & form Resource (lihat Lampiran). Menutup modal (X/Esc) = `requestClose` → `officeApi.forceSave` lalu tutup (simpan otomatis). Hook
  `useOfficeStatus`, `useOfficeDiagnostics`, `useOfficeVersions`, `useRestoreOfficeVersion`, `useOfficePreferences`,
  `useUpdateOfficePreferences`, `useOfficeFonts` (`data/use-office.ts`). Tahap 3 (`docs/ONLYOFFICE.md` §3.4): kartu
  **AI di editor** (sakelar) / **Templat dokumen** (unggah, lihat, sunting, hapus) / **Font** (`onlyoffice-cards.tsx`);
  `officeApi.config` mengirim `appOrigin` (alamat proxy AI untuk iframe editor). `NewOfficeDocumentPicker` = dokumen
  kosong + **Impor berkas** (unggah; DOC/PPT/… dikonversi lewat `createDocument({ templateId })`) + **Dari templat**
  (`useOfficeTemplates`) — tombol **Dari templat (n)** membuka `TemplatePickerDialog` (`template-browser.tsx`: cari, filter
  jenis, paginasi; `TemplateBrowser` juga dipakai kartu Templat Tools); helper `office-templates.ts` (+ test). **Per role** (`onlyoffice-settings.tsx`): user = AI,
  Templat, Cara memakai; admin + Status server & Font (unggah/hapus). **Konsep ↔ final** (`document-links.tsx`):
  `DocumentLinksButton` di header pratinjau & editor (popover + dialog unggah final → Resource Global tag asal "Dokumen
  Final" + File Control, tautkan berkas/konsep), `DocumentLinkBadge` + `useOfficeLinkBadges` di tabel lampiran & Resources.
  Editor selalu `mobile: false` (editor seluler Community hanya melihat).
- **Komponen umum**: `ConfirmDialog`, `SectionCard`, `RenameDialog`, `SearchableSelect`, `PaginationControl`+`paginate()`,
  `Markdown`, `PriorityBadge`, `PageLoader`, `DateRangeFilter`, `SearchInput`.
- **Paginasi daftar**: `usePagination(items, ukuranAwal)` (`hooks/use-pagination.ts`) → `{ pageItems, setPage,
  controlProps }`, sebarkan `controlProps` ke `<PaginationControl>`; halaman otomatis dijepit, panggil `setPage(1)` saat
  filter berubah.
- **Tombol aksi yang muncul saat hover**: `pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100
  pointer-fine:group-focus-within:opacity-100` — selalu terlihat di layar sentuh (HP/tablet), bukan `md:opacity-0`.
- **Dialog & animasi tutup**: `useRetained(itemProp)` / `useLatchedWhileOpen(open, value)` (nilai harus stabil).
- **Penjaga tutup dialog** (`components/common/dialog-close-guard.ts`, dipasang di `components/ui/dialog.tsx`): isi dialog
  memanggil `useDialogCloseGuard(() => boolean | Promise<boolean>)` untuk menahan X / Esc / klik luar dialog terdekat;
  tombol Batal milik form yang menutup lewat kode memakai `useGuardedClose()(onCancel)` (atau `DialogClose`). Dipakai
  form lampiran (dokumen ONLYOFFICE berisi).
- **Tanggal** (`src/lib/dates.ts`): YMD `"2026-10-08"` (schedule/routine/task.dueDate/ai_note) dan `toDateString()`
  `"Thu Oct 08 2026"` (todo.date, completion.date). YMD selalu dibaca dengan `parseLocalYMD`, **jangan**
  `new Date("YYYY-MM-DD")` (dibaca UTC → bergeser sehari di zona waktu barat UTC).
- **Link dari input user** (`href`): lewat `toExternalHref()` (`src/lib/urls.ts`) — menambah `https://` dan menolak
  skema selain http/https.
- **QR & scan**: QR lokal `qrcode.react` (`QrImage`), scan `CameraScanner`/`CameraScanDialog` (import dinamis).
- **Cetak**: `printElement(ref.current, judul, "label" | "a4")` (`features/file-control/lib/print.ts`).
- **Menu klik kanan**: shadcn `context-menu`, target dari `closest("[data-item-id]")`.
- **Pintasan keyboard**: `useEffectEvent` + satu `useEffect` listener `window` (abaikan input & dialog terbuka).

## 9. Glosarium Domain

- **PARA**: Projects (deadline, tasks/actions berbobot, timeline), Areas (tanggung jawab berkelanjutan; hierarki
  **Area → Sub Area → Kegiatan → Sub Kegiatan → Task**; ketiga tingkat = `para_activity` (tanpa `parentId` = Sub Area,
  tingkat dari rantai `parentId`, maks. 3, semuanya menyimpan `areaId`); task boleh melekat di tingkat mana pun;
  helper di `features/productivity/lib/para.ts` (`AREA_LEVELS`, `activityLevel`, `activityTreeIds`, …); area juga
  memuat project — Free Project = project tanpa area yang valid, bisa diambil ke area dari dialog Area atau dilepas;
  Project & item Area punya **Action/Task** dan **Agenda** (satu daftar & timeline bertag di detail item). Centang
  Action/Task membuka dialog
  **Tandai Selesai** (`complete-task-dialog.tsx`): Tanggal (hari ini bila kosong), Prioritas (medium bila kosong), Bobot
  action project (bila kosong: sisa 100 − bobot action lain) terisi otomatis — `completionDefaults`; batal centang
  langsung),
  Resources (link/file/note, tag konteks, ringkasan AI), Archives (snapshot `originalType` project/area/resource,
  `data`, `archivedAt` → bisa dipulihkan). Turunan ikut diarsipkan dalam **satu entri** di `related`
  (project → action-nya; area → project, sub area/kegiatan/sub kegiatan, dan semua task-nya) dan ikut dipulihkan —
  koleksi aktif tidak pernah berisi task yatim. Setiap arsip & pemulihan dicatat di `para_archive_log` (tab Archives →
  "Log Arsip & Pemulihan"). Logika murni: `features/productivity/lib/para-archive.ts` (+ test). Hapus project / item
  area juga menghapus turunan & task-nya (`useParaActions().deleteProject/deleteActivity`); hapus area diblokir
  selama masih berisi sub area/project.
- **Planner**: todo/task punya `completedAt` (selesai terlambat); tipe agenda punya warna + ikon dari paket ikon bersama.
  Rutinitas `daily|weekly|monthly|interval` (+ `intervalType`, `freezePeriods`); jadwal/agenda multi-hari
  (`startDate/endDate`, `isAllDay`, type, location, media = link meeting (bisa lebih dari satu), `description`,
  **berulang** (`seriesId` + `recurrence`, satu agenda per pertemuan), **jadwal ulang** (`reschedules`), **dasar pelaksanaan**
  `resources`, **hasil agenda** `outcome` + `results` + Notes AI terhubung); todo berprioritas; `completions` per rutinitas per tanggal
  (ID `${routineId}:${date}`).
- **File Control**: Klasifikasi, **JRA** (retensi aktif/inaktif + Musnah/Permanen), siklus Aktif → Inaktif →
  Perlu Tindak Lanjut → Statis/Musnah, wadah fisik bertingkat (gedung/rak/box/folder), peminjaman, penyusutan
  (berita acara), penataan ala file explorer, QR. Spesifikasi lengkap: `docs/FILE-CONTROL.md`.

## 10. Roadmap

Fondasi aplikasi sudah lengkap (backend, frontend semua modul, data layer, database terstruktur, keamanan, deployment
VPS, CI, dokumentasi). Berikutnya:
1. ~~AI multi-provider di backend~~ ✅ 2026-10-11. Lanjutan thread AI: perbaikan per fitur AI (chatbot, pencarian,
   Notes AI, ringkasan resource) di atas fondasi baru.
2. RAG: ~~tahap 1 ekstraksi + indeks pgvector~~ ✅ 2026-10-11 → **tahap 2** chatbot `POST /ai/chat` di backend memakai
   `AiIndexService.search` + riwayat chat **permanen** di PostgreSQL (keputusan user) → tahap 3 Redis (cache embedding
   pertanyaan, batas pemakaian harian, throttler). **My Notebook** (2026-10-14) sudah menerapkan chat RAG bersitasi +
   riwayat permanen per notebook; chatbot global tinggal memakai pola yang sama (`notebook-context.ts`) atas semua data.
   Lanjutan My Notebook: berbagi notebook, sumber item bersama, Studio lain (FAQ, panduan belajar, briefing, timeline,
   ringkasan audio).
3. (Opsional) tampilan riwayat audit arsip di UI (`GET /archive-audit` sudah tersedia).
4. **Dokumen dibuat di aplikasi** (jenis resource baru) dengan editor berbasis **ONLYOFFICE** — thread dimulai
   2026-10-15: menu **Tools → ONLYOFFICE**; riset, arsitektur, tahapan & to-do user di `docs/ONLYOFFICE.md`. Titik sambung: Resource Global (`para_resource`, berkas = `uploadId` Asset backend), centang
   "Masukkan ke File Control" (`file-control-intake.ts`), ekstraksi/indeks RAG berkas (DOCX/XLSX sudah didukung), CSP
   `nginx.conf` bila editor dimuat dari domain lain.

Pemeliharaan tech stack terjadwal (kajian & urutan: `docs/UPGRADE-PLAN.md` §1): KaTeX 0.19 (≥ 29 Okt 2026), Node 26
(≥ ± 25 Nov 2026); pantau TS 7, Prisma 8, ioredis 6.

## 11. Status

| Area | Status |
|---|---|
| Backend fondasi (auth cookie, users, settings, records, uploads, health, logging) | ✅ |
| Frontend: Settings, Overview (+ global search, focus mode, notifikasi, chatbot), Planner, Notes, Productivity, File Control | ✅ |
| Database terstruktur + audit kearsipan (baseline + migrasi bertahap) | ✅ |
| Keamanan (cookie httpOnly, CSP, sandbox berkas, upload streaming, rate limit) | ✅ |
| Deployment VPS (compose prod, Caddy HTTPS, batas memori, backup luar server terenkripsi + pemantauan) — diuji end-to-end lokal, termasuk pemulihan dari luar server | ✅ |
| Kualitas (Vitest, smoke test, CI GitHub Actions, Dependabot npm/docker/docker-compose/actions) | ✅ |
| Tech stack terbaru yang stabil (versi: `docs/ARCHITECTURE.md` §2.1) | ✅ |
| `npm audit` | ✅ via overrides; sisa yang dipantau (belum ada patch / tidak masuk produksi): backend `deepmerge-ts` (tunggu Prisma) & `sprintf-js` (via `mammoth`), frontend `braces` (via CLI `shadcn`, risiko diterima) — `docs/UPGRADE-PLAN.md` §3 |
| Panduan setup awal / menyalakan / mematikan + aturan port (`docs/SETUP.md` §1–§6) | ✅ ditulis & diverifikasi 2026-10-11 dengan menjalankan §3 langkah 0–6 di laptop user (Node 24.21.0 arm64; login, unit test, smoke test lulus; `strictPort` terbukti menolak instance kedua) — laptop sudah ter-setup |
| AI multi-provider di backend (Gemini/Claude/OpenAI, key terenkripsi, model bisa diganti user) | ✅ 2026-10-11 — unit + smoke + UI diuji; panggilan ke provider sungguhan menunggu API key user |
| RAG tahap 1: ekstraksi PDF/DOCX/XLSX/OCR + indeks pgvector (Gemini embedding) + pencarian gabungan | ✅ 2026-10-11 — unit + smoke (record → indeks → cari → hapus) + embedding Gemini sungguhan di akun admin dev |
| Perbaikan Planner (terlambat, filter & urutan agenda, gaya tipe agenda, hapus berantai, layar sentuh, agenda bisa diklik, paginasi) | ✅ 2026-10-11 — lint, typecheck, unit test, build, dan UI diuji di browser (desktop + mode HP) |
| Agenda: tampilan lihat (link meeting bisa diklik), dasar pelaksanaan (upload opsional), hasil agenda (ringkasan, Notes Space, upload, web link, Notes AI terhubung) | ✅ 2026-10-11 — lint, typecheck, unit test, build, UI diuji di browser (Overview, Harian, Jadwal, Notes AI); **integrasi ke Action Productivity: dikerjakan user/thread Productivity berikutnya** |
| Todo selesai terlambat (tetap tercoret di Terlambat, tanggal asal "Selesai <tgl>") + paket ikon bersama (±140 ikon, pemilih + saran AI) | ✅ 2026-10-11 — unit test, typecheck, lint, UI diuji di browser; saran AI diuji dengan provider sungguhan akun admin dev |
| Hapus agenda/lampiran → berkas ikut dihapus (pilih pertahankan → Resource Global), upload batal dibersihkan, kalender Harian ringkas + hover | ✅ 2026-10-11 — unit test, typecheck, lint, UI + storage diuji (404 setelah dihapus, Resource Global terbentuk); Productivity menerapkan aturan yang sama + `completedAt` (2026-10-11, diuji UI + storage); upload yang belum tersimpan dibersihkan juga saat reload/tutup tab + ringkasan AI opsional (diuji: reload → 404, sapuan cadangan, berkas tersimpan aman, AI tidak dipanggil tanpa centang); Action → dialog Tandai Selesai + Agenda (dengan Hasil) di Project/Area, ikut arsip/hapus/berbagi (diuji UI + skrip API berbagi + smoke) |
| Agenda berulang (seri, satu agenda per pertemuan; ubah/hapus dengan cakupan ini / ini & berikutnya / semua) + banyak link meeting | ✅ 2026-10-14 — unit test (pola, rencana seri, link), lint, typecheck, build, UI diuji di browser (buat seri 10 pertemuan, ubah semua, ubah pola dari pertemuan tengah, hapus "ini & berikutnya", tab Jadwal/Harian) |
| Berbagi seri agenda sekaligus (`schedule_series`) + hapus agenda berseri dari Productivity dengan cakupan | ✅ 2026-10-14 — unit backend & frontend, smoke (+6), skrip API dua akun (11/11), UI diuji (Bagikan Seri, hapus "ini & berikutnya" dari project) |
| Jadwal ulang agenda (majukan/mundurkan, alasan, cek bentrok, kembalikan; juga satu pertemuan seri) | ✅ 2026-10-14 — unit test, lint, typecheck, build, UI diuji di browser (pindah kuliah 27→29 Okt dengan bentrok terdeteksi, baris "Dipindah ke" di tanggal asal, kembalikan) |
| Pencarian tab Jadwal, Rutinitas, Referensi (per kata, termasuk hari/tanggal, link, pola) | ✅ 2026-10-15 — unit test, lint, typecheck, build, UI diuji di browser |
| Catatan Bebas: editor teks kaya (Tiptap) + tulisan tangan stylus (halaman penuh & blok Coretan) + ubah ke teks (AI) | ✅ 2026-10-11 — unit test, build, smoke, UI diuji di browser (mouse + event pena sintetis + mode HP), pengenalan AI diuji dengan Gemini sungguhan; **uji S Pen di perangkat Android user belum** |
| Perbaikan Notes Space (simpan otomatis Catatan, cegah perubahan hilang di Notes AI, cari/sematkan/paginasi, dokumen dibaca backend, prompt AI, List urut ulang & progres) | ✅ 2026-10-11 — lint, typecheck, unit test, build, dan UI diuji di browser (desktop + mode HP); ringkasan/transkrip AI sungguhan belum diuji (butuh API key) |
| **My Notebook** (RAG ala NotebookLM: sumber berkas/item LifeOS/teks/web, chat hibrida bersitasi + riwayat permanen, ringkasan Studio, catatan notebook → Catatan Bebas) + urutan tab Notes (Catatan Bebas, List Bebas, Notes AI, My Notebook) | ✅ 2026-10-14 — unit backend (notebook-context, web-source: 19) & frontend, smoke (+20), lint, typecheck, build, UI diuji di browser (desktop + HP); chat & ringkasan diuji dengan Gemini sungguhan (akun admin dev; Gemini sempat 503 kelebihan beban → jalur error teruji) |
| Isolasi data per user (admin tanpa akses data user lain, role viewer dihapus, statistik admin) + **berbagi** item (Project, Area, Resource/arsip, Catatan, Notes AI, List, Agenda; izin Lihat/Komentar/Edit; turunan & berkas ikut; komentar; Pengaturan → Berbagi; File Control tab Dibagikan) | ✅ 2026-10-11 — unit (backend share-graph + frontend sharing), smoke ±45 skenario baru, lint, typecheck, build, UI diuji di browser (bagikan Edit → kolaborator menambah action & komentar; bagikan Lihat → baca-saja; statistik admin). **Belum**: RAG/chatbot mencari item bersama, notifikasi berbagi, tautan publik |
| File Control: uji menyeluruh + perbaikan aturan penyusutan, peminjaman, referensi, penataan & tampilan detail/kartu (11 temuan prioritas tinggi & sedang) | ✅ 2026-10-14 — unit test (`archive.test.ts` +6), lint, typecheck, build, UI diuji di browser dengan data `[UJI]`. Lanjutan: konfirmasi Restore, BA auto-dispose (tanggal lokal + pelaksana), Penataan khusus fisik, Lihat Dokumen seragam, pratinjau cetak layar penuh, modal pratinjau berkas lebih besar — diuji di browser |
| Pengaturan & Layout: Profil Saya keluar dari Pengaturan (`/profile`), urutan sub menu, satu pengatur tema, sidebar ciut simetris, tombol tutup pencarian global, form tanpa sinkronisasi `useEffect`, logo lewat endpoint ber-cache | ✅ 2026-10-15 — unit backend & frontend, smoke (+7 skenario logo), lint, typecheck, build, UI diuji di browser (desktop + HP) |
| Perbaikan Overview (proyek berjalan, tugas mendesak + terlambat, to-do & rutinitas hari ini bisa dicentang, status & Gabung agenda, label Indonesia, notifikasi tugas terlambat & baru dibagikan) | ✅ 2026-10-15 — unit test (`overview-logic.test.ts`: 9), lint, typecheck, build, UI diuji di browser (desktop + HP; centang rutinitas/todo/task, tambah agenda, popover notifikasi) |
| Integrasi ONLYOFFICE (menu Tools → ONLYOFFICE) | 🚧 riset + keputusan user (`docs/ONLYOFFICE.md` §4.2) + **tahap 0 infra dev ✅** + **tahap 1 backend ✅** + **tahap 2 frontend ✅ 2026-10-15** (Tools = pengaturan/status; buka/edit dari pratinjau semua fitur; "Buat dokumen" di form lampiran & Resource; simpan otomatis saat modal ditutup; riwayat versi; unit backend 19 + frontend 4, smoke +29, UI diuji desktop & HP); **tahap 3 ✅ 2026-10-16** (revisi user: AI satu pintu = tab AI bawaan ONLYOFFICE memakai provider & key Pengaturan → AI lewat proxy backend; templat diunggah di Tools; impor berkas saat Buat Dokumen; unit + smoke lulus, UI diuji termasuk Summarization dengan Gemini sungguhan) + **lanjutan ✅** (Tools per role, font diunggah admin + pemantau, tautan konsep ↔ dokumen final) + **tahap 4 produksi ✅ 2026-10-16** (compose profile `office`, Caddy `/office/`, smoke penuh lewat stack produksi lokal); berikutnya agen SRIKANDI & agen pembuat dokumen di Tools (teknologi dibahas user) |
| Push ke GitHub (`origin/main`) | Hanya atas permintaan user; setelah push user mengecek CI |
| VPS & domain | ⏳ **belum dibeli** — saat siap ikuti docs/DEPLOYMENT.md §0 (memilih VPS, DNS, isi .env, checklist) |

Isu terbuka: belum ada (API key AI plaintext di browser ditutup 2026-10-11).

## 12. Log Keputusan

- 2026-10-08 — Stack & arah disetujui user: TypeScript + router + TanStack Query; shadcn colorful; AI multi-provider;
  pgvector untuk vector search, Redis untuk queue/cache/sesi chat; repo `zonakerja/lifeos`.
- 2026-10-08 — Prisma tanpa engine Rust + adapter pg dan `@node-rs/argon2` (Windows ARM64); SeaweedFS sebagai S3
  (image MinIO tidak tersedia).
- 2026-10-08 — Database: 20 tabel terstruktur + kolom `extra` jsonb (lossless), snake_case, timestamptz; array
  disimpan jsonb (Prisma tidak mendukung list nullable); audit kearsipan; satu migrasi baseline.
- 2026-10-08 — Bundle: rute, halaman login, markdown/KaTeX, dan html5-qrcode dimuat malas (chunk utama ± 360 kB).
- 2026-10-09 — Arsitektur siap VPS: refresh token di cookie httpOnly (tidak ada sesi di localStorage), sandbox berkas
  upload, upload streaming, log terstruktur, health live/ready, compose produksi terpisah (Caddy, tanpa port infra
  terbuka, Redis berpassword, image di-pin, backup harian), unit test + CI. Aplikasi berdiri sendiri (tanpa impor/
  kompatibilitas aplikasi lain).
- 2026-10-09 — Kebijakan dependensi: Dependabot hanya membuat PR minor/patch; update **major** dikerjakan terencana
  (baca changelog/migration guide, satu keluarga paket per commit, semua test). CI dipin ke `ubuntu-24.04`.
- 2026-10-09 — Pilihan user: **TypeScript 6.0 di backend & frontend** (TS 7 belum didukung typescript-eslint &
  @nestjs/swagger), **Redis 8**. Backend NestJS tetap CommonJS; Prisma Client di-generate ke `src/generated/prisma`.
- 2026-10-09 — Advisory di dependensi transitif ditutup lewat npm `overrides` (daftar: `docs/ARCHITECTURE.md` §2.3).
- 2026-10-10 — Dokumentasi tanpa duplikasi: `docs/ARCHITECTURE.md` = fondasi & **satu-satunya tempat versi** tech
  stack (§2); `docs/UPGRADE-PLAN.md` = kajian item yang belum di-upgrade + audit yang dipantau. Dokumen lain tidak
  menulis nomor versi, cukup merujuk.
- 2026-10-10 — PostgreSQL 18 (`pgvector/pgvector:0.8.7-pg18`, Debian 12): volume bernomor major di-mount ke
  `/var/lib/postgresql`; upgrade major = dump/restore ke volume baru (docs/DEPLOYMENT.md §8, docs/SETUP.md §7.1).
  Dependabot juga memantau `docker-compose*.yml` (major PostgreSQL ada di sufiks tag → tidak pernah diubah otomatis).
  Seed dev dijalankan `tsx`; postinstall esbuild sengaja tidak diizinkan di `allowScripts`.
- 2026-10-10 — Data development hanya dummy: boleh direset kapan saja tanpa backup (lihat §7).
- 2026-10-10 — Infrastruktur produksi diperkuat (disetujui user): backup dengan image sendiri (rclone 1.75) →
  berkas lewat API S3 (bukan `tar` volume yang sedang berjalan), salinan luar server S3-compatible (R2/B2) terenkripsi
  rclone crypt, heartbeat healthchecks.io + uptime monitor; batas memori per container & tuning PostgreSQL untuk VPS
  4 GB (override lewat env untuk 2 GB); panduan pengamanan VPS. SeaweedFS `-volume.max=0` (default 8 volume ⇒
  upload gagal setelah ± 7–8 GB). Dependabot: abaikan nginx minor ganjil (mainline) & KaTeX ≥ 0.19 (dijadwalkan).
- 2026-10-10 — LifeOS satu-satunya project di laptop user → infra dev memakai **port default** (PostgreSQL 5432,
  Redis 6379, SeaweedFS S3 8333 / filer 8888; backend 4000, Vite 5173). Laptop dikembalikan ke kondisi "belum pernah
  dijalankan": tanpa container/volume/image Docker, tanpa `node_modules`, `dist`, Prisma Client hasil generate, dan
  `backend/.env` — langkah menjalankan dari awal (termasuk lazydocker) dibuat di thread berikutnya. Backend tetap port
  4000 (konvensi API; default NestJS 3000 tidak dipakai).
- 2026-10-10 — Permintaan user: setiap jawaban yang mengerjakan task diakhiri laporan **Status lingkungan** (§2a), dan
  user bisa meminta "matikan semua" sebelum menutup laptop (prosedur §2a, data tetap aman).
- 2026-10-10 — Panduan operasional user di `docs/SETUP.md` §1–§6 (setup awal sekali, menyalakan, mematikan, reset,
  cek status; PowerShell + WSL + lazydocker). **Aturan port**: port tetap sama di semua terminal & thread, satu
  komponen = satu proses (pakai yang sudah berjalan), Vite `strictPort: true` agar tidak pindah ke 5174. Bagian lama
  SETUP.md bergeser nomor (infra §7, upgrade PostgreSQL dev §7.1, alur database §10).
- 2026-10-11 — Panduan Node bercabang Windows ARM64 (`nvm ... arm64`) / Windows x64 (default nvm). Node x64 yang
  sempat terpasang di laptop (24.21.0, emulasi) dihapus atas permintaan user, lalu dipasang Node **24.21.0 arm64**
(`nvm install 24 arm64` + `nvm use 24.21.0 arm64`) dan diaktifkan; 24.18.0 dihapus. Setup awal SETUP.md §3 dijalankan
  penuh di laptop (dev server dijalankan di tab Terminal panel, bukan preview Claude — atas pilihan user).
- 2026-10-11 — Thread perbaikan **File Control** dimulai. Perbaikan 1: menu File Control gagal dimuat (504 Outdated
  Optimize Dep untuk `qrcode.react`) → Vite `optimizeDeps.entries` memindai seluruh `src/` saat start (dev saja).
- 2026-10-11 — Thread perbaikan **Productivity** (PARA: Overview, Projects, Areas, Resources, Archives) dimulai.
  Perbaikan 1 (arsip): sebelumnya mengarsipkan area meninggalkan kegiatan & task-nya, dan action project yang
  diarsipkan tetap muncul di Planner/beranda/chatbot. Kini turunan dibundel di `ParaArchive.related` (disimpan di
  kolom `extra`, tanpa migrasi), area = satu entri arsip (bukan lagi entri terpisah per project), pemulihan
  mengembalikan semuanya; daftar arsip menampilkan "Termasuk: …". Arsip lama tanpa `related` tetap bisa dipulihkan.
  Perbaikan 2 (hapus): hapus project/kegiatan kini ikut menghapus action/task-nya (sebelumnya tertinggal & tetap
  muncul di Planner/beranda); konfirmasi menyebut jumlah yang ikut terhapus dan menyarankan Arsipkan.
  Perbaikan 3: tombol Close modal Project/Area/Action tidak berfungsi — dua setter URL (`project`/`area` + `task`)
  saling menimpa → `useSetSearchParams` (satu navigasi).
  Enhancement 4 (revisi user): hierarki Area **Area → Sub Area → Kegiatan → Sub Kegiatan → Task** — "Kegiatan" lama
  menjadi **Sub Area**, lalu ditambah Kegiatan & Sub Kegiatan (istilah mengikuti perencanaan pemerintah Program →
  Kegiatan → Sub Kegiatan). Model: `para_activity.parentId` (kolom `parent_id`, migrasi
  `20261011120000_activity_parent`), bukan tabel baru — semua konsumen yang mencari induk task lewat koleksi activity
  (Planner, beranda, kalender, chatbot, arsip area) otomatis ikut. Hapus berantai ke seluruh turunan & task; konfirmasi
  dan ringkasan arsip menghitung per tingkat. Identifier kode tetap `Activity` / `para_activity`.
  Enhancement 5: dialog Area bisa "Ambil dari Free Project" dan "Lepas dari area".
  Enhancement 6: expand/collapse pohon Sub Area & Kegiatan di sidebar dialog Area (default terbuka, tombol buka/tutup
  semua, jumlah turunan tampil saat tertutup; memilih item lewat kartu/breadcrumb/form otomatis membuka induknya).
  State hanya di memori (kembali terbuka saat dialog dibuka ulang).
  Enhancement 7 (tab Archives): panel filter ringkas (lebar 176 px, jumlah per jenis); kartu arsip informatif (waktu +
  relatif, pelaku, area asal/periode project, tipe/host/tag resource, progres task, "Lihat isi" = project, struktur
  area, daftar task); tampilan **Log Arsip & Pemulihan** dari tabel baru `para_archive_logs` (record type
  `para_archive_log`, migrasi `20261011130000_para_archive_log`) — ditulis `useParaActions` saat arsip/pulihkan,
  pemilik log = pemilik arsip. Tidak memakai `archive_audit_logs` (khusus kearsipan File Control). Snapshot arsip kini
  membawa `userId` pemilik item (sebelumnya arsip data user lain oleh super admin tercatat milik admin).
- 2026-10-11 — Thread **fitur AI** dimulai. Pemicu: Gemini menolak `gemini-2.5-flash` ("no longer available to new
  users"). Keputusan (jalur fondasi, disetujui user): AI dipindah ke **backend** (`src/ai/`) dengan SDK resmi
  `@google/genai`, `@anthropic-ai/sdk`, `openai`; API key per user per provider di tabel `ai_credentials` terenkripsi
  AES-256-GCM (`AI_ENCRYPTION_KEY`), kolom `users.api_key` dihapus (key lama tidak dimigrasi — user memasukkan ulang),
  provider aktif `users.ai_provider`. Model default `gemini-3.8-flash`, `claude-opus-5-5`, `gpt-6.1-sol`, tetapi model
  **bisa diganti user** di Pengaturan → AI agar penghentian model berikutnya tidak butuh rilis. Gemini memakai
  `generateContent` (masih didukung penuh, stateless) — bukan Interactions API yang secara default menyimpan interaksi
  di server Google. Saran model Gemini juga memuat `gemini-3.1-pro-preview` (Pro hanya ada versi preview; 2.5 Pro
  tertutup untuk pengguna baru) dan `gemini-3.5-flash-lite`; default tetap Flash stabil. Audio hanya Gemini.
  Atas permintaan user ditambah **cadangan otomatis** (sakelar, default menyala): satu provider aktif untuk semua fitur,
  provider lain yang punya key otomatis dipakai bila provider aktif kehabisan kuota / tidak terjangkau / tidak
  mendukung lampiran; key ditolak & model tidak tersedia sengaja tidak dialihkan agar terlihat dan diperbaiki. CSP `connect-src` tidak lagi mengizinkan Google. Prompt fitur-fitur AI belum
  diubah (dikerjakan per fitur di thread ini).
- 2026-10-11 — RAG (keputusan user): embedding **Gemini** (`gemini-embedding-2`, 768 dimensi, stabil, auto-normalisasi),
  riwayat chat **permanen** (tahap 2), mulai tahap 1. Vektor di pgvector (bukan Redis: data, hak akses, dan backup tetap
  satu tempat). Ditambah sakelar per user "Indeks pengetahuan" (privasi: mati = indeks dihapus) dan indeks tanpa
  embedding bila user tidak punya key Gemini (pencarian kata tetap jalan, tidak ada data keluar). Ekstraktor pure JS:
  `unpdf`, `mammoth`, `read-excel-file` (`exceljs` ditolak: tidak dirawat sejak 2023); OCR lewat Gemini, bukan OCR
  lokal (berat untuk VPS). HNSW = indeks parsial di migrasi SQL agar cek drift Prisma tetap bersih.
- 2026-10-11 — Thread AI **dijeda** atas permintaan user setelah RAG tahap 1 (di-commit). Thread berikutnya: perbaikan
  fitur **Planner** dan **Notes Space**; setelah itu lanjut RAG tahap 2 (chatbot backend + riwayat chat permanen).

- 2026-10-11 — Thread perbaikan **Planner** dimulai (tanpa perubahan backend/migrasi). Perbaikan:
  1. Tab Harian: bagian **Terlambat** (hanya saat melihat hari ini) berisi todo belum selesai dari tanggal sebelumnya +
     task/action yang lewat tenggat; todo bisa dipindahkan ke hari ini (satu per satu / sekaligus); task/action hanya
     diubah lewat dialognya (tenggat proyek tidak dipindah otomatis).
  2. Tab Jadwal: filter **Akan Datang** (default; agenda yang sedang berlangsung termasuk) / Sudah Lewat (terbaru dulu) /
     Semua di `?sub=`, urut tanggal lalu jam, badge "Hari ini"/"Berlangsung"/"Selesai".
  3. Tipe agenda punya **warna & ikon** (`AgendaType.color/icon`, tersimpan di `extra`); tipe tanpa pengaturan memakai
     default bawaan atau warna stabil dari nama (`lib/schedule-style.ts`). Ganti nama tipe ikut memperbarui agenda
     pemakainya (milik user yang sama); hapus tipe tidak mengubah agenda (label tetap).
  4. Hapus rutinitas ikut menghapus riwayat centang (`completion`)-nya; konfirmasi menyebut jumlahnya dan menyarankan Arsipkan.
  5. Tombol aksi hover (riwayat freeze, daftar agenda, todo, referensi) selalu terlihat di layar sentuh (`pointer-fine:`).
  6. Agenda di tab Harian bisa diklik → dialog ubah agenda (`?agenda=`, `ScheduleFormDialog` diekspor dari schedule-tab).
  Ditambah **paginasi** di Jadwal (10), Rutinitas (10), Referensi (12) lewat hook baru `usePagination`. Logika murni +
  test di `features/planner/lib/planner-logic.test.ts`.
  Pengecekan ulang: `routine.startDate` kini dibaca sebagai tanggal lokal (`new Date("YYYY-MM-DD")` = UTC → di zona barat
  UTC rutinitas mulai sehari lebih awal); link media agenda lewat `toExternalHref` (`lib/urls.ts`: tanpa skema →
  https, selain http/https → teks biasa); jam selesai < jam mulai ditolak; agenda tanpa lokasi & link tidak lagi
  berlabel "Online"; cek nama tipe agenda ganda dibatasi per pemilik.
  Lanjutan (disetujui user): rutinitas bulanan tanggal 29–31 dan interval bulanan/tahunan dari tanggal itu (termasuk
  29 Feb) **jatuh ke hari terakhir** bulan yang lebih pendek (`dayInMonth`, keterangan tampil di form); rutinitas tidak
  bisa dicentang/di-log untuk tanggal mendatang dan "Dilakukan Pada" tidak boleh di masa depan; dialog todo punya field
  **tanggal** (todo bisa dipindah hari); freeze yang beririsan diberi **peringatan** (tetap boleh disimpan,
  `overlappingFreezes`); tab Harian punya tombol **Tambah agenda** untuk tanggal yang dilihat (`?agenda=new`).
- 2026-10-11 — Thread perbaikan **Notes Space** (tanpa perubahan backend/migrasi; field baru `pinned` tersimpan di `extra`):
  1. Tombol aksi kartu/item (hapus, sematkan, ubah, urutkan) selalu terlihat di layar sentuh (`pointer-fine:`).
  2. **Catatan disimpan otomatis** setiap perubahan (tetap tersimpan walau pindah menu/tab); catatan baru baru tersimpan
     setelah ada isinya; catatan yang dikosongkan dibuang saat ditutup. **Notes AI** tetap simpan eksplisit, tetapi keluar
     (tombol Kembali, pindah tab/menu, back browser, tutup tab) saat ada perubahan / upload / proses / rekaman berjalan
     memunculkan dialog Simpan / Buang / Batal (`useBlocker` + `beforeunload`).
  3. Mikrofon dimatikan saat editor ditutup ketika masih merekam.
  4. Gaya ringkasan "Lainnya" diganti **Kustom** dengan instruksi yang ditulis user.
  5. Hasil pencarian global & link chatbot `app:ainote|freenote:<id>` membuka catatannya langsung (`?note=<id>`).
  6. Viewer tidak bisa mengetik judul/tanggal/agenda Notes AI.
  7. Catatan & Notes AI: pencarian, **sematkan** (pin), urutan terbaru (Catatan: terakhir diubah; Notes AI: tanggal),
     paginasi (12 / 10); List: pencarian & paginasi (9).
  8. Notes AI: tanggal diformat, badge menampilkan nama + tanggal agenda (atau "Agenda sudah dihapus"), pilihan agenda
     dengan pencarian (terbaru dulu) + tombol Buka agenda, label UI berbahasa Indonesia.
  9. Dokumen Notes AI dibaca **ekstraksi backend** (PDF, DOCX, XLSX, teks; gambar/PDF scan lewat OCR Gemini) — tanpa kuota
     AI; bila tidak menghasilkan teks dan formatnya bisa dibaca model, AI user menyalin isinya (cadangan). Teks dibatasi
     200.000 karakter. Berkas yang diganti / perubahan yang dibuang / catatan yang dihapus ikut dihapus dari storage.
  10. Prompt ringkasan disusun ulang (instruksi per gaya, info judul/tanggal/agenda, sumber dalam tag, larangan
      mengarang, Bahasa Indonesia); prompt transkrip memberi label pembicara.
  11. List: urutkan item (naik/turun), progres `selesai/total` + bar, tombol "Hapus yang selesai" (dengan konfirmasi).
  Ditambah status memuat (tidak lagi menampilkan "Belum ada" sebelum data datang).
- 2026-10-11 — **Enhancement Catatan Bebas** (riset → keputusan user): editor **Tiptap 3** (MIT; dipilih atas Lexical yang
  butuh UI dibuat sendiri dan BlockNote yang kaku / MPL) + tulisan tangan **perfect-freehand** + Pointer Events (bukan
  tldraw: lisensi produksi berbayar/watermark; bukan Excalidraw: berat & gaya berbeda). Pengenalan tulisan tangan lewat
  AI backend (Web Handwriting Recognition API tidak lintas browser). Perangkat user: **Android + S Pen** (uji perangkat
  setelah aplikasi siap). Saat membuat catatan user memilih **Ketik** atau **Tulis tangan** (halaman penuh, kertas
  bergaris/kotak/titik/polos, tambah halaman); catatan ketik juga bisa menyisipkan **blok Coretan**. Tanpa migrasi
  (`kind`/`doc`/`ink` di `extra`); backend hanya mengabaikan `doc`/`ink`/`kind`/`pinned` di indeks RAG. Fitur editor:
  judul 1–3, tebal/miring/garis bawah/coret/stabilo/kode, link (http/https), daftar, checklist, tabel, kutipan, blok
  kode, garis, gambar (upload), pintasan Markdown, undo/redo. Tinta: pena bertekanan, stabilo, penghapus goresan,
  6 warna pena / 4 stabilo, 3 ketebalan, undo/redo, hapus semua, tinggi bertambah otomatis (maks. 50 halaman), peringatan
  bila data > 3,5 MB. Belum: menu "/" (slash command), zoom kanvas, seleksi/pindah goresan.
- 2026-10-11 — Advisory baru `braces` ≤ 3.0.3 (GHSA-vfj7-8cjw-p6xm, high) di frontend lewat CLI `shadcn`: belum ada versi
  perbaikan sehingga override tidak mungkin. Keputusan user: **dokumentasikan & pantau** (tidak masuk produksi; tidak
  melepas paket `shadcn` karena `index.css` memakai `shadcn/tailwind.css`). Jangan `npm audit fix --force`
  (menurunkan shadcn ke 1.0). Saran: aktifkan Dependabot security updates di pengaturan repo GitHub.

- 2026-10-11 — **Agenda: lihat, dasar pelaksanaan, hasil** (thread Planner; bersinggungan dengan Productivity & Notes —
  tanpa perubahan backend/migrasi, field baru di `extra`):
  - Membuka agenda dari Overview, Harian, Jadwal, notifikasi, pencarian global, chatbot, dan Notes AI kini menampilkan
    **tampilan lihat** (bukan form ubah); link meeting bisa langsung diklik (juga tombol **Gabung** di baris Harian).
  - **Dasar Pelaksanaan** (opsional) di form agenda: lampiran format PARA (`Schedule.resources`) — upload berkas, web link,
    catatan, atau resource global. Keputusan user: nanti diintegrasikan ke Productivity **bersama Action**; karena formatnya
    sama dengan `ProjectTask.resources`, integrasi cukup menyalin/merujuk array lampiran.
  - **Hasil Agenda** di tampilan lihat (langsung tersimpan, tanpa membuka form): ringkasan `outcome`, lampiran `results`
    (catatan Notes Space / upload / web link / resource global), daftar Notes AI yang memilih agenda ini, tombol
    **Buat Notes AI** (`?note=new&schedule=<id>` → judul, tanggal, agenda terisi).
  - Komponen lampiran bersama diperluas tanpa mengubah perilaku lama: `AttachmentForm types`, `AddAttachmentButton label`,
    lampiran catatan dibuka di Notes Space (sebelumnya hanya toast "Tidak ada link/file").
  - Belum: menghapus agenda/lampiran tidak menghapus berkasnya dari storage (sama seperti lampiran Productivity).

- 2026-10-11 — **Todo terlambat & paket ikon** (thread Planner, tanpa perubahan backend; field baru di `extra`):
  - Bug: todo terlambat yang dicentang hari ini kembali ke tanggal asal & tampil tidak tercentang. Kini centang mencatat
    `completedAt`; item tetap tampil tercentang/tercoret di bagian Terlambat pada hari diselesaikan (header menghitung
    "n diselesaikan hari ini"); di tanggal asal tampil tidak tercentang dengan keterangan "Selesai <tgl>". Aturan sama untuk
    task/action yang diselesaikan lewat Planner. Data dev "Kirim notulen" (dicentang user sebelum perbaikan) diberi
    `completedAt` dari waktu update server.
  - Keputusan user: ikon referensi Planner diperbanyak lewat **paket ikon bersama** (`src/lib/icons`, ±140 ikon, 13
    kategori) yang dapat dipakai fitur lain; pemilihan lewat tombol → dialog (tampilan tetap bersih) + **AI memilih ikon**
    dari nama tipe (tombol AI cepat & daftar saran di dialog). Tipe tanpa ikon tersimpan tetap memakai default; key lama
    (`graduation`, `book`, `heart`) dipetakan lewat alias.

- 2026-10-11 — **Pembersihan berkas lampiran** (keputusan user, berlaku juga untuk Productivity): menghapus agenda atau
  melepas lampiran berkasnya menghapus berkas dari storage; dialog konfirmasi memberi pilihan mempertahankan satu/lebih
  berkas yang lalu menjadi Resource Global (tag "Agenda"). Berkas yang masih dipakai di tempat lain (Resource global,
  item lain, arsip PARA) dilindungi. Upload yang dibatalkan sebelum disimpan juga dihapus. Komponen bersama:
  `DeleteWithFilesDialog`, `useAttachmentCleanup`, `attachment-cleanup.ts` (+ test). Thread Productivity akan
  menerapkan pola yang sama (prompt handoff disiapkan) + pencatatan `completedAt` saat task dicentang.
- 2026-10-11 — **Productivity: hapus berkas lampiran & `completedAt`** (lanjutan keputusan pembersihan berkas): hapus
  Project / item Area / Action/Task dan melepas lampiran berkas di form Project/Action/Task kini menghapus berkasnya dari
  storage (pilih Pertahankan → Resource Global; tag "Project" / "Area" / "Project Action" / "Area Task"); upload
  sesi yang tidak disimpan dibuang saat Batal/X/Esc; hapus Resource Global (tab Resources) ikut menghapus berkasnya bila
  tidak dipakai di tempat lain, "Ganti File" membersihkan berkas lama. `completionPatch` dipindah ke `src/lib/completion.ts`
  (+ `completionChangePatch`); centang task/action di Productivity mengisi `completedAt`. Ditemukan & diperbaiki: form
  dialog yang dibuka ulang sebelum unmount memakai state lama → `useOpenSession` sebagai `key`. Hook bersama
  `useAttachmentCleanup` mendapat opsi kompatibel `excludeResourceIds` (perilaku Planner tidak berubah).
- 2026-10-11 — **Upload yatim & ringkasan AI opsional** (thread Productivity): berkas yang diunggah tetapi belum tersimpan
  kini dibersihkan juga saat tab di-reload/ditutup (`lib/pending-uploads.ts` + `usePendingUploadsJanitor`, keepalive +
  sapuan cadangan). Keputusan user: ringkasan AI saat upload menjadi **centang opsional** (default mati, diingat per
  browser) agar tidak ada panggilan penyedia AI tanpa disadari; tombol tidak lagi terkunci menunggu AI. Prop
  `AttachmentForm autoSummarize` diganti `offerAiSummary`.
- 2026-10-11 — **Action & Agenda di Project/Area** (keputusan user): centang Action/Task di Productivity membuka dialog
  isian (Tanggal, Prioritas, Bobot project — terisi otomatis, bisa diubah) sebelum ditandai selesai. Project & item Area
  kini bisa memiliki **Agenda** (memakai agenda Planner apa adanya, termasuk Dasar Pelaksanaan & **Hasil Agenda**;
  tetap tampil di Planner). Agenda **ikut dihapus / diarsipkan** bersama induknya (berkas ikut aturan pembersihan).
  Lanjutan: `projectId` agenda menjadi kolom (`20261011180000_schedule_project`) agar graf berbagi backend menyertakan
  agenda sebagai turunan project/item area (penerima melihat agenda + berkas + Notes AI terhubung; agenda baru dari
  kolaborator izin edit menjadi milik pemilik). Agenda multi-hari tampil sekali dengan rentang tanggal di daftar &
  Timeline Productivity; "??:??" diganti "Tanpa jam" (juga di Planner).
- 2026-10-12 — **Lampiran saat Tandai Selesai & daftar terpadu** (permintaan user): dialog Tandai Selesai (Productivity &
  Planner Harian) punya bagian **Lampiran Hasil (opsional)** — mekanisme lampiran yang sama (`AttachmentForm`,
  `useAttachmentEdits`: Batal/X/Esc membuang upload sesi, lampiran baru digabung ke `resources` task saat dikonfirmasi).
  Tab Action | Agenda di detail Project/Area diganti **daftar gabungan** action/task + agenda urut tanggal dengan tag
  pembeda dan filter tag; timeline sudah gabungan. Diuji dengan data demo (batal → berkas 404; konfirmasi → lampiran
  tersimpan, progres 20% → 45%).
- 2026-10-15 — **Tag & Ringkas AI di semua form lampiran** (permintaan user): form lampiran Project/Action/Task/Tandai
  Selesai dan Agenda Planner (dasar pelaksanaan & hasil) kini punya input tag Resource Global seperti form Resource, dan
  agenda + "Ubah" task cepat ikut menawarkan "Ringkas dengan AI" sehingga semua form lampiran sama. Ditemukan & diperbaiki
  saat uji: menempel beberapa tag sekaligus kehilangan tag pertama (state basi) → pembaruan fungsional. Revisi (permintaan
  user): input tag selalu tampil di form lampiran — sebelumnya tersembunyi sampai "Simpan/Tag ke Resource Global" dicentang.
- 2026-10-14 — **Tag bebas Resource Global** (permintaan user): sebelumnya tag hanya tag konteks otomatis (asal resource);
  tag "Regulasi"/"SOP" di data demo berasal dari skrip seed, bukan UI. Kini form Resource punya input tag bebas (saran dari
  tag yang sudah dipakai, anti-duplikat), tag konteks tampil terkunci, tabel membedakan keduanya, pencarian ikut tag.
  Tanpa perubahan backend (kolom `tags` jsonb).
- 2026-10-14 — **File Control opt-in** (keputusan user): berkas tidak lagi otomatis masuk File Control; user menentukannya
  sejak awal lewat centang "Masukkan ke File Control" (bersama "Ringkas dengan AI") di form Resource Global dan semua
  form lampiran (Project, Action/Task, Agenda, Tandai Selesai) — lampiran yang dicentang otomatis menjadi Resource Global.
  Default mati, diingat per browser. Data lama tetap di File Control (migrasi `20261014120000_file_control_opt_in`).
  Bisa dikeluarkan dengan melepas centang di form Resource (status `none`, tercatat di audit) selama belum diberkaskan.
  Rencana berikutnya (thread & branch baru, oleh user): jenis resource baru **dokumen yang dibuat di aplikasi** dengan
  editor dokumen berbasis **ONLYOFFICE** (Document Server); dokumen itu memakai centang File Control yang sama.
- 2026-10-12 — **Modal Project/Area lebih lega** (permintaan user): header TaskManager dirapatkan (progres satu baris,
  lampiran Dasar & kartu turunan item area dalam satu baris geser, toolbar satu baris, tombol tambah pindah ke baris
  judul, footer dihapus), sidebar Area lebih sempit (w-64/72). Ruang daftar di layar 1366×768: 227 px → 504 px. Di HP
  header ikut tergulir bersama daftar. Ditemukan & diperbaiki: grid kartu tab Projects/Areas tanpa `grid-cols-1` membuat
  halaman melebar di HP. Kartu Project & Area (tab Projects/Areas) dibuat ringkas: tombol aksi kecil
  (`CARD_ACTION_CLASS`) di baris atas bersama label pendek, judul & nama area di baris sendiri (sebelumnya tombol aksi
  menimpa judul), footer deadline + jumlah action / jumlah sub area + project.
  Pertanyaan user "resource selain PDF tidak muncul di Gantung": File Control memang hanya memuat Resource Global
  bertipe **berkas** (format apa pun) + arsip PARA bertipe berkas; Resource **link/catatan** dan **lampiran**
  Project/Action/Agenda (yang tidak dicentang "Tambahkan ke Resource Global") bukan arsip sehingga tidak masuk.
- 2026-10-11 — **Evaluasi & pembersihan Productivity + uji data realistis**: kode — field peninggalan tidak lagi
  ditulis/dibaca (`Project.progress`, `linkedNotes`, `Area.color`), filter mati `status !== "archived"` dihapus (project
  yang diarsipkan sudah keluar dari koleksi), tanggal YMD di progres/filter/notifikasi dibaca lokal (`parseLocalYMD`, bukan
  UTC), urutan YMD dibandingkan sebagai string. Alur — centang task Productivity di Planner Harian kini juga membuka
  dialog Tandai Selesai; peringatan bila total bobot action project ≠ 100%. Data dev: tidak ada task/agenda/kegiatan yatim;
  2 berkas tidak dirujuk (`Mohammad_Yusuf_CV.pdf`, unggahan user) dibiarkan. Uji realistis: 11 dokumen hasil generator
  (PDF teks, DOCX, XLSX, CSV; konten instansi pemerintah fiktif "Kota Sukamaju") + data demo berawalan `demo-` (2 area
  bertingkat, 2 project, action berbobot, agenda + hasil, resource global, berbagi, arsip) — ekstraksi 11/11 `completed`,
  DOCX rusak → `failed` tanpa menjatuhkan worker, indeks RAG menemukan isi dokumen, berbagi & unduh berkas benar.
- 2026-10-11 — **Kalender Harian**: tinggi dikurangi (sel 56–64 px, bukan persegi), hover tanggal → ringkasan agenda/
  rutinitas/to-do. Ketidaksesuaian penanda diperbaiki: sebelumnya todo/task yang sudah selesai tidak ditandai sama sekali
  (tanggal berisi to-do selesai tampak kosong) dan penanda dihitung terpisah dari daftar; kini satu sumber
  (`summarizeDay`) dengan status belum selesai (titik) / semua selesai (lingkaran).

- 2026-10-11 — Thread **Environment System & User** dimulai. Keputusan user: (1) **isolasi data** — admin/super admin
  hanya mengelola akun + melihat **statistik** pemakaian (bukan isi data); (2) role **viewer dihapus** (akun viewer →
  member lewat migrasi; hak baca-saja kini per item); (3) **berbagi** dengan izin **Lihat / Komentar / Edit**;
  (4) cakupan tahap pertama: Productivity (Project, Area, Resource), Notes Space (Catatan, Notes AI, List), Planner
  (Agenda), File Control (arsip). Desain: tabel `shares` + `record_comments` (migrasi `20261011170000_sharing`), akses
  dihitung saat request dari relasi payload (turunan ikut izin root; rujukan baca-saja; berkas lewat `uploadId`);
  hanya pemilik yang membagikan, menghapus item induk, mengarsipkan; kolaborator Edit boleh menambah/menghapus turunan
  (item baru milik pemilik induk) dan mengunggah ke ruang pemilik. Tag/Resource Global hasil "Pertahankan" oleh
  kolaborator tidak dibuat atas nama pemilik. Item bersama tampil di modulnya dengan penanda pemilik; File Control
  memisahkan pengelolaan (milik sendiri) dari tab **Dibagikan**. Seed dev: akun kedua `user@lifeos.com` (member).
  Ditunda: RAG/chatbot atas item bersama, notifikasi saat dibagikan, tautan publik, berbagi tipe lain (rutinitas, todo).

- 2026-10-14 — **Agenda berulang & banyak link** (thread Planner; tanpa perubahan backend/migrasi — `seriesId`,
  `recurrence` di `extra`, link tetap kolom `media`). Desain (rekomendasi diterapkan): setiap pertemuan disimpan sebagai
  agenda tersendiri dalam satu seri — bukan satu agenda yang dihitung ulang — karena tiap pertemuan kuliah butuh hasil,
  Notes AI, dan lampiran sendiri, dan semua konsumen agenda (termasuk berbagi & Productivity) tetap bekerja. Pola:
  harian/mingguan (pilih hari)/bulanan, interval, batas tanggal atau jumlah (maks. 200). Ubah/hapus pertemuan menanyakan
  cakupan. Ditemukan & diperbaiki: memundurkan Tanggal Mulai di form tidak menggeser Tanggal Selesai (agenda diam-diam jadi
  multi-hari); form agenda belum memakai `useOpenSession` (form bisa terbuka dengan data agenda sebelumnya).
  Belum: berbagi seri sekaligus (berbagi tetap per pertemuan), pilihan cakupan saat hapus agenda dari Productivity.

- 2026-10-14 — **Berbagi seri & hapus berseri dari Productivity**: seri agenda berulang bisa dibagikan sekaligus lewat
  item virtual `schedule_series` (tanpa migrasi; `shares.record_type` teks) — backend menurunkan semua pertemuan saat
  request, termasuk yang ditambahkan kemudian; tiap pertemuan = root (kolaborator tidak bisa menghapus); kolaborator edit
  bisa menambah pertemuan (`parentRefsOf` → seri). Diuji unit (share-graph), smoke (+6 skenario), skrip API dua akun
  (11 skenario: bagikan, tolak seri tak dikenal, root, pertemuan baru ikut, tambah/ubah oleh kolaborator, larang hapus,
  judul di Berbagi, izin lihat, cabut), dan UI. Hapus agenda di Productivity kini memakai dialog Planner dengan pilihan
  cakupan seri. Catatan: pertemuan baru dari pemilik terlihat penerima setelah cache akses baca (3 detik) — sama seperti
  turunan bersama lain.
- 2026-10-14 — Thread **Notes Space** lanjutan: urutan tab menjadi **Catatan Bebas → List Bebas → Notes AI → My Notebook**
  (permintaan user). **My Notebook** ala NotebookLM (keputusan user): sumber = upload berkas, item LifeOS, teks tempel, dan
  **link web** (diambil server dengan perlindungan SSRF); cara baca **hibrida** (sumber kecil dikirim utuh, besar → RAG
  dalam sumber notebook, sitasi wajib); Studio tahap 1 = **ringkasan & poin kunci + saran pertanyaan** (FAQ, panduan
  belajar, briefing, timeline, audio ditunda); hasil disimpan ke **catatan notebook** dan bisa disalin ke **Catatan
  Bebas**. Desain: tabel sendiri (bukan record type) karena chat & sitasi relasional dan tidak perlu sinkron per item;
  potongan memakai `chunkText` yang sama dengan indeks AI sehingga hasil pencarian vektor bisa dicocokkan per potongan;
  peringkat kata kunci di memori sebagai cadangan bila indeks dimatikan. Sumber item LifeOS hanya milik sendiri (item
  bersama ditunda). Paket baru: `@mozilla/readability` + `linkedom` (backend), `@tiptap/markdown` (frontend).
  Revisi tata letak (permintaan user): ringkasan digabung ke chat agar chat lebar & lega; panel Studio (catatan) pindah
  ke bawah sumber; daftar sumber & catatan dibatasi tinggi lalu digulir. Revisi berikutnya: Sumber & Studio = dua panel
  dengan scroll masing-masing yang selalu terlihat di laptop biasa; chat bisa melampirkan / menempel gambar (maks. 4,
  ≤ 10 MB, dibaca AI bersama sumber; tanpa sumber pun boleh bertanya tentang gambar). Lanjutan (keputusan user):
  sumber Item LifeOS mencakup **berkas LifeOS (mis. PDF lampiran)** yang hanya dirujuk — menghapus notebook tidak menghapus
  item/berkas LifeOS, sedangkan berkas dari "Upload berkas" ikut terhapus; lampiran chat diperluas ke berkas (dokumen
  dibaca dari teks ekstraksi); salin jawaban tanpa rujukan [n]; **modal pratinjau berkas** bersama (PDF & gambar; DOCX/
  XLSX/PPTX menunggu ONLYOFFICE).
- 2026-10-14 — **Jadwal ulang agenda** (permintaan user: kuliah berulang bisa dimajukan/dimundurkan; berlaku untuk semua
  agenda). Desain: tanggal/jam agenda diganti langsung (bukan pengecualian virtual) + riwayat `reschedules` di `extra`
  (tanpa migrasi), sehingga Harian, kalender, Overview, notifikasi, Productivity, dan berbagi otomatis memakai jadwal baru;
  jadwal semula & alasan tetap terlihat dan bisa dikembalikan. Ditemukan & diperbaiki: label tanggal tab Jadwal membaca
  YMD sebagai UTC (`formatDayMonth("YYYY-MM-DD")` → kini `parseLocalYMD`).
- 2026-10-14 — **File Control: uji menyeluruh + perbaikan** (thread File Control; tanpa perubahan backend/migrasi). Uji
  dengan data `[UJI]`/`fct-` (semua tahap siklus, wadah bertingkat, arsip PARA, berbagi). Diperbaiki: (1) BAP manual
  menawarkan arsip vital & Permanen untuk dimusnahkan → satu aturan `dispositionBlockReason` untuk semua jalur
  penyusutan; (2) arsip yang sedang dipinjam bisa dimusnahkan/dipindah → ditolak (penyusutan, Penataan, pemindahan
  massal) + penanda "Dipinjam"; (3) klasifikasi/JRA yang dipakai arsip bisa dihapus → ditolak; (4) arsip digital
  musnah/statis masih tampil & bisa ditata → disembunyikan/ditolak untuk semua media; (5) impor CSV / form membuat
  referensi kembar → dicegah (`classificationKey`/`jraKey`); (6) target kembali < tanggal pinjam diterima → ditolak +
  penanda Terlambat; (7–8) detail arsip Gantung berlabel "Aktif · NON PERMANEN · DIGITAL" & banner hijau untuk arsip
  Perlu Tindak Lanjut → banner/label per status (`RetentionBadge`); (9–10) kartu: lokasi "?/?" & kode "001" → lokasi
  lengkap / "Belum ditata" & kode `P.S.I`; (11) peminjaman hanya arsip fisik. `isAwaitingDisposition` dihapus (diganti).
  Lanjutan (permintaan user): Restore dengan dialog konfirmasi; BA auto-dispose memakai tanggal lokal + mencatat pelaksana
  (`user`), cetak BA menandatangankan pelaksana tercatat; **Penataan khusus arsip fisik** (keputusan user) — arsip
  digital tidak ditata/dihitung sebagai isi wadah (`isPhysicalArchive`), form pemberkasan digital tanpa lokasi fisik
  (dikosongkan saat simpan) tetapi tetap ada Catatan, filter Media di pemindahan massal dihapus; **Lihat Dokumen**
  seragam di semua tempat (`lib/archive-document.ts`, termasuk arsip digital yang hanya punya tautan); pratinjau cetak A4
  (BA & Daftar Isi) layar penuh; modal pratinjau berkas bersama (`file-preview.tsx`) dibuat berbingkai tipis dan
  hampir selebar/setinggi layar.
- 2026-10-15 — Thread **Pengaturan & Layout** dimulai. Perbaikan: (1) **Profil Saya** dipindah dari Pengaturan ke halaman
  sendiri `/profile` (permintaan user: sudah ada di menu user); `/settings/profile` lama jatuh ke tab pertama.
  (2) Sub menu Pengaturan berurutan **Aplikasi, Manajemen User, Berbagi, AI** (member hanya melihat Berbagi & AI).
  (3) Sidebar diciutkan: logo 36 px di tombol 32 px terpotong sebelah kanan → logo 32 px; ikon modul 28 px bergeser 8 px
  karena padding tombol → tanpa padding. (4) Tombol tutup bawaan dialog pencarian global menimpa tab AI → tombol tutup
  sendiri di baris input. (5) Pengatur tema ganda (tombol header + submenu menu user) → satu dropdown di header dengan
  pilihan Ikuti sistem. (6) Tab Profil & Aplikasi tidak lagi menyalin data ke form lewat `useEffect` (pola §8b): form diisi
  sekali saat data termuat. (7) Logo aplikasi (data URL ≤ 1 MB) tidak lagi ikut di setiap respons `GET /settings/app`
  (termasuk halaman login) → endpoint publik `GET /settings/app/logo?v=` yang di-cache browser; `PATCH` memvalidasi bahwa
  logo berupa gambar. Tanpa migrasi (kolom `app_logo` tetap).
- 2026-10-15 — Thread **Overview** dimulai (tanpa perubahan backend/migrasi). Perbaikan: (1) Proyek Berjalan tidak lagi
  `slice(0, 4)` mentah — hanya project berjalan, urut deadline terdekat, hitungan penuh; (2) Tugas Mendesak = terlambat
  (prioritas apa pun) + prioritas tinggi ≤ 7 hari / tanpa tenggat, bisa dicentang (task → dialog Tandai Selesai), tenggat
  dibaca lokal (sebelumnya `new Date(YMD)` = UTC); (3) kartu baru To-do Hari Ini + rutinitas hari ini bisa dicentang dari
  Overview; (4) Agenda Hari Ini: status per jam, Gabung, tombol tambah agenda, "Sepanjang hari"; label Inggris
  ("Task Completion", "Time Elapsed", "Project Reminder", "Overdue") diganti; (5) notifikasi: project selesai/ditunda
  tidak diingatkan, bagian Tugas Terlambat & Baru Dibagikan, tanggal agenda dibaca lokal; (6) kartu rutinitas memakai
  warna Planner. `scheduleTimeLabel` bersama (Planner) sengaja tidak diubah.
  Lanjutan (permintaan user): klik Tugas Mendesak / To-do Hari Ini / Proyek Berjalan membuka **modal di Overview**
  (modal Project/Area dari Productivity, dialog todo dari Planner) alih-alih berpindah ke menu Productivity/Planner;
  hanya "Lihat Semua" yang berpindah menu. URL logika modal Project/Area dipindah ke `ParaDetailDialogs` (dipakai
  bersama). Ditemukan & diperbaiki saat uji: dialog todo baru mewarisi tanggal todo yang dibuka sebelumnya → `key`
  `useOpenSession`.
- 2026-10-15 — Thread **integrasi ONLYOFFICE** dimulai (menu baru **Tools**, sub menu pertama **ONLYOFFICE**). Riset:
  ONLYOFFICE Docs **Community** self-hosted (`onlyoffice/documentserver`, amd64+arm64, **tanpa akun**), batas 20 koneksi
  dihapus sejak 9.4, 9.4 = satu proses tanpa RabbitMQ/DB; 10.0 baru rilis 12 Okt → mulai **9.4**, 10.0 setelah ± 9 Nov.
  Integrasi lewat Docs API (config JWT ditandatangani backend, unduh bertoken, callback → versi baru Asset di S3 +
  ekstraksi/RAG). Uji jaringan laptop: container di WSL **tidak** menjangkau Windows lewat `host.docker.internal`
  (host-gateway = VM WSL), tetapi **bisa** lewat IP gateway default WSL (backend 4000 → 200). Usulan: port dev 8080
  (profile compose `office`), produksi di sub-path `/office/` via Caddy, VPS disarankan 8 GB. Detail & keputusan
  yang menunggu user: `docs/ONLYOFFICE.md` §4.
  Keputusan user (hari yang sama): **langsung 10.0** (stabil), cakupan + **edit PDF**, **10 versi terakhir**, AI di editor
  **bisa dipilih** (AI LifeOS lewat backend sebagai penyedia kustom plugin AI ONLYOFFICE, atau AI bawaan ONLYOFFICE, atau
  mati), sisanya sesuai rekomendasi (Community, Resource Global + File Control, berbagi, Bahasa Indonesia). Tahap 0 selesai:
  service compose `onlyoffice` (profile `office`, port 8080, `JWT_HEADER=AuthorizationJwt`, `ALLOW_PRIVATE_IP_ADDRESS`);
  backend nanti membaca IP WSL dari antarmuka Windows `vEthernet (WSL…)` (`ONLYOFFICE_BACKEND_URL=auto`).
  Tahap 1 (backend) selesai: modul `src/office/` + migrasi `20261015120000_asset_versions`. Desain: berkas tetap Asset
  (tidak ada record type baru — dokumen baru dijadikan Resource Global oleh frontend); versi disimpan per **sesi edit**
  (Ctrl+S berkali-kali dalam satu sesi = satu versi) agar batas 10 versi tidak habis oleh simpanan antara; pulihkan versi =
  salinan sebagai versi terbaru; edit hanya untuk DOCX/XLSX/PPTX/PDF (format lain dibuka baca saja agar ONLYOFFICE tidak
  menyimpan dalam format berbeda); AI bawaan ONLYOFFICE sementara dimatikan di config sampai pilihan AI per user (tahap 3).
  Templat kosong = berkas `new.*` locale id-ID dari image ONLYOFFICE (`backend/templates/office/`, ikut image Docker).
  Tahap 2 (frontend) selesai: modul **Tools** ber-sub-menu (sub menu ONLYOFFICE), daftar dokumen dari Resource Global,
  Buat baru → Resource Global tag `ONLYOFFICE` + opsi File Control, editor modal yang bisa dibuka dari mana saja,
  riwayat versi + pulihkan, pratinjau dokumen kantor lewat ONLYOFFICE mode lihat. Ditemukan saat uji: Pulihkan saat editor
  terbuka tertimpa isi sesi lama (ONLYOFFICE membuat ulang berkas → checksum beda) → callback sesi lama kini hanya masuk
  riwayat (`planVersionSave` aksi `archive`).
  Revisi tahap 2 (arahan user): menu **Tools = pengaturan/status ONLYOFFICE saja** (daftar dokumen & dialog "Buat baru"
  dihapus, tag konteks `ONLYOFFICE` tidak dipakai); dokumen baru dibuat dari form lampiran Project/Action/Task/Tandai
  Selesai/Agenda dan form Resource ("Buat dokumen", konteks & pemilik sama dengan upload lampiran); menutup modal editor
  = **simpan paksa** (`POST /office/files/:id/forcesave`, Command Service) dan menunggu sampai tersimpan.
  Revisi berikutnya (arahan user): "Buat dokumen" menjadi **pilihan Tipe** "Buat Dokumen (ONLYOFFICE)" (tombol lama sulit
  ditemukan) dengan pola sama seperti resource berkas (tag, File Control, Ringkas AI dari teks ekstraksi setelah editor
  ditutup); menu **Tools dipindah ke kategori Sistem** bersama Pengaturan.
  Lanjutan (permintaan user): batal tambah resource/lampiran dengan dokumen ONLYOFFICE yang sudah berisi → modal
  konfirmasi dulu; tombol "Hapus dokumen" di form (selalu dikonfirmasi) untuk membuang dokumen yang tidak jadi dipakai.
  Lanjutan (permintaan user): dialog induk (Project, Action/Task, Tandai Selesai, Agenda) juga dijaga lewat penjaga tutup
  generik di `Dialog`; format ONLYOFFICE tidak lagi dibatasi 4 jenis — mengikuti daftar resmi server (edit / lossy-edit /
  view, disimpan dalam format asli); ekstraksi teks format kantor lain lewat konversi ONLYOFFICE (TXT/CSV) agar Ringkas AI
  & RAG ikut membaca PPTX, ODT, RTF, ODS, dll.
- 2026-10-16 — **ONLYOFFICE tahap 3** (keputusan user): AI LifeOS = **plugin LifeOS sendiri** (bukan penyedia kustom plugin
  AI resmi: pengaturannya per server/localStorage, bukan per user), AI bawaan = plugin resmi dengan **key diisi user di
  editor** (disimpan di browser; UI memberi peringatan), pilihan per user default **Mati**; templat = **Resource bertag
  Templat**; font = **folder font di server**. Image ONLYOFFICE dev kini dibangun sendiri (`infra/onlyoffice/Dockerfile` =
  image resmi + plugin AI). Konversi DOCX → PDF untuk File Control belum dikerjakan (menunggu keputusan alur).
  **Revisi user (hari yang sama)**: tab AI bawaan tidak muncul saat memakai plugin panel sendiri → AI dibuat **satu pintu**:
  tab AI bawaan ONLYOFFICE apa adanya (semua fiturnya) dengan provider & key Pengaturan → AI lewat proxy backend, tanpa
  pengaturan AI di editor (plugin panel & pilihan "key di editor" dihapus; `office_ai` jadi boolean). Templat **diunggah
  di Tools → ONLYOFFICE** (tag Resource tidak dipakai). Ditambah **Impor berkas** DOCX/XLSX/PPTX/… saat Buat Dokumen.
- 2026-10-16 — **ONLYOFFICE lanjutan + tahap 4** (keputusan user): Tools → ONLYOFFICE per role (user: AI, Templat, Cara
  memakai; admin + Status & Font); font **diunggah admin** (folder bersama + pemantau di image, tanpa restart manual);
  **konsep ↔ dokumen final** (konsep surat/nota dinas tidak perlu diberkaskan; PDF bertanda tangan = Resource Global +
  File Control otomatis, tertaut dua arah lewat `assets.draft_id`; dasar agen SRIKANDI nanti). Produksi: service
  `onlyoffice` profile `office`, Caddy `/office/`. Ditemukan saat uji produksi: editor seluler Community hanya bisa
  melihat → selalu tampilan desktop. Rencana user berikutnya: agen SRIKANDI & agen pembuat dokumen bertemplat di Tools
  (n8n / OpenClaw, dibahas nanti). Templat instansi user (29 DOCX dari folder `template/`, akan dihapus user) diunggah ke
  akun admin dev sebagai templat; pemilih templat menjadi modal dengan cari + filter + paginasi (permintaan user).
  Review celah (code review high) → 8 perbaikan: env kosong di compose produksi membuat backend gagal start saat
  ONLYOFFICE nonaktif (kini `emptyToUndefined` + test); kandidat tautan disaring format di database (sebelumnya hanya 120
  berkas terbaru); final diunggah ke ruang pemilik konsep (kolaborator berbagi Edit); upload final dibuang bila tautan
  gagal; penanda tautan hanya menghitung berkas yang boleh dibaca + cek izin hanya untuk berkas milik user lain; modal
  templat tetap terbuka saat gagal; opsi editor seluler dihapus dari API.

## 13. Konvensi Kode

- Indentasi 2 spasi, LF, UTF-8 (`.editorconfig`, `.gitattributes`). Prettier tunggal di root.
- Sebelum menyatakan selesai: `lint` + `typecheck`/`build` + `npm test` pada bagian yang diubah; backend juga
  `npm run test:smoke`; perubahan tampilan dicek di browser.
- Jangan commit `.env`/kredensial. Kredensial di dokumen ini hanya untuk development lokal.
- Komentar kode menjelaskan *apa/mengapa* untuk aplikasi ini (jangan merujuk "versi lama" / aplikasi lain).

## 14. Resep Pengembangan Fitur

**Menambah field pada entitas yang sudah ada** (mis. `priority` di `schedule`):
1. Frontend: tambah field di `src/types/entities.ts`, pakai di UI. Tanpa perubahan backend pun data tetap tersimpan
   (masuk kolom `extra`).
2. Bila field perlu kolom bertipe (difilter/diindeks/dihitung di DB): tambah di `backend/src/records/record-schema.ts`
   → `npm run db:generate-models` → buat migrasi (docs/SETUP.md §10) → `npx prisma migrate deploy` →
   `npx prisma generate` → restart backend. Data lama di `extra` untuk key itu tidak otomatis pindah ke kolom; bila
   perlu, tulis `UPDATE ... SET kolom = (extra->>'key')::tipe, extra = extra - 'key'` di migrasi yang sama.
3. Tambah kasus di `record-mapper.spec.ts` bila ada jenis/aturan baru.

**Menambah entitas (record type) baru**:
1. Backend: entri baru di `RECORD_TABLES` (`record-schema.ts`: model, tabel snake_case jamak, field, indeks, `audit`)
   → generate + migrasi seperti di atas. `RecordType` & validasi `/records/:type` otomatis mengikuti.
2. Frontend: tambah nama type di array `RECORD_TYPES` (`src/types/api.ts`), tipe di `entities.ts`, hook di
   `src/data/collections.ts` (`useCollection<T>("nama_type")`).
3. Smoke test: tambah skenario bila ada aturan khusus.

**Menambah modul/halaman**: entri di `src/config/navigation.ts` (key, path, ikon, tab, role) → rute `lazy` di
`src/app/router.tsx` → `features/<modul>/<modul>-page.tsx` mengekspor `Component` dengan `<ModulePage module="...">`
→ (opsional) warna modul baru di `src/index.css` (`--mod-<key>`, `[data-module=...]`).

**Menambah endpoint/modul backend non-records** (mis. AI): modul Nest baru di `src/<nama>/` (controller + service +
DTO class-validator), daftarkan di `app.module.ts`, guard `JwtAuthGuard` + `RolesGuard` bila perlu, endpoint frontend di
`src/lib/api/endpoints.ts`, hook TanStack Query di `src/data/`. Tambah skenario smoke test.

**Menambah env**: `src/config/env.validation.ts` + `backend/.env.example` + (produksi) `docker-compose.prod.yml`
`environment:` + root `.env.example` + dokumentasi `docs/DEPLOYMENT.md` bila wajib diisi di VPS.

**Memanggil domain eksternal dari browser**: tambahkan ke `connect-src` (atau direktif terkait) di
`frontend/nginx.conf`, kalau tidak akan diblokir CSP di produksi (di dev tidak terlihat!). Lebih baik lewat backend.

**Mengubah logika File Control** (status, retensi, penyusutan, wadah, format ID, impor CSV): perbarui juga
`docs/FILE-CONTROL.md` (dan `lib/archive.test.ts` bila logika murni berubah) di commit yang sama.

**Menambah komponen shadcn**: `cd frontend && npx shadcn@latest add <nama> --yes` (hasil di `components/ui/`).

**Upgrade major dependensi** (Dependabot sengaja tidak membuat PR major):
1. Inventaris: `npm outdated` di `backend/` & `frontend/`, cek image di Dockerfile & compose. Pilih versi **stabil
   terbaru yang ekosistemnya sudah siap** (cek peerDependencies plugin: `@nestjs/*`, `nestjs-pino`, `typescript-eslint`,
   `@vitejs/plugin-react`, dll.). Hindari rilis < 2–4 minggu, `-rc`/`-beta`, dan Node non-LTS di produksi.
   Tanggal rilis & peer deps: `npm view <pkg> time dist-tags peerDependencies`. Pasang dengan
   `npm install --before=<tanggal hari ini>` agar rilis yang baru keluar hari itu tidak ikut.
2. Satu keluarga paket per commit (mis. semua `@nestjs/*` sekaligus), baca migration guide/changelog resminya.
3. Prisma: jaga adapter pg (Windows ARM64) dan generator `prisma-client` CJS; setelah upgrade `prisma generate`,
   cek drift. Jangan `npm i prisma@latest` (tag `latest` CLI bisa menunjuk rc) — tulis versi eksplisit.
4. PostgreSQL major **bukan** sekadar ganti tag image — butuh dump/restore ke volume baru (nama volume memuat nomor
   major); data volume lama tidak kompatibel. Lakukan terpisah, lihat resep "Upgrade major PostgreSQL" di bawah.
5. Setiap langkah: lint, typecheck, `npm test`, build, `npm run test:smoke`, build image Docker; terakhir CI hijau.
   Perubahan image/infra: jalankan juga stack produksi lokal di project compose terpisah
   (`docker compose -p lifeos-upgradetest --env-file <tmp> -f docker-compose.prod.yml up -d --build --wait`,
   `APP_DOMAIN=http://localhost`), smoke test lewat `API_URL=http://localhost/api/v1`, lalu `down -v`.
6. Perbarui versi di `docs/ARCHITECTURE.md` §2.1 (satu-satunya tabel versi) dan catat riwayat, yang ditunda +
   kajian, serta audit yang dipantau di `docs/UPGRADE-PLAN.md`.
7. Jalankan `npm audit` di kedua paket. Celah di dependensi transitif → `overrides` npm (versi major sama), dicatat
   di `docs/ARCHITECTURE.md` §2.3. Setiap upgrade paket induk: cek apakah override masih perlu, hapus bila tidak.

**Upgrade major PostgreSQL** (mis. 18 → 19):
1. Cek tag `pgvector/pgvector:<pgvector>-pg<M>` (Docker Hub tags API: arsitektur arm64, tanggal) + catatan rilis
   PostgreSQL & dokumentasi image (path mount/PGDATA bisa berubah antar-major). Pakai varian OS yang sama dengan
   sebelumnya bila bisa (ganti glibc = collation berubah → perlu REINDEX).
2. Dev: backup semua DB (`pg_dumpall` + `pg_dump -Fc` per DB: `lifeos`, `lifeos_shadow`, lainnya) dan jumlah baris
   per tabel → ubah `docker-compose.yml` (tag + volume baru) → `up -d --wait postgres` → `CREATE DATABASE` untuk DB
   selain `lifeos` → `pg_restore` → `ANALYZE` → bandingkan jumlah baris (docs/SETUP.md §7.1).
3. `docker-compose.prod.yml` service `postgres` + volume baru, **dan** `FROM` di `infra/backup/Dockerfile` (pg_dump
   harus = major server).
4. Uji: migrate deploy (DB lama & DB kosong), seed, drift, smoke, `CREATE EXTENSION vector` + `extversion`, UI.
5. Stack prod lokal: jalankan compose **versi sebelum perubahan** (salinan dari git) di project
   `lifeos-upgradetest`, isi data (seed + record + upload), lalu ikuti persis docs/DEPLOYMENT.md §8 ke compose
   baru; ulangi satu siklus `backup.sh --once` → ubah data → restore (DEPLOYMENT §4); `down -v` + hapus volume
   lama project uji.
6. Volume dev lama boleh dihapus setelah verifikasi (data dev dummy); volume produksi lama baru dihapus setelah stabil.

**Menambah provider/model AI**: model baru dari provider yang sama cukup diganti user di Pengaturan → AI; ubah default
di `backend/src/ai/ai-providers.ts` (`defaultModel`, `suggestedModels`) saat generasi model berganti. Provider baru:
nilai enum `AiProvider` di `schema.prisma` + migrasi, entri katalog `AI_PROVIDERS`, klien `providers/<nama>.client.ts`
(SDK resmi, petakan error ke `AiProviderError`), daftarkan di `CLIENTS` (`ai.service.ts`), tipe `AiProviderId` di
frontend `types/api.ts`; tambah kasus di `ai.spec.ts` & smoke test.

**Menambah tipe data ke indeks RAG**: tambah record type + labelnya di `INDEXED_TYPES`
(`backend/src/ai/index/index-text.ts`) dan label sumber di `frontend/src/features/settings/ai-index-card.tsx`; field
payload otomatis ikut (kecuali key berakhiran `Id`, lihat `KEEP_KEYS`). Lalu "Indeks ulang" di Pengaturan → AI.
Mengganti model/dimensi embedding = migrasi kolom `vector(N)` + indeks HNSW baru + bangun ulang semua indeks.

**Menambah dependensi npm**: pilih paket dengan prebuilt arm64/pure JS; paket berat → import dinamis agar chunk
utama tetap < 500 kB (cek output `npm run build`).

## 15. Jebakan yang Sudah Diketahui

- Bash tool memakan backslash di heredoc/`node -e` → pakai skrip file (Write) untuk regex/teks dengan `\`.
- Variabel `${X:?}` di compose dievaluasi meski service tidak dipakai → compose dev tidak boleh punya variabel wajib.
- `prisma migrate dev` tidak bisa interaktif di sini → buat migrasi dengan `prisma migrate diff ... --script`.
- Prisma tidak mendukung list nullable → array disimpan sebagai `json`.
- Login dibatasi 10/menit: menjalankan smoke test berulang dalam satu menit bisa kena 429 — tunggu sebentar.
- Uji UI lewat `javascript_tool`: Radix `Select` & `DropdownMenu` butuh event `pointerdown`, Radix `Tabs` butuh
  `mousedown`, `ContextMenu` butuh event `contextmenu`; input React diisi via setter `HTMLInputElement.prototype.value`
  + event `input`. Klik koordinat gagal saat panel browser tersembunyi.
- Browser panel menolak sertifikat internal Caddy (`https://localhost`) → uji UI produksi dengan
  `APP_DOMAIN=http://localhost` (cookie `Secure` tetap diterima di localhost).
- Object storage kadang belum siap saat backend baru start ("socket hang up" di log) — normal; bucket dibuat
  otomatis saat health check atau upload berikutnya (`/health`).
- Respons `401` dari `POST /auth/refresh` saat membuka aplikasi tanpa sesi adalah normal (muncul di console).
- TypeScript 6: `tsbuildinfo` ditulis di samping tsconfig (bukan di `dist`) → setelah `nest build` menghapus `dist`,
  build incremental bisa **tidak meng-emit apa pun**. Karena itu `tsconfig.build.json` menaruh `tsBuildInfoFile` di
  `dist/` dan `.dockerignore` mengecualikan `*.tsbuildinfo`. Default TS 6 lain: `types: []` (set `["node"]`).
- Prisma 7: client harus di-generate (`postinstall`); setelah `git clone`/hapus `src/generated` jalankan
  `npm install` atau `npx prisma generate`. Generator memakai `importFileExtension = ""` (import CJS
  tanpa ekstensi; aman untuk `nest build`, Vitest, dan `tsx` yang menjalankan seed dev). `prisma migrate dev/db push` tidak lagi generate/seed otomatis.
- `npm update/install` bisa gagal 404 untuk versi yang baru dirilis beberapa menit (tarball belum tersebar CDN) →
  pakai `--before=<tanggal>`.
- Uji image backend dengan `docker run --env-file backend/.env`: Docker **tidak** membuang tanda kutip nilai `.env`
  (DATABASE_URL jadi tidak valid) dan `NODE_ENV=development` memakai `pino-pretty` (tidak ada di image) → buat env file
  tanpa kutip dan set `NODE_ENV=production`.
- KaTeX ≥ 0.18 memberi prefix pada class CSS **internal**; `.katex`, `.katex-display`, `.katex-html` tetap. Jangan
  menarget class internal KaTeX di styling. `npm install <pkg>` mengubah `~` menjadi `^` di package.json (untuk 0.x
  rentangnya sama).
- nvm-windows di Windows ARM: `nvm install 24` memasang **x64** (emulasi, tanpa error); `nvm use <versi>` tanpa
  `arm64` gagal "Version not installed" untuk versi arm64; `nvm uninstall` versi yang sedang aktif menghapus symlink
  `C:\nvm4w\nodejs` (perintah `node` hilang) → selalu sebut `arm64`, pindah versi dulu baru uninstall.
- `npm --prefix backend exec -- prisma ...` dijalankan dari folder **root** (cwd tidak pindah) → Prisma tidak menemukan
  `prisma.config.ts`. Pakai skrip (`npm --prefix backend run prisma:deploy`, yang berjalan di folder backend) atau
  `cd backend` dulu.
- Saat dev server frontend dibuka sebelum backend (watch) selesai kompilasi, console menampilkan `502` dari proxy Vite
  untuk request pertama — normal.
- Image PostgreSQL ≥ 18 memakai `VOLUME /var/lib/postgresql` dan PGDATA `/var/lib/postgresql/<major>/docker`. Volume
  yang masih di-mount ke `/var/lib/postgresql/data` membuat container **menolak start** ("in 18+, these Docker images
  are configured to store database data in a format which is compatible with pg_ctlcluster…"). Mount volume ke
  `/var/lib/postgresql`; major berbeda = volume berbeda (dump/restore, bukan ganti tag).
- Git Bash mengubah argumen berawalan `/` menjadi path Windows (`/mnt/c/...` → `C:/Program Files/Git/mnt/c/...`)
  saat memanggil `wsl -e sh /mnt/...` → awali dengan `MSYS_NO_PATHCONV=1` atau jalankan via `wsl -e sh -c "..."`.
- esbuild (dependensi `tsx`) punya postinstall yang diblokir npm 11; sengaja `"esbuild": false` di `allowScripts`
  — binary diambil dari paket `@esbuild/<platform>`, postinstall hanya optimasi.
- SeaweedFS `weed server` default `-volume.max=8` dan tiap bucket (collection) memesan 7 volume → upload gagal
  "No writable volumes and no free volumes left" setelah ± 7–8 GB atau bila ada bucket kedua. Compose memakai
  `-volume.max=0` (otomatis sesuai sisa disk). SeaweedFS juga menyimpan folder kosong (S3 asli tidak).
- Image turunan `postgres`/`pgvector` mewarisi `VOLUME /var/lib/postgresql` → setiap container baru meninggalkan
  volume anonim. Service `backup` me-mount `tmpfs` di path itu.
- `backup.sh` (dash): `set -e` tidak berlaku di fungsi yang dipanggil dari `if`/`||` → setiap langkah memakai
  `|| return 1` eksplisit. Di skrip Node, `String.replace` mengubah `$$` menjadi `$` — pakai fungsi pengganti
  (`replace(a, () => b)`) saat mengedit compose yang berisi `$$VAR`.
- Folder `./backups` ditulis container sebagai root; hapus isinya lewat container (`docker run --rm -v …`).
- PR Dependabot untuk major bump satu paket (mis. hanya `@nestjs/core` 12 tanpa `@nestjs/common`) pasti merah di CI
  → tutup PR-nya; major upgrade dilakukan manual untuk seluruh keluarga paket (lihat §12).
- "Failed to fetch dynamically imported module …-page.tsx" + console `504 (Outdated Optimize Dep)` = Vite baru
  menemukan dependensi milik rute lazy saat rute dibuka lalu mengoptimasi ulang. Dicegah dengan
  `optimizeDeps.entries` (memindai `src/**`) di `frontend/vite.config.ts`; bila tetap terjadi, restart dev server.
- Backend dev (`nest start --watch`) yang crash saat restart otomatis (mis. env wajib baru belum ada di `backend/.env`)
  tidak hidup lagi walau file diubah: proses watcher tetap ada tetapi port 4000 kosong → restart `npm run dev`.
- Status 401 dari backend memicu refresh sesi di `lib/api/client.ts`, dan status ≥ 502 diganti pesan "Server tidak
  dapat dihubungi" → error layanan pihak ketiga (provider AI) dipetakan ke 422/429.
- `@google/genai` & `protobufjs` punya install script (no-op / cek versi) → sengaja `false` di `allowScripts`.
- Dua migrasi dengan timestamp sama diurutkan menurut nama folder — beri migrasi baru timestamp yang lebih besar dari
  migrasi terakhir di `prisma/migrations` (cek dulu, thread lain bisa menambah migrasi).
- Prisma tidak mengenal indeks HNSW: indeks biasa maupun ekspresi cast (`embedding::vector(768)`) dianggap drift
  (`DROP INDEX`). Indeks **parsial** (`... WHERE embedding IS NOT NULL`) dan indeks ekspresi fungsi (GIN
  `to_tsvector`) diabaikan Prisma → aman. Query vektor wajib memakai kondisi yang sama.
- Smoke test yang menyimpan API key palsu: hapus key itu sebelum menulis record/berkas, kalau tidak worker indeks & OCR
  akan memanggil provider sungguhan dengan key palsu.
- `git worktree` sementara untuk membandingkan build: tautkan `node_modules` dengan junction lalu **hapus junction dulu**
  (`rmdir`) sebelum `git worktree remove --force`, agar `node_modules` asli tidak ikut terhapus.
- `setSearchParams` React Router **tidak mengantrekan** updater fungsi: dua setter `useSearchParam` yang dipanggil
  berturut-turut saling menimpa (perubahan pertama hilang, mis. dialog tidak bisa ditutup) → `useSetSearchParams`.
- Uji dialog Radix saat panel browser tersembunyi: animasi tutup tidak berjalan, elemen tetap ada dengan
  `data-state="closed"` → cari dialog dengan `[role=dialog][data-state=open]`.
- React StrictMode (dev) menjalankan cleanup `useEffect` sekali setelah mount pertama → ref penanda "sudah unmount"
  harus di-set ulang ke `false` di badan effect, kalau tidak komponen mengira sudah ditutup (mis. upload dianggap
  dibuang lalu dihapus). Di build produksi tidak terjadi, jadi bug ini hanya terlihat di dev.
- Panel browser Claude tersembunyi → elemen ber-layout lebar 0, koordinat pointer jadi `Infinity`. Loop yang bergantung
  koordinat bisa membuat tab hang → validasi `Number.isFinite` (sudah di `pushPoint`/`grownHeight`). Uji kanvas: ambil
  screenshot dulu agar panel terlihat; event pointer sintetis dalam satu task tidak melihat render React berikutnya
  (pisahkan per panggilan / `await` timeout).
- Tiptap: HMR tidak membangun ulang editor yang sedang terbuka (extension lama tetap dipakai) → reload halaman setelah
  mengubah extension. Alat uji `computer type/key` dan `execCommand` tidak memicu input rule (pintasan Markdown) →
  uji lewat `view.someProp("handleTextInput", …)`; instance editor ada di `document.querySelector(".ProseMirror").editor`.
- oxlint `react(purity)` menandai `Date.now()`/`new Date()` di fungsi bernama dalam komponen walau hanya dipanggil
  dari event handler → pindahkan ke helper level modul (`const nowIso = () => new Date().toISOString()`).
- Vite dev server bisa menyajikan modul **kosong** bila file terbaca saat sedang ditulis (mis. `prettier --write` pada
  banyak file sementara halaman terbuka) → error "does not provide an export named …" yang bertahan setelah reload.
  Cek `curl http://localhost:5173/src/<path>`; perbaiki dengan menyentuh file (`touch`) atau restart dev server.
- Cleanup React (unmount) **tidak berjalan** saat tab di-reload/ditutup → berkas yang belum tersimpan wajib dicatat
  `trackPendingUpload` (lihat §8b Lampiran) agar dibersihkan `usePendingUploadsJanitor`.
- Uji upload lewat panel browser Claude: jangan mencentang "Ringkas dengan AI" kecuali memang menguji AI — centang itu
  memanggil penyedia AI sungguhan (biaya/kuota). Uji pencatat upload: `localStorage` `lifeos.pendingUploads.<userId>`.

- Bash tool: `node -e "..."` berisi template literal (backtick) / `${...}` dijalankan sebagai command substitution oleh
  shell → teks rusak diam-diam. Tulis skrip ke scratchpad dengan tool Write (atau heredoc `<<'EOF'`) lalu `node skrip.js`.
- Item milik user lain di koleksi membawa `share`; jangan menyimpan ulang item bersama tanpa `userId`-nya (server
  menganggapnya milik sendiri → duplikat). `useCollection` sudah meneruskan `item.userId`.
- ID record buatan client (timestamp) unik per user, bukan global: item bersama dan item sendiri bisa (sangat jarang)
  ber-ID sama dan bentrok di cache koleksi — risiko diterima.
- WSL/Docker bisa **macet** (bukan berhenti): `wsl -e …`/`docker ps` menggantung, port 5432 tetap terbuka tetapi
  backend `/health` timeout & sesi browser ter-logout. Pulihkan (dengan izin user): `wsl --shutdown` → `wsl -e sh -c
  "sleep infinity"` (latar) → `docker compose up -d --wait`; data volume aman.
- DOCX yang merujuk gaya (`w:tblStyle`/`w:pStyle`) tanpa `word/styles.xml` membuat `mammoth` melempar TypeError → ekstraksi
  berstatus `failed` (worker tetap jalan). Dokumen Word asli selalu punya styles.xml; generator DOCX uji jangan merujuk gaya.
- Provider AI sungguhan bisa menjawab 503 "high demand" (Gemini) atau menggantung sampai `AI_TIMEOUT_MS` (3 menit) —
  bukan bug aplikasi. Saat uji UI tunggu lebih lama / coba ulang; jalur error (toast + pertanyaan kembali ke input) ikut
  teruji. Panel browser tersembunyi memperlambat `setTimeout` → batasi loop tunggu per panggilan `javascript_tool`.
- Setelah `prisma generate` (kolom/tabel baru), backend `nest start --watch` yang sedang berjalan bisa tetap memakai
  Prisma Client **lama** di `dist/generated` (watch tidak meng-emit ulang berkas hasil generate) → query ke kolom baru
  gagal 500. Cek `grep -c <kolom> dist/generated/prisma/internal/class.js`; perbaiki dengan restart `npm run dev`.
- Import dinamis paket yang belum pernah dimuat (mis. `@tiptap/markdown` lewat `markdown-to-doc`) membuat Vite dev
  mengoptimasi ulang dependensi dan me-reload halaman sekali — normal, ulangi aksinya.
- Tool Write mengubah escape `\u0300` di konten menjadi karakter Unicode literal (regex `[\u0300-\u036f]` jadi karakter
  kombinasi yang tak terbaca, walau tetap berfungsi). Tulis escape lewat skrip yang menyusun `String.fromCharCode(92)`,
  atau periksa hasilnya dengan `grep` setelah menulis.
- Container Docker di WSL (mode NAT) **tidak** menjangkau layanan Windows lewat `host.docker.internal`
  (`host-gateway` = VM WSL). Pakai IP gateway default WSL = IPv4 antarmuka Windows `vEthernet (WSL (Hyper-V firewall))`
  (berubah setelah restart → baca dinamis). `docker compose stop` tanpa `--profile office` tidak menyentuh service ber-profile.
- ONLYOFFICE membuat ulang berkas setiap menyimpan (zip & metadata baru) → isi sama bisa ber-checksum berbeda; jangan
  mengandalkan checksum untuk mendeteksi "tidak ada perubahan" lintas sesi. Esc/klik di dalam editor ONLYOFFICE (iframe)
  tidak sampai ke dialog Radix — sediakan tombol tutup; uji UI klik tombol header lewat `javascript_tool` bila fokus ada di
  iframe.
- Tool Write dengan path relatif (`....Users...`) dihitung dari folder kerja (drive D:) → file tertulis ke
  `D:Users...`, bukan scratchpad. Selalu pakai path absolut scratchpad.
- Plugin AI resmi ONLYOFFICE (mode pengaturan server) mengirim isi proxy sebagai JSON **tanpa** Content-Type → parser JSON
  Nest mengabaikannya (body kosong); jalur `/api/v1/office/ai/proxy` memakai parser teks (`main.ts`). Opsi plugin
  (`editorConfig.plugins.options[GUID]`) wajib di config bertanda tangan dari backend, bukan ditambah browser. Jembatan AI
  bergantung pada struktur plugin (`index.html`, `window.Asc.plugin.init`) → `docker compose build onlyoffice` gagal
  (grep) bila plugin berubah; cek ulang `lifeos-ai-bridge.js` saat itu. Impor dinamis modul aplikasi dari
  `javascript_tool` bisa memberi **instans modul lain** (store Zustand terpisah) → buka editor lewat UI. Panel browser
  sempit memotong tab toolbar ONLYOFFICE (tab AI tersembunyi) → `resize_window` lebih lebar saat uji.
- Menjalankan `npm run test:smoke` dua kali dalam satu menit → login 429 (batas 10/menit), bukan bug.
- ONLYOFFICE Community: `type: "mobile"` (editor web seluler) hanya bisa **melihat** ("butuh lisensi komersial") →
  frontend selalu `mobile: false`. Backend dev perlu `ONLYOFFICE_FONTS_DIR` di `backend/.env` untuk unggah font; mengubah
  `.env` tidak me-restart `nest start --watch` (ubah isi berkas src agar watch me-restart). Smoke test di stack produksi
  lokal: link berkas ONLYOFFICE memakai alamat internal `http://backend:4000` → smoke memetakannya ke `API_URL`
  (`hostUrl`). Folder backup stack uji dimiliki root → hapus lewat container.
- Compose produksi meneruskan env opsional yang tidak diisi sebagai **string kosong** (`VAR: ${X:-}`), dan
  class-validator `@IsOptional` hanya melewati null/undefined → env opsional bervalidasi (URL, `MinLength`) wajib memakai
  `@Transform(emptyToUndefined)` (`env.validation.ts`, + test). Uji stack produksi juga dengan fitur opsional **dimatikan**.

## 16. Memori & Kesinambungan Antar-Chat

- **Sumber kebenaran knowledge = file ini + `docs/`** (ikut di repo, otomatis dibaca Claude Code di setiap chat proyek
  ini, dan tetap ada walau berganti perangkat). Memori Claude lokal (`~/.claude/projects/.../memory/`) hanya ringkasan
  pendukung — jangan menaruh knowledge penting **hanya** di sana atau hanya di percakapan.
- Setiap keputusan teknis baru → §12; status → §11; pola/aturan baru → §8/§8b/§14; masalah lingkungan → §2/§15.
