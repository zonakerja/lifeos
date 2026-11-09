# CLAUDE.md — LifeOS

Knowledge base utama untuk Claude Code di proyek LifeOS. **Baca seluruh file ini di awal setiap chat/thread.**
Dokumen ini menggantikan memori percakapan: keputusan, konteks user, status, dan pola wajib tercatat di sini.
Perbarui **§11 Status** dan **§12 Log Keputusan** setiap selesai satu langkah berarti.
Dokumentasi untuk manusia ada di `docs/` (SETUP, DEPLOYMENT, ARCHITECTURE = fondasi + tech stack & versi, UPGRADE-PLAN, FILE-CONTROL,
ONLYOFFICE = riset & rencana integrasi editor dokumen, AI-AGENT = riset & rencana AI Agent: Hermes, Obsidian, WhatsApp, SRIKANDI/SIMAN/e-Kinerja,
TODO-USER = **to-do pemilik** langkah demi langkah — perbarui setiap ada pekerjaan baru yang harus dikerjakan user).

## 0. Memulai Thread Baru (checklist wajib)

1. Baca file ini sampai habis (terutama §11 Status, §14 Resep, §15 Jebakan). Untuk modul File Control baca juga
   `docs/FILE-CONTROL.md`; untuk deploy `docs/DEPLOYMENT.md`; untuk arsitektur & versi tech stack
   `docs/ARCHITECTURE.md` (fondasi); untuk upgrade dependensi `docs/UPGRADE-PLAN.md`; untuk menu Tools → ONLYOFFICE
   `docs/ONLYOFFICE.md`; untuk AI Agent `docs/AI-AGENT.md`.
2. Cek kondisi repo: `git status`, `git log --oneline -10` (commit terakhir = pekerjaan terakhir).
3. **Cek status lingkungan dulu (§2a)** — jangan menyalakan yang sudah aktif. Yang belum aktif: nyalakan (lihat §2):
   `wsl -e sh -c "sleep infinity"` (background) →
   `wsl -e sh -c "cd /mnt/d/Development/Application/LifeOS && docker compose up -d"` → preview `backend` & `frontend`
   (`.claude/launch.json`). Login `admin@lifeos.com` / `123`.
4. Pastikan baseline sehat sebelum mengubah apa pun: `npm test` (backend & frontend), `npm run test:smoke` (backend).
5. Tanyakan/konfirmasi ruang lingkup thread ke user bila belum jelas; catat keputusan di §12.
6. **Sebelum thread berakhir**: perbarui §11 Status, §12 Log Keputusan, pola baru di §8/§8b/§14, jebakan baru di §15,
   dokumen `docs/` yang terdampak, dan `docs/TODO-USER.md` bila ada tugas baru / selesai untuk user — lalu tawarkan commit (commit hanya atas perintah user). Knowledge yang hanya ada di percakapan akan hilang.

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
  SeaweedFS 8333/8888, ONLYOFFICE 8080 (profile `office`), robot 4100 (profile `robot`, hanya 127.0.0.1), Hermes 8642 (profile `agent`, hanya 127.0.0.1) (opsional: Prisma Studio 5555, Vite preview 4173, stack prod uji 80/443).
  Proyek user lain di laptop yang sama, **OnTrack Data Hub** (sumber data SIMAN/MyIntress, `docs/AI-AGENT.md` §16), memakai
  port sendiri (keputusan 2026-10-24): web 5174, API/MCP 3000, PostgreSQL 5433, Redis 6380 — jangan dipakai LifeOS. Satu komponen = satu
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
| Robot Playwright (Docker, opsional) | 4100 | … | Docker (WSL), profile `robot` | http://localhost:4100/health |
| Hermes agen (Docker, opsional) | 8642 | … | Docker (WSL), profile `agent` | http://localhost:8642/health · nyala: `wsl -e sh …/infra/hermes/up.sh` |
| WSL | — | berjalan / berhenti | — | proses penjaga `sleep infinity` milik Claude (bila ada) |

Tambahkan baris lain bila relevan (mis. stack produksi uji `lifeos-*test` di port 80/443, proses latar belakang Claude).
Akhiri dengan satu kalimat: apa yang masih menyala dan apakah aman menutup laptop.

**Cara mengecek** (PowerShell; tidak menyalakan apa pun):

```powershell
# Port yang sedang dipakai + prosesnya (wslrelay.exe = port container Docker)
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 80,443,4000,4100,5173,5432,6379,8080,8333,8888 } |
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
2. Docker: `wsl -e sh -c "cd /mnt/d/Development/Application/LifeOS && docker compose --profile office --profile robot --profile agent stop"` — **`stop`, bukan
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
| Database | 28 tabel domain terstruktur dari satu spesifikasi + kolom `extra` jsonb (lossless), snake_case, timestamptz |
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
├── backend/                  NestJS (Dockerfile, prisma/, src/, templates/office/ = dokumen kosong ONLYOFFICE,
│                             templates/knowledge-vault/ = templat vault Obsidian, test/smoke.mjs)
├── infra/knowledge-vaults/   vault Obsidian dev (KNOWLEDGE_VAULTS_DIR; isi tidak ikut git, hanya README)
├── frontend/                 React SPA (Dockerfile, nginx.conf, src/)
├── agents/hermes/skills/     skill Hermes (SKILL.md) — dipasang baca-saja ke container hermes & dibaca backend
├── robot/                    service robot Playwright (Dockerfile, src/server.ts, browser.ts, logic.ts) — konektor SRIKANDI/e-Kinerja
└── docs/                     SETUP.md · DEPLOYMENT.md · ARCHITECTURE.md · UPGRADE-PLAN.md · FILE-CONTROL.md · ONLYOFFICE.md · AI-AGENT.md ·
                              TODO-USER.md (to-do pemilik)
```

## 7. Infrastruktur

**Development** (`docker compose up -d`, image di-pin sama dengan produksi):

| Service | Container | Host port | Kredensial |
|---|---|---|---|
| PostgreSQL 18 + pgvector 0.8.7 | lifeos-postgres | 5432 | db `lifeos`, `postgres/postgres`; DB tambahan `lifeos_shadow` (cek drift); volume `lifeos-postgres18-data` |
| Redis 8.10 | lifeos-redis | 6379 | tanpa password |
| SeaweedFS 4.48 (S3) | lifeos-storage | 8333 (S3), 8888 (filer UI) | `lifeos` / `lifeos-secret`, bucket `lifeos-assets` (dibuat otomatis) |
| Hermes Agent 0.22.2 (opsional, profile `agent`) | lifeos-hermes | 127.0.0.1:8642 | image resmi `nousresearch/hermes-agent:v0.22.2`; `API_SERVER_KEY` dev di compose = `HERMES_API_KEY` backend/.env; volume `lifeos-hermes-data` (config.yaml, memori, sesi — **tanpa** API key model); skill repo di `/opt/data/skills/lifeos`; backend Windows = host `lifeos-api` (IP gateway WSL, diisi `infra/hermes/up.sh`); model = proxy LifeOS & MCP LifeOS ditulis `infra/hermes/configure.sh` (dijalankan up.sh); izin = tombol **Siapkan agen** di Asisten Agen |
| Robot Playwright 1.63 (opsional, profile `robot`) | lifeos-robot | 127.0.0.1:4100 | image `lifeos-robot:1.63.0` dari `robot/Dockerfile` (± 3,5 GB, Chromium); token dev di compose = `ROBOT_TOKEN` backend/.env; tanpa volume (sesi disimpan backend terenkripsi); nyala: `docker compose --profile robot up -d --wait robot` |
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
**Syncthing produksi** (opsional, `COMPOSE_PROFILES=sync`): service `syncthing` (UID 1000 = backend) menyinkronkan vault
Obsidian ke `./knowledge-vaults`; port 22000 TCP/UDP publik (satu-satunya selain Caddy), GUI hanya `127.0.0.1:8384` (tunnel
SSH), volume `syncthing-data`. Obsidian sendiri **tidak** dipasang di server/Docker. Panduan: DEPLOYMENT §10.

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
  `notebook_messages.attachments`; bersihkan chat / hapus notebook ikut menghapus lampirannya (hanya berkas context
  `notebook_chat`; lampiran context lain ditolak 400). Sumber berkas ganda ditolak. `GET /notebooks/usage` = item LifeOS
  & berkas yang menjadi sumber (dialog hapus catatan menolak bila catatan dipakai notebook). `GET /:id/messages?take=`
  → `{ messages, hasMore }` (100 terbaru, "Muat pesan lama"). **Berkas yang menjadi sumber notebook tidak bisa dihapus
  dari fitur lain** (`DELETE /uploads/:id` → 409) sampai dilepas dari notebook.
- **Settings**: `GET /settings/app` publik (branding login; **tanpa** data logo, hanya `logoVersion`); `GET /settings/app/logo`
  publik = gambar logo (data URL di kolom `app_logo` didekode; `Cache-Control: immutable` karena URL memuat `?v=`,
  `CSP: sandbox`); `PATCH` admin (`appLogo`: tidak dikirim = tetap, `""` = hapus, data URL PNG/JPG/WEBP/GIF/SVG = ganti).
- **AI** (`src/ai/`, detail: `docs/ARCHITECTURE.md` §3.1): `GET/PATCH /ai/settings`, `PUT/DELETE /ai/settings/:provider`,
  `POST /ai/settings/:provider/test`, `POST /ai/generate` (multipart `prompt` + `files[]`, maks. 5 / 20 MB). Katalog
  provider & model default di `ai-providers.ts`; satu klien per provider di `providers/` (Gemini `generateContent`
  stateless, Claude Messages streaming + `effort`/`fallbacks`, OpenAI Responses `store:false`). Kredensial di
  `ai_credentials` (terenkripsi, API hanya mengembalikan `keyHint`), provider aktif di `users.ai_provider`, sakelar
  **cadangan otomatis** `users.ai_fallback` (`ai-routing.ts`: lampiran tak didukung / kuota / tak terjangkau → provider
  lain yang punya key; respons `fallback`). **Pembagian tugas** `users.ai_routing` (jsonb; `ai-routing.ts` + test):
  provider per tugas `chat` (asisten & My Notebook) / `general` (bawaan `generate`) / `ocr` (pilihan → Gemini → OpenAI
  → Claude) / `embedding` (Gemini | OpenAI, `index/embedding.ts`, 768 dimensi; pencarian hanya vektor model sama; ganti
  ⇒ indeks dibangun ulang); `generate(userId, prompt, files, task)`. **Cadangan per tugas** (`chatBackup` /
  `generalBackup` / `agentBackup` di `ai_routing`, keputusan user 2026-11-06): dicoba tepat setelah provider tugas, lalu
  provider lain (hanya bila cadangan otomatis menyala; `taskBackup` = cadangan efektif di `effective`). **Proxy agen** ikut:
  `AiService.agentCredentials` = urutan kandidat, `AgentService.proxyChat` pindah ke berikutnya bila gagal **sebelum
  menjawab** dengan `isFallbackStatus` (429/402/408/5xx; 401/403/404/400 tidak) — `lastModelCall.fallbackFrom`. Error
  provider → 429 (kuota) / 422 (lainnya) — **jangan** 401 atau ≥ 502 (lihat §15). Semua role boleh memakai AI.
  **Jalur lewat router** (keputusan user 2026-11-06; `ai-endpoint.ts` + test): setiap kredensial bisa **langsung** (SDK resmi)
  atau **lewat router** pihak ketiga mana pun (`ai_credentials.base_url` + `api_format` openai | anthropic (khusus Claude) +
  `embedding_model`). Format OpenAI → `providers/openai-compatible.client.ts` (Chat Completions, gambar + PDF `file`, tanpa
  audio); format Anthropic → SDK Claude dengan `baseURL` (akhiran `/v1` dibuang), fitur beta ditolak router → diulang
  sekali tanpa fitur itu (`isUnsupportedFeatureError`; agen: `basicClaudeRequest`). Embedding lewat router = `/embeddings`
  OpenAI-compatible dengan ID model isian user. Proxy agen Hermes ikut (OpenAI → `{base}/chat/completions`, Anthropic →
  `proxyClaude`). ID model ditulis sesuai dokumentasi router; kemampuan Claude dikenali dari nama yang dinormalkan
  (`canonicalClaudeModel`: `claude-opus-5.5` = `claude-opus-5-5`). Alamat wajib https publik (`normalizeBaseUrl`; http/host
  lokal hanya di luar production); ganti jalur wajib key baru (key lama tidak pernah dikirim ke alamat lain). Label error &
  cadangan menyebut jalur ("Google Gemini lewat host").
- **Indeks pengetahuan / RAG** (`src/ai/index/`, detail: `docs/ARCHITECTURE.md` §3.2): tabel `ai_chunks` (pgvector 768,
  `gemini-embedding-2` dengan key Gemini pemilik data; tanpa key → tanpa embedding, pencarian kata saja), antrian BullMQ
  `ai-index` dipicu `RecordsService` & ekstraksi, sakelar `users.ai_index_enabled`, `GET /ai/index`,
  `POST /ai/index/rebuild`, `GET /ai/index/search` (vektor + full-text, RRF). Tipe yang diindeks: `INDEXED_TYPES`.
  `ai_chunks.collection` = `knowledge` (vault Obsidian & berkasnya) | `workspace` (lainnya) + `metadata` (jenis, status
  berlaku/draf/dicabut/templat, publik, …); `search(…, { only, collections, excludeStatuses, publicOnly })`. Pemotongan
  lewat **`chunkSource(sourceType, text)`** — satu aturan untuk indeks **dan** My Notebook (berkas/sumber notebook/catatan
  vault = `chunkStructured` per judul/BAB/Pasal; record = `chunkText`). Mengubah aturan pemotongan ⇒ "Indeks ulang".
