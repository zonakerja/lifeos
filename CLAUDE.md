# CLAUDE.md — LifeOS

Knowledge base utama untuk Claude Code di proyek LifeOS. **Baca seluruh file ini di awal setiap chat/thread.**
Dokumen ini menggantikan memori percakapan: keputusan, konteks user, status, dan pola wajib tercatat di sini.
Perbarui **§11 Status** dan **§12 Log Keputusan** setiap selesai satu langkah berarti.
Dokumentasi untuk manusia ada di `docs/` (SETUP, DEPLOYMENT, ARCHITECTURE = fondasi + tech stack & versi, UPGRADE-PLAN, FILE-CONTROL).

## 0. Memulai Thread Baru (checklist wajib)

1. Baca file ini sampai habis (terutama §11 Status, §14 Resep, §15 Jebakan). Untuk modul File Control baca juga
   `docs/FILE-CONTROL.md`; untuk deploy `docs/DEPLOYMENT.md`; untuk arsitektur & versi tech stack
   `docs/ARCHITECTURE.md` (fondasi); untuk upgrade dependensi `docs/UPGRADE-PLAN.md`.
2. Cek kondisi repo: `git status`, `git log --oneline -10` (commit terakhir = pekerjaan terakhir).
3. Nyalakan lingkungan (lihat §2): `wsl -e sh -c "sleep infinity"` (background) →
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

## 2. Lingkungan Development (laptop user)