- **Chatbot LifeOS & basis pengetahuan** (detail: `docs/ARCHITECTURE.md` §3.6, rencana `docs/AI-AGENT.md`): `POST /ai/chat`
  (`src/ai/chat/`: cari koleksi knowledge 8 + workspace 6 → catatan tertaut ikut (graf `knowledge_links`) → prompt
  `buildAssistantPrompt` (+ profil kerja, tanggal, ringkasan `<data_aplikasi>` dari browser) → sitasi `[n]` → riwayat
  `ai_conversations`/`ai_messages`; logika murni + test `ai-chat-context.ts`), `GET/DELETE /ai/chat/conversations…`,
  `GET/PUT /ai/profile` (`users.ai_profile`, juga ikut chat My Notebook). **Vault Obsidian** (`src/knowledge/`,
  `KnowledgeVaultService`): env `KNOWLEDGE_VAULTS_DIR` (kosong = nonaktif), vault user = subfolder `users.knowledge_vault`,
  pemantau `fs.watch` + pindai berkala → `knowledge_notes` (catatan `.md` / berkas `file` → asset konteks
  `knowledge_vault`, disembunyikan dari `GET /uploads`) + `knowledge_links` → indeks `sourceType = "obsidian"`; folder
  `00-Inbox` = draf (LifeOS hanya menulis di sini lewat `POST /knowledge/inbox`), `90-Templat` = tidak diindeks. Logika
  murni + test `vault-parser.ts`. Endpoint `/knowledge/status|folders|vault|vault/create|scan|notes|notes/:id|inbox`.
  **Menu Pengetahuan menulis ke vault** (keputusan user 2026-11-06, `docs/AI-AGENT.md` §25.2): `tree`, `graph` (node + edge +
  node bayangan `missing:<target>`), `search?q=&mode=text|semantic` (operator `path:` `tag:` `status:` `jenis:` `file:`),
  `health`, `prefs` (`users.knowledge_prefs`: penanda path + grup warna graf), `attachment?path=` (gambar sematan dibaca
  langsung dari disk, tidak di-OCR), `notes/:id/source` (isi mentah + hash), `PUT notes/:id` & `PATCH notes/:id/properties`
  (wajib `baseHash`; berkas berubah di disk → **409** `currentHash`, tidak pernah menimpa; YAML diubah lewat dokumen `yaml`
  agar komentar/urutan tetap), `POST notes` (nama sama → bernomor, templat `{{judul}}`/`{{tanggal}}`), `notes/:id/move`
  (perbarui `[[tautan]]` catatan perujuk; **id catatan berganti** — dibaca ulang dari path baru), `DELETE notes/:id` &
  `DELETE folders` = pindah ke `.trash` vault, `notes/:id/unlinked` + `link-mention`, `folders` / `folders/move`. Tulis
  atomik (berkas sementara → rename) lalu `scanNow`. Logika murni + test `vault-editor.ts`. Agen tetap hanya menulis `00-Inbox`.
  **Riwayat versi** (K7, tabel `knowledge_note_versions`, logika murni + test `vault-history.ts`): setiap tulisan LifeOS ke catatan
  lewat `writeNoteFile` (simpan editor, properti, centang tugas, sematkan tautan, perbarui tautan saat pindah, pulihkan) mencatat
  isi **sebelum** ditimpa (`before_*`); pemindai mencatat versi terpantau (`observed`, dirapatkan per 5 menit = ditimpa, kecuali
  sudah ditandai `before_*`); maks. 30 versi per path; riwayat dikunci per **path** dan ikut dipindah (`moveVersions`). Endpoint
  `GET notes/:id/versions`, `GET notes/:id/versions/:vid`, `POST notes/:id/versions/:vid/restore { baseHash }` (isi sekarang
  dicatat dulu → pemulihan bisa dibatalkan). Tulisan catatan baru dari LifeOS **wajib** lewat `writeNoteFile`, bukan `writeAtomic`.
  **Catatan harian** (K1, `KnowledgeDailyService` + logika murni & test `vault-daily.ts`): `POST /knowledge/daily { date }` (tanggal
  lokal dari browser) → `Harian/YYYY-MM-DD.md` dibuat **sekali** (`createAt`, `wx`; ada = dibuka, tidak pernah ditimpa) dari templat
  `90-Templat/Harian.md` bila ada (`{{tanggal}}` `{{judul}}` `{{jam}}` `{{lifeos}}` = tempat ringkasan) + ringkasan agenda, to-do,
  task jatuh tempo & terlambat tanggal itu (tautan wiki ke berkas cermin 80-LifeOS bila ada, selain itu tautan "buka" LifeOS).
  **Catatan berkala** (lanjutan K1, pola Periodic Notes; logika murni + test `vault-periodic.ts`): `POST /knowledge/daily { date, period:
  "week"|"month" }` → `Mingguan/YYYY-Www.md` (minggu ISO Senin–Minggu) / `Bulanan/YYYY-MM.md`, dibuat sekali dari
  `90-Templat/Mingguan.md` / `Bulanan.md` bila ada (penanda sama dengan harian) + tautan catatan harian (mingguan) / mingguan (bulanan)
  + agenda & task jatuh tempo periode itu (maks. 60 per bagian) — `KnowledgeDailyService.openPeriod`.
  **Catatan serupa** (K4): `GET /knowledge/notes/:id/similar` = rata-rata vektor potongan catatan vs potongan lain koleksi `knowledge`
  bermodel sama (SQL pgvector, tanpa panggilan AI); `available: false` = catatan belum punya embedding.
  **Tugas lintas vault** (K3, logika murni + test `vault-tasks.ts`, pola plugin Tasks): `GET /knowledge/tasks` = semua `- [ ]`
  (status ` `/`x`/`/`/`-`, 📅 ⏳ 🛫 ✅, prioritas 🔺⏫🔼🔽⏬, 🔁, `[due:: ]`, #tag, judul terdekat) dari isi tersimpan, kecuali
  `90-Templat`, `80-LifeOS`, blok kode, dan ringkasan LifeOS catatan harian (maks. 3.000); `POST /knowledge/tasks/toggle
  { noteId, index, raw, done, today }` menulis balik (`[x]` + `✅ tanggal`; dibuka lagi = tanggal dibuang; berulang `every N
  day|week|month|year` [`when done`] → kejadian berikutnya disisipkan di atasnya). Tugas dicari menurut urutan **+ baris asli**
  (bergeser → baris asli yang unik); tidak ketemu → **409**, tidak pernah menebak. Format tugas baru → `parseTaskLine`.
  **Bases** (K2, logika murni + test `vault-bases.ts`): berkas `.base` Obsidian (YAML `filters`/`formulas`/`properties`/`views`) —
  `GET /knowledge/bases` (semua `.base` di vault), `GET|PUT|DELETE /knowledge/bases/file?path=` (isi = objek hasil parse + `hash`;
  PUT wajib `baseHash` → berubah di disk **409**; kunci utama ditulis ulang lewat dokumen `yaml`, kunci lain & komentar tetap;
  YAML rusak → `error`, tidak ditimpa; `80-LifeOS` baca saja; hapus = `.trash`), `POST /knowledge/bases { name, folder? }`.
  Server tidak mengevaluasi filter — mesin ekspresi ada di frontend (`base-engine.ts`).
  **Canvas** (K8, logika murni + test `vault-canvas.ts`): berkas `.canvas` (JSON Canvas 1.0, sama dengan Canvas Obsidian) —
  `GET /knowledge/canvases`, `GET|PUT|DELETE /knowledge/canvases/file?path=`, `POST /knowledge/canvases` (DTO sama dengan Bases);
  PUT menulis utuh (indentasi tab) setelah `validateCanvas` (id unik, jenis text/file/link/group, posisi angka, garis merujuk
  node yang ada) + `baseHash` → **409**; JSON rusak → `error`, tidak ditimpa. Pemindai & pembuat berkas bersama `listVaultFiles` /
  `createVaultFile` (dipakai Bases juga). **Isi canvas diindeks RAG** (`canvasIndexText`: kartu teks urut posisi, rujukan catatan,
  tautan, grup, hubungan "A → B (label)"): `sourceType = obsidian_canvas`, `sourceId = path`, koleksi `knowledge`; dimuat lewat
  pemuat eksternal `AiIndexService.registerSourceLoader` (didaftarkan `KnowledgeVaultService`, tanpa ketergantungan melingkar);
  diantre saat simpan/buat/hapus dari LifeOS dan saat pindai (`syncCanvasIndex`: waktu ubah per path di memori — restart = semua
  diantre ulang, murah karena hash per potongan); templat & 80-LifeOS tidak diindeks. Canvas tidak masuk `knowledge_notes`.
  **Note composer** (K9, logika murni + test `vault-compose.ts`, pola core plugin Obsidian): `POST /knowledge/notes/:id/merge { targetId+targetHash |
  newTitle+folder, position, heading, baseHash }` & `POST /knowledge/notes/:id/extract { from, to, text, after, baseHash, … }`. Urutan tulis wajib: tujuan →
  perujuk (`rewriteReferrers`) → canvas (`updateCanvasRefs`) → sumber paling akhir (gabung = ke `.trash`), jadi gagal di tengah = teks ganda, tidak pernah hilang.
  Hash basi / pilihan tidak cocok → **409**. Gabung: nilai properti tujuan menang, `tags`/`aliases` disatukan, nama sumber masuk `aliases`, `title` sumber tidak
  ikut; `## Judul sumber` + perujuk `[[Tujuan#Judul sumber|Judul sumber]]` (bisa dimatikan; baris tabel tanpa alias); id blok bentrok → `id-2`. Ekstrak: posisi
  dihitung atas teks LF, perujuk & `[[#…]]` ke judul/blok yang pindah diarahkan ke tujuan, `[[#x]]` ke bagian yang tertinggal menjadi `[[Asal#x]]`. Catatan baru memakai
  templat `90-Templat/Note Composer.md` bila ada (`{{content}}`, `{{fromTitle}}`, `{{newTitle}}`, `{{date:FORMAT}}`). Versi `before_merge`/`before_extract`. Bukan alat
  MCP: agen tetap hanya menulis `00-Inbox`. **Rujukan canvas** kini ikut saat catatan/folder diganti nama atau dipindah (`retargetCanvasNodes`).
  **Ganti nama tag se-vault** (K10, logika murni + test `vault-tags.ts`): `POST /knowledge/tags/rename { from, to }` = properti `tags`/`tag` + `#tag` di isi + turunan
  (`#a/b`), tanpa peka huruf besar/kecil, tag yang sudah ada digabung; kode, judul, `[[a#b]]`, URL tidak tersentuh; kueri `tag:` grup graf ikut; cermin 80-LifeOS dilewati; versi
  `before_tag`; catatan ber-YAML rusak dilewati & dilaporkan (`failed`). Filter `.base` & teks canvas **tidak** ikut diubah.
  **Cermin hasil kerja → vault** (keputusan user 2026-11-06, `KnowledgeExportService` + logika murni & test `vault-export.ts`):
  satu arah LifeOS → folder `80-LifeOS/` (Catatan Bebas, List Bebas, Notes AI, My Notebook = indeks + catatan Studio + riwayat
  chat, Productivity = Project + Action, Area + struktur, Agenda yang punya hasil/induk, Resource Global), saling bertaut
  `[[path|judul]]`, frontmatter `sumber: lifeos` + `lifeos_id` + `lifeos` (alamat "Buka di LifeOS" dari `CORS_ORIGIN`).
  Pengaturan di `users.knowledge_prefs.export` (`setPrefs` mempertahankannya); pemicu = sidik jari tabel (jumlah + `updated_at`)
  dicek tiap menit + `PUT /knowledge/export` + `POST /knowledge/export/run`; `DELETE /knowledge/export/files` = hapus berkas
  cermin. Hanya berkas bertanda `sumber: lifeos` yang ditimpa/dihapus; hanya data milik sendiri. `EXPORT_DIR` **tidak
  diindeks** (`noteDocument`), tidak diperiksa (`noteProblems`/`vaultHealth`), dan baca saja (`findEditable` → 400 untuk
  sunting/properti/pindah/hapus/sematkan tautan). Jenis data baru → `SOURCES` (service) + `buildExport` + `EXPORT_KINDS`.
- **Integrasi agen / MCP** (`src/integrations/`, detail `docs/ARCHITECTURE.md` §3.7): token akses pribadi `api_tokens`
  (`lifeos_pat_…`, hash SHA-256, cakupan `knowledge:read|knowledge:write|workspace:read|workspace:write|ai:chat|requests:read|requests:write`,
  kedaluwarsa; `/integrations/tokens|scopes|activity`) + **MCP server** `POST /api/v1/mcp` (Streamable HTTP stateless,
  Bearer token — JWT login ditolak; tools disaring izin: search/read knowledge, inbox, search workspace, agenda, task
  terbuka, buat to-do lewat `RecordsService`, tanya asisten, daftar/buka/catat/analisis pengajuan, **alat skill agen**:
  `read_request_files`, `list_templates`, `get_template_fields`, `update_request` (status hanya maju, tidak bisa
  menyetujui), `create_request_document` — `docs/AI-AGENT.md` §22) + log `agent_activity_logs`. Logika murni + test
  `api-token-logic.ts`. Tool baru → `LifeosMcpService.createServer` (bungkus `run()` agar tercatat) + cakupan + smoke.
- **Pengajuan & Antrian Verifikasi** (`src/requests/`, detail `docs/ARCHITECTURE.md` §3.8): tabel `requests` (milik user,
  bukan record type; jenis psp/penghapusan/pemanfaatan/surat/lainnya, data surat, status `baru → diproses →
  menunggu_verifikasi → disetujui → dikirim` / `ditolak`, `source` manual/mcp/whatsapp, berkas pemohon context `request`,
  dokumen hasil templat context `request-document` — keduanya ikut terhapus bersama pengajuan, `history`). Agen AI:
  `POST /requests/:id/analyze` (ringkasan, field, kelengkapan vs persyaratan basis pengetahuan) & `/review` (telaah
  bersitasi + konsep jawaban) memakai teks ekstraksi berkas (masih dibaca → 409) + `AiIndexService.search` koleksi
  `knowledge`; prompt & pembaca JSON murni di `request-logic.ts` (+ test). Status maju otomatis tetapi tidak pernah mundur
  dan **disetujui/dikirim hanya oleh user**. **Mesin templat** `template-engine.ts` (+ test, docxtemplater + pizzip):
  templat DOCX context `office-template` dengan `${penanda}` & paragraf petunjuk `[…]`; penanda SRIKANDI
  (`nomor_naskah`, `tanggal_naskah`, `ttd*`) & penanda kosong dibiarkan utuh; teks beberapa baris → beberapa paragraf.
  `GET /requests/templates/:id/fields`, `POST /:id/suggest-values` (usulan AI), `POST /:id/documents`.
  `RequestsService.onStatusChange(listener)` = kait setelah user mengubah status (dipakai bot WhatsApp).
- **Bot WhatsApp** (`src/whatsapp/`, detail `docs/ARCHITECTURE.md` §3.9, operasional DEPLOYMENT §12): WhatsApp
  Cloud API resmi, bot **di LifeOS** (bukan Hermes publik). Tabel `contact_groups` (grup **umum**: satker / instansi /
  masyarakat / internal / lainnya + hak `allow_requests`, `share_requests`), `wa_contacts.group_id`, `wa_messages`,
  `requests.wa_contact_id`, `users.wa_bot` (profil layanan: nama & topik). Webhook `/whatsapp/webhook` (isi mentah `express.raw` + HMAC App Secret, aktif bila 5 env
  `WHATSAPP_*` lengkap; pemilik = `WHATSAPP_OWNER_EMAIL`) → antrian `whatsapp-inbound` → `WhatsappService.process`:
  kontak harus aktif & terverifikasi; berkas/`#ajukan` → pengajuan (bila grup mengizinkan); `#status` → `statusScope`
  (grup berbagi = pengajuan berkode grup, selain itu milik kontak sendiri; grup dari tabel, bukan dari pesan — AG-20);
  pertanyaan → pengetahuan `publicOnly` + `audienceGroup` (catatan `publik: true` atau properti `grup` = kode grup) +
  berlaku → jawaban JSON, ragu → `needs_reply`. **Jangan** menulis logika khusus satker: semua lewat grup. Tanpa kredensial / bukan pemilik = **mode simulasi** (`POST /whatsapp/simulate`, balasan
  `simulated`). Logika murni + test `whatsapp-logic.ts`.
- **Asisten Agen / Hermes** (`src/agent/`, detail `docs/AI-AGENT.md` §23, DEPLOYMENT §14): env opsional `HERMES_URL`,
  `HERMES_API_KEY` (= `API_SERVER_KEY` container), `HERMES_OWNER_EMAIL` (**hanya akun ini** yang boleh memakai agen — Hermes
  memakai token MCP milik satu akun; akun lain 403), `HERMES_SKILLS_DIR` (bawaan `../agents/hermes/skills`). Backend ↔ API
  server Hermes (OpenAI-compatible, Bearer): `GET /agent/status|skills|runs`, `POST /agent/chat` (run di sesi Hermes
  `lifeos-<userId>-<percakapan>`), `POST /agent/requests/:id/run { skill }` (perintah skill atas satu pengajuan, ditolak bila
  sudah diputuskan), `GET /agent/runs/:id`, `POST /agent/runs/:id/stop`. Tugas = **run asinkron** `/v1/runs` yang di-poll;
  run dipetakan ke user di memori (hilang saat backend restart). Error Hermes → 422/404 (bukan 5xx/401). Daftar skill LifeOS
  dibaca dari **folder repo** (`parseSkillFile`), bukan `/v1/skills` (bug Hermes 0.22.x). Logika murni + test `agent-logic.ts`.
  **Siapkan agen tanpa terminal** (`docs/AI-AGENT.md` §23.1): Hermes tidak menyimpan API key model — `model.provider: custom`
  → `AgentLlmController` `/agent/llm/v1/{models,chat/completions}` (OpenAI-compatible, streaming diteruskan) → Gemini/OpenAI:
  endpoint OpenAI-compatible resmi (`OPENAI_COMPAT_BASE`); **Claude: Messages API native** lewat SDK (`agent-claude.ts` + test:
  terjemahan dua arah, prompt caching penanda per blok `applyCacheMode` (alat, sistem, blok terakhir), `drop_block`, `fallbacks`, blok pemikiran disimpan `ClaudeTurnMemory` di memori backend) —
  dengan key tersimpan; `lastModelCall.usage` = token + cache; provider = tugas routing **`agent`**
  (`ai_routing.agent`, kosong = provider aktif; `AiService.agentCredential`). Kunci Hermes → LifeOS = `HERMES_API_KEY`
  (`${API_SERVER_KEY}` di config Hermes) yang dikenali sebagai token akses biasa: `POST /agent/setup { scopes? }` membuat token
  "Agen Hermes (otomatis)" milik pemilik agen dengan hash kunci itu (cakupan baru `ai:model` untuk model). `bearerToken`
  menerima `[A-Za-z0-9_-]{24,128}` (JWT bertitik tetap ditolak). Logika murni + test `agent-llm.ts`.
  **Run agen permanen** di tabel `agent_runs` (tombol, chat, aturan; `hermesRunId`) + pemantau 10 dtk di `AgentService`
  (mulai run antrian, baca status, batas 45 menit) — tidak lagi hilang saat backend restart.
  **Kebijakan Otomatis** (`agent-policy.service.ts`, logika murni + test `agent-policy.ts`, detail `docs/AI-AGENT.md` §24.6):
  aturan pemilik di `agent_policies` (jenis + grup → skill, mode off/shadow/auto, ambang skor aset, kolom kritis, toleransi,
  batas harian, masa tunda, templat Register). Pengajuan baru yang cocok → run `queued` (trigger `policy`) → agen memanggil
  MCP `submit_asset_check` (`requests/asset-verification.service.ts`: **server** mencocokkan ke data master — tahap 1 berkas
  JSON tiruan `AGENT_ASSET_MASTER_FILE`, kelak OnTrack) → `finalize` memutuskan dengan `decidePolicy` (model tidak
  memutuskan). Auto & lolos → Disetujui (riwayat `by: "kebijakan"`) → entri Register `reg-auto-<id>` dari templat → job
  `agent-send` setelah masa tunda → `registerSrikandiOutgoing` (Simpan konsep saja; **Kirim Konsep tetap user**) → kabar
  status. Shadow / sakelar darurat `users.agent_auto_paused` / batas harian = hanya dicatat. `/agent/policies*`,
  `POST /agent/requests/:id/auto/cancel`.
- **Konektor robot** (`src/robot/` + service `robot/`, detail `docs/ARCHITECTURE.md` §3.10, DEPLOYMENT §13): env opsional
  `ROBOT_URL`, `ROBOT_TOKEN`. Tabel `robot_connectors` (sesi browser `storageState` **terenkripsi**, kunci = HMAC turunan
  `AI_ENCRYPTION_KEY`, `robotSessionKey`) & `robot_runs` (tangkapan layar di object storage `robot/<userId>/…`, bukan
  Asset). Login = **browser jarak jauh**: `/robot/connectors/:system/login` → frame JPEG + input (klik/ketik/tombol terbatas)
  → `finish` simpan sesi; `check`, `capture` (eksplor: screenshot + `ariaSnapshot`). **Brankas kredensial** (keputusan user
  2026-10-25) `credential-vault.ts`: AES-256-GCM, env `CREDENTIAL_ENCRYPTION_KEY` khusus (tanpa fallback), AAD
  user+sistem+kolom, simpan wajib kata sandi akun LifeOS, tidak pernah dikembalikan ke browser. **Login otomatis**
  (`auto-login` → `answer`): robot mengisi kredensial (`robot/src/login-form.ts` mengenali kolom), CAPTCHA & OTP **diketik
  user** (tanpa OCR; rahasia TOTP tidak disimpan). Modal "berhasil" setelah login ditutup robot (`infoDialogButton`: hanya
  teks berhasil/sukses + tombol OK/Tutup; modal keputusan tidak pernah). Robot hanya membuka host konektor dan tidak pernah
  menandatangani / mengirim hasil akhir — tugas agent sampai draf, keputusan kirim di tangan user. Alur pengisian (tahap 6b) dibangun dari
  rekaman eksplor + **Rekam halaman ini** di tayangan (`POST /robot/sessions/:id/capture`, untuk formulir/modal yang muncul
  setelah klik); peta e-Kinerja: `/skp` → SKP per periode → `/skp/renaksi/<id>` (`docs/AI-AGENT.md` §21.2). **Job robot**
  (tabel lengkap `docs/ARCHITECTURE.md` §3.10): SKP/RHK & Renaksi e-Kinerja, naskah ber-TTD SRIKANDI, referensi (+ klasifikasi
  `categories`), **Register** `POST /robot/srikandi/register/:id { dryRun? }` → `registerSrikandiOutgoing` (berkas dari object
  storage → robot `/jobs/srikandi/register`, body ≤ 40 MB) → konsep di Log Naskah Keluar, entri `submitted`. **Tautan publik berkas** `src/uploads/public-links.ts` (`public_links`, token hash, `/api/v1/public/files/:token`).
  **Brankas digital** `src/uploads/public-vaults.ts` (+ `vault-logic.ts` + test; `public_vaults`, `public_vault_files`,
  `public_vault_accesses`): satu tautan publik `/brankas/bv_<token>` per poin renaksi berisi beberapa berkas terisolasi; `/vaults*`
  (pemilik: buat/ubah berkas — tautan tetap/ganti tautan/hapus/log akses), publik `/public/vaults/:token[/files/:id]`; setiap
  buka/lihat/unduh dicatat (IP, perkiraan lokasi via env `GEOIP_PROVIDER` ipapi|none, peramban); berkas brankas → `DELETE /uploads` 409.
  Brankas dihapus / berkas dikeluarkan → unggahan khusus brankas (context `renaksi-vault`) yang tidak dipakai brankas lain ikut
  dihapus (`vaultFilesToRelease`); lampiran item tidak disentuh. Hapus entri renaksi dari robot → `PublicVaultsService.removeForEntry`.
- **Otomasi terjadwal** (`src/automation/`, detail `docs/ARCHITECTURE.md` §3.12): jadwal sinkron robot **baca-saja** per user
  (`automation_jobs` = sumber kebenaran, `schedule` jsonb daily/hourly/cron + zona waktu, maks. sekali per jam; logika murni +
  test `automation-logic.ts`) → job scheduler BullMQ `auto:<userId>:<kind>` di antrian `automation` (disamakan dengan tabel saat
  start), worker concurrency 1, satu percobaan. Jenis = `ROBOT_JOB_KINDS` (`robot/robot-jobs.ts`): `*_session` (**Jaga
  sesi login** = `RobotService.check`: sesi dibuka → `storageState` terbaru disimpan ulang terenkripsi; sesi habis = gagal),
  `ekinerja_skp`, `ekinerja_renaksi`, `srikandi_letters`, `srikandi_references`, `srikandi_classifications`; isi Renaksi &
  daftarkan naskah **tidak** dijadwalkan. Sesi belum ada / `status = expired` → worker **melewati** tugas sistem itu tanpa
  membuka sistem (`pauseReason`), jalan lagi sendiri setelah login ulang. **Notifikasi** `GET /automation/alerts`
  (`automationAlerts` + test: `session_expired` / `session_missing` (jadwal aktif tanpa sesi) / `job_failed`; tanpa membuat
  baris konektor). `RobotService.exclusive` = kunci per user + sistem (409 bila sistem sedang dipakai tugas lain; jadwal
  yang bertabrakan → `skipped`); method sinkron publik = pembungkus tipis (`job(...)`) atas `read*` privat dan menerima
  `trigger` (`button` bawaan). Riwayat `automation_runs` (schedule | manual | button, 50 terakhir); tombol menu asal dicatat
  lewat `RobotService.onJobFinished`. `/automation/jobs`, `PATCH /automation/jobs/:kind`, `POST …/:kind/run`, `/automation/runs`.
- **Database**: tabel & kolom snake_case (`@@map/@map`), timestamptz(3), FK `users` cascade. 28 tabel domain
  (agenda_types, schedules, routines, todos, routine_completions, free_notes, ai_notes, note_lists, areas, projects,
  activities, tasks, resources, para_archives, para_archive_logs, archive_classifications, archive_retention_schedules,
  archive_locations, archive_borrowings, archive_dispositions, archive_move_logs, skps, skp_targets, action_plan_entries, action_plan_months, srikandi_references, srikandi_letters, srikandi_outgoings) dengan kolom sistem
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
  `20261016130000_asset_draft_link` (konsep ↔ dokumen final) + `20261018120000_sub_area_without_date` (Sub Area tanpa
  tanggal & lampiran) + `20261024120000_knowledge_base` (koleksi/metadata `ai_chunks`, `users.ai_profile` &
  `knowledge_vault`, `ai_conversations`, `ai_messages`, `knowledge_notes`, `knowledge_links`) +
  `20261024130000_ai_routing` (`users.ai_routing`) + `20261024140000_api_tokens_mcp` (`api_tokens`, `agent_activity_logs`) +
  `20261024150000_requests` (Pengajuan) + `20261024160000_whatsapp_bot` (grup kontak, kontak & pesan WhatsApp, profil
  bot; `requests.satker`/`satker_code` → `applicant`/`group_code`) + `20261025120000_robot_connectors` (konektor robot,
  log run, tautan publik berkas) + `20261025130000_robot_credentials` (brankas kredensial) + `20261025140000_action_plans` (record type `skp_target` &
  `action_plan_entry` — RHK & rencana aksi e-Kinerja) + `20261025150000_skp_sync` (record type `skp`, RHK per SKP) +
  `20261025160000_srikandi_letters` (record type `srikandi_letter`) + `20261025170000_srikandi_references` (record type
  `srikandi_reference`) + `20261031120000_srikandi_outgoing` (record type `srikandi_outgoing` — Register Naskah Keluar) + `20261031130000_action_plan_months`
  (record type `action_plan_month` — potret bulan Rencana Aksi e-Kinerja) + `20261031140000_public_vaults` (brankas digital + log
  akses) + `20261101120000_automation_jobs` (jadwal & riwayat otomasi) + `20261106130000_ai_router_endpoints` (jalur router per kredensial AI) + `20261106140000_knowledge_prefs` (preferensi menu Knowledge) + `20261106120000_agent_policies` (Kebijakan Otomatis,
  `agent_runs`, sakelar darurat, `requests.asset_check`/`auto_decision`) + `20261107120000_knowledge_note_versions` (riwayat versi
  catatan vault). Migrasi baru → lihat docs/SETUP.md §10
    (`prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`, lalu cek
    drift dengan `--exit-code`; shadow DB dari `SHADOW_DATABASE_URL`).
- **Records API**: `GET /records/:type?from&to` (milik sendiri + item bersama bertanda `share`), `PUT
  /records/:type/:clientId` `{ payload, userId? }` (upsert, juga undelete; `userId` = pemilik item bersama, butuh izin
  edit; item baru di dalam item bersama otomatis milik pemilik induknya), `DELETE /records/:type/:clientId?userId=`
  (soft delete; item induk bersama hanya oleh pemiliknya). `share` di payload dibuang server. **Daftar ringan**
  `?light=1` (`record-light.ts` + test: `free_note` tanpa `doc` & `ink` dipotong ke pratinjau, `ai_note` tanpa
  `fileContext`; record ditandai `partial`) + `GET /records/:type/:clientId?userId=` (satu record utuh, cek berbagi).
  PUT menerima `preserve` (key tidak utuh → nilai tersimpan dipertahankan) dan `base` (isi sebelum perubahan → untuk
  tipe di `MERGE_ARRAY_KEYS` = `list`, selisih base → payload diterapkan di atas isi terkini, `record-merge.ts` + test;
  salinan frontend `lib/record-merge.ts` — ubah keduanya bersamaan).
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
  referensi File Control: `useClassifications/useJraList/usePhysRefs({ includeShared })`). `LIGHT_TYPES` (`free_note`,
  `ai_note`) dimuat sebagai daftar ringan: item bertanda `_partial` (key tidak utuh) — **editor wajib memuat isi lengkap**
  lewat `useCompleteItem(type, item)` (dan `fetchCompleteItem` sebelum menghapus berkas di dokumen); menulis item
  `_partial` otomatis mengirim `preserve`, jadi spread `{ ...item, x }` aman — **jangan** membuat ulang objek item
  partial tanpa spread. Tipe `MERGE_ARRAY_KEYS` (List) mengirim `base` sehingga tulisan bersamaan (kolaborator / tab
  lain) tidak saling menimpa; hasil gabungan server dipasang ke cache tanpa menimpa perubahan lokal yang lebih baru.
- **Design system (wajib)**: token OKLCH di `src/index.css`; dilarang warna hardcoded / ternary dark mode. Warna modul
  via `data-module` → `bg-module`, `text-module`, `bg-module-soft`, `bg-module-gradient`, `text-module-foreground`;
  status `success | warning | info | destructive`. Font Figtree. Setiap halaman memakai `<ModulePage module="...">`.
  Pakai komponen shadcn; jangan membuat modal/tombol custom.
- **Bundle**: rute, halaman login, `Markdown` (react-markdown + KaTeX, `markdown-renderer.tsx`), `html5-qrcode`, dan
  editor Catatan Bebas (Tiptap + tinta, chunk `free-note-editor` ±485 kB) dimuat malas. Chunk utama ±440 kB (termasuk host editor ONLYOFFICE; sejak tahap 3 floating-ui/popper ikut chunk utama —
  sebelumnya chunk terpisah yang tetap dimuat saat start); tanpa
  peringatan ukuran chunk. Tab My Notebook = chunk `notebook-tab` (±42 kB). Menu Pengetahuan: `knowledge-page` ±82 kB,
  `graph-canvas` ±185 kB, `note-editor` (CodeMirror) ±375 kB, `bases-tab` ±40 kB (juga dipakai sematan `![[x.base]]`), `canvas-tab` ±24 kB — dimuat malas. Mermaid (`mermaid-diagram.tsx` → `import("mermaid")`, elk ±1,4 MB) hanya dimuat saat catatan berisi diagram; `chunkSizeWarningLimit` 1500 kB karena itu, chunk utama tetap ±405 kB.
- **CSP produksi** (`nginx.conf`): `script-src 'self'`, `connect-src 'self'` (AI lewat backend), `style-src 'self'
  'unsafe-inline'`, `img/media blob: data:`. Domain eksternal baru → tambahkan di sini (lebih baik lewat backend).

### Pola implementasi frontend (WAJIB)
- **Koleksi data**: pakai hook bertipe di `src/data/collections.ts`; tipe entitas di `src/types/entities.ts`.
- **Dialog form**: state di komponen *dalam* yang di-mount saat dialog terbuka (`useState(() => dariProps)`), atau
  `key` pada inner. **Jangan** sinkronisasi props→state dengan `useEffect`.