- **Windows 11 ARM64**. Node `24` arm64 via **nvm-windows** (`.nvmrc`), npm 11.
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
| Database | 20 tabel domain terstruktur dari satu spesifikasi + kolom `extra` jsonb (lossless), snake_case, timestamptz |
| Auth | access JWT 15 menit di memori + refresh token di cookie httpOnly berotasi |
| AI provider | Multi-provider dipilih user: Gemini, Claude, OpenAI (thread fitur AI) |
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
├── backend/                  NestJS (Dockerfile, prisma/, src/, test/smoke.mjs)
├── frontend/                 React SPA (Dockerfile, nginx.conf, src/)
└── docs/                     SETUP.md · DEPLOYMENT.md · ARCHITECTURE.md · UPGRADE-PLAN.md · FILE-CONTROL.md
```

## 7. Infrastruktur

**Development** (`docker compose up -d`, image di-pin sama dengan produksi):

| Service | Container | Host port | Kredensial |
|---|---|---|---|
| PostgreSQL 18 + pgvector 0.8.7 | lifeos-postgres | 5432 | db `lifeos`, `postgres/postgres`; DB tambahan `lifeos_shadow` (cek drift); volume `lifeos-postgres18-data` |
| Redis 8.10 | lifeos-redis | 6379 | tanpa password |
| SeaweedFS 4.48 (S3) | lifeos-storage | 8333 (S3), 8888 (filer UI) | `lifeos` / `lifeos-secret`, bucket `lifeos-assets` (dibuat otomatis) |

Seed development: `admin@lifeos.com` / `123` (super_admin), `viewer@lifeos.com` / `123` (viewer).
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
- Global: Helmet, CORS, ValidationPipe whitelist + forbidNonWhitelisted, `PrismaExceptionFilter`, Throttler
  (600/menit; login 10/menit; refresh 30/menit), log `nestjs-pino` (`src/config/logger.config.ts`: JSON di production,
  `reqId`/`X-Request-Id`, header & token disensor), shutdown hooks, body JSON 5 MB.
- **Auth** (`src/auth/`): `POST /auth/login` → body `{ user, accessToken }` + cookie `lifeos_rt` (httpOnly, SameSite=Strict,
  path `/api/v1/auth`, `refresh-cookie.ts`). `POST /auth/refresh` (cookie) merotasi; toleransi reuse 30 detik untuk
  refresh paralel; reuse setelahnya → semua sesi user dihapus. `POST /auth/logout`, `GET/PATCH /auth/me`,
  `POST /auth/change-password` (hapus sesi lain). Pencabutan eksplisit = hapus baris; `revokedAt` hanya untuk rotasi.
  Admin mengubah password/role user → sesi user itu dihapus.
- **Users**: list/get (admin, super_admin), create/update/delete (super_admin; admin hanya kelola non-super-admin).
- **Settings**: `GET /settings/app` publik (branding login); `PATCH` admin.
- **Database**: tabel & kolom snake_case (`@@map/@map`), timestamptz(3), FK `users` cascade. 20 tabel domain
  (agenda_types, schedules, routines, todos, routine_completions, free_notes, ai_notes, note_lists, areas, projects,
  activities, tasks, resources, para_archives, archive_classifications, archive_retention_schedules,
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
  - Migrasi: satu baseline `20261009120000_init`. Migrasi baru → lihat docs/SETUP.md §5
    (`prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`, lalu cek
    drift dengan `--exit-code`; shadow DB dari `SHADOW_DATABASE_URL`).
- **Records API**: `GET /records/:type?userId&from&to`, `PUT /records/:type/:clientId` `{ payload, userId? }` (upsert,
  juga undelete), `DELETE /records/:type/:clientId?userId=` (soft delete). Admin tanpa `userId` melihat semua user.
- **Uploads**: multer diskStorage (tmp) → SHA-256 streaming → S3 `<userId>/<yyyy>/<mm>/<ts>-<uuid><ext>` → `assets` +
  `asset_extractions` → job BullMQ `asset-extraction` (teks ≤ 20 MB). `GET /uploads/:id` (Bearer), `POST /uploads/:id/link`
  → `/uploads/:id/download?token=` 10 menit. Respons berkas: `CSP: sandbox`, konten aktif dipaksa attachment.
- **Health**: `/health` (readiness, 503 bila dependensi down), `/health/live` (liveness).
- **Seed**: `src/database/seed.ts` (dev: akun demo via `prisma db seed` → `tsx`; production: super admin dari env,
  `node dist/database/seed.js`).
- **Test**: `npm test` (Vitest unit), `npm run test:smoke` (end-to-end ±50 skenario; membuat & menghapus user member
  + viewer sementara; env `API_URL`, `SMOKE_ADMIN_EMAIL`, `SMOKE_ADMIN_PASSWORD`).
- Perintah: `dev | build | start | lint | typecheck | test | test:smoke | prisma:generate | prisma:deploy |
  prisma:seed | db:generate-models`.

## 8b. Frontend (`frontend/`)

- Vite 8 + React 19 + TypeScript 6 strict + Tailwind v4 + shadcn/ui (`radix-maia`, lucide, `cn`) + React Router 8
  (rute `lazy`) + TanStack Query 5 + Zustand 5 + react-hook-form + zod 4 + sonner. Lint **oxlint** (0 warning,
  `components/ui/**` di-ignore). Test: Vitest (`npm test`).
- Dev server 5173, proxy `/api` → localhost:4000; frontend memakai base relatif `/api/v1` (`VITE_API_BASE_URL`).
- Struktur: `app/` (router, providers), `config/navigation.ts` (sumber tunggal modul/tab/role), `types/`, `lib/api/`
  (client + endpoints), `data/` (useCollection + hook bertipe), `stores/`, `hooks/`, `components/{ui,layout,common}`,
  `features/<modul>/` (`<modul>-page.tsx` mengekspor `Component`).
- **Sesi**: `stores/auth-store.ts` hanya di memori (`status: unknown|authenticated|anonymous`, `user`, `accessToken`).
  `main.tsx` memanggil `bootstrapSession()` (refresh via cookie); `RequireAuth` menunggu status. **Jangan menyimpan
  token/user di localStorage.** `lib/api/client.ts`: `credentials: "include"`, refresh single-flight saat 401.
- **Data domain**: `useCollection<T>(recordType, { getId? })` → `{ items, setItems, upsert, remove, isLoading }`.
  `setItems(updater)` = diff prev/next → PUT/DELETE per item (debounce 500 ms, diserialkan per item, optimistis,
  rollback + toast). `flushPendingWrites()` saat logout. Super admin melihat data semua user.
- **Design system (wajib)**: token OKLCH di `src/index.css`; dilarang warna hardcoded / ternary dark mode. Warna modul
  via `data-module` → `bg-module`, `text-module`, `bg-module-soft`, `bg-module-gradient`, `text-module-foreground`;
  status `success | warning | info | destructive`. Font Figtree. Setiap halaman memakai `<ModulePage module="...">`.
  Pakai komponen shadcn; jangan membuat modal/tombol custom.
- **Bundle**: rute, halaman login, `Markdown` (react-markdown + KaTeX, `markdown-renderer.tsx`), dan `html5-qrcode`
  dimuat malas. Chunk utama ±360 kB; tanpa peringatan ukuran chunk.
- **CSP produksi** (`nginx.conf`): `script-src 'self'`, `connect-src 'self' https://generativelanguage.googleapis.com`
  (AI dari browser), `style-src 'self' 'unsafe-inline'`, `img/media blob: data:`. Domain eksternal baru → tambahkan di sini.

### Pola implementasi frontend (WAJIB)
- **Koleksi data**: pakai hook bertipe di `src/data/collections.ts`; tipe entitas di `src/types/entities.ts`.
- **Dialog form**: state di komponen *dalam* yang di-mount saat dialog terbuka (`useState(() => dariProps)`), atau
  `key` pada inner. **Jangan** sinkronisasi props→state dengan `useEffect`.
- **Deep link via URL** (`useSearchParam`): `?edit=`, `?todo=`, `?date=`, `?project=`, `?area=`, `?task=`, `?resource=`,
  `?note=`, `?archive=`, sub-tab `?sub=`/`?ref=`. Peta di `src/lib/deep-links.ts`.
- **Waktu di render**: `useToday()`. **Hak akses**: `usePermissions()` (viewer read-only).
- **AI**: hanya via `useAi()` (`src/lib/ai/use-ai.ts`), provider sementara Gemini dari browser (`gemini-2.5-flash`).
- **Lampiran**: `features/resources/` (`AttachmentForm`, `AttachmentTable`, `ResourceAiDialog`, `openAttachment()`,
  `mergeIntoGlobalResources()`, `useFileSummarizer()`).
- **Komponen umum**: `ConfirmDialog`, `SectionCard`, `RenameDialog`, `SearchableSelect`, `PaginationControl`+`paginate()`,
  `Markdown`, `PriorityBadge`, `PageLoader`, `DateRangeFilter`, `SearchInput`.
- **Dialog & animasi tutup**: `useRetained(itemProp)` / `useLatchedWhileOpen(open, value)` (nilai harus stabil).
- **Tanggal** (`src/lib/dates.ts`): YMD `"2026-10-08"` (schedule/routine/task.dueDate/ai_note) dan `toDateString()`
  `"Thu Oct 08 2026"` (todo.date, completion.date).
- **QR & scan**: QR lokal `qrcode.react` (`QrImage`), scan `CameraScanner`/`CameraScanDialog` (import dinamis).
- **Cetak**: `printElement(ref.current, judul, "label" | "a4")` (`features/file-control/lib/print.ts`).
- **Menu klik kanan**: shadcn `context-menu`, target dari `closest("[data-item-id]")`.
- **Pintasan keyboard**: `useEffectEvent` + satu `useEffect` listener `window` (abaikan input & dialog terbuka).

## 9. Glosarium Domain

- **PARA**: Projects (deadline, tasks/actions berbobot, timeline), Areas (tanggung jawab berkelanjutan, berisi kegiatan),
  Resources (link/file/note, tag konteks, ringkasan AI), Archives (snapshot `originalType` project/area/resource,
  `data`, `archivedAt` → bisa dipulihkan).
- **Planner**: rutinitas `daily|weekly|monthly|interval` (+ `intervalType`, `freezePeriods`); jadwal multi-hari
  (`startDate/endDate`, `isAllDay`, type, location, media); todo berprioritas; `completions` per rutinitas per tanggal
  (ID `${routineId}:${date}`).
- **File Control**: Klasifikasi, **JRA** (retensi aktif/inaktif + Musnah/Permanen), siklus Aktif → Inaktif →
  Perlu Tindak Lanjut → Statis/Musnah, wadah fisik bertingkat (gedung/rak/box/folder), peminjaman, penyusutan
  (berita acara), penataan ala file explorer, QR. Spesifikasi lengkap: `docs/FILE-CONTROL.md`.

## 10. Roadmap

Fondasi aplikasi sudah lengkap (backend, frontend semua modul, data layer, database terstruktur, keamanan, deployment
VPS, CI, dokumentasi). Berikutnya:
1. AI multi-provider di backend (Gemini/Claude/OpenAI, key terenkripsi; hapus API key dari browser & kolom plaintext).
2. Ekstraksi PDF/DOCX/XLSX/OCR, embedding pgvector + chatbot RAG atas arsip & resource.
3. (Opsional) tampilan riwayat audit arsip di UI (`GET /archive-audit` sudah tersedia).

Pemeliharaan tech stack terjadwal (kajian & urutan: `docs/UPGRADE-PLAN.md` §1): KaTeX 0.19 (≥ 29 Okt 2026), Node 26
(≥ ± 25 Nov 2026); pantau TS 7, Prisma 8, ioredis 6.

## 11. Status

| Area | Status |
|---|---|
| Backend fondasi (auth cookie, users, settings, records, uploads, health, logging) | ✅ |
| Frontend: Settings, Overview (+ global search, focus mode, notifikasi, chatbot), Planner, Notes, Productivity, File Control | ✅ |
| Database terstruktur + audit kearsipan (satu migrasi baseline) | ✅ |
| Keamanan (cookie httpOnly, CSP, sandbox berkas, upload streaming, rate limit) | ✅ |
| Deployment VPS (compose prod, Caddy HTTPS, batas memori, backup luar server terenkripsi + pemantauan) — diuji end-to-end lokal, termasuk pemulihan dari luar server | ✅ |
| Kualitas (Vitest, smoke test, CI GitHub Actions, Dependabot npm/docker/docker-compose/actions) | ✅ |
| Tech stack terbaru yang stabil (versi: `docs/ARCHITECTURE.md` §2.1) | ✅ |
| `npm audit` | ✅ via overrides; sisa `deepmerge-ts` (tunggu Prisma) — `docs/UPGRADE-PLAN.md` §3 |
| Push ke GitHub (`origin/main`) | Hanya atas permintaan user; setelah push user mengecek CI |
| VPS & domain | ⏳ **belum dibeli** — saat siap ikuti docs/DEPLOYMENT.md §0 (memilih VPS, DNS, isi .env, checklist) |

Isu terbuka: API key Gemini masih dipakai dari browser & disimpan plaintext di `users.api_key` (roadmap butir 1).

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
  `/var/lib/postgresql`; upgrade major = dump/restore ke volume baru (docs/DEPLOYMENT.md §8, docs/SETUP.md §2.1).
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
  `backend/.env` — langkah menjalankan dari awal (termasuk lazydocker) dibuat di thread berikutnya.

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
   → `npm run db:generate-models` → buat migrasi (docs/SETUP.md §5) → `npx prisma migrate deploy` →
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
   selain `lifeos` → `pg_restore` → `ANALYZE` → bandingkan jumlah baris (docs/SETUP.md §2.1).
3. `docker-compose.prod.yml` service `postgres` + volume baru, **dan** `FROM` di `infra/backup/Dockerfile` (pg_dump
   harus = major server).
4. Uji: migrate deploy (DB lama & DB kosong), seed, drift, smoke, `CREATE EXTENSION vector` + `extversion`, UI.
5. Stack prod lokal: jalankan compose **versi sebelum perubahan** (salinan dari git) di project
   `lifeos-upgradetest`, isi data (seed + record + upload), lalu ikuti persis docs/DEPLOYMENT.md §8 ke compose
   baru; ulangi satu siklus `backup.sh --once` → ubah data → restore (DEPLOYMENT §4); `down -v` + hapus volume
   lama project uji.
6. Volume dev lama boleh dihapus setelah verifikasi (data dev dummy); volume produksi lama baru dihapus setelah stabil.

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

## 16. Memori & Kesinambungan Antar-Chat

- **Sumber kebenaran knowledge = file ini + `docs/`** (ikut di repo, otomatis dibaca Claude Code di setiap chat proyek
  ini, dan tetap ada walau berganti perangkat). Memori Claude lokal (`~/.claude/projects/.../memory/`) hanya ringkasan
  pendukung — jangan menaruh knowledge penting **hanya** di sana atau hanya di percakapan.
- Setiap keputusan teknis baru → §12; status → §11; pola/aturan baru → §8/§8b/§14; masalah lingkungan → §2/§15.