- **Deep link via URL** (`useSearchParam`): `?edit=`, `?todo=`, `?date=`, `?agenda=<id>|new` (lihat/buat agenda di Overview, Harian, Jadwal), `?schedule=<id>` (Notes AI baru dari agenda),
  `?project=`, `?area=`, `?task=`, `?resource=`, `?note=<id>|new` (Catatan & Notes AI, `links.note(tab, id)`; Catatan juga `new-ink` = tulis tangan), `?archive=`,
  `?list=<id>` (List Bebas, `links.list(id)`), `?notebook=<id>` (My Notebook, `links.notebook(id)`),
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
- **Chatbot melayang** (`features/assistant/floating-chatbot.tsx`): memakai `POST /ai/chat` lewat `useAiChat()`
  (`data/use-ai-chat.ts`), bukan `useAi()`; percakapan baru / riwayat (popover) / hapus; ringkasan data aplikasi tetap
  dikirim sebagai `snapshot` (`buildLifeosContext`); chip sitasi → `citationTarget` (`features/knowledge/knowledge-utils.ts`
  + test: catatan vault → `openKnowledgeNote(id)` = dialog global `KnowledgeNoteHost` di AppShell, berkas → `previewFile`,
  record → `recordSourcePath`); "Simpan ke Inbox" (`answerForInbox`: `[n]` → `[[judul]]`). **Menu Knowledge** (dulu "Pengetahuan", label diganti 2026-11-06) (`/knowledge/:tab`,
  Workspace setelah Notes Space, warna `--mod-knowledge`, `features/knowledge/workspace/`, hook `data/use-knowledge-workspace.ts`,
  logika murni + test `knowledge-logic.ts`): tab **Catatan** (`?note=<id>&h=<judul>`; ≥ 1280 px tiga kolom penjelajah | catatan |
  info, 1024–1279 px penjelajah + Catatan/Info, di bawahnya tab — satu tata letak saja yang dirender; penjelajah dengan menu klik
  kanan & seret-lepas, Cari kata/makna, Tag, Penanda; pembaca `NoteMarkdown` = `[[tautan]]` + pratinjau hover, `![[sematan]]`,
  callout, id judul dari nomor baris `outline()`; **sematan bagian & blok** (K6, logika murni + test `note-blocks.ts`):
  `![[catatan#Judul]]` = bagian sampai judul setingkat, `![[catatan#^id]]` = satu blok (paragraf / butir / tabel bertanda `^id` di akhir
  baris atau baris sendiri), penanda `^id` dirender jangkar tak terlihat `blk-<id>` (`BLOCK_SCHEME`), `[[catatan#^id]]` lompat ke blok,
  nama kosong `[[#…]]` = catatan ini (`NoteMarkdown noteId`, konteks `byId`); editor CodeMirror 6 dimuat malas `note-editor.tsx` —
  simpan otomatis 1,5 dtk, Ctrl+S, pelengkap `[[` + `[[catatan#` (judul) + `[[catatan#^` (blok; blok tanpa id diberi `^id` baru:
  catatan lain lewat `source` + `save` ber-`baseHash`, catatan sendiri dalam satu transaksi editor), bentrok → Muat versi terbaru / Simpan sebagai salinan; panel info Properti (formulir frontmatter),
  Garis besar, Backlink, Sebutan tanpa tautan, Tautan keluar, **Catatan serupa** (skor %, penanda "bertaut"), Graf lokal, Tanya AI;
  tombol **Catatan hari ini** + pilih tanggal (popover juga **Mingguan** / **Bulanan**; palet: Catatan minggu/bulan ini) di header
  (`features/knowledge/daily-note-button.tsx`, `useDailyNote().open(date, after?, period?)`, juga ikon di Planner Harian
  `PlannerDailyNoteButton` — tampil bila vault sudah dipilih)), **Tugas** (K3, `tasks-tab.tsx`: kelompok Terlambat / Hari ini / 7 hari
  / Nanti / Tanpa tanggal / Selesai, atau per catatan; cari kata & `#tag`; centang optimistis `useToggleKnowledgeTask`; logika murni
  + test `task-logic.ts`; `VaultTaskRow` + `useVaultTaskToggle` juga dipakai `PlannerVaultTasks` di kartu To-Do Planner Harian =
  tugas vault jatuh tempo tanggal itu + terlambat saat hari ini), **Bases** (K2, `bases-tab.tsx` dimuat malas, `?base=<path>&view=<n>`;
  mesin + test `base-engine.ts`: subset sintaks Bases Obsidian — properti `status`/`note.x`/`note["…"]`/`file.*`/`formula.*`,
  `! && ||`, perbandingan, aritmetika & tanggal ± durasi, `today() now() date() if() number() list()`, `file.hasTag/inFolder/
  hasProperty`, metode `contains… isEmpty lower upper`; ekspresi tak dikenal = dicatat & diabaikan (tidak menyembunyikan catatan);
  tampilan Tabel (satu tabel, baris judul per kelompok) / Kartu / Daftar; dialog Atur tampilan = nama, bentuk, batas, kolom,
  urutan, kelompok, filter (ekspresi bisa disunting + penyusun kondisi `buildCondition`); Filter & rumus base; fungsi/properti
  baru → `call`/`fileField` + `FILE_LABELS`; ringkasan kaki tabel `summaries` (`summarize`, nama Obsidian: Average, Median, Min,
  Max, Sum, Range, Stddev, Earliest, Latest, Checked, Unchecked, Empty, Filled, Unique); sel properti `note.*` disunting langsung
  (`EditableCell` → `setProperties` ber-hash; bukan tag, rumus, properti berkas, cermin 80-LifeOS; bentuk nilai mengikuti nilai lama
  `parseCellInput`); sematan `![[x.base]]` / `![[x.base#Tampilan]]` di catatan = `EmbeddedBase` dimuat malas dari `note-markdown`,
  tautan `[[x.base]]` membuka tab Bases (`?base=` boleh nama berkas)), **Canvas** (K8, `canvas-tab.tsx` dimuat malas, `?canvas=<path|nama>`;
  logika murni + test `canvas-logic.ts`: warna preset "1"–"6" → token, geometri garis Bezier per sisi, pas layar, operasi
  tambah/pindah (kisi 10, grup ikut memindah isinya)/ubah ukuran/hapus/hubungkan; papan geser + Ctrl/roda zoom, kartu teks
  (Markdown, klik dua kali sunting), catatan/berkas (isi catatan / gambar), tautan (kartu, tanpa iframe), grup; titik di sisi kanan
  kartu diseret ke kartu lain = garis; simpan otomatis 700 ms berantai dengan hash (409 → muat ulang); data terkini lewat ref
  `latest` — **jangan** menghitung perubahan dari closure render; node/garis tak lengkap → hanya-baca; `[[x.canvas]]` /
  `![[x.canvas]]` di catatan = papan mini baca-saja `EmbeddedCanvas` (dimuat malas dari `note-markdown`, dipaskan ke kotak 340 px,
  klik judul / klik dua kali = buka tab Canvas; di dalam kartu/sematan lain = kartu pembuka); sitasi chatbot canvas →
  `links.knowledgeCanvas(path)`), **Riwayat versi** (K7, menu ⋯ catatan & palet perintah →
  `version-history-dialog.tsx`: daftar versi + asal, Perubahan (diff baris `line-diff.ts` + test, dibanding isi terkini yang selalu
  dibaca ulang `useKnowledgeSource(id, { fresh: true })`) / Isi versi, Pulihkan dengan konfirmasi), **Graf** (`graph-canvas.tsx`
  react-force-graph-2d dimuat malas; bergaya Graph view Obsidian — panel Filter (cari, tag sebagai node, lampiran, hanya berkas
  yang ada, yatim, cermin 80-LifeOS, Inbox/Templat), Grup (warna status + grup kueri tersimpan per akun), Tampilan (panah, ambang
  pudar teks, ukuran node, tebal tautan, **Animasi** = pertumbuhan vault dari catatan tertua), Gaya (pusat, tolak, tautan, jarak);
  pengaturan per browser `graph-settings.ts` (+ test, localStorage `lifeos.knowledgeGraph`); objek node dipakai ulang per id agar
  posisi tidak melompat saat difilter; catatan cermin `isMirrorNote` = baca saja + tombol Buka di LifeOS), **Tabel** (properti per
  kolom, ubah status/jenis/publik di sel), **Inbox** (kurasi: status + publik + pindah folder), **Kesehatan**; pembuka cepat
  Ctrl+O (`CommandDialog` + `<Command>`) + **palet perintah Ctrl+P** (K5, `command-palette.tsx`: grup Catatan ini / Sisipkan di
  editor / Vault / Buka tab; catatan terbuka & editor aktif didaftarkan ke store sebagai `active` & `editor` oleh `NoteView` &
  `NoteEditor`) + **perintah `/` di editor** (awal baris / setelah spasi; potongan Markdown & templat `90-Templat` — logika murni +
  test `editor-snippets.ts`; perintah sisip baru → `SNIPPETS`); **Pelengkap pembaca** (K10): blok ```mermaid → `NotePre` (komponen tingkat modul) + `MermaidDiagram` (`securityLevel: strict`, tema mengikuti aplikasi, cache hasil per tema + kode, galat tampil dengan kodenya; juga di kartu Canvas & sematan); catatan kaki `[^1]` (GFM; tautan `#…` digulir di dalam `[data-note-md]`, bukan tab baru); sorotan `==teks==` (`MARK_SCHEME`) & komentar `%%…%%` di `toReaderMarkdown`; jumlah kata `noteStats` (header mode baca; mode sunting langsung + "n dari m" saat ada pilihan); ganti nama tag = ikon di panel Tag; perintah `/` Diagram Mermaid & Catatan kaki. **Note composer** (K9, `compose-dialog.tsx`): gabung dari palet, menu ⋯ catatan, klik kanan penjelajah; ekstrak dari palet saat mode sunting + ada pilihan (`EditorBridge.selection`, judul bawaan `extractTitle`, sisa teks diingat per browser `lifeos.noteComposer.after`); sebelum dikirim editor di-`flush`, sesudahnya `active.control.reload()`; dialog bersama `workspace-dialogs.tsx` + store `workspace-store.ts`. Dialog sitasi
  `KnowledgeNoteHost` punya "Buka di menu Knowledge" (`links.knowledgeNote(id, heading?)`). **Tools → Basis Pengetahuan**
  (`features/tools/knowledge/knowledge-settings.tsx`, hook `data/use-knowledge.ts`) = **pengaturan saja** (keputusan user
  2026-11-06: daftar catatan & daftar masalah pindah ke menu Knowledge): profil kerja, vault (pakai folder / buat dari templat /
  pindai / lepas + pintasan Buka Pengetahuan / Kesehatan), kartu **Cermin hasil kerja ke Obsidian** (sakelar, jenis data,
  Sinkronkan sekarang, Hapus berkas cermin; `useKnowledgeExport`), cara memakai + peringatan kuota gratis Gemini (juga di Tools →
  Indeks Pengetahuan). **Tools → Indeks Pengetahuan**
  (tab `index`, `features/tools/knowledge-index/knowledge-index-settings.tsx`; keputusan user 2026-10-31, dulu kartu di
  Pengaturan → AI): sakelar indeks, statistik, Indeks ulang, uji pencarian. **Pengaturan → Model AI** (tab URL tetap
  `api`; dulu "AI"): provider, API key, model, cadangan otomatis, kartu **Pembagian tugas AI** (`ai-routing-card.tsx`);
  tautan silang Model AI ↔ Indeks Pengetahuan ↔ Basis Pengetahuan. **Pengaturan →
  Integrasi** (`integrations-tab.tsx`, hook `data/use-integrations.ts`, helper `integrations-utils.ts` + test): token
  akses agen (dialog buat → token tampil sekali + contoh konfigurasi Hermes/JSON, cabut) + Aktivitas agen.
- **Editor dengan simpan eksplisit** (mis. Notes AI): cegah perubahan hilang dengan `useBlocker` (React Router; abaikan
  navigasi yang disengaja lewat ref `leavingRef`) + listener `beforeunload` selama ada perubahan/proses berjalan, dan
  dialog Simpan / Buang / Batal. Editor tanpa proses berat (Catatan) cukup **simpan otomatis** lewat `setItems` — antrian
  tulis `useCollection` tetap terkirim walau komponen sudah unmount.
- **Notes Space** (`features/notes/`, `notes-page.tsx`): tab berurutan **Catatan Bebas** (`free`) → **List Bebas**
  (`lists`) → **Notes AI** (`ai`) → **My Notebook** (`notebook`, chunk malas); hero = jumlah catatan, list aktif,
  Notes AI, notebook. Logika murni + test di `lib/notes-logic.ts` (urutan: disematkan dulu lalu terakhir diubah / tanggal,
  pencarian, prompt ringkasan & transkrip & tulisan tangan, progres list, berkas yang aman dihapus); baca isi dokumen lewat
  `lib/read-file-text.ts` (ekstraksi backend `GET /uploads/:id/metadata`, cadangan AI). Catatan Bebas & Notes AI dimuat
  sebagai **daftar ringan** → editor dibuka lewat `useCompleteItem` (pemuat "Membuka catatan…"); `?note=<id>` yang tidak
  ada / tidak lagi dibagikan menampilkan "tidak ditemukan" + Kembali. Hapus catatan lewat `NoteDeleteDialog` (lihat
  Lampiran).
  - **Catatan Bebas**: kartu warna (`note-colors.ts`), pratinjau tulis tangan dari coretan yang dipotong server, sematkan,
    cari, paginasi 12; simpan otomatis (detail editor di bawah).
  - **List Bebas** (`lists-tab.tsx`, record `list`): item dicentang/diurutkan/diubah/dihapus langsung di kartu, progres
    `selesai/total`, "Hapus yang selesai", arsip (tampilan Arsip terpisah), paginasi 9. Ubah judul/teks item: Enter atau
    klik di luar = simpan, **Esc = batal**. Tulis memakai penggabungan `base` (List bersama tidak saling menimpa).
    `?list=<id>` menyorot list dan menaruhnya paling atas; list diarsipkan / hilang → keterangan + "Lihat arsip".
  - **Notes AI** (`ai-note-editor.tsx`, simpan eksplisit — lihat "Editor dengan simpan eksplisit"): judul, tanggal, agenda
    terkait (`agenda-options.ts`, `?note=new&schedule=<id>` terisi dari agenda), **audio** (rekam / unggah → transkrip AI,
    maks. 20 MB), **dokumen tambahan** (teks ekstraksi server, dibatasi 200 rb karakter), catatan kasar, **ringkasan AI**
    dengan gaya Standar / Akademis / Risalah Rapat / Catatan Mudah / Kustom (`summary-style-dialog.tsx`, `SUMMARY_STYLES`)
    yang bisa disunting. Unggahan dicatat `trackPendingUpload` sampai Simpan/Buang; **Simpan dikunci selama merekam**.
    Berkas audio/dokumen dihapus dari storage saat diganti, perubahan dibuang, atau catatan dihapus (`removeUploads`).
  - **Berkas pemilik di catatan bersama**: kolaborator berizin Edit tidak boleh menghapus berkas pemilik → ID yang ditolak
    (403) dicatat di `orphanUploadIds` catatan (`removeUploadsCollectForbidden`), lalu `useOrphanUploadsJanitor` (tab
    Catatan Bebas & Notes AI milik pemilik) menghapus yang sudah tidak dipakai dan mengosongkan daftarnya.
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
  pertama = pilihan awal), `AddAttachmentButton label`, `AttachmentForm initial` (isian awal). `AttachmentTable` membuka
  lampiran **catatan** di dalam aplikasi (Notes Space), bukan tab baru; tab Resources juga membuka resource catatan di
  Notes Space. Lampiran catatan yang disimpan ke Resource Global membawa `noteId` dan dicocokkan lewat `noteId` (tidak
  dibuat ganda saat item disimpan ulang). **Catatan yang masih dirujuk tidak bisa dihapus**: hapus Catatan Bebas / Notes AI
  / List lewat `<NoteDeleteDialog noteKey="free|ai|list-<id>">` (`resources/note-delete-dialog.tsx`; logika murni
  `note-references.ts` + test: lampiran hasil/dasar agenda, Project, Area, Action/Task, Resource Global) — bila ada rujukan,
  dialog menampilkan tempatnya (klik = buka item untuk melepas tautan) tanpa tombol hapus. `linkedScheduleId` saja bukan
  rujukan. Snapshot arsip PARA tidak dihitung. Sumber My Notebook ikut dihitung (`useNotebookUsage`). Tempat baru yang
  menyimpan lampiran catatan → tambahkan ke `noteReferences`.
  - **Buat dokumen ONLYOFFICE** = pilihan Tipe UI `"office"` ("Buat Dokumen (ONLYOFFICE)", `OFFICE_ATTACHMENT_TYPE`) yang
    disimpan sebagai tipe `file` (state `fileSource`): `NewOfficeDocumentPicker` (4 jenis, judul = Nama Resource,
    `uploadContext`/`uploadOwnerId` sama dengan upload) → `acceptAsset` (pending + dibuang bila batal) → `editInOffice`
    membuka editor; `onClosed` → bila "Ringkas dengan AI" dicentang, `summarizer.summarizeUpload(uploadId)` (teks ekstraksi
    server). Tag, File Control, tanggal, deskripsi sama dengan berkas biasa. Berkas DOCX/XLSX/PPTX/PDF di form punya tombol
    "Edit di ONLYOFFICE". Form Resource Global sama (hanya untuk resource baru). Membuang dokumen yang dibuat di form
    (Batal, ganti Tipe, X/Esc dialog Tambah Resource lewat `closeGuardRef`) → `useOfficeDiscardConfirm().confirm(id)`:
    konfirmasi hanya bila dokumen sudah berisi (versi > 1); tombol "Hapus dokumen" → `confirm(id, { explicit: true })`
    (selalu konfirmasi).
  - **Ringkasan AI saat upload = opsional** (keputusan user): `AttachmentForm offerAiSummary` (semua form lampiran) dan
    form Resource menampilkan centang **"Ringkas dengan AI"** — default mati, pilihan terakhir diingat per browser
    (`resources/ai-summary-preference.ts`). AI hanya dipanggil bila dicentang (centang setelah upload → langsung diringkas);
    "Tambahkan"/"Simpan" tidak menunggu AI (bila masih berjalan, ringkasan dilewati → buat nanti lewat ikon robot); hasil
    untuk berkas yang sudah diganti diabaikan.
  - **Masukkan ke File Control = opt-in** (keputusan user 2026-10-14): centang **"Masukkan ke File Control"** di form
    Resource Global dan `AttachmentForm` (khusus berkas; default mati, diingat per browser) → `archivalStatus: "pending"`.
    Pada lampiran, centang ini memaksa `addToGlobal` (`AttachedResource.toFileControl` → `mergeIntoGlobalResources`), karena
    File Control bersumber dari Resource Global. Tanpa centang berkas **tidak** masuk File Control. Helper:
    `resources/file-control-intake.ts` (`isInFileControl`, `fileControlStatus`, `archiveLockReason`, preferensi). Detail:
    docs/FILE-CONTROL.md §1. **Arsip yang sudah diberkaskan (Fisik/Digital) dikunci di luar File Control**: tab Resources
    menolak Hapus (toast + "Buka di File Control" → `links.archive(id, tab)`), form Resource mengunci Tipe, Ganti File, dan
    Edit di ONLYOFFICE (nama/tanggal/tag/deskripsi tetap bisa diubah) — penghapusan arsip hanya lewat penyusutan.
  - **Tag Resource Global** (`resources/resource-tags.ts` + test): dua macam di satu array `tags` — **tag konteks** otomatis
    (asal: `Global Resource`, `Project Basis`, `Project`, `Project Action`, `Area`, `Area Task`, `Agenda`, `Dokumen Final`,
    serta penanda File Control `Musnah`/`Statis` = `CONTEXT_TAGS`;
    diberikan `contextTag` saat resource dibuat dari lampiran/penghapusan, tidak bisa diubah user) dan **tag bebas**
    (kategori isi, mis. Regulasi, SOP) yang diketik di form Resource lewat `<TagInput>` (`components/common/tag-input.tsx`:
    Enter/koma/+, Backspace, saran `datalist` dari tag yang sudah dipakai). `addFreeTag` mencegah duplikat tanpa peka huruf
    besar/kecil & mengikuti penulisan yang sudah ada. Pencarian tab Resources mencocokkan nama atau tag. Context tag baru →
    tambahkan ke `CONTEXT_TAGS`. **Form lampiran** (`AttachmentForm`: Project, Action/Task, Tandai Selesai, Agenda dasar &
    hasil) juga punya input **Tag** yang **selalu tampil** (Dasar Pelaksanaan, Hasil, lampiran Project/Action/Task); tag disimpan
    di `AttachedResource.tags` dan, bila lampiran masuk Resource Global (centang global, File Control, atau jenis Resource
    Global), **ditambahkan** (tanpa duplikat, tidak pernah menghapus) ke resource oleh `mergeIntoGlobalResources`. Semua form lampiran menawarkan "Ringkas dengan AI"
    (`offerAiSummary`). Handler tag wajib pembaruan fungsional (`setX(prev => …)`): menempel "a, b" memanggil `onAdd`
    beberapa kali dalam satu event. Tag yang sengaja dihapus user di form Resource dicatat di `Resource.removedTags`
    (`nextRemovedTags`) dan **tidak** ditambahkan ulang dari lampiran (`mergeAttachmentTags`). Tab Resources: filter per
    tag + dialog **Kelola Tag** (`resource-tags-dialog.tsx`: ganti nama = gabung bila nama sudah ada, hapus dari semua
    resource milik sendiri; `freeTagCounts`, `renameResourceTag`). **Ubah lampiran**: `AttachmentTable onUpdate` →
    `AttachmentEditDialog` (nomor, nama, tanggal, deskripsi, tag; jenis & berkas tidak diubah — ganti berkas = hapus lalu
    tambah) di semua form lampiran + Hasil Agenda.
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
    Global** (tab Resources) ikut menghapus berkasnya bila tidak dipakai di tempat lain (`excludeResourceIds`); berkas yang
    menjadi sumber My Notebook ikut dihitung "Dipakai" (`referenced()` membaca `useNotebookUsage`; server menolak 409) dan
    hapus resource yang menjadi sumber notebook memberi peringatan. Form item area: **Sub Area = nama + deskripsi** (seperti
    Area); Kegiatan/Sub Kegiatan + Tanggal & Dasar Pelaksanaan (tag konteks "Area") seperti form Project ("Project Basis") —
    `areaLevelHasSchedule` / `activityFields` (`lib/para.ts`); form Area & item area di-`key` per sesi
    buka. "Ganti
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
  (`features/productivity/components/para-detail-dialogs.tsx`, dipasang di Productivity & Overview); `?task=` milik item
  Area membuka dialog Area dengan kegiatan pemilik task langsung terpilih (`AreaDetailDialog initialSelection`).
- **Peta modul Planner** (`features/planner/`, `/planner/:tab`, `planner-page.tsx` = hero "agenda hari ini / rutinitas
  aktif" + 4 tab):
  - **Harian** (`daily-tab.tsx`): URL `?date=YYYY-MM-DD`, `?todo=<id>|new`; kalender, Terlambat, agenda hari itu (+ baris
    "Dipindah ke …"), rutinitas aktif (`isRoutineActiveOnDate`), to-do gabungan = todo (`todo.date` = `toDateString`) +
    action/task Productivity yang jatuh tempo (`dueDate` YMD), urut prioritas. Todo: `TodoDialog` (juga dipakai Overview);
    centang rutinitas = `completion` `${routineId}:${dateKey}` (tidak untuk tanggal mendatang), "Catat" =
    `ActivityLogDialog` (tanggal aktual ≤ hari ini + catatan) — keduanya di `planner-dialogs.tsx`. Hapus task Productivity
    dari Harian memakai `DeleteWithFilesDialog`.
  - **Jadwal** (`schedule-tab.tsx`): filter `?sub=upcoming|past|all`, pencarian, gabung seri, paginasi 10; hapus lewat
    `ScheduleDeleteDialog`; lihat/ubah lewat `ScheduleDialogs` (`schedule-dialogs.tsx`, form `schedule-form.tsx`, pola
    berulang `recurrence-fields.tsx` + `SeriesScopePicker`, `reschedule-dialog.tsx`).
  - **Rutinitas** (`routines-tab.tsx` + `routine-dialogs.tsx`): `?edit=<id>|new`; frekuensi harian / mingguan (hari) /
    bulanan (tanggal 29–31 jatuh ke hari terakhir, `dayInMonth`) / interval (hari, minggu, bulan, tahun dari
    `startDate`); **freeze** = periode jeda (`freezePeriods`, riwayat bisa diubah/dihapus, irisan hanya diperingatkan);
    Unfreeze mengakhiri periode per kemarin; **arsip** menyembunyikan tanpa menghapus riwayat; hapus ikut menghapus
    `completion`-nya.
  - **Referensi** (`references-tab.tsx`): tipe agenda (record `agenda_type`: nama, `order`, warna `AGENDA_COLORS`, ikon
    paket ikon) — `useAgendaTypeList()` (`use-agenda-types.ts`) menyemai tipe bawaan sekali per user (penanda di
    localStorage) dan mengembalikan `names` unik; ganti nama ikut memperbarui agenda milik sendiri; gaya efektif lewat
    `scheduleTypeStyle`/`resolveAgendaStyle` (`lib/schedule-style.ts`, bawaan dari nama bila belum diatur).
  - Logika murni (semuanya ber-test): `lib/planner-logic.ts` (tanggal/jam agenda, filter, terlambat & selesai terlambat,
    rutinitas & freeze, ringkasan kalender, link meeting), `recurrence.ts`, `reschedule.ts`, `planner-search.ts`. Dipakai
    juga oleh Overview, notifikasi, pencarian global, chatbot, Notes AI, Productivity, dan Basis Pengetahuan — ubah
    dengan hati-hati.
  - Celah yang diketahui: form agenda membuang upload sesi saat dialog ditutup (`discardUploads`) tetapi belum mencatatnya
    dengan `trackPendingUpload`, jadi berkas bisa tertinggal bila tab di-reload sebelum agenda disimpan.
- **Peta modul Productivity** (`features/productivity/`, `/productivity/:tab`, `productivity-page.tsx` = hero jumlah
  projects/areas/resources + 5 tab; `ParaDetailDialogs` & `ScheduleDialogs` dipasang di halaman):
  - **Overview** (`overview-tab.tsx`): 4 kartu statistik, `ParaCalendar` (`para-calendar.tsx`: rentang project berjalan
    `isProjectRunningOn` + titik action/task per tanggal → `DayDetailDialog`), daftar project belum selesai (maks. 5, dua
    bar `MiniProgress`: task berbobot `projectTaskProgress` & waktu `projectTimeProgress`, `lib/progress.ts`).
  - **Projects** (`projects-tab.tsx` + `project-dialogs.tsx`): cari judul, `DateRangeFilter` "Aktif Bulan/Tahun Ini"
    (`isProjectActiveIn`), paginasi 10; kartu ringkas (`CARD_ACTION_CLASS`: ubah, bagikan, arsip, hapus; label Free Project
    hanya untuk project milik sendiri); form Project = nama, deskripsi, tanggal mulai/deadline, area, Dasar Pelaksanaan
    (tag "Project Basis"; `status` tidak ada di form — bawaan `active`); detail = `ProjectDetailDialog` → `TaskManager`.
  - **Areas** (`areas-tab.tsx` + `area-dialogs.tsx`): paginasi 10, kartu jumlah sub area + project; hapus area ditolak
    selama masih berisi sub area/project, arsip lewat `ParaDetailDialogs`. `AreaDetailDialog` = sidebar pohon
    Sub Area → Kegiatan → Sub Kegiatan (buka/tutup, `max-h-[30svh]` di HP) + daftar project area (Ambil dari Free Project /
    Lepas) + panel kanan `TaskManager` item terpilih (`initialSelection`).
  - **TaskManager** (`task-manager.tsx`, dipakai detail Project & item area): daftar gabungan action/task + agenda
    (`agenda-item.tsx`) urut tanggal, tampilan List | Timeline, cari, filter tanggal & jenis, sakelar Gabung seri; centang
    → `CompleteTaskDialog`, "Ubah" cepat → `TaskQuickDialog`, form action/task dengan lampiran (`useAttachmentEdits`);
    tombol Laporan Kinerja (`ActionPlanButton`) di baris action/task, agenda, dan header Kegiatan/Sub Kegiatan.
  - **Resources** (`resources-tab.tsx`): cari nama/tag, filter tanggal & tag, Kelola Tag, paginasi 25, `?resource=<id>`
    menyorot; ringkasan AI per resource, arsipkan, hapus (aturan berkas & arsip terkunci: lihat Lampiran). Form Resource
    (tipe link / file / Buat Dokumen ONLYOFFICE / catatan) di berkas yang sama.
  - **Archives** (`archives-tab.tsx`): tampilan Arsip (filter jenis project/area/resource, cari, tanggal, paginasi 25,
    "Lihat isi", Pulihkan dengan konfirmasi) | **Log Arsip & Pemulihan** (filter aksi). Tidak ada hapus arsip permanen.
  - Aksi berantai (arsip/pulihkan/hapus project, area, item area beserta turunan, agenda, berkas, log) terpusat di
    `use-para-actions.ts`; logika murni ber-test: `lib/para.ts`, `lib/para-archive.ts`, `lib/progress.ts`,
    `lib/action-plan.ts`.
  - Celah yang diketahui (belum diperbaiki): Overview Productivity memilih project dari progres saja (project berstatus
    selesai/ditunda bisa muncul; Overview utama memakai `runningProjects`) dan masih berlabel Inggris ("Calendar
    Overview", "Recent Active Projects", "Task Completion", "Time Elapsed"; form Project juga "Start Date", "Area of
    Responsibility"); tab Areas belum punya pencarian.
- **Kalender Harian** (`planner-calendar.tsx`): sel tinggi tetap 56–64 px (bukan persegi); penanda dari `summarizeDay()`
  (`planner-logic.ts`, sumber sama dengan daftar Harian) — titik penuh = ada yang belum selesai, lingkaran = semua
  selesai (todo/task/rutinitas yang sudah selesai tetap ditandai); hover tanggal → tooltip ringkasan agenda, rutinitas,
  to-do (maks. 4 per bagian).
- **Agenda (Planner)**: dibuka lewat `<ScheduleDialogs defaultDate?>` (`features/planner/components/schedule-dialogs.tsx`),
  dipasang di Overview, Planner Harian, dan Jadwal; dikendalikan URL: `?agenda=<id>` = **tampilan lihat** (link meeting
  bisa diklik/disalin, keterangan, dasar pelaksanaan, hasil agenda: ringkasan `outcome`, Notes AI terhubung otomatis
  lewat `AiNote.linkedScheduleId`, lampiran hasil; tombol **Buat Notes AI** di samping **Tambah Hasil**. Notes AI terhubung
  **tidak otomatis** menjadi lampiran hasil — bisa catatan pribadi — tiap barisnya punya "Masukkan ke Hasil" (form lampiran
  terisi `type: "note"`, `noteId: "ai-<id>"` lewat `AttachmentForm initial`; Resource Global/tag dipilih user) atau penanda
  "Di Hasil"), `?agenda=new` = agenda baru, `?edit=<id>` = form ubah (agenda bersama
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
    **sekali** dengan rentang tanggal (`scheduleDateRangeLabel`: "14 Okt – 16 Okt 2026"), agenda berulang **satu baris per
    seri** (pertemuan berikutnya yang belum lewat, `collapseAgendaSeries` di `lib/para.ts`; sakelar "Gabung seri"), juga di tampilan **Timeline**
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
    tanggalnya berubah. Productivity (`agenda-item.tsx`) juga menampilkan badge "Dijadwal ulang".
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
- **Layout & Pengaturan** (keputusan user 2026-10-15): sidebar = modul Workspace (… Notes Space, **Knowledge**, Productivity, **Approval**, File Control) + grup **AI Agent** khusus modul agen (Laporan Kinerja, SRIKANDI — `sidebarGroup: "agent"`; keputusan user 2026-10-25, Approval kembali ke Workspace 2026-10-31) + grup Sistem berisi **Tools** dan **Pengaturan**
  (`ModuleDef.sidebarGroup: "system"`, keduanya menu ber-sub-menu `SubmenuModuleItem`); Pengaturan
  (sub menu berurutan **Aplikasi, Manajemen User, Berbagi, Model AI, Integrasi** — urutan tab di `navigation.ts` sama dengan sub menu).
  **Profil Saya bukan bagian Pengaturan**: halaman sendiri `/profile` (`features/profile/`, modul `profile` dengan
  `hiddenInSidebar`, warna = Pengaturan) dibuka dari menu user kiri bawah. **Tema** hanya diatur dari tombol tema di header
  (dropdown Terang / Gelap / Ikuti sistem). Tombol sidebar saat diciutkan = 32 px: logo ikut 32 px, ikon modul memakai
  `COLLAPSIBLE_ITEM_CLASS` (tanpa padding) agar tepat di tengah. Logo aplikasi dibaca lewat `appLogoUrl(settings)`
  (`use-app-settings.ts`). Dialog yang punya kontrol di pojok kanan atas (mis. pencarian global) memakai
  `showCloseButton={false}` + `DialogClose` sendiri di baris kontrolnya agar tidak bertumpuk. **Popover/panel berisi daftar
  panjang**: batasi tinggi `max-h-[min(…,var(--radix-popover-content-available-height))]` + `flex flex-col`, daftar di
  `div min-h-0 flex-1 overflow-y-auto`, footer `shrink-0` — jangan `ScrollArea` dengan `max-h` saja (lihat §15).
  **Mode Fokus** (`features/focus/focus-mode.tsx`): judul, keterangan, ikon dialog & tombol header mengikuti sesi yang
  dipilih (`MODE_META`: Mode Fokus / Waktu Rehat / Waktu Istirahat).
- **Otomasi = sub-tab Otomasi terjadwal di tab Connector** Laporan Kinerja & SRIKANDI (keputusan user 2026-11-06: sub menu Tools → Otomasi
  dihapus karena duplikat; `/tools/automation` lama jatuh ke tab Tools pertama). Kode tetap di `features/tools/automation/`, hook
  `data/use-automation.ts`, logika murni + test `automation-utils.ts`. `AutomationJobs systems` (dipasang `RobotSettings`) =
  kartu **Cara kerja otomasi** (+ tombol notifikasi browser) lalu kartu jadwal per sistem: sakelar aktif, ringkasan jadwal (`describeSchedule`) +
  berikutnya, status terakhir (+ **Login ulang** bila gagal karena sesi), **Ubah jadwal** (Harian/mingguan · Tiap jam ·
  Kustom cron, hari, zona waktu), **Jalankan sekarang** (antrian), **Riwayat**. Daftar di-poll 3 dtk selama ada run aktif;
  run yang baru selesai memuat ulang record terkait (`KIND_RECORDS`). Tombol sinkron di menu asal tidak berubah. Peringatan
  per sistem: sesi kedaluwarsa (merah, jadwal dijeda) / belum login. **Notifikasi robot** (`robot-alerts.tsx`, hook
  `useAutomationAlerts` dipoll 2 menit): bagian **Robot & Otomasi** paling atas di lonceng, toast sekali per kejadian
  (`useRobotAlertToasts` di AppShell; ID yang sudah tampil di localStorage `lifeos.robotAlerts.seen.<userId>`, `newAlerts`),
  notifikasi browser opsional saat tab tidak dilihat (tombol **Aktifkan notifikasi browser** di kartu Cara kerja otomasi);
  notifikasi tugas gagal membuka tab Connector sistemnya (tombol "Lihat riwayat").
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
  jenis, paginasi; `TemplateBrowser` juga dipakai kartu Templat Tools); helper `office-templates.ts` (+ test). **Per role** (`onlyoffice-settings.tsx`, urutan: Cara memakai → Templat → AI, lalu khusus admin): user = AI,
  Templat, Cara memakai; admin + Status server & Font (unggah/hapus). **Konsep ↔ final** (`document-links.tsx`):
  `DocumentLinksButton` di header pratinjau & editor (popover + dialog unggah final → Resource Global tag asal "Dokumen
  Final" + File Control, tautkan berkas/konsep), `DocumentLinkBadge` + `useOfficeLinkBadges` di tabel lampiran & Resources.
  Editor selalu `mobile: false` (editor seluler Community hanya melihat).
- **Approval** (dulu Pengajuan; `features/requests/`, modul `requests` di Workspace setelah Productivity, path tetap `/requests`, warna `--mod-requests`;
  **arah 2026-10-31**: dokumen bertemplat dikerjakan agen Hermes lewat skill, Approval = antrian verifikasi keluaran agen —
  `docs/AI-AGENT.md` §22): tab **Antrian Verifikasi**
  (baru/diproses/menunggu verifikasi; menunggu verifikasi di atas) & **Selesai**; `?request=<id>` detail, `?request=new`
  formulir (berkas diunggah saat Simpan, gagal → dibuang). Detail: data surat (ubah), berkas pemohon (pratinjau + status
  baca), Analisis & kelengkapan, Telaah & konsep jawaban (Markdown bisa disunting/disalin, sitasi `CitationChip` dari
  chatbot), Dokumen dari templat (`TemplateFillDialog`: isian `${…}` + paragraf, **Isi dengan AI** hanya mengisi yang
  kosong → `openOfficeEditor`), keputusan (Setujui → Dikirim, Tolak dengan alasan, Buka kembali), Riwayat. Hook
  `data/use-requests.ts`, logika murni `request-utils.ts` (+ test). Dialog berisi daftar panjang/teks panjang: `grid-cols-1`
  pada `DialogContent` & grid di dalamnya (lihat §15).
  Tab **Percakapan WA** (`whatsapp/conversations-tab.tsx`, `?wa=<nomor>`: status bot, daftar percakapan, isi + balasan
  petugas / simpan FAQ / tandai selesai, Simulator) & **Grup & Kontak** (`whatsapp/contacts-tab.tsx`: profil layanan
  bot, grup + jenis + hak akses, kontak); pemohon pengajuan = `applicant` + `groupCode` (bukan satker); hook
  `data/use-whatsapp.ts` (percakapan dipantau berkala), logika murni `whatsapp/whatsapp-utils.ts` (+ test).
  Tab **Kebijakan Otomatis** (`policies-tab.tsx`, hanya pemilik agen: aturan, sakelar darurat, statistik shadow) + panel
  detail `auto-decision-panel.tsx` (keputusan, Batalkan kiriman, tabel verifikasi aset) + penanda di daftar; helper
  `autoDecisionState`/`policyAgreement`/`HISTORY_ACTOR` di `request-utils.ts` (+ test); hook `useAgentPolicies` /
  `useAgentPolicyMutations` (`data/use-agent.ts`).
- **Asisten Agen** (grup AI Agent paling atas, `/agent`, `features/agent/`, warna `--mod-agent` violet): tab **Chat**
  (`agent-page.tsx`: pesan → `agentApi.chat` → `useAgentRunWatcher` poll 1,5 dtk; percakapan = sesi Hermes, ID di
  localStorage, riwayat tampilan hanya di memori tab; Hentikan) & **Status & Skill** (status, skill LifeOS + jumlah skill
  bawaan, tugas terakhir; kartu **Siapkan agen** `agent-setup-card.tsx`: Hermes menyala · model dari Pengaturan → Model AI ·
  izin agen (dialog cakupan → `agentApi.setup`) · panggilan model terakhir). Bukan pemilik / Hermes mati → keterangan cara
  menyalakan. Pembagian tugas AI punya baris **Agen (Hermes)**. Detail Approval: `AgentRunPanel`
  (`agent-run-panel.tsx`, hanya bila agen siap & ada skill LifeOS) — pilih skill (bawaan `telaah-pengajuan`) → **Jalankan**
  → selesai = muat ulang pengajuan. Hook `data/use-agent.ts`.
- **Konektor robot** = tab **Connector** di menu Laporan Kinerja (e-Kinerja) & SRIKANDI (keputusan user 2026-10-25; dulu Tools →
  Konektor Robot) — komponen `RobotSettings systems=[…]` (`features/tools/robot/`, hook `data/use-robot.ts`), sama di kedua menu,
  dua sub-tab `?sub=` (keputusan user 2026-11-06): **Pengaturan koneksi** (bawaan; titik merah = belum login / sesi habis) = kartu
  status service robot + kartu per sistem (Sesi & login + kredensial, Pengaturan alamat, **Pekerjaan robot & batasnya** = daftar
  `flows` dari backend `SYSTEM_INFO` berlabel Lewat tombol / Bisa dijadwalkan, Riwayat koneksi + dialog rekaman) dan **Otomasi
  terjadwal** (`?sub=automation`, badge jumlah jadwal aktif) = `AutomationJobs`. Notifikasi tugas gagal membuka `?sub=automation`;
  tautan login dari jadwal membuka Pengaturan koneksi. Pekerjaan robot baru → tambahkan ke `SYSTEM_INFO.flows`. `remote-browser-dialog.tsx` = tayangan JPEG yang di-poll ± 0,9 dtk; klik dipetakan ke 1280×800
  (`toViewportPoint`), keyboard lewat `keyToInput`, **masukan dikirim berurutan** (antrian promise — ketikan cepat tidak
  hilang), tutup tanpa "Selesai" = sesi robot dibatalkan; bisa melanjutkan sesi yang sudah dibuka (`sessionId`, dari Login
  otomatis). `credentials-dialog.tsx` (simpan kredensial + konfirmasi kata sandi LifeOS), `auto-login-dialog.tsx` (gambar
  CAPTCHA / kotak OTP / Buka tayangan; dimulai sekali per dialog — StrictMode). Logika murni `robot-utils.ts` (+ test). Tombol **Tautan publik**
  (`features/sharing/public-link-button.tsx`) di header pratinjau berkas.
- **Laporan Kinerja / Renaksi e-Kinerja** (Productivity, keputusan user 2026-10-25): user **memilih sendiri** item yang masuk rencana aksi
  bulanan — tombol ikon `ClipboardList` (`ActionPlanButton`, `components/action-plan-dialog.tsx`) di baris Action/Task,
  baris Agenda (`agenda-item.tsx`), dan header Kegiatan/Sub Kegiatan (`task-manager.tsx`; Project & Sub Area = wadah, tidak);
  hanya item milik sendiri. Dialog: bulan (bawaan tanggal selesai → tenggat → bulan ini), **RHK** (record type `skp_target`
  per tahun, bisa ditambah di tempat), **indikator** RHK yang dicentang (bawaan semua), **rencana aksi** (`description`),
  **realisasi** (`realization`; indikator aspek WAKTU memakai `timeRealization`, bawaan "Penyampaian tepat waktu"), **bukti
  data dukung** (`documentUrl`: **Brankas digital** = pilihan bawaan bila item punya berkas — beberapa berkas (lampiran item +
  unggah, context `renaksi-vault`) di balik satu tautan `/brankas/<token>` (halaman publik: **Lihat** = modal pratinjau
  `vault-file-viewer.tsx`, PDF lewat pdf.js `pdf-pages.tsx` dimuat malas — bukan tab baru), `entry.vaultId`; ubah berkas = tautan & pengenal
  perubahan tetap; `VaultFilePicker`, `VaultButton` + dialog log akses / ganti tautan di baris Laporan Kinerja
  (`features/vault/`, hook `data/use-vaults.ts`); atau web link lampiran, berkas tunggal → tautan publik, ketik sendiri). Entri = record type `action_plan_entry` (`period` YYYY-MM, `skpId`, `targetId`, `indicators`,
  `source*`, `status` draft/ready/filled; field baru di `extra`). Status **dihitung ulang** di tampilan
  (`entryStatus(entry, target)`: entri lama tanpa realisasi = belum lengkap); entri terisi yang tidak diubah tetap terisi. Modul **Laporan Kinerja** (grup AI Agent, `/kinerja`, `features/kinerja/` — `kinerja-page.tsx` + `action-plan-board.tsx`; item asal dibuka lewat `links.task/schedule/area`): per bulan, dikelompokkan per RHK,
  ubah/hapus, kartu **SKP & RHK** tahun itu + tombol **Ambil dari e-Kinerja** (robot membaca `/skp` + Detail SKP tiap SKP
  tahun itu → record `skp` (`ekin-<nomor>`) & `skp_target` (ID stabil dari bagian+nama RHK, `skpId`, bagian
  UTAMA/TAMBAHAN, RHK pimpinan, indikator); RHK yang hilang tapi dipakai → `stale`). **Satu tahun bisa beberapa SKP**: bulan
  entri memilih SKP yang periodenya mencakup bulan itu (`skpsForPeriod`; SKP dipecah di tengah bulan → user memilih), RHK =
  milik SKP itu (`targetOptions`); kartu RHK manual per tahun hanya cadangan bila SKP belum tersinkron. Logika murni + test `lib/action-plan.ts`.
  **Isi ke e-Kinerja** (tombol per bulan + konfirmasi) → `POST /robot/ekinerja/renaksi/fill { period, dryRun? }`
  (`RobotService.fillEkinerjaRenaksi`; logika murni + test `backend/src/robot/ekinerja-renaksi.ts`: entri siap → baris per
  indikator per SKP, butir sama digabung; entri yang semua butirnya terbaca → `filled`) → robot `POST /jobs/ekinerja/renaksi`
  (`robot/src/ekinerja-renaksi.ts` + test, `BrowserPool.ekinerjaRenaksi`): blok bulan ditandai lewat **node teks** yang
  **terlihat** (nama bulan = teks lepas; halaman memuat templat rating & tab Perilaku tersembunyi), centang indikator yang
  belum menjadi baris (tidak pernah melepas centang), tambah butir yang belum ada (**idempoten** — butir e-Kinerja tidak bisa
  diubah/dihapus satu per satu), `safeClick` menolak tombol kirim/ajukan/hapus, bulan tanpa tombol Isi/Edit = sudah
  diajukan → berhenti. `dryRun` = baca isi bulan + rencana langkah tanpa klik (dipakai untuk memeriksa).
  Robot e-Kinerja **tidak pernah** menekan "Kirim Penilaian Ke Atasan". **Pemantauan & sinkron dua arah** (2026-10-31,
  `docs/AI-AGENT.md` §21.10a): **Pantau e-Kinerja** (`POST /robot/ekinerja/renaksi/sync { year }` → robot `/jobs/ekinerja/renaksi/read`)
  → record `action_plan_month` per bulan (status draft/submitted/rated, tanggal pengajuan, rating, isi + feedback) + impor butir
  yang hanya ada di e-Kinerja (`importCandidates`); entri menyimpan pengenal perubahan `pushedSignature` + `pushed` (`entrySignature`
  backend = frontend `lib/action-plan.ts`, ubah keduanya bersamaan) dan `deleted` (hapus tertunda); `displayStatus` = Berubah /
  Akan dihapus / Tidak ada di e-Kinerja / Terkunci (bulan diajukan → ubah & hapus ditolak). Tombol kirim berlabel **Kirim ke e-Kinerja** bila bulan belum pernah dikirim
  (`monthSent`: tidak ada entri terisi/berpengenal dan potret bulan kosong), selain itu **Kirim perubahan** = fill `mode: "sync"`:
  baca + impor dulu, lalu `syncPlan` (centang baru, lepas yang tidak diminta & berisi, **tulis ulang** baris berubah = lepas →
  centang → isi ulang; indikator sementara bila bulan akan kosong, `modalPasses`; baris kosong tidak pernah dilepas). Backend sinkron: `POST
  /robot/ekinerja/skp/sync { year }` (`RobotService.syncEkinerjaSkp` menulis lewat `RecordsService`; logika murni + test
  `ekinerja-sync.ts`), robot `POST /jobs/ekinerja/skp` (`robot/src/ekinerja.ts` + test).
- **SRIKANDI** (grup AI Agent, `/srikandi/:tab`, `features/srikandi/srikandi-page.tsx`): tab **Register Naskah Keluar** (id `register`, tab pertama; `register-board.tsx` + `register-dialog.tsx` + `register-file-picker.tsx`, logika murni + test `register-logic.ts`; record `srikandi_outgoing`, `?register=<id>|new` + `&request=&doc=` dari Approval = `links.srikandiRegister*`; detail `docs/AI-AGENT.md` §21.11–§21.12; **Daftarkan ke SRIKANDI** = `robotApi.registerOutgoing` → `POST /robot/srikandi/register/:id` (backend `registerSrikandiOutgoing` + logika murni `srikandi-register.ts`) → robot `POST /jobs/srikandi/register` (`robot/src/srikandi-register.ts` + test): isi formulir → **Simpan** = konsep di Log Naskah Keluar, draf berhal sama tidak dibuat ulang, `dryRun` = **Periksa di SRIKANDI** (dialog `RunDialog` dari `robot-settings.tsx`); robot tidak pernah Kirim Konsep), tab **Daftar Naskah Keluar** (id `outgoing`; record
  `srikandi_letter`, cari + paginasi, Lihat PDF lewat `previewFile`, tombol **Ambil dari SRIKANDI** → `POST
  /robot/srikandi/letters/sync`) & **Connector** (`<RobotSettings systems={["srikandi"]} />`). Sinkron: robot `POST
  /jobs/srikandi/outgoing` (`robot/src/srikandi.ts` + test) membaca Daftar Naskah Keluar, untuk naskah ber-TTD (`isSigned`)
  yang belum dikenal (kunci = nomor naskah; `id` alamat detail terenkripsi acak) membuka detail dan **menangkap respons PDF**
  yang dimuat penampil (tanpa klik; maks. 5/sinkron) → backend `syncSrikandiLetters` (`srikandi-sync.ts` + test) menyimpan
  berkas `UploadsService.createFromBuffer` context `srikandi` + record. PDF SRIKANDI menyimpan teks penanda `${nomor_naskah}`
  di lapisan teks (nomor/TTE ditempel di atasnya) — wajar. **Lampiran**: robot hanya mengklik teks persis "Lihat" pada butir
  daftar lampiran yang berupa nama berkas (`attachmentName`), menangkap berkas dari respons / **unduhan** (Chromium headless
  menjadikan PDF di tab/iframe unduhan → job ini satu-satunya yang `acceptDownloads`, berkas sementara langsung dihapus) /
  ambil ulang alamat berkas di domain yang sama (`sameSite`: `s3.arsip.go.id` untuk SRIKANDI), lalu Esc. Record menyimpan
  `attachments` [{name, uploadId?}] + `attachmentsComplete`; naskah yang belum lengkap diambil lampirannya saja pada sinkron
  berikutnya (`haveMain`). **Finalisasi** (`finalizeSrikandiLetters`, keputusan user 2026-10-25): setiap berkas naskah &
  lampiran → Resource Global `res-sk-<uploadId>` (tag "Dokumen Final", `archivalStatus: "pending"` = File Control Gantung;
  sekali per berkas — dicatat di `letter.resources`, dihapus user = tidak dibuat ulang). **Tautan naskah final ↔ dokumen
  mentah** dibuat lewat **Register Naskah Keluar** (gerbang wajib sebelum push ke SRIKANDI, sumbernya Approval atau konsep
  Productivity — keputusan user 2026-10-25; dibangun 2026-10-31: **Tautkan final** di tab Register), **bukan** ditebak dari isi dokumen (pencocokan hal ke
  dokumen Approval sempat dibuat lalu dicabut). Detail Approval tetap menandai konsep yang punya final (`DocumentLinkBadge`).
  Tab **Referensi** (`references-board.tsx`, record `srikandi_reference`: kategori signer/recipient/recipient_group/verifier/
  cc/cc_group/disposition_group, `label` + `fields`): **Ambil referensi** → `POST /robot/srikandi/references/sync` → robot
  `POST /jobs/srikandi/references` (`robot/src/srikandi-reference.ts` + test) membaca 7 tabel menu Pengguna SRIKANDI (+ kategori `classification` = Klasifikasi
  Arsip lewat **Ambil klasifikasi** / `POST /robot/srikandi/classifications/sync`, job dengan `categories`) semua
  halaman: klik **Hitung Total** (tunggu "Mohon Tunggu" hilang → total pembanding), lalu tombol `chevron_right` di
  `nav[aria-label='Table navigation']` (tunggu aktif) sampai jumlah = total / 2 halaman tanpa data baru; judul kolom
  dinormalkan (`headerName`, innerText ikut huruf kapital CSS). ID `sr-<hash kategori|label|jabatan>`; entri hilang dihapus
  kecuali kategori terbaca kosong (`staleReferences`). Blok "Eksplor halaman" di kartu
  konektor dihapus (keputusan user) — rekaman halaman lewat **Rekam halaman ini** di tayangan; endpoint
  `/connectors/:system/capture` tetap untuk pemetaan oleh Claude & smoke. RHK dari robot menyimpan **RHK pimpinan yang
  diintervensi** (`leader`) + indikatornya (`leaderIndicator`); tombol Edit/Hapus RHK di sel SKP draft dibuang saat membaca.
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
  `new Date("YYYY-MM-DD")` (dibaca UTC → bergeser sehari di zona waktu barat UTC). Tanggal "hari ini" ditulis dengan
  `formatLocalYMD(new Date())`, **jangan** `new Date().toISOString().slice(0, 10)` (tanggal UTC → kemarin sebelum 07.00 WIB).
- **Link dari input user** (`href`): lewat `toExternalHref()` (`src/lib/urls.ts`) — menambah `https://` dan menolak
  skema selain http/https.
- **QR & scan**: QR lokal `qrcode.react` (`QrImage`), scan `CameraScanner`/`CameraScanDialog` (import dinamis).
- **Cetak**: `printElement(ref.current, judul, "label" | "a4")` (`features/file-control/lib/print.ts`).
- **Menu klik kanan**: shadcn `context-menu`, target dari `closest("[data-item-id]")`.
- **Pintasan keyboard**: `useEffectEvent` + satu `useEffect` listener `window` (abaikan input & dialog terbuka).

## 9. Glosarium Domain

- **PARA**: Projects (deadline, tasks/actions berbobot, timeline), Areas (tanggung jawab berkelanjutan; hierarki
  **Area → Sub Area → Kegiatan → Sub Kegiatan → Task**; ketiga tingkat = `para_activity` (tanpa `parentId` = Sub Area,
  tingkat dari rantai `parentId`, maks. 3, semuanya menyimpan `areaId`; **Sub Area hanya nama + deskripsi**, Tanggal &
  Dasar Pelaksanaan hanya Kegiatan/Sub Kegiatan); task boleh melekat di tingkat mana pun;
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
2. RAG: ~~tahap 1 ekstraksi + indeks pgvector~~ ✅ 2026-10-11 → ~~**tahap 2** chatbot `POST /ai/chat` di backend +
   riwayat permanen~~ ✅ 2026-10-24 (bersama basis pengetahuan Obsidian, `docs/AI-AGENT.md` §17) → tahap 3 Redis (cache embedding
   pertanyaan, batas pemakaian harian, throttler). **My Notebook** (2026-10-14) sudah menerapkan chat RAG bersitasi +
   riwayat permanen per notebook; chatbot global tinggal memakai pola yang sama (`notebook-context.ts`) atas semua data.
   Lanjutan My Notebook: berbagi notebook, sumber item bersama, Studio lain (FAQ, panduan belajar, briefing, timeline,
   ringkasan audio).
3. (Opsional) tampilan riwayat audit arsip di UI (`GET /archive-audit` sudah tersedia).
4. **Dokumen dibuat di aplikasi** (jenis resource baru) dengan editor berbasis **ONLYOFFICE** — thread dimulai
   2026-10-15: menu **Tools → ONLYOFFICE**; riset, arsitektur, tahapan & to-do user di `docs/ONLYOFFICE.md`. Titik sambung: Resource Global (`para_resource`, berkas = `uploadId` Asset backend), centang
   "Masukkan ke File Control" (`file-control-intake.ts`), ekstraksi/indeks RAG berkas (DOCX/XLSX sudah didukung), CSP
   `nginx.conf` bila editor dimuat dari domain lain.

5. **Peta jalan agen** (`docs/AI-AGENT.md` §25, dikerjakan satu per satu): komunikasi ✅ kecuali uji model → skill & kerja otomatis →
   fitur Hermes di LifeOS → antarmuka Obsidian → pembagian model.

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
| `npm audit` | ✅ 2026-11-09 `--omit=dev` bersih di backend, frontend, robot (Prisma 7.10.1, `zod` 4.6.7, `fast-uri` 3.1.9, `shadcn` 4.22.1). Sisa hanya perkakas pengembangan: `minimatch` 10.x (moderate, perbaikan di major 11) & `deepmerge` (low, via CLI `shadcn`), risiko diterima — jangan `npm audit fix --force` (`docs/UPGRADE-PLAN.md` §3) |
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
| Hasil Agenda ↔ Notes AI (Buat Notes AI di samping Tambah Hasil, Notes AI terhubung dimasukkan ke Hasil secara opsional) + perbaikan resource catatan (`noteId`, tanpa duplikat, bisa dibuka) + catatan bertaut tidak bisa dihapus sebelum dilepas | ✅ 2026-10-17 — unit test, lint, typecheck, UI diuji di browser (masukkan ke Hasil + Resource Global, simpan ulang tanpa duplikat, buka dari tab Resources, hapus Notes AI bertaut ditolak + tautan membuka agenda, catatan tanpa rujukan tetap bisa dihapus) |
| Audit celah Notes Space (12 temuan): List bersama digabung per item, daftar ringan Catatan/Notes AI, catatan & berkas sumber My Notebook terlindung, unggahan Notes AI tercatat, Simpan saat merekam dicegah, edit List tersimpan saat blur, berkas yatim kolaborator dibersihkan pemilik, tautan item hilang diberi keterangan, lampiran chat dibatasi, sumber berkas ganda ditolak, riwayat chat bertahap | ✅ 2026-10-17 — unit backend (record-merge/light) & frontend, smoke (+12), lint, typecheck, build |
| Catatan Bebas: editor teks kaya (Tiptap) + tulisan tangan stylus (halaman penuh & blok Coretan) + ubah ke teks (AI) | ✅ 2026-10-11 — unit test, build, smoke, UI diuji di browser (mouse + event pena sintetis + mode HP), pengenalan AI diuji dengan Gemini sungguhan; **uji S Pen di perangkat Android user belum** |
| Perbaikan Notes Space (simpan otomatis Catatan, cegah perubahan hilang di Notes AI, cari/sematkan/paginasi, dokumen dibaca backend, prompt AI, List urut ulang & progres) | ✅ 2026-10-11 — lint, typecheck, unit test, build, dan UI diuji di browser (desktop + mode HP); ringkasan/transkrip AI sungguhan belum diuji (butuh API key) |
| **My Notebook** (RAG ala NotebookLM: sumber berkas/item LifeOS/teks/web, chat hibrida bersitasi + riwayat permanen, ringkasan Studio, catatan notebook → Catatan Bebas) + urutan tab Notes (Catatan Bebas, List Bebas, Notes AI, My Notebook) | ✅ 2026-10-14 — unit backend (notebook-context, web-source: 19) & frontend, smoke (+20), lint, typecheck, build, UI diuji di browser (desktop + HP); chat & ringkasan diuji dengan Gemini sungguhan (akun admin dev; Gemini sempat 503 kelebihan beban → jalur error teruji) |
| Isolasi data per user (admin tanpa akses data user lain, role viewer dihapus, statistik admin) + **berbagi** item (Project, Area, Resource/arsip, Catatan, Notes AI, List, Agenda; izin Lihat/Komentar/Edit; turunan & berkas ikut; komentar; Pengaturan → Berbagi; File Control tab Dibagikan) | ✅ 2026-10-11 — unit (backend share-graph + frontend sharing), smoke ±45 skenario baru, lint, typecheck, build, UI diuji di browser (bagikan Edit → kolaborator menambah action & komentar; bagikan Lihat → baca-saja; statistik admin). **Belum**: RAG/chatbot mencari item bersama, notifikasi berbagi, tautan publik |
| File Control: uji menyeluruh + perbaikan aturan penyusutan, peminjaman, referensi, penataan & tampilan detail/kartu (11 temuan prioritas tinggi & sedang) | ✅ 2026-10-14 — unit test (`archive.test.ts` +6), lint, typecheck, build, UI diuji di browser dengan data `[UJI]`. Lanjutan: konfirmasi Restore, BA auto-dispose (tanggal lokal + pelaksana), Penataan khusus fisik, Lihat Dokumen seragam, pratinjau cetak layar penuh, modal pratinjau berkas lebih besar — diuji di browser |
| Pengaturan & Layout: Profil Saya keluar dari Pengaturan (`/profile`), urutan sub menu, satu pengatur tema, sidebar ciut simetris, tombol tutup pencarian global, form tanpa sinkronisasi `useEffect`, logo lewat endpoint ber-cache | ✅ 2026-10-15 — unit backend & frontend, smoke (+7 skenario logo), lint, typecheck, build, UI diuji di browser (desktop + HP) |
| Layout lanjutan: popover notifikasi panjang bisa digulir (footer tidak tertimpa), judul Mode Fokus sesuai sesi | ✅ 2026-10-16 — lint, typecheck, unit test, build, UI diuji di browser (layar 768 & 460 px) |
| Perbaikan Overview (proyek berjalan, tugas mendesak + terlambat, to-do & rutinitas hari ini bisa dicentang, status & Gabung agenda, label Indonesia, notifikasi tugas terlambat & baru dibagikan) | ✅ 2026-10-15 — unit test (`overview-logic.test.ts`: 9), lint, typecheck, build, UI diuji di browser (desktop + HP; centang rutinitas/todo/task, tambah agenda, popover notifikasi) |
| Integrasi ONLYOFFICE (menu Tools → ONLYOFFICE) | 🚧 riset + keputusan user (`docs/ONLYOFFICE.md` §4.2) + **tahap 0 infra dev ✅** + **tahap 1 backend ✅** + **tahap 2 frontend ✅ 2026-10-15** (Tools = pengaturan/status; buka/edit dari pratinjau semua fitur; "Buat dokumen" di form lampiran & Resource; simpan otomatis saat modal ditutup; riwayat versi; unit backend 19 + frontend 4, smoke +29, UI diuji desktop & HP); **tahap 3 ✅ 2026-10-16** (revisi user: AI satu pintu = tab AI bawaan ONLYOFFICE memakai provider & key Pengaturan → Model AI lewat proxy backend; templat diunggah di Tools; impor berkas saat Buat Dokumen; unit + smoke lulus, UI diuji termasuk Summarization dengan Gemini sungguhan) + **lanjutan ✅** (Tools per role, font diunggah admin + pemantau, tautan konsep ↔ dokumen final) + **tahap 4 produksi ✅ 2026-10-16** (compose profile `office`, Caddy `/office/`, smoke penuh lewat stack produksi lokal); berikutnya agen SRIKANDI & agen pembuat dokumen di Tools (teknologi dibahas user) |
| Integrasi AI Agent (Basis Pengetahuan, agen dokumen bertemplat, SRIKANDI, e-Kinerja Kemenhub, SIMAN, asisten chat) | 🚧 riset (2026-10-17/18, revisi OnTrack 2026-10-24; `docs/AI-AGENT.md` §9–§16, keputusan AG-18…AG-20 ✅, AG-21 ditunda) + **tahap 1 fondasi pengetahuan ✅ & tahap 2 konektor Obsidian ✅ 2026-10-24** (`POST /ai/chat` RAG + riwayat + sitasi, koleksi/metadata indeks, pemotongan per BAB/Pasal, profil kerja, vault Obsidian + graf tautan + Inbox, Tools → Basis Pengetahuan; unit backend +22 & frontend +7, smoke +20, skrip API vault 15/15, chat Gemini sungguhan, UI desktop & HP). **Pembagian tugas AI + embedding OpenAI + OCR multi-provider ✅** dan **tahap 3 token akses + MCP server ✅ 2026-10-24** (unit +8, klien MCP SDK 16/16, smoke +19, UI; embedding OpenAI belum diuji dengan key sungguhan). **Tahap 4 Pengajuan + mesin templat + Antrian Verifikasi + konsep jawaban ✅ 2026-10-24** (menu Pengajuan, MCP `requests:*`; unit backend +14 & frontend +4, smoke +20, UI desktop & HP dengan Gemini sungguhan: analisis, telaah, isi templat Surat Dinas → ONLYOFFICE). **Tahap 5 bot WhatsApp ✅ 2026-10-24** (bot di LifeOS lewat Cloud API resmi + Simulator, grup kontak umum + hak akses + pengetahuan khusus grup + profil layanan, kontak, kabar status, MCP `list_whatsapp_followups`; unit +13, smoke +26, UI dengan Gemini sungguhan; webhook Meta sungguhan menunggu VPS/domain/akun Meta) + dokumen `docs/TODO-USER.md`. **Laporan Kinerja (Renaksi) e-Kinerja di Productivity ✅ 2026-10-25** (pilih item → bulan, SKP, RHK, uraian, link dokumen; SKP & RHK diambil robot, beberapa SKP per tahun; unit +16, UI & sinkron e-Kinerja sungguhan diuji). **Tahap 6b robot pengisian Renaksi ✅ 2026-10-31** (per indikator: renaksi + realisasi + bukti; Isi ke e-Kinerja idempoten, tidak pernah mengirim; unit robot +7, backend +3, frontend +2; diuji ke e-Kinerja sungguhan dengan data uji Oktober, data uji sudah dibersihkan lewat Edit Rencana Aksi Kerja atas izin user). **Pemantauan & sinkron dua arah Renaksi ✅ 2026-10-31** (Pantau e-Kinerja: status bulan draf/diajukan/dinilai + isi + feedback, impor isian e-Kinerja, kunci bulan diajukan, pengenal perubahan, Kirim perubahan dengan tulis ulang baris; unit robot +3, backend +4, frontend +3; diuji isi → ubah → hapus ke draf Oktober sungguhan, Oktober dipulihkan). **Tahap 6a mesin robot SRIKANDI & e-Kinerja ✅ 2026-10-25** (service Playwright, browser jarak jauh, sesi terenkripsi, brankas kredensial + login otomatis dengan CAPTCHA/OTP diketik user, eksplor halaman, tautan publik berkas; unit +12, smoke +28, UI dengan tayangan SRIKANDI sungguhan — login CAPTCHA/OTP oleh user). **Revisi 2026-10-31**: dokumen bertemplat dipindah ke skill agen Hermes (`docs/AI-AGENT.md` §22, AG-22…25 ✅; tool MCP skill agen ✅, smoke +7). **Tahap pertama integrasi Hermes ✅ 2026-10-31** (container profile `agent`, skrip `infra/hermes/up.sh`, backend `src/agent/`, menu Asisten Agen + Kerjakan dengan agen di Approval, skill uji `telaah-pengajuan`, compose produksi + DEPLOYMENT §14; unit +6, smoke +4; Hermes menyala & membaca skill, jaringan Hermes → LifeOS 200). **Siapkan agen tanpa terminal ✅ 2026-10-31** (proxy model lewat key Pengaturan → Model AI,
  token agen otomatis, kartu Siapkan agen, `configure.sh`; unit +7, smoke +6; Hermes → proxy & MCP terbukti, **jawaban model
  sungguhan belum terlihat** karena Gemini 503 high demand saat uji). **Kebijakan Otomatis tahap 1 ✅ 2026-11-06** (peta jalan
  no. 2: aturan + shadow/auto + verifikasi aset server dengan master tiruan + konsep SRIKANDI tertunda + run agen di DB; unit
  backend +9 & frontend +4, smoke +5, uji API 12/12; run Hermes gagal karena key Gemini 401 → jalur lolos & kirim SRIKANDI belum
  diuji; **toolset Hermes belum dibatasi**). **Claude untuk Hermes lewat API native ✅ 2026-11-05** (unit +14, uji server tiruan; belum ke Claude sungguhan). **Provider lewat router + cadangan per tugas (peta jalan no. 5) ✅ 2026-11-06** (proxy agen berpindah ke cadangan; diuji router tiruan; belum ke router sungguhan). **Menu Pengetahuan (no. 4) ✅ 2026-11-06** (antarmuka Obsidian: penjelajah, pembaca, editor, properti, graf, tabel, Inbox, kesehatan; unit backend +26 & frontend +9, uji API 29/31 (2 = waktu pindai awal), smoke +11, UI desktop & HP). **Cermin hasil kerja → Obsidian (80-LifeOS) + graf ala Obsidian + Tools → Basis Pengetahuan jadi pengaturan saja ✅ 2026-11-06** (unit backend +4 & frontend +3, smoke +7, vault dev 47 berkas dicerminkan dengan 0 potongan indeks, UI diuji; cermin di akun admin dev **menyala**). **Audit & uji menyeluruh fitur AI Agent ✅ 2026-11-01**
  (Asisten Agen, Laporan Kinerja + brankas, SRIKANDI, robot: 6 perbaikan, unit +2, uji API brankas 5/5, UI desktop & HP;
  sistem e-Kinerja/SRIKANDI sungguhan tidak disentuh). **Rancangan persetujuan otomatis ("Kebijakan Otomatis") ditulis
  2026-11-01** (`docs/AI-AGENT.md` §24; menunggu keputusan AG-26…29, belum ada kode). **Brankas digital bukti renaksi ✅ 2026-10-31** (satu tautan per poin, beberapa berkas, pemberitahuan PDP, log akses IP + lokasi; unit backend +3, frontend +2, smoke +11, UI diuji: halaman publik, dialog brankas, ubah berkas, hapus entri → tautan mati). **Register Naskah Keluar SRIKANDI — bagian LifeOS ✅ 2026-10-31** (riset formulir resmi, tab Register, tautan final; unit +9, smoke +2, UI diuji desktop & HP; **robot pendaftaran ✅** — diuji ke SRIKANDI sungguhan: simpan konsep, anti-ganda, konsep uji dihapus; unit robot +4, backend +3, smoke +1). Berikutnya skill `penetapan-psp` (menunggu contoh dokumen user, C5) / 5b OnTrack / Register: Naskah Banyak & E-Form / pesan templat WA |
| Otomasi terjadwal (cron BullMQ, di tab Connector Laporan Kinerja & SRIKANDI; sub menu Tools → Otomasi dihapus 2026-11-06): sinkron baca-saja e-Kinerja & SRIKANDI, jadwal diatur dari UI, Jalankan sekarang, riwayat, tombol manual tetap; **Jaga sesi login** + jadwal dijeda saat sesi kedaluwarsa + notifikasi (lonceng, toast, browser) | ✅ 2026-11-01 — unit backend +11 & frontend +5, smoke +15 (user sementara tanpa sesi → sistem pemerintah tidak disentuh), lint, typecheck, build, UI desktop & HP; **jadwal di akun admin masih nonaktif** (dinyalakan user); run terjadwal ke sistem sungguhan belum diamati |
| Productivity lanjutan: modal Project/Area lega, kartu ringkas, File Control opt-in, tag bebas Resource Global & lampiran | ✅ 2026-10-12–15 — unit test, lint, typecheck, build, UI diuji di browser (desktop + HP) |
| Audit celah Productivity (8 temuan + 2 temuan saat uji): arsip yang sudah diberkaskan dikunci dari tab Resources, sumber My Notebook dilindungi di dialog hapus, item Area berlampiran & berdeskripsi, ubah lampiran, agenda berulang digabung per seri, form Area di-`key`, tag terhapus tidak kembali, filter & Kelola Tag, tag Musnah/Statis terkunci, tanggal bawaan lokal | ✅ 2026-10-18 — unit test (frontend 190+), lint, typecheck, build, UI diuji di browser dengan data `UJI-AUDIT` (dibersihkan) |
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
  **bisa diganti user** di Pengaturan → Model AI agar penghentian model berikutnya tidak butuh rilis. Gemini memakai
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
  Perbaikan 2026-10-18 (laporan user): task Tugas Mendesak milik Kegiatan/Sub Area membuka dialog Area dengan panel kanan
  kosong ("Pilih Sub Area, Kegiatan, atau Project") karena tidak ada item terpilih → `?task=` kini memilih kegiatan
  pemilik task (berlaku juga di Productivity, notifikasi, pencarian global, chatbot).
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
  tab AI bawaan ONLYOFFICE apa adanya (semua fiturnya) dengan provider & key Pengaturan → Model AI lewat proxy backend, tanpa
  pengaturan AI di editor (plugin panel & pilihan "key di editor" dihapus; `office_ai` jadi boolean). Templat **diunggah
  di Tools → ONLYOFFICE** (tag Resource tidak dipakai). Ditambah **Impor berkas** DOCX/XLSX/PPTX/… saat Buat Dokumen.
- 2026-10-16 — **ONLYOFFICE lanjutan + tahap 4** (keputusan user): Tools → ONLYOFFICE per role (user: AI, Templat, Cara
  memakai; admin + Status & Font); font **diunggah admin** (folder bersama + pemantau di image, tanpa restart manual);
  **konsep ↔ dokumen final** (konsep surat/nota dinas tidak perlu diberkaskan; PDF bertanda tangan = Resource Global +
  File Control otomatis, tertaut dua arah lewat `assets.draft_id`; dasar agen SRIKANDI nanti). Produksi: service
  `onlyoffice` profile `office`, Caddy `/office/`. Ditemukan saat uji produksi: editor seluler Community hanya bisa
  melihat → selalu tampilan desktop. Rencana user berikutnya: agen SRIKANDI & agen pembuat dokumen bertemplat di Tools
  (n8n / OpenClaw, dibahas nanti). Templat instansi user (29 DOCX dari folder `template/` yang sudah dihapus 2026-10-24) diunggah ke
  akun admin dev sebagai templat; pemilih templat menjadi modal dengan cari + filter + paginasi (permintaan user).
  Review celah (code review high) → 8 perbaikan: env kosong di compose produksi membuat backend gagal start saat
  ONLYOFFICE nonaktif (kini `emptyToUndefined` + test); kandidat tautan disaring format di database (sebelumnya hanya 120
  berkas terbaru); final diunggah ke ruang pemilik konsep (kolaborator berbagi Edit); upload final dibuang bila tautan
  gagal; penanda tautan hanya menghitung berkas yang boleh dibaca + cek izin hanya untuk berkas milik user lain; modal
  templat tetap terbuka saat gagal; opsi editor seluler dihapus dari API.
- 2026-10-16 — Thread **Pengaturan & Layout** lanjutan: (1) popover notifikasi yang panjang meluber ke bawah dan menimpa
  footer — `ScrollArea` Radix dengan `max-h` saja tidak membatasi viewport-nya (tinggi `size-full` tidak terhitung), sehingga
  isi tidak bisa digulir; kini popover dibatasi ruang layar tersedia dan daftar memakai area gulir biasa. (2) Judul dialog
  Focus Mode kini mengikuti sesi: **Mode Fokus**, **Waktu Rehat**, **Waktu Istirahat** (keterangan & ikon ikut berubah; tombol
  header saat berjalan menampilkan ikon & nama sesi).
- 2026-10-18 — **Sub Area tanpa tanggal** (keputusan user): Sub Area = wadah seperti Area, hanya nama + deskripsi; Tanggal &
  Dasar Pelaksanaan hanya untuk Kegiatan / Sub Kegiatan (kolom `activities.deadline`/`resources` tetap karena dipakai
  keduanya). Migrasi `20261018120000_sub_area_without_date` membersihkan sisa data Sub Area (data dev: 0 baris terdampak).
- 2026-10-18 — **Audit celah Productivity** (permintaan user, semua dikerjakan berurutan): (1) arsip Fisik/Digital bisa dihapus
  permanen dari tab Resources tanpa prosedur penyusutan → ditolak + arahan ke File Control; (2) tipe / berkas arsip yang sudah
  diberkaskan bisa diganti dari form Resource → dikunci; (7) form Area & Sub Area/Kegiatan tanpa `key` per sesi buka;
  (4) item area tidak bisa diberi Dasar Pelaksanaan/deskripsi padahal data & tampilan sudah mendukung; (5) lampiran tidak
  bisa diubah tanpa menghapus berkas → `AttachmentEditDialog`; (6) agenda berulang memenuhi daftar/timeline Project/Area →
  satu baris per seri; (8) tag asal project ganda ("Project" vs "Project Basis" → seragam "Project Basis" untuk dasar
  pelaksanaan), tag yang dihapus kembali dari lampiran (`removedTags`), filter + Kelola Tag; (3) berkas sumber My Notebook
  tidak dikenali dialog hapus (dijanjikan terhapus, 409 diabaikan) → "Dipakai". Ditemukan saat uji: tanggal bawaan lampiran /
  resource = tanggal UTC (kemarin sebelum 07.00 WIB) → `formatLocalYMD`; tag `Musnah`/`Statis` dari File Control bisa diubah
  lewat Kelola Tag → tag otomatis. Tanpa migrasi (`removedTags`, deskripsi & lampiran item area di kolom/`extra`).
- 2026-10-17 — **Hasil Agenda ↔ Notes AI** (permintaan user): tombol Buat Notes AI dipindah ke samping Tambah Hasil. Notes AI
  yang memilih agenda tetap hanya **tertaut** (catatan pribadi tidak wajib menjadi resource) dan bisa dimasukkan ke Hasil per
  catatan (opsional ke Resource Global). Celah yang ditemukan & diperbaiki: lampiran catatan yang disimpan ke Resource
  Global kehilangan `noteId` dan dibuat ganda setiap item disimpan ulang; resource catatan di tab Resources tidak bisa
  dibuka ("Tidak ada link/file"). Lanjutan (permintaan user): catatan yang sudah ditautkan sebagai lampiran / Resource
  Global tidak bisa dihapus sebelum tautannya dilepas (Catatan Bebas, Notes AI, List; dialog menunjukkan tempatnya).

- 2026-10-17 — **Audit celah Notes Space** (permintaan user, semua temuan diperbaiki): (1) List Bebas bersama / di dua tab
  saling menimpa item → PUT membawa `base` dan server menggabungkan perubahan per item (`record-merge.ts`, dipakai lewat
  `MERGE_ARRAY_KEYS`; tipe lain tidak berubah); (2) catatan yang menjadi sumber My Notebook kini ikut ditolak dialog hapus
  (`GET /notebooks/usage`); (3) berkas sumber notebook dilindungi di server (`DELETE /uploads/:id` → 409) agar tidak terhapus
  saat dokumen Notes AI diganti / resource dihapus; (4) unggahan Notes AI dicatat `trackPendingUpload` sampai disimpan;
  (5) Simpan Notes AI dikunci selama merekam; (6) daftar Catatan Bebas & Notes AI memakai **daftar ringan** (dokumen, coretan
  penuh, teks dokumen tidak ikut; editor memuat isi lengkap, tulis item ringan memakai `preserve`) — desain dipilih agar
  data lama tetap utuh tanpa migrasi; (7) edit judul/item List tersimpan saat klik di luar (Esc = batal); (8) lampiran chat
  notebook hanya berkas context `notebook_chat`; (9) sumber berkas ganda ditolak; (10) berkas pemilik yang dilepas kolaborator
  dicatat di `orphanUploadIds` lalu dibersihkan saat pemilik membuka Notes; (11) `?note=`/`?list=` ke item yang hilang /
  diarsipkan diberi keterangan; (12) riwayat chat dimuat 100 pesan terbaru + "Muat pesan lama".
- 2026-10-17 — Thread **AI Agent** dimulai: riset OpenClaw, Hermes Agent, n8n, SRIKANDI (hasil & to-do: `docs/AI-AGENT.md`).
  Temuan: n8n = workflow automation (lisensi Sustainable Use, bukan agent pribadi); Hermes & OpenClaw = asisten pribadi
  lewat chat (MIT; OpenClaw punya riwayat keamanan buruk 2026 → bila dipakai, Hermes disarankan); SRIKANDI tidak punya API
  publik (otomasi browser berisiko & mungkin melanggar ketentuan). LifeOS belum punya tool calling maupun token akses untuk
  program luar. Rekomendasi (menunggu keputusan user): A token akses pribadi + MCP server LifeOS → B agen dokumen
  bertemplat di backend → C pencocokan PDF final ↔ konsep (SRIKANDI semi-otomatis) → D/E n8n / Hermes opsional.
  Kebutuhan tambahan user (hari yang sama): **knowledge AI terspesialisasi** (user memberi & "melatih" pengetahuan) →
  rekomendasi tahap **K "Basis Pengetahuan Saya"** = RAG + profil/instruksi tetap + memori usulan AI yang disetujui +
  contoh gaya + uji pengetahuan, **bukan fine-tuning** (Gemini API tak lagi menyediakan tuning, Claude tidak ada, terikat
  satu provider, tidak bisa diperbarui); dikerjakan pertama. **Agen e-Kinerja Kemenhub** (login akun SIK, KM 254/2022)
  & **SIMAN v2** (DJKN, PMK 118/2023): tanpa API publik → rekomendasi **mode asisten** (LifeOS menyiapkan rekap/bukti,
  user mengirim), tidak menyimpan kata sandi akun pemerintah; otomasi penuh hanya dengan API/izin resmi.
- 2026-10-18 — AI Agent riset tahap 2 (`docs/AI-AGENT.md` §9–§15). **Kajian RAG**: chatbot melayang global **tidak memakai
  indeks** (konteks disusun di browser dari data terpotong `lifeos-context.ts`; indeks hanya dipakai My Notebook &
  `/ai/index/search`); semua potongan terindeks dikirim ke embedding Gemini — **key Gemini gratis (unpaid) boleh dipakai
  Google & dibaca reviewer** → untuk data kantor wajib billing aktif / embedding lokal; belum ada koleksi/metadata/status
  berlaku, pemotongan buta struktur, embedding hanya Gemini. **Obsidian** (gratis untuk kerja sejak Feb 2025) diusulkan
  sebagai tempat user menulis pengetahuan; vault disinkron ke server (Syncthing + Git di server), LifeOS membaca & mengindeks
  (+ graf `[[tautan]]`), hanya menulis ke `00-Inbox/`. **Agen: Hermes saja** (memori, keamanan default, WhatsApp Cloud API
  resmi, MCP) dengan dua instans: publik (bot satker, memori tulis mati — studi memory poisoning) & pribadi. Tiga pekerjaan
  user: bot WhatsApp ketentuan BMN, pengajuan dokumen bertemplat (PSP, SK panitia penghapusan, SK pemanfaatan) →
  ONLYOFFICE → SRIKANDI, konsep jawaban surat satker (selalu diverifikasi user) — semua lewat Antrian Verifikasi LifeOS.
  Sketsa robot (dibahas nanti): Playwright, profil browser persisten, sesi diperbarui user lewat browser jarak jauh
  (password & kode authenticator diketik user; tidak menyimpan kata sandi/rahasia TOTP), robot tidak pernah menandatangani;
  SIMAN baca-saja, e-Kinerja bulanan (butuh tautan publik bertoken), SRIKANDI isi + unggah.
- 2026-10-24 — **Keputusan user: tidak ada robot SIMAN di LifeOS.** Data master aset SIMAN & data keuangan MyIntress
  diambil dari **OnTrack Data Hub** (proyek user sendiri, `D:\Development\Application\OnTrack`: NestJS 3000 + PostgreSQL 16,
  vault kredensial, Playwright, rencana REST API ber-API key + MCP `query_siman_assets` / `query_myintress_data`).
  Rekomendasi (`docs/AI-AGENT.md` §16): **MCP untuk agen + REST API untuk fitur LifeOS** (bukan baca DB langsung / clone
  scraper); Hermes publik tanpa akses OnTrack. Per 2026-10-24 modul siman/myintress/API/MCP OnTrack **belum ada di kode**
  (baru skema & dokumen) → integrasi menunggu OnTrack. Robot pengisian **e-Kinerja & SRIKANDI tetap** direncanakan.
  Bentrok port dev (keduanya 5173/5432/6379) → usulan OnTrack pindah port saat dev (AG-19).
  Keputusan user (hari yang sama): AG-18 ✅ MCP + REST API; AG-19 ✅ OnTrack pindah ke 5174/3000/5433/6380 (dikerjakan user
  lewat Antigravity di repo OnTrack); AG-20 ✅ Hermes publik tanpa MCP OnTrack, **tetapi** nomor WhatsApp terverifikasi
  yang di-assign ke satker boleh menanyakan data satkernya sendiri — `satkerCode` diambil server dari pemetaan nomor
  (`wa_contacts`), bukan dari pesan/model; AG-21 ditunda sampai prototipe OnTrack selesai (finishing OnTrack nanti
  diserahkan ke Claude). User meminta lanjut **tahap 1 (fondasi pengetahuan) & tahap 2 (konektor Obsidian)** → AG-10
  (urutan) & AG-11 (Obsidian sumber pengetahuan, LifeOS membaca + `00-Inbox`) dianggap disetujui; sinkron vault (AG-12)
  baru relevan di server — di dev backend membaca folder vault lokal.
- 2026-10-24 — **AI Agent tahap 1 & 2 selesai** (`docs/AI-AGENT.md` §17). Desain: chat RAG di backend (bukan konteks
  browser) agar bot WhatsApp/agen nanti memakai jalur yang sama; ringkasan agenda/to-do dari browser tetap dikirim sebagai
  data aplikasi (tautan `app:`). Basis pengetahuan = koleksi `knowledge` di `ai_chunks` yang sama (bukan tabel vektor
  baru) dengan metadata status → aturan dicabut/draf/templat cukup filter SQL. Vault Obsidian dibaca dari disk server
  (`KNOWLEDGE_VAULTS_DIR`, dev `infra/knowledge-vaults/`), bukan plugin Obsidian (butuh aplikasi desktop menyala); PDF di
  vault disalin sebagai asset konteks `knowledge_vault` agar memakai ekstraksi & indeks yang ada. GraphRAG ringan =
  catatan tertaut (`[[…]]`, properti `dasar_hukum`) ikut konteks. Pemotongan sadar struktur dipakai indeks **dan** My
  Notebook lewat satu fungsi (`chunkSource`). Paket baru backend: `yaml` (pure JS). Ditemukan saat uji: pindai manual
  mengembalikan hasil pemindaian yang sedang berjalan (sebelum berkas baru ditulis) → `scanNow` menunggu lalu memindai
  lagi; folder uji smoke menumpuk → satu folder `smoke-vault` dipakai ulang; Markdown menggabung baris tunggal → tampilan
  catatan mempertahankan ganti baris seperti Obsidian. Belum: embedding selain Gemini, reranking, uji pengetahuan, memori
  usulan AI.
- 2026-10-24 — **Pembagian tugas AI + tahap 3** (user menerima semua rekomendasi; key yang dimiliki: Gemini & OpenAI).
  Desain: satu kolom jsonb `users.ai_routing` (bukan tabel) karena hanya 4 pilihan; embedding OpenAI dipotong ke 768
  dimensi (`dimensions`) agar kolom vektor & indeks HNSW tetap — model dicatat per potongan dan pencarian difilter per
  model. OCR mencoba provider lain saat kuota/tak terjangkau; kode alasan lama `needs_gemini_key` dipertahankan (sudah
  tersimpan di data). MCP: token akses pribadi (bukan JWT login) agar bisa dicabut & dibatasi; MCP stateless (server per
  permintaan) karena tidak butuh sesi dan lebih sederhana di belakang Caddy; tools disaring per cakupan (agen tidak
  melihat tool di luar izin); semua aksi lewat service aplikasi sehingga isolasi/berbagi/audit tetap berlaku. Paket baru:
  `@modelcontextprotocol/sdk` 1.32.1 (dipilih atas 1.32.2 yang baru rilis sehari) + `zod` 4. Ditemukan saat audit: advisory
  baru `body-parser`, `multer` (via NestJS/Express) & `fast-uri` (via ajv) diumumkan 19–22 Okt — ditangani terpisah
  (pemeliharaan dependensi), bukan di thread ini.
- 2026-10-25 — **Brankas kredensial + login otomatis robot** (permintaan user, merujuk OnTrack: OCR CAPTCHA MyIntress & dialog
  OTP SIMAN; user mengirim kredensial asli di chat — tidak disalin ke file/DB/memori, user diminta mengganti kata sandi).
  Keputusan: kredensial disimpan terenkripsi (revisi prinsip lama "tidak menyimpan kata sandi") dengan kunci khusus +
  AAD + konfirmasi kata sandi LifeOS; **CAPTCHA tidak dipecahkan otomatis** (OCR menembus pengamanan anti-bot sistem
  pemerintah) → gambar CAPTCHA ditampilkan untuk diketik user; OTP diketik user, rahasia TOTP tidak disimpan. Ditemukan
  saat uji: StrictMode menutup sesi yang diserahkan ke tayangan (cleanup efek) → pembatalan ditunda; dialog login otomatis
  membuka dua sesi → penanda sekali jalan.
- 2026-10-25 — **Tahap 6a: mesin robot SRIKANDI & e-Kinerja + AG-21** (permintaan user: siapkan teknologinya, pengujian
  nanti oleh user). AG-21 diputuskan: mesin dibangun **di LifeOS** (OnTrack belum punya mesin Playwright). Desain: service
  `robot/` terpisah (container Playwright resmi, arm64/amd64) **tanpa penyimpanan** — sesi `storageState` disimpan backend
  terenkripsi; login oleh user lewat **browser jarak jauh** berbasis tangkapan layar + masukan (bukan VNC: tidak perlu port/
  aplikasi tambahan, tetap di balik login LifeOS). Ditemukan saat uji: login SRIKANDI memakai **CAPTCHA** → robot tidak
  pernah mengisinya; ketikan cepat sempat hilang satu huruf → masukan diantrekan. Alur pengisian sengaja belum dibuat
  (struktur halaman belum diketahui) — diganti **Eksplor halaman** untuk merekam form bersama user. Tautan publik berkas
  dibangun sekarang karena dibutuhkan "link dokumen" e-Kinerja. Playwright 1.63.0 (bukan 1.64 yang baru rilis < 3 minggu).
- 2026-10-25 — **Renaksi e-Kinerja dari Productivity** (keputusan user): rencana aksi diisi tiap bulan dari data Productivity,
  tetapi **user yang memilih** item mana yang masuk (tidak semua) — agen menerima "produk jadi": bulan, pemetaan RHK, uraian,
  link dokumen. Desain: dua record type baru (bukan tabel khusus) agar memakai sinkronisasi `useCollection` dan backup yang
  sama; entri menyimpan salinan judul asal (tetap ada walau item dihapus); RHK diketik user dulu (nanti bisa diambil robot
  dari Detail SKP); link berkas = tautan publik tanpa kedaluwarsa (penilai e-Kinerja membuka kapan saja; bisa dicabut). Di
  dev tautan berawalan localhost — baru bisa dibuka penilai setelah VPS. Ditambah juga **Rekam halaman ini** di browser
  jarak jauh (formulir/modal setelah klik). Rekaman daftar SKP: SKP 2026 masih Draft → Rencana Aksi belum bisa dibuka.
- 2026-10-25 — **Connector pindah ke menu masing-masing + naskah ber-TTD dari SRIKANDI** (permintaan user): Tools → Konektor
  Robot dihapus; tab **Connector** ada di Laporan Kinerja (e-Kinerja) & SRIKANDI. SKP 2026 belum disubmit → renaksi ditunda,
  lanjut SRIKANDI: halaman `/pembuatan-naskah-keluar/naskah-keluar` direkam (tabel 10 kolom + detail dengan penampil PDF,
  tombol Unduh PDF, lampiran). Desain: robot menangkap PDF dari respons jaringan saat detail dimuat — tidak mengklik Unduh/
  tombol lain; naskah ber-TTD disimpan sebagai berkas LifeOS. Diuji: 182/SDJ.KEU/X/2026 terambil (PDF 2 halaman, nomor &
  tanggal & QR TTE tampil, footer BSrE), sinkron ulang tidak mengunduh ganda. Lampiran naskah diambil juga
  (Laporan Hasil Studi 4,7 MB & Tesis 4,6 MB, teks terbaca); sinkron ulang tanpa unduhan ganda. Lanjutan (keputusan user):
  naskah & lampiran otomatis Resource Global (Dokumen Final) + File Control, ditautkan ke konsep Approval bila ditemukan
  (diuji dengan pengajuan [UJI] berkonsep Nota Dinas berhal sama → tertaut, penanda Final, riwayat; data uji dihapus).
- 2026-10-25 — **Grup menu AI Agent** (keputusan user): sidebar punya grup baru **AI Agent** berisi **Approval** (Pengajuan
  berganti nama, path & data tetap), **Laporan Kinerja** (dipindah dari tab Productivity menjadi modul `/kinerja`), dan
  **SRIKANDI** (`/srikandi`: sesi robot SRIKANDI; alur naskah menunggu rekaman). "Eksplor halaman" di Tools → Konektor Robot
  dihapus dari UI (diganti Rekam halaman ini). RHK pimpinan yang diintervensi + indikatornya ikut disimpan & ditampilkan;
  teks tombol Edit RHK / Hapus RHK pada SKP draft tidak lagi ikut narasi (diuji: SKP 2026 draft → 6 RHK bersih).
- 2026-10-31 — **Integrasi Hermes tahap pertama** (permintaan user: UI/UX untuk Hermes, persiapan laptop & VPS). Keputusan:
  pemakaian harian lewat **UI LifeOS** (menu Asisten Agen + tombol di Approval) yang berbicara ke **API server Hermes** dari
  backend (kunci tidak sampai ke browser); dashboard bawaan Hermes / Open WebUI tidak dipakai; pengaturan model & skill
  sesekali (berkas repo; `setup.sh` diganti tombol Siapkan agen, lihat entri berikutnya). Hermes = **container Docker** image resmi (sama dengan VPS), versi v0.22.2 (≥ 2 minggu;
  bug `/v1/skills` ada sampai 0.22.5 → daftar skill dari repo). Satu pemilik agen (`HERMES_OWNER_EMAIL`) karena Hermes memakai
  token MCP satu akun. API key model diketik user di wizard Hermes (tidak lewat Claude). Produksi: tanpa port publik, backend
  beralias `lifeos-api` agar konfigurasi MCP sama dengan dev, volume `hermes-data` wajib ikut backup.
- 2026-10-31 — **Dokumen bertemplat → agen Hermes; Approval kembali ke Workspace** (keputusan user): menu Approval pindah
  ke Workspace setelah Productivity; grup AI Agent hanya modul agen (Laporan Kinerja, SRIKANDI). Penanganan permintaan
  dokumen bertemplat (PSP, panitia penghapusan, pemanfaatan BMN, …) yang dibangun sebagai fitur & alur tetap (tahap 4) akan
  ditangani **Hermes lewat skill/workflow**; LifeOS menyediakan alat MCP (pengajuan, berkas, pengetahuan, templat), Approval
  sebagai antrian verifikasi, dan log. OnTrack = sumber kebenaran SIMAN (master aset, terutama PSP) & MyIntress (akuntansi,
  laporan keuangan) lewat MCP **dan** API Service. AG-22…25 disetujui user (skill di `agents/hermes/skills/`, Analisis/Telaah
  bawaan dihapus setelah skill teruji, Hermes laptop → VPS). Langkah (1) selesai: tool MCP skill agen + `agentUpdate`.
- 2026-10-31 — **Riset Register Naskah Keluar SRIKANDI** (thread AI Agent → SRIKANDI dimulai): alur & isian formulir Registrasi
  Naskah Keluar (tipe Naskah Keluar / Naskah Final, batas lampiran, Kirim Konsep/Kirim Naskah) dari Buku Panduan SRIKANDI V3
  Kemenko PMK 2026 → `docs/AI-AGENT.md` §21.11 + usulan rancangan. Titik aman robot = **SIMPAN** (draf di Log Naskah Keluar);
  Kirim Konsep/Kirim Naskah/TTE di tangan user. Formulir di akun user belum direkam (TODO-USER A8). Atas pilihan user ("rancang
  dulu") bagian LifeOS dibangun lebih dulu: record type `srikandi_outgoing` + tab **Register Naskah Keluar** (isian formulir,
  berkas dari Approval/berkas LifeOS/unggah, referensi, status, tandai terdaftar manual, tautkan naskah final + konsep DOCX ↔
  PDF final) + tombol SRIKANDI di dokumen Approval. Robot pendaftaran menyusul setelah rekaman.
- 2026-10-31 — **Robot Register Naskah Keluar diuji ke SRIKANDI** (izin user: boleh simpan konsep & Ambil Nomor, tidak boleh
  Ajukan/Kirim Konsep, hapus konsep setelah uji). Formulir di akun user dipetakan Claude lewat browser jarak jauh (rekaman oleh
  user tidak diperlukan): ada Mode Registrasi, Naskah Banyak, Diberkaskan Oleh Unit Pengolah, ukuran QR; Ambil Nomor hanya
  penanda `XXX/KEU/ND/2026`. Desain: robot mengklik opsi react-select (Enter tanpa opsi mengirim formulir), draf dikenali dari hal
  (ID detail terenkripsi acak), berhenti di Simpan. Uji: dryRun → simpan → anti-ganda → konsep dihapus lewat aksi Hapus Log.
- 2026-10-31 — **Pemantauan & sinkron dua arah Rencana Aksi e-Kinerja** (permintaan user: pantau isian sampai penilaian dikirim,
  LifeOS & e-Kinerja tidak boleh berbeda, isian terkirim bisa diubah dengan pengenal perubahan). Desain: potret bulan sebagai
  record type baru `action_plan_month`; LifeOS = sumber isi untuk bulan draf tetapi butir yang diketik langsung di e-Kinerja
  diimpor dulu agar tidak hilang; bulan diajukan/dinilai dikunci; pengenal perubahan = tanda tangan isi saat terkirim; ubah =
  tulis ulang baris indikator (satu-satunya cara di e-Kinerja). Diuji ke draf Oktober (izin user): isi → ubah → hapus,
  Oktober dipulihkan.
- 2026-10-31 — **Klasifikasi arsip SRIKANDI menjadi referensi** (permintaan user): kategori `classification` di
  `srikandi_reference` dari `/klasifikasi-arsip/klasifikasi` (1.048 baris, label "KODE - Nama"), tombol **Ambil klasifikasi**
  terpisah dari Ambil referensi (lama), dipakai sebagai pilihan Klasifikasi (hanya Aktif) di formulir Register.
- 2026-10-30/31 — **Robot pengisian Renaksi e-Kinerja (tahap 6b)** (permintaan user, SKP 2026 sudah disetujui; aturan
  user: centang indikator sesuai pemetaan LifeOS, uji boleh pakai narasi & link dummy lalu dihapus, **tidak boleh** Kirim
  Penilaian Ke Atasan). Desain: entri = satu butir di setiap indikator RHK terpilih (pola isian user: satu baris per
  indikator, indikator WAKTU berrealisasi "Penyampaian tepat waktu"); `description` tetap kolom "rencana aksi", realisasi &
  indikator di `extra` (tanpa migrasi). Robot idempoten (baca dulu, tambah yang belum ada) karena e-Kinerja tidak punya
  ubah/hapus per butir; menghapus = Edit Rencana Aksi Kerja → lepas centang (baris & isinya hilang, min. 1 indikator) — robot
  tidak pernah melakukannya. Ditemukan saat uji: nama bulan berupa node teks lepas & templat rating tersembunyi membuat bulan
  terbaca "sudah diajukan"; pembacaan butir via saudara `<ol>` gagal (akan menggandakan butir bila diulang) → penelusuran
  node + mode `dryRun` untuk memeriksa sebelum mengisi.
- 2026-10-25 — **SKP & RHK diambil robot + tab Laporan Kinerja** (permintaan user): RHK tidak diketik manual tetapi
  diambil robot dari e-Kinerja (daftar SKP + tabel Hasil Kerja Detail SKP; hanya membaca, tombol Tambah RHK/Ajukan SKP
  tidak disentuh); tab Renaksi berganti nama **Laporan Kinerja**; **satu tahun bisa beberapa SKP** (mis. Jan–Apr & Mei–Des
  2025) → SKP menjadi record sendiri dan RHK melekat ke SKP, bulan entri menentukan SKP-nya. Diuji ke e-Kinerja sungguhan:
  7 SKP terbaca, RHK SKP 1 Mei–31 Des 2025 = 3 RHK × 2 indikator sesuai halaman; sinkron ulang tanpa data ganda.
- 2026-10-24 — **Pengajuan & bot dibuat umum** (permintaan user sebelum commit tahap 5: hari ini satker, kelak bisa
  masyarakat umum / unit pelayanan). Desain: "satker" diganti **grup kontak** berjenis (satker, instansi, masyarakat,
  internal, lainnya) dengan hak akses eksplisit (kirim pengajuan; lihat status seluruh grup vs milik sendiri) + properti
  catatan `grup: [KODE]` untuk pengetahuan khusus grup + profil layanan bot (nama & topik) per user. Pengajuan memakai
  `applicant`/`group_code` (RENAME COLUMN, data lama aman). Migrasi tahap 5 yang belum di-commit ditulis ulang (dev DB
  di-rollback manual lalu `migrate deploy`).
- 2026-10-24 — **Tahap 5 AI Agent: bot WhatsApp satker + to-do pemilik** (permintaan user: commit tahap 4, hapus folder
  `template/`, dokumen to-do sederhana, lanjut tahap 5). Desain (revisi rencana §12.1): bot satker dibangun **di LifeOS**
  memakai WhatsApp Cloud API resmi, bukan instans Hermes publik — AG-20 butuh satker pengirim ditentukan server dari
  nomor bertanda tangan Meta; lewat Hermes nomor hanya sampai ke MCP sebagai argumen model (bisa dimanipulasi) dan
  memorinya rawan diracuni. Hermes tetap untuk asisten pribadi via MCP. Tanpa kredensial Meta bot berjalan dalam **mode
  simulasi** sehingga bisa dicoba di laptop sebelum VPS. Folder `template/` dihapus (templat sudah ada di akun admin dev);
  test templat asli dihapus. Tambalan advisory dari sesi lain di-commit terpisah dari tahap 4. Dokumen baru
  `docs/TODO-USER.md` (diperbarui setiap ada tugas user).
- 2026-10-24 — **Tahap 4 AI Agent: Pengajuan + mesin templat + Antrian Verifikasi** (`docs/AI-AGENT.md` §19). Desain:
  tabel sendiri `requests` (bukan record type) karena alur status, riwayat, dan hasil agen relasional & tidak perlu sinkron
  per item; menu baru **Pengajuan** di Workspace (bukan sub menu Tools, karena dipakai harian sebagai antrian kerja).
  Mesin templat memakai penanda gaya SRIKANDI `${…}` yang sudah ada di 29 templat instansi user + paragraf petunjuk
  `[…]` (diganti teks AI, format paragraf dipertahankan); penanda SRIKANDI tidak pernah diisi LifeOS. Usulan isian AI
  selalu disunting user dulu; agen (MCP) hanya boleh mencatat & menganalisis — persetujuan/pengiriman hanya user.
  `satker_code` disiapkan untuk pemetaan pengguna WhatsApp per satker (AG-20, tahap 5). Paket baru: `docxtemplater`
  3.71 + `pizzip` 3.3 (pure JS). Ditemukan saat uji: isian AI bernomor di paragraf rata kiri-kanan teregang bila
  dijadikan pindah baris → dipecah menjadi beberapa paragraf.
- 2026-10-24 — **CI merah setelah push** (laporan user): (1) `format:check` frontend gagal di `main` dan semua PR Dependabot
  — `notebook-utils.test.ts` belum diformat Prettier → diformat; (2) Dependabot docker-compose error sejak service
  ONLYOFFICE dev memakai `image: lifeos-onlyoffice:10.0` (dicari di Docker Hub) → tag lewat variabel
  `${LIFEOS_ONLYOFFICE_TAG:-10.0}` (nama image tetap sama) + `ignore: lifeos-*` di dependabot.yml.
- 2026-10-31 — **Indeks Pengetahuan pindah ke Tools; menu AI → Model AI** (permintaan user): kartu Indeks pengetahuan
  (RAG) keluar dari Pengaturan → AI menjadi sub menu **Tools → Indeks Pengetahuan** (`/tools/index`, setelah Basis
  Pengetahuan) karena indeks = alat kerja yang dipakai semua fitur AI, sedangkan Pengaturan hanya provider/key/model.
  Sub menu Pengaturan "AI" berganti nama **Model AI** (path `/settings/api` tetap agar tautan lama tidak putus); semua
  teks "Pengaturan → AI" (UI, pesan error backend, dokumen) ikut diganti. Tanpa perubahan backend/API.
- 2026-10-31 — **Brankas digital bukti renaksi** (permintaan user sebelum commit): link bukti yang dibuka atasan / pejabat
  pembina kepegawaian = **satu tautan per poin renaksi** berisi beberapa berkas terisolasi (tabel sendiri, bukan folder S3 —
  berkas tetap Asset dan bisa dipakai bersama tanpa disalin; isolasi = token hanya membuka berkas yang terdaftar di brankasnya).
  Halaman publik memuat pemberitahuan PDP (UU 27/2022) dan pemberitahuan pencatatan; setiap buka/lihat/unduh dicatat dengan IP
  + perkiraan lokasi dari IP (ipapi.co tanpa key, bisa dimatikan `GEOIP_PROVIDER=none`; lokasi = perkiraan kota ISP). Ganti
  berkas tidak mengubah tautan (tidak perlu kirim ulang ke e-Kinerja); ganti tautan = isi entri berubah → Kirim perubahan.
  Berkas brankas dilindungi dari penghapusan fitur lain.
- 2026-10-31 — **Siapkan agen tanpa terminal** (permintaan user: `setup.sh` jangan wajib terminal; key yang ada hanya Google
  Gemini dengan kredit Google Cloud). Keputusan: "satu pintu" seperti AI di ONLYOFFICE — Hermes memakai model lewat proxy
  OpenAI-compatible LifeOS dengan key di Pengaturan → Model AI (key tidak pernah disimpan di Hermes, ganti key/model tanpa
  menyentuh Hermes), baris Pembagian tugas **Agen (Hermes)**. Kunci Hermes ↔ LifeOS memakai `HERMES_API_KEY` yang sudah
  dipegang kedua pihak, didaftarkan sebagai token akses "Agen Hermes" lewat tombol **Siapkan agen** (cakupan bisa dipilih,
  dicabut di Integrasi) — tidak perlu menyalin token. `setup.sh` dihapus; `configure.sh` (tanpa rahasia) dijalankan `up.sh`.
  OpenClaw tidak ditambahkan (Hermes cukup untuk pekerjaan saat ini). Langganan Claude Pro tidak bisa dipakai Hermes (hanya
  API key); Claude Code/Desktop dengan Pro bisa memakai MCP LifeOS secara interaktif.
- 2026-11-01 — **Audit & uji menyeluruh fitur AI Agent** (permintaan user: Asisten Agen, SRIKANDI, Laporan Kinerja). Tanpa
  menyentuh e-Kinerja/SRIKANDI sungguhan (kode robot, pengaman tombol terlarang, dan alur diperiksa lewat kode + test).
  Diperbaiki: (1) unggahan khusus brankas menjadi sampah di storage saat brankas dihapus / berkas dikeluarkan / entri
  dihapus robot → dihapus bila tidak dipakai brankas lain; (2) dialog Rencana Aksi: unggahan brankas yang dilepas
  centangnya atau bukti yang diganti dari brankas kini dibuang saat Simpan, teks peringatan entri terisi diperbarui (ubah =
  tulis ulang lewat Kirim perubahan), badge status dihitung ulang seperti papan Laporan Kinerja; (3) Register SRIKANDI:
  batas berkas (naskah/lampiran ≤ 5 MB, total lampiran ≤ 20 MB) diperiksa backend sebelum berkas dibaca ke memori;
  (4) sesi login jarak jauh yang ditinggalkan dibuang dari memori setelah 1 jam; (5) konektor dibuat lewat upsert (dua
  permintaan pertama tidak bentrok); (6) cache lokasi IP brankas dibatasi 1.000 entri, catatan log Pantau per SKP.
- 2026-11-01 — **Pemeriksaan dokumentasi Planner** (permintaan user): kode Planner dibaca ulang dan dibandingkan dengan
  dokumen. Ditambahkan peta modul Planner di §8b (tab → berkas, URL, aturan rutinitas/freeze/arsip, tipe agenda, logika
  murni & pemakainya di modul lain); kalimat usang "Productivity belum menampilkan badge jadwal ulang" dikoreksi. Celah
  kode yang dicatat (belum diperbaiki): upload Dasar Pelaksanaan di form agenda belum memakai `trackPendingUpload`.
- 2026-11-01 — **Pemeriksaan dokumentasi Productivity** (permintaan user): kode Productivity dibaca ulang. Aturan fitur
  (lampiran, tag, File Control, arsip, Sub Area, agenda, Laporan Kinerja) sudah tercatat dan sesuai kode; yang belum ada =
  peta modul → ditambahkan di §8b (tab → berkas, filter, paginasi, TaskManager, aksi berantai). Celah kode yang dicatat
  (belum diperbaiki): Overview Productivity memakai label Inggris & bisa menampilkan project selesai/ditunda; tab Areas
  tanpa pencarian.
- 2026-11-01 — **Otomasi terjadwal di dalam LifeOS** (permintaan user). Penjadwal BullMQ yang dikelola dari UI
  (Tools → Otomasi, tanpa layanan baru): e-Kinerja tiap pagi,
  Daftar Naskah Keluar tiap jam kerja 07–17, referensi tiap pagi, klasifikasi mingguan — semua bawaan **nonaktif** sampai user
  menyalakan. Hanya tugas baca-saja yang boleh dijadwalkan; maks. sekali per jam; satu tugas sekaligus; tidak mengulang
  otomatis. Tombol sinkron & "Jalankan sekarang" tetap ada; kunci per sistem mencegah dua tugas memakai sesi yang sama.
  "Daftar register naskah" ditafsirkan sebagai **Daftar Naskah Keluar** (status Register Naskah Keluar belum dibaca dari
  SRIKANDI — belum ada alur robotnya). Lanjutan (permintaan user: sesi tersimpan + notifikasi saat kedaluwarsa): sesi sudah
  disimpan terenkripsi dan diperbarui setiap run; ditambah tugas **Jaga sesi login** per sistem (bawaan tiap jam kerja menit
  ke-30, nonaktif), jadwal sistem yang sesinya kedaluwarsa **dijeda** (dilewati tanpa membuka halaman login sistem pemerintah),
  dan notifikasi di lonceng + toast + notifikasi browser opsional. CAPTCHA/OTP tetap diketik user, jadi login ulang tidak
  diotomatiskan.

- 2026-11-01 — **Obsidian tidak di Docker; Syncthing sebagai container produksi** (permintaan user). Obsidian = aplikasi
  desktop untuk menulis (laptop/HP); LifeOS hanya membaca berkas Markdown vault, jadi image Obsidian (desktop jarak jauh
  KasmVNC) tidak dipakai — berat dan menambah permukaan serangan. Yang dijalankan di VPS = Syncthing resmi
  `syncthing/syncthing:2.1.6` (2.1.7 baru 11 hari) di profile `sync`, menggantikan paket sistem sebagai cara utama
  (paket tetap alternatif). Pengecualian aturan "hanya Caddy membuka port": 22000 TCP/UDP untuk sinkron langsung.
- 2026-11-01 — **Rancangan persetujuan otomatis tugas agen** (permintaan user, contoh Generasi PSP: WhatsApp → baca dokumen →
  ambil aset → cocokkan ke master SIMAN/OnTrack → ≥ 75% → PSP dari templat → SRIKANDI, selain itu Telaah Staf). Prinsip yang
  dipilih: **yang menyetujui = kebijakan milik user yang dijalankan server**, bukan model. Agen menyerahkan data aset
  terstruktur, server memverifikasi ulang ke OnTrack dan menghitung skor sendiri (tahan *prompt injection*). Dilengkapi mode
  shadow, masa tunda sebelum SRIKANDI (yang bisa dibatalkan), batas harian, sakelar darurat, dan `agent_runs` permanen.
  Rancangan & keputusan terbuka AG-26…29: `docs/AI-AGENT.md` §24. Belum ada kode.
- 2026-11-05 — **Claude untuk Hermes lewat API native** (permintaan user, rencana memakai Opus 5.5 sebagai otak agen). Endpoint
  kompatibel OpenAI milik Anthropic tanpa prompt caching, tanpa blok pemikiran, tidak dianjurkan untuk produksi, dan menolak
  `temperature`/`tool_choice` paksa. Dipilih **terjemahan di proxy LifeOS**, bukan `api_mode: anthropic_messages` di Hermes: Hermes
  tetap satu konfigurasi sehingga ganti provider dari Pengaturan → Model AI tetap tanpa terminal. Menyala: cache otomatis, effort
  medium, `fallbacks: "default"` (refusal dialihkan server), `drop_block` (ringkasan riwayat Hermes tidak jadi 400). Hermes
  membuang `reasoning_details` di rute custom → blok giliran alat disimpan di memori backend (6 jam, 500 giliran); hilang saat
  restart = API menurunkan pemikiran untuk giliran itu, tidak error. Diuji dengan klien OpenAI + server Anthropic tiruan;
  **belum diuji ke Claude sungguhan** (belum ada API key; TODO-USER A7).
- 2026-11-05 — **Peta jalan agen 5 tahap** (permintaan user, dikerjakan satu per satu; `docs/AI-AGENT.md` §25): komunikasi, skill &
  kerja otomatis tanpa Approval (Kirim Konsep SRIKANDI tetap di tangan user), fitur Hermes di LifeOS, antarmuka Obsidian, pembagian
  model. **Nomor 1**: LifeOS = satu-satunya perantara Obsidian ↔ Hermes; jalur terbukti kecuali jawaban model. Diperbaiki: embedding
  gagal kini tidak membuat catatan hilang dari pencarian (disimpan tanpa vektor, menyusul), status vault & indeks di kartu Siapkan
  agen, tautan ganda di `read_knowledge_note`. Vault `Pengetahuan-BMN` dibuat di akun admin dev. API key Gemini tersimpan ditolak
  Google (401) → menunggu key baru dari user.
- 2026-11-06 — **Provider AI lewat router** (permintaan user: token Claude/OpenAI/Gemini dibeli lewat router pihak ketiga yang
  lebih murah, tidak terbatas satu router). Desain: jalur menjadi sifat **kredensial per provider** (bukan provider baru), sehingga
  pembagian tugas, cadangan otomatis, OCR, embedding, dan proxy agen tetap memakai provider Gemini/Claude/OpenAI apa adanya dan
  tiap provider boleh berbeda jalur (mis. Gemini & OpenAI langsung, Claude lewat router). Dua format umum: OpenAI Chat
  Completions (semua provider) dan Anthropic Messages (Claude, agar cache & pemikiran tetap jalan). Router = pihak ketiga yang
  melihat isi permintaan → peringatan di UI; key router disimpan terenkripsi seperti key resmi. Diuji dengan router tiruan
  (15/15: simpan, uji koneksi, model salah, Claude + ulang tanpa beta, generate, embedding & pencarian), unit +13, smoke +5;
  **belum diuji ke router sungguhan** (key dipegang user) dan proxy agen lewat router belum diuji ujung-ke-ujung.
- 2026-11-06 — **Peta jalan no. 4: menu Knowledge** (disetujui user, "full feature" + riset dulu; rencana §25.2). Berkas vault tetap
  sumber kebenaran: LifeOS menulis berkas (atomik, cek hash → 409 alih-alih menimpa perubahan Obsidian/Syncthing), lalu pemantau
  yang sama membaca ulang sehingga indeks RAG & graf ikut. Hapus = `.trash` vault. Editor CodeMirror (bukan Tiptap) agar sintaks
  Obsidian tidak berubah saat disimpan; parser `@lezer/markdown` langsung karena `@codemirror/lang-markdown` menarik HTML/CSS/JS
  (chunk 563 kB). Graf `react-force-graph-2d` (MIT, kanvas) atas sigma.js. Gambar sematan dibaca dari disk (tanpa OCR/biaya AI).
  Agen tetap hanya menulis `00-Inbox`. Belum: frontmatter di editor tampil sebagai judul (setext) — kosmetik.
- 2026-11-06 — **Cermin hasil kerja LifeOS → Obsidian, graf ala Obsidian, tumpang tindih Tools** (disetujui user). Cermin = satu
  arah ke `80-LifeOS/` (sinkron dua arah rawan bentrok & merusak data); berkas cermin ditimpa setiap sinkron dan baca saja di
  LifeOS, catatan user sendiri menautkannya. Tidak diindeks ulang sebagai pengetahuan (data sudah diindeks sebagai data kerja →
  jawaban AI tidak ganda). Hanya data milik sendiri; lampiran = nama + tautan (berkas tidak disalin); berkas lampiran yang juga
  Resource Global ditautkan ke berkas Resource-nya. Pemicu = sidik jari tabel tiap menit (tanpa kait di RecordsService/Notebooks).
  Graf: panel Filter/Grup/Tampilan/Gaya + Animasi seperti Obsidian, pengaturan tampilan per browser. Tools → Basis Pengetahuan =
  pengaturan (vault, profil, cermin, cara memakai); bekerja dengan isi vault = menu Knowledge. Hermes: user mengatur tugas Agen =
  Claude (lewat router) dengan cadangan OpenAI.
- 2026-11-06 — **Peta jalan no. 5: cadangan per tugas AI** (keputusan user: "pilih cadangan per tugas", rencana Agen = Claude →
  cadangan OpenAI, chat/RAG/umum = Gemini). Disimpan di `ai_routing` yang ada (tanpa migrasi); sakelar cadangan otomatis tetap
  sakelar utama. Proxy agen kini punya cadangan: hanya sebelum respons dimulai (aliran yang sudah berjalan tidak bisa dipindah)
  dan hanya untuk kuota/saldo/sibuk/tak terjangkau — key ditolak tetap terlihat. Diuji router tiruan 6/6 (non-stream, stream,
  401 tidak dialihkan, sakelar mati), unit +6, smoke +3. **No. 4 menu Knowledge**: riset & rencana ditulis
  (`docs/AI-AGENT.md` §25.2), menunggu persetujuan user sebelum dibangun.
- 2026-11-06 — **Kebijakan Otomatis tahap 1** (peta jalan no. 2; keputusan user: skill buatan Hermes = draf yang diaktifkan user,
  shadow dulu lalu auto dinaikkan user, alat bawaan Hermes dibiarkan menyala **dengan pengingat sebelum auto dipakai**, data master
  tiruan; AG-26…29 sesuai rekomendasi). Desain: yang memutuskan = server menurut aturan; agen hanya menyerahkan data aset terstruktur
  dan server menghitung ulang skor sendiri (tahan *prompt injection*). Isian SRIKANDI tidak dikarang agen: disalin dari entri
  Register yang dipilih user sebagai templat; tanpa templat = tidak pernah dikirim. Run agen dipindah dari memori ke tabel
  `agent_runs` agar keputusan tetap terjadi walau backend restart. Run dari aturan menunggu berkas selesai dibaca (tenang 90 dtk).
- 2026-11-06 — **Duplikasi otomasi dihapus** (permintaan user): sub menu Tools → Otomasi dan bagian jadwal di tab Connector
  memakai komponen yang sama; bedanya hanya kartu "Cara kerja otomasi" + tombol notifikasi browser (hanya di Tools) dan
  notifikasi tugas gagal yang menuju `/tools/automation`. Keduanya digabung ke tab Connector Laporan Kinerja & SRIKANDI; sub
  menu Tools → Otomasi dihapus (API `/automation/*` tetap). Lanjutan: tab Connector dibagi dua sub-tab **Pengaturan koneksi** |
  **Otomasi terjadwal**; daftar "Alur yang direncanakan (belum aktif)" yang usang diganti "Pekerjaan robot & batasnya" sesuai
  kemampuan robot sekarang; kartu pengantar SRIKANDI yang usang dihapus sehingga kedua menu sama persis.
- 2026-11-06 — **Menu Pengetahuan → Knowledge** (permintaan user): hanya label menu & teks UI (path `/knowledge`, kode, sumber
  indeks "Pengetahuan: …" tetap). Riset lanjutan fitur Obsidian yang belum ada (K1–K11, usulan urutan K1 → K4 → K5 → K3 → K6
  → K2 → K7 → K8) ditulis di `docs/AI-AGENT.md` §25.6 — menunggu pilihan user.
- 2026-11-06 — **K1 Catatan harian + K4 Catatan serupa** (pilihan user). Catatan harian = berkas milik user (dibuat sekali,
  ringkasan = potret saat dibuat, centang tidak disinkronkan — itu K3); dibuka juga dari Planner Harian. Catatan serupa memakai
  embedding yang sudah ada (tanpa biaya AI); skor ±0,85 = topik sama, ±0,6 = tidak terkait (gemini-embedding-2).
- 2026-11-07 — **K5 palet perintah + perintah `/`** ("lanjut ke tahap selanjutnya"). Ctrl+P di menu Knowledge menggantikan cetak
  browser (seperti Obsidian; cetak tetap lewat menu browser). Perintah `/` hanya di awal baris atau setelah spasi agar path/URL
  (`a/b`, `https://`) tidak memicunya. Templat yang disisipkan di tengah catatan membuang properti templat (tidak ada dua blok
  properti). Tanpa perubahan backend.
- 2026-11-07 — **K3 tugas lintas vault** ("lanjutkan tahap selanjutnya"). Format = plugin Tasks Obsidian agar tugas yang ditulis
  di Obsidian dan di LifeOS sama persis (centang → `✅ tanggal`, berulang → baris baru di atas). Tugas vault **tidak** disalin ke
  record Planner (berkas tetap sumber kebenaran); Planner Harian hanya menampilkannya. Ringkasan LifeOS di catatan harian
  dilewati (salinan to-do Planner → tidak ganda). Penulisan balik memakai baris asli, bukan hash berkas, agar dua centang
  beruntun di catatan yang sama tidak saling menolak, tetapi perubahan baris di Obsidian tetap ditolak 409.
- 2026-11-07 — **K6 sematan catatan & blok** ("lanjutkan tahap pengembangan knowledge selanjutnya"). Sintaks Obsidian apa adanya
  (`#Judul`, `#^id`, penanda `^id`) agar berkas tetap sama di Obsidian. Seperti Obsidian, memilih blok tanpa id di pelengkap
  `[[catatan#^` menulis `^id` acak 6 karakter ke berkas tujuan; baris dicari persis & unik (berubah → ditolak, tidak menebak).
  Tanpa perubahan backend.
- 2026-11-07 — **K2 Bases** ("Lanjut K2 dulu"). Berkas `.base` = sumber kebenaran (tampilan yang sama terbuka di Obsidian);
  server hanya baca/tulis YAML, evaluasi filter di browser atas daftar catatan yang sudah dimuat (tanpa query baru). Hanya subset
  sintaks Obsidian yang didukung — ekspresi lain tidak merusak berkas, hanya diberi peringatan & diabaikan. Tampilan Kanban dari
  usulan awal tidak dibuat (Bases Obsidian tidak punya Kanban); Tabel/Kartu/Daftar sesuai Obsidian. Lanjutan ("selesaikan bagian
  K2 yang belum"): sematan `![[x.base]]` di catatan, ringkasan kaki tabel, sunting nilai di sel (tulis frontmatter ber-hash).
- 2026-11-07 — **K7 riwayat versi catatan** (pola File recovery Obsidian). Disimpan di database (ikut backup), bukan di vault
  (tidak tersinkron ke Obsidian/HP). Isi sebelum LifeOS menimpa selalu disimpan; versi dari Obsidian dicatat saat pindai,
  dirapatkan per 5 menit (seperti selang snapshot Obsidian). Ditemukan saat merancang: isi sebelum simpan = versi terpantau
  terakhir → versi itu ditandai `before_*` agar tidak ditimpa pindai berikutnya. Ditemukan saat uji: dialog membandingkan dengan
  isi catatan lama di cache → isi terkini selalu dibaca ulang saat dialog dibuka.
- 2026-11-07 — **K8 Canvas** ("lanjutkan pengembangan tahap selanjutnya"; perubahan sebelumnya di-commit dulu atas perintah user).
  Format terbuka JSON Canvas apa adanya (kunci tak dikenal dipertahankan, indentasi tab seperti Obsidian) sehingga berkas sama
  dengan Canvas Obsidian. Tahap 1 penampil + tahap 2 sunting dasar sekaligus (pindah, ubah ukuran, tambah teks/catatan/tautan/grup,
  sunting teks, hubungkan, warna, hapus); papan digambar sendiri dengan DOM + SVG (tanpa pustaka baru). Kartu tautan tidak memuat
  situs dalam iframe (CSP produksi & privasi). Ditemukan saat uji: akhir seretan/sunting menyimpan data lama karena perubahan
  dihitung dari closure render / updater React → semua perubahan dihitung dari ref data terkini.
- 2026-11-09 — **Advisory npm ditutup** (permintaan user, tanpa perubahan fitur): Prisma 7.10.1 (`deepmerge-ts` 8; override `mysql2` dicabut), `zod` 4.6.7, `fast-uri` 3.1.9, `shadcn` 4.22.1 + transitif CLI, semua dengan `--before=2026-10-26` (kebijakan rilis ≥ 2 minggu). `shadcn/tailwind.css` tidak berubah. `minimatch` 11 tidak dipaksakan: baru 12 hari dan lintas major bagi ESLint.
- 2026-11-09 — **K10 pelengkap Obsidian** ("kembangkan fitur2 penting K10, tidak hanya mermaid"): Mermaid 12.2.0 (12.3.0 baru 6 hari, kebijakan ≥ 2 minggu), catatan kaki, jumlah kata, ganti nama tag se-vault;
  ditambah sorotan `==teks==` & komentar `%%…%%` yang ternyata belum didukung pembaca. Mermaid mode ketat karena isi vault bisa datang dari agen/sinkron; diuji dengan build produksi + CSP persis `nginx.conf`
  (tanpa pelanggaran; `<img onerror>` di label dibuang, `click javascript:` tidak jalan). Ditemukan saat uji: tautan catatan kaki membuka tab baru; diagram digambar ulang setiap render (komponen `pre` sebaris).
  Catatan kaki sebaris `^[teks]` Obsidian belum didukung. Audit menemukan `zod` < 4.6.6 & `fast-uri` (bukan dari Mermaid), ditutup di entri berikut.
- 2026-11-09 — **K9 Note composer** (riset lalu "bangun", keputusan K9-A…C sesuai rekomendasi; `docs/AI-AGENT.md` §25.7): properti digabung (tujuan menang, tag & alias
  disatukan), `## Judul sumber` + perujuk ke bagian itu, celah lama ganti nama / pindah catatan yang memutus node `file` di `.canvas` ikut ditutup. Ekstrak dikerjakan
  server (posisi + teks + hash), bukan transaksi editor, agar satu aturan & urutan tulis yang aman; editor di-flush lalu dimuat ulang (undo editor hilang, diganti riwayat
  versi K7). Pilihan sisa teks disimpan per browser, bukan `knowledge_prefs` (perubahan rencana: tidak perlu lintas perangkat). Target heading & pecah per heading = tahap 2.
- 2026-11-07 — **Prompt caching proxy agen → penanda per blok** (uji atas permintaan user, dokumentasi Classai: cache otomatis, token
  cache ditagih 50%). Uji tiga format (tingkat atas / per blok / tanpa penanda) × 3 panggilan identik ±8 ribu token lewat Classai: semua
  melaporkan cache 0 karena router membuang kolom cache dari `usage` (mentah hanya `input_tokens`/`output_tokens`). Dipilih penanda per
  blok (format yang dikenali API Anthropic langsung maupun router yang memasang penanda sendiri bila belum ada).
  **Terbukti 2026-11-09 lewat dasbor Classai** (Usage → "tokens from packages"): 4 panggilan identik = 32 rb token tercatat, hanya 20 rb
  terpotong dari paket (8 rb penuh + 3 × 4 rb setengah harga). Riwayat sebelumnya juga cocok dengan cache aktif di ketiga format (172 rb
  tercatat, 126 rb terpotong) → log "Token" dasbor & LifeOS = token mentah, potongan hanya terlihat di "tokens from packages".
- 2026-11-07 — **Celah K1–K8 ditutup** (permintaan user: "lakukan pekerjaan K1 sd K8 yang masih terlewat"): catatan berkala
  mingguan/bulanan (bagian "periodic" K1), isi canvas di indeks RAG (sumber terpisah `obsidian_canvas`, bukan baris
  `knowledge_notes`, agar canvas tidak muncul sebagai catatan yang bisa disunting/ditimpa teks), sematan canvas sebagai papan mini.
  Kanban (K2) sengaja tidak dibuat (Bases Obsidian tidak punya). Ditemukan saat uji: semua sematan (catatan, base, canvas) dirender
  `<div>` di dalam `<p>` (HTML tidak sah, peringatan React) → paragraf berisi sematan dirender sebagai `<div>`.
  Dicek atas pertanyaan user: Classai Router (Claude Opus 5.5) tidak membatasi topik, tetapi model menyebut dirinya "Claude Code
  lewat Classai Router" → router kemungkinan menyisipkan system prompt Claude Code (LifeOS sendiri tidak mengirim system prompt di
  `generate`); jawaban umum tetap benar.
  Ditemukan saat restart WSL: pemantau run agen (`AgentService.tick`, `try/finally` tanpa `catch` dari `setInterval`) mematikan
  proses backend ketika database sesaat putus → galat kini dicatat; pemindai vault & cermin juga diberi `.catch`.

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

**Memakai router AI baru** (OpenRouter, router lokal, dll.): tanpa kode — user mengisi alamat API, format, key, dan ID model
di Pengaturan → Model AI → kartu provider → **Lewat router**. Kode hanya perlu diubah bila router memakai format selain
OpenAI Chat Completions / Anthropic Messages (tambah nilai `AiApiFormat` + klien di `providers/` + cabang di `AiService.call` &
`AgentService.proxyChat`).

**Menambah provider/model AI**: model baru dari provider yang sama cukup diganti user di Pengaturan → Model AI; ubah default
di `backend/src/ai/ai-providers.ts` (`defaultModel`, `suggestedModels`) saat generasi model berganti. Provider baru:
nilai enum `AiProvider` di `schema.prisma` + migrasi, entri katalog `AI_PROVIDERS`, klien `providers/<nama>.client.ts`
(SDK resmi, petakan error ke `AiProviderError`), daftarkan di `CLIENTS` (`ai.service.ts`), tipe `AiProviderId` di
frontend `types/api.ts`; tambah kasus di `ai.spec.ts` & smoke test.

**Menambah data ke cermin 80-LifeOS** (ekspor ke Obsidian): record type → `SOURCES` (`knowledge-export.service.ts`, juga ikut
sidik jari), penulis berkas + alokasi path di `buildExport` (`vault-export.ts`, tautan lewat `ref()`/`wikilink` agar tidak
ambigu), jenis baru → `EXPORT_KINDS` (backend), `KnowledgeExportKind` + `EXPORT_KIND_INFO` (frontend). Tambah kasus di
`vault-export.spec.ts` (tes "semua tautan terselesaikan").

**Menambah tipe data ke indeks RAG**: tambah record type + labelnya di `INDEXED_TYPES`
(`backend/src/ai/index/index-text.ts`) dan label sumber di `frontend/src/features/tools/knowledge-index/knowledge-index-settings.tsx`; field
payload otomatis ikut (kecuali key berakhiran `Id`, lihat `KEEP_KEYS`). Lalu "Indeks ulang" di Tools → Indeks Pengetahuan.
Mengganti model/dimensi embedding = migrasi kolom `vector(N)` + indeks HNSW baru + bangun ulang semua indeks.

**Menambah sumber ke basis pengetahuan / chat AI**: sumber baru dengan koleksi sendiri → `SourceDocument.collection`
+ `metadata` di `AiIndexService` (`loadSource` & `loadAllSources`; sumber milik modul lain yang bergantung pada AiIndexService →
`registerSourceLoader(sourceType, { load, loadAll })`, contoh Canvas di `KnowledgeVaultService`), jenis pemotongan di `chunkSource`, label sumber di
`knowledge-index-settings.tsx` & `citationTarget` (`knowledge-utils.ts`) agar sitasi bisa dibuka. Aturan menjawab / bagian prompt →
`buildAssistantPrompt` (+ test). Status yang tidak boleh dipakai menjawab → `EXCLUDED_STATUSES`.

**Menambah tool MCP** (agen AI): tool baru di `LifeosMcpService.createServer` (`src/integrations/lifeos-mcp.service.ts`)
di dalam blok cakupan yang sesuai (`can("…")`), handler dibungkus `run(nama, …)` agar tercatat di log aktivitas, input
dengan zod (batasi panjang/rentang), aksi lewat service aplikasi (jangan query langsung yang melewati isolasi/berbagi).
Cakupan baru → `API_SCOPES` + `SCOPE_LABELS` (backend) & `SCOPE_SHORT` (frontend `integrations-tab.tsx`); label log di
`TOOL_LABELS`. Tambah skenario smoke (JSON-RPC `tools/call`).

**Menambah alur robot pengisi** (pelajaran Renaksi e-Kinerja): baca halaman per **node teks terlihat** (bukan per elemen —
judul bisa teks lepas, templat tersembunyi ikut di DOM), sediakan `dryRun` (baca + rencana tanpa klik) dan uji dulu, buat
langkah idempoten (baca isi → tambah yang belum ada), klik lewat `safeClick` (pola tombol terlarang), dan jangan pernah
menekan tombol kirim/ajukan.

**Menambah alur robot** (tahap 6b, mis. konsep naskah SRIKANDI): minta user merekam halaman lewat Eksplor halaman →
baca `robot_runs.aria` (struktur) + tangkapan layar → tulis langkah di service robot (`robot/src/`, endpoint job baru
berisi input terstruktur, locator berbasis role/label dari snapshot, tangkapan layar tiap langkah) + endpoint backend yang
menyimpan run & meminta konfirmasi user sebelum langkah "kirim". Jangan pernah: menandatangani, mengisi CAPTCHA/OTP,
menyimpan kata sandi. Versi `playwright` npm = tag image di `robot/Dockerfile`.

**Mengubah isian sistem tanpa ubah/hapus per butir** (pelajaran e-Kinerja): simpan tanda tangan isi saat terkirim (pengenal
perubahan), baca & impor isi sistem sebelum menulis, tulis ulang satu unit terkecil yang bisa dihapus (baris indikator) lalu isi
ulang dari LifeOS; jangan pernah melepas baris kosong / mengosongkan unit yang wajib ada; selalu sediakan `dryRun`.

**Mengisi formulir react-select** (pelajaran Registrasi SRIKANDI): tandai kolom lewat teks label → `input[role=combobox]`
berikutnya, ketik istilah pendek (`searchTerm`), tunggu opsi dari server, **klik** opsi (`pickOption`) — jangan Enter (bisa
mengirim formulir); kenali hasil simpan dari isi tabel (ID terenkripsi bisa acak per muat).

**Menambah hak akses grup bot WhatsApp** (mis. data OnTrack per grup): kolom boolean baru di `ContactGroup` + migrasi,
DTO `GroupDto`, `groupAccessSummary` & form grup (frontend), lalu periksa hak itu di `WhatsappService.process` — data
selalu disaring dengan `contact.group.code` dari database, **jangan** dari isi pesan/argumen model.

**Menambah tugas otomasi terjadwal**: hanya tugas yang **membaca** sistem asal. Jenis baru di `ROBOT_JOB_KINDS` + `ROBOT_JOBS`
+ `summarizeRobotJob` (`robot/robot-jobs.ts`), method publik dibungkus `this.job(user, kind, trigger, …)`, jadwal bawaan di
`DEFAULT_SCHEDULES`, cabang `dispatch` di `automation-worker.service.ts`; frontend `AutomationKind` (`types/api.ts`),
`KIND_INFO` & `KIND_RECORDS` (`automation-utils.ts`). Tugas non-robot kelak: tambahkan cabang `dispatch` sendiri (tetap lewat
service aplikasi). Tanpa migrasi (kolom `kind` teks).

**Menambah pemeriksa Kebijakan Otomatis** (jenis pengajuan lain, mis. panitia penghapusan): data terstruktur diserahkan agen
lewat alat MCP baru yang memanggil service server (pola `submit_asset_check`), hasil disimpan di kolom pengajuan, lalu
`decidePolicy` membaca hasil itu — jangan pernah mengambil skor/keputusan dari teks model. Sumber master baru (OnTrack) cukup
mengganti `AssetVerificationService.masters`.

**Menambah skill Hermes**: folder `agents/hermes/skills/<nama-skill>/SKILL.md` (frontmatter `name` = nama folder, huruf
kecil + tanda hubung, `description` = kapan dipakai) → langkah kerja memakai alat MCP `lifeos` (lihat
`agents/hermes/skills/README.md`: hasil lewat `update_request`/`create_request_document`, `submitForReview`, tidak pernah
memutuskan) → `docker restart lifeos-hermes` → muncul di Asisten Agen & panel Approval. Alat MCP baru yang dibutuhkan skill →
resep "Menambah tool MCP".

**Menambah jenis pengajuan / templat**: jenis baru → `REQUEST_KINDS` + `KIND_LABELS` (backend `request-logic.ts`) & frontend
`request-utils.ts` (label sama). Templat baru cukup diunggah user (Tools → ONLYOFFICE → Templat) dengan penanda
`${nama_isian}` (huruf/angka/garis bawah) dan paragraf petunjuk yang seluruhnya `[…]`; penanda khusus SRIKANDI baru →
`isSrikandiTag` (`template-engine.ts`).

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
- Setelah WSL dimatikan paksa (`wsl --shutdown` saat Docker macet), Redis bisa gagal start: container `lifeos-redis`
  terus restart / **unhealthy**, log "Bad file format reading the append only file … appendonly.aof.N.incr.aof".
  Pulihkan (data dev Redis = antrian & cache): `docker stop lifeos-redis` → `docker run --rm -v lifeos-redis-data:/data
  redis:8.10-alpine sh -c 'cd /data && cp -a appendonlydir appendonlydir.bak-$(date +%s) && echo y | redis-check-aof --fix
  appendonlydir/appendonly.aof.manifest'` → `docker start lifeos-redis`. Hanya ujung yang rusak yang dibuang.
- **Project Docker lain di laptop** (mis. OnTrack: `ontrack_postgres`, `ontrack_redis`, restart `unless-stopped`) ikut
  menyala saat WSL/Docker start bila sebelumnya mati karena `wsl --shutdown`/laptop ditutup (bukan `docker stop`) →
  merebut port 5432/6379; container LifeOS tetap "Up" tetapi **tanpa port**, backend gagal konek. Cek `docker ps -a`
  (kolom port) + `docker compose ls -a`; perbaiki: `docker stop ontrack_postgres ontrack_redis` (sekali `stop` = tidak
  menyala lagi otomatis) → `docker restart lifeos-postgres lifeos-redis`.
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

- `new Date().toISOString().slice(0, 10)` = tanggal **UTC**: di WIB sebelum 07.00 hasilnya kemarin. Untuk "hari ini" pakai
  `formatLocalYMD(new Date())` (di komponen lewat helper level modul agar lolos oxlint purity).
- Toast sonner dengan `action` tertutup sendiri setelah beberapa detik — saat uji lewat `javascript_tool`, klik tombol
  aksinya segera setelah toast muncul.

- MCP SDK di proyek CommonJS: impor lewat subpath ber-`.js` (`@modelcontextprotocol/sdk/server/mcp.js`,
  `…/server/streamableHttp.js`) — paket memetakan `require` ke `dist/cjs`. Mode stateless butuh `sessionIdGenerator:
  undefined` + server & transport baru per permintaan; tutup keduanya saat `res` `close`. Klien MCP wajib mengirim
  `Accept: application/json, text/event-stream`. Uji cepat: `@modelcontextprotocol/sdk/client` (`Client` +
  `StreamableHTTPClientTransport` dengan header Authorization).
- **Dependabot docker-compose gagal** ("The updater encountered one or more errors") bila compose memuat image buatan
  sendiri dengan tag versi biasa (mis. `lifeos-onlyoffice:10.0`): Dependabot mencarinya di Docker Hub. Image lokal wajib
  memakai tag variabel (`lifeos-x:${VAR:-10.0}`) + aturan `ignore: lifeos-*` di `.github/dependabot.yml`.
- CI menjalankan `npm run format:check` (Prettier) di frontend: berkas yang lolos lint & test tetap bisa membuat CI merah
  → jalankan `npx prettier --check src` (frontend) sebelum commit. PR Dependabot yang gagal karena `main` → setelah
  `main` diperbaiki, komentari `@dependabot rebase` di PR-nya.
- `sed -i 's|…|…\\n…|'` di Git Bash mengubah `\n` pada teks pengganti menjadi **baris baru sungguhan** (string JS di test
  jadi rusak: "Tests no tests") → untuk teks berisi `\n` pakai tool Edit. `npx prettier --write docker-compose.prod.yml`
  ikut memecah baris `command` Redis (isi sama, diff tidak perlu) → jangan memformat compose dengan Prettier.
- shadcn `CommandDialog` (versi proyek) **tidak** membungkus isi dengan `<Command>` → `CommandItem` di dalamnya crash "Cannot
  read properties of undefined (reading 'subscribe')". Selalu `<CommandDialog><Command>…</Command></CommandDialog>`.
- Id judul yang dihitung dengan penghitung bersama selama render (`uniqueId` di komponen anak react-markdown) bergeser di
  StrictMode dev (render ganda → `judul-1`). Ambil id dari data turunan (nomor baris `outline()` lewat `node.position`).
- `@codemirror/lang-markdown` mengimpor `lang-html` (+ CSS/JS) di tingkat modul → chunk editor > 500 kB. Pakai
  `new Language(defineLanguageFacet(), parser.configure(GFM))` dari `@lezer/markdown` (`note-editor.tsx`).
- Uji UI: `PopoverContent` Radix juga ber-`role="dialog"` → `[role=dialog][data-state=open]` bisa menangkap popover;
  bedakan lewat isi/tombolnya.
- Bash tool: heredoc panjang berisi tanda kutip tunggal (mis. "Anda's", `'EOF'` + teks ber-apostrof) bisa gagal
  "unexpected EOF while looking for matching `''" → tulis isi ke scratchpad dengan tool Write lalu `cat … >> berkas`.
- Komponen `ScrollArea` (shadcn/Radix) hanya menggulir bila **tingginya pasti** (`h-*`, atau flex item di kontainer
  bertinggi pasti). Dengan `max-h-*` saja viewport (`size-full`) ikut setinggi isi → isi meluber & tidak bisa digulir.
  Untuk panel ber-`max-h` (popover) pakai `div overflow-y-auto`.
- Item grid CSS punya `min-width: auto`: teks `truncate` / baris panjang di dalam `grid` (termasuk `DialogContent` shadcn
  yang ber-`display: grid`) melebarkan kolom sehingga dialog/halaman meluber di HP. Pakai `grid-cols-1` (= `minmax(0,1fr)`)
  pada grid tersebut atau `min-w-0` pada item. Cek dengan `el.scrollWidth > el.clientWidth` di mode HP.
- Express `raw()` untuk webhook harus dipasang **sebelum** `json()` di `main.ts` (body sudah dibaca parser JSON = tanda
  tangan tidak bisa diverifikasi). Uji bot WhatsApp tanpa Meta lewat `POST /whatsapp/simulate`; balasan datang
  asinkron dari antrian → tunggu/polling percakapan. Bot hanya memakai catatan vault `publik: true` + `status: berlaku`
  — tanpa catatan seperti itu semua pertanyaan "diteruskan ke petugas" (bukan bug).
- Skrip Node yang ditulis lewat heredoc Bash berisi template literal: `\\d` di dalam template menjadi `\d` lalu dimakan
  lagi → regex rusak diam-diam (`/^d{5}$/`). Untuk regex di kode sumber pakai tool Edit/Write langsung, lalu `grep`.
- Service robot: paket npm `playwright` dan image `mcr.microsoft.com/playwright:v…` **wajib versi sama** (Chromium dibundel di
  image; berbeda versi = gagal launch). Image ± 3,5 GB. Robot hanya bisa diuji bila container menyala — smoke melewati
  bagian browser bila `/robot/status` tidak reachable (CI). Uji browser jarak jauh tanpa menyentuh sistem pemerintah: arahkan
  konektor e-Kinerja ke https://example.com (dipakai smoke; tidak ada login → dianggap "sudah masuk").
- SRIKANDI & e-Kinerja login memakai CAPTCHA → tidak dipecahkan mesin; login otomatis berhenti di CAPTCHA/OTP dan menunggu
  ketikan user. Uji tanpa akun: nilai palsu boleh diisi karena robot berhenti di CAPTCHA **tanpa mengirim** — jangan pernah
  mengirim jawaban CAPTCHA saat menguji (itu percobaan login ke sistem pemerintah).
- Dialog yang membuka sumber daya eksternal di `useEffect` (sesi robot): StrictMode dev menjalankan efek → cleanup → efek
  lagi. Gunakan penanda sekali-jalan (`useRef`) untuk membuka, dan tunda pembatalan di cleanup (`setTimeout` yang
  dibatalkan pemasangan ulang) agar sesi tidak tertutup/terbuka ganda.
- Klik di sistem pemerintah lewat sesi tayangan robot (`/robot/sessions/:id/input`) bisa **ditahan pengaman otomatis Claude**
  ("Unrequested Commit in a Connected App") walau user sudah mengizinkan uji — minta izin eksplisit user di chat untuk aksi
  itu (mis. "Izinkan robot") lalu ulangi.
- Hermes 0.22.2–0.22.5: `GET /v1/skills` selalu 500 (`_find_all_skills() got an unexpected keyword argument
  'include_editorial'`) → daftar skill dibaca backend dari folder repo. Cek ulang saat upgrade Hermes.
- Claude Opus/Sonnet 5.5 lewat proxy agen: `ClaudeTurnMemory` ada di memori satu proses (seperti peta run agen). Cek cache lewat
  **Token: dari cache** di kartu Siapkan agen; `0` terus-menerus = awalan berubah (mis. system prompt Hermes) **atau** jalur lewat router
  yang membuang angka cache dari `usage` (Classai Router: hanya `input_tokens`/`output_tokens`, diuji 2026-11-07) — cek hemat cache di
  dasbor router (Classai: Usage → "tokens from packages" dibanding total token), bukan di LifeOS. Uji tanpa biaya:
  `ANTHROPIC_BASE_URL` menunjuk server tiruan (SDK membacanya otomatis) dengan user sementara.
- Mount skill `./agents/hermes/skills:/opt/data/skills/lifeos` membuat Docker membuat `/opt/data/skills` milik root di volume
  → skill bawaan Hermes gagal disalin ("Permission denied"). `infra/hermes/up.sh` meng-`chown 10000` sekali lalu restart.
- Hermes tanpa model/izin belum bisa menjalankan tugas walau `/health` = ok (`readiness.model` tetap "ok") → kartu Siapkan
  agen. MCP Hermes yang ditolak saat start "diparkir" sampai ada run berikutnya (lalu tersambung sendiri) — bila tidak,
  `docker restart lifeos-hermes`. `hermes config set` menulis nilai jadi; nilai `${ENV}` di config.yaml ditulis lewat `sed`
  (`configure.sh`) agar rahasia tidak tersalin ke berkas. Gemini 503 "high demand" diteruskan proxy apa adanya; Hermes
  mencoba ulang sendiri (3× lalu siklus pemulihan 61 dtk).
- SRIKANDI: Enter di kotak cari react-select tanpa opsi cocok **mengirim formulir** ("The klasifikasi id field is required");
  ID `?id=U2Fsd…` di Log/Daftar Naskah acak per muat halaman; kolom Aksi Log di luar layar (klik sel Hal lalu Tab agar
  bergeser saat lewat tayangan robot). Job register membawa berkas base64 → batas body robot 40 MB khusus rute itu.
- Dev: request lewat proxy Vite → `req.ip` = `::1` (log brankas "Jaringan lokal / privat"). Lokasi IP sungguhan hanya terlihat
  di produksi (Caddy + `TRUST_PROXY=true`).
- Berkas dari `/uploads/...` & `/public/.../files/...` ber-`CSP: sandbox` → dibuka langsung di tab, penampil PDF Chrome
  **mengunduh** berkasnya. Tampilkan lewat blob (pratinjau aplikasi) atau pdf.js (brankas publik; iframe PDF tidak tampil di HP).
- `mime.types` nginx (image `nginx:1.30-alpine`) tidak mengenal `.mjs` → worker pdf.js tersaji `application/octet-stream`
  dan ditolak (nosniff) **hanya di produksi** (Vite dev benar). `nginx.conf` memetakan `.mjs` di `/assets/`; cek dengan image
  nginx sungguhan (`docker run … nginx:1.30-alpine` + `wget -S`).
- Tes AI sungguhan lewat `javascript_tool` (panel tersembunyi): satu panggilan maks. ± 45 detik → tunggu bertahap
  (beberapa panggilan `await` 30–40 detik), jangan satu loop panjang.
- Bila preview backend Claude mati ("exited with code 4294967295"), proses `nest start --watch` / `dist/main` anaknya bisa
  tertinggal: preview baru pindah ke 4001, atau dua pengawas saling membangun ulang `dist/` sehingga backend restart di tengah smoke
  (ECONNREFUSED). Cek proses node `*LifeOSackend*`, hentikan semuanya, lalu `preview_start` sekali.
- Pekerjaan berkala (`setInterval(() => void this.x())`) wajib menangkap semua galat (`try/catch` atau `.catch`): penolakan
  promise yang lolos = proses backend mati (Node 24), mis. saat database/Redis sesaat putus setelah restart WSL.
- Komponen interaktif yang menyimpan saat `pointerup`/`blur` (Canvas): updater `setState(fn)` baru dijalankan saat render
  berikutnya dan closure handler bisa memegang state lama → event beruntun dalam satu tugas menyimpan isi lama. Hitung perubahan
  dari ref data terkini (`latest.current`) lalu `setState(nilai)`.
- `components={{ x: () => … }}` di ReactMarkdown membuat tipe komponen baru tiap render, jadi React memasang ulang isinya (state hilang, diagram digambar ulang). Komponen yang punya state / kerja mahal wajib di tingkat modul (`NotePre`).
- Node `writeFileSync` di Windows kadang gagal `UNKNOWN` (errno -4094) saat dev server / pengawas sedang membuka berkas — sementara; ulangi. Skrip yang mengubah beberapa berkas bisa berhenti di tengah: cek berkas sebelumnya sudah tertulis.
- Kunci robot (`RobotService.exclusive`) dan sesi login jarak jauh ada di **memori satu proses backend** — jangan menjalankan
  backend lebih dari satu instans (kunci tidak berlaku lintas proses). Menguji "Jalankan sekarang" / menyalakan jadwal di akun
  yang punya sesi Connector = robot membuka SRIKANDI/e-Kinerja sungguhan → uji pakai user tanpa sesi (smoke) kecuali user
  mengizinkan. Jadwal yang dinyalakan saat uji wajib dimatikan lagi (cek `automation_jobs.enabled` & Redis `bull:automation:repeat*`).

## 16. Memori & Kesinambungan Antar-Chat

- **Sumber kebenaran knowledge = file ini + `docs/`** (ikut di repo, otomatis dibaca Claude Code di setiap chat proyek
  ini, dan tetap ada walau berganti perangkat). Memori Claude lokal (`~/.claude/projects/.../memory/`) hanya ringkasan
  pendukung — jangan menaruh knowledge penting **hanya** di sana atau hanya di percakapan.
- Setiap keputusan teknis baru → §12; status → §11; pola/aturan baru → §8/§8b/§14; masalah lingkungan → §2/§15.
