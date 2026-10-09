# Setup & Menjalankan LifeOS

## 1. Prasyarat

| Kebutuhan | Versi | Catatan |
|---|---|---|
| Node.js | 24 LTS (npm 11) | Disarankan via **nvm** (Windows: nvm-windows) |
| Docker Engine + Compose v2 | terbaru | Docker Desktop **tidak** wajib — Docker Engine di WSL/Linux cukup |
| Git | terbaru | |

### Catatan Windows ARM64 (Snapdragon)

- Docker Engine dijalankan di **WSL Ubuntu**; CLI `docker` tidak ada di PATH Windows. Jalankan perintah compose lewat:
  ```bash
  wsl -e sh -c "cd /mnt/d/Development/Application/LifeOS && docker compose up -d"
  ```
  Port container tetap bisa diakses dari Windows lewat `localhost`.
- WSL bisa berhenti saat idle sehingga container ikut mati. Biarkan satu sesi WSL tetap hidup
  (mis. `wsl -e sh -c "sleep infinity"` di terminal terpisah) selama development.
- Paket native tanpa prebuilt win32-arm64 akan gagal dipasang. Proyek ini sudah memakai alternatif yang aman
  (`@node-rs/argon2`, Prisma 7 tanpa engine Rust + adapter `pg`).
- npm 11 memblokir install script yang belum disetujui; daftar yang diizinkan ada di field `allowScripts`
  pada `backend/package.json`. Paket baru yang butuh postinstall: `npm approve-scripts <pkg>` lalu `npm rebuild <pkg>`.

## 2. Infrastruktur (Docker)

```bash
docker compose up -d          # dari root repo
docker compose ps
```

| Service | Host port | Kredensial dev |
|---|---|---|
| PostgreSQL 16 + pgvector | `55432` | db `lifeos`, `postgres` / `postgres` |
| Redis 7 | `6380` | — |
| SeaweedFS S3 API | `9002` | `lifeos` / `lifeos-secret` (`infra/seaweedfs/s3.json`) |
| SeaweedFS filer UI | `9003` | — |

Bucket `lifeos-assets` dibuat otomatis oleh backend saat start.

## 3. Backend

```bash
cd backend
cp .env.example .env            # Windows CMD: copy .env.example .env
npm install
npx prisma migrate deploy       # terapkan semua migrasi
npm run prisma:seed             # pengaturan + akun demo
npm run dev                     # http://localhost:4000/api/v1
```

- Swagger UI: `http://localhost:4000/api/docs` (non-production).
- Health: `GET /api/v1/health` (readiness: database, redis, storage) dan `GET /api/v1/health/live` (liveness).
- Log: format mudah dibaca di development, JSON di production (`LOG_LEVEL`).
- Akun demo (seed development): `admin@lifeos.com` / `123` (super_admin), `viewer@lifeos.com` / `123` (viewer).
- Semua env divalidasi saat boot (`src/config/env.validation.ts`); daftar lengkap di `backend/.env.example`.

| Perintah | Fungsi |
|---|---|
| `npm run dev` | server dengan watch |
| `npm run build` / `npm start` | build ke `dist/` lalu jalankan |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run prisma:generate` | generate Prisma Client |
| `npm run db:generate-models` | regenerate model domain dari `src/records/record-schema.ts` |
| `npm run prisma:deploy` | terapkan migrasi |
| `npm run prisma:seed` | seed data |
| `npm test` | unit test (Vitest) |
| `npm run test:smoke` | uji end-to-end terhadap server yang berjalan (user sementara dibuat & dihapus; `API_URL`, `SMOKE_ADMIN_EMAIL`, `SMOKE_ADMIN_PASSWORD`) |

## 4. Frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

Vite mem-proxy `/api` ke `http://localhost:4000`, sehingga frontend cukup memakai path relatif `/api/v1`
(override dengan `VITE_API_BASE_URL` bila API di host lain).

| Perintah | Fungsi |
|---|---|
| `npm run dev` | dev server + HMR |
| `npm run build` | typecheck + build produksi ke `dist/` |
| `npm run lint` | oxlint (harus 0 warning) |
| `npm run format` / `format:check` | Prettier (config di root) |
| `npm test` | unit test (Vitest) |

## 5. Alur kerja database

- Skema: `backend/prisma/schema.prisma`. Model domain (tabel `schedules`, `todos`, `resources`, `archive_*`, ...)
  **dibuat otomatis** dari `backend/src/records/record-schema.ts`.
- Mengubah/menambah field domain:
  1. Edit `record-schema.ts`.
  2. `npm run db:generate-models` (memperbarui `schema.prisma`).
  3. Buat migrasi. Bila `prisma migrate dev` tidak bisa interaktif, buat folder migrasi lalu:
     ```bash
     npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script \
       > prisma/migrations/<timestamp>_<nama>/migration.sql
     ```
     Shadow database diambil dari env `SHADOW_DATABASE_URL` (`.env`, dibaca `prisma.config.ts`); buat sekali:
     `CREATE DATABASE lifeos_shadow;`
  4. `npx prisma migrate deploy` lalu `npx prisma generate`.
  5. Cek tidak ada drift: perintah diff yang sama dengan `--exit-code` (tanpa `--script`) harus keluar 0.
- Prisma 7: URL koneksi ada di `backend/prisma.config.ts` (bukan di `schema.prisma`). Prisma Client di-generate ke
  `backend/src/generated/prisma` (tidak di-commit) oleh `postinstall`/`npm run prisma:generate`; import dari path itu,
  bukan dari `@prisma/client`. `migrate dev`/`db push` tidak lagi menjalankan generate/seed otomatis.

## 6. Continuous Integration

`.github/workflows/ci.yml` menjalankan di setiap push/PR: lint, format check, typecheck, unit test, build (frontend &
backend), smoke test end-to-end terhadap infrastruktur Docker nyata, cek drift skema database, dan build image Docker.
Dependabot memperbarui dependensi npm, image Docker, dan GitHub Actions setiap minggu.

## 7. Deployment

Lihat [DEPLOYMENT.md](DEPLOYMENT.md) (VPS dengan `docker-compose.prod.yml`: Caddy + HTTPS otomatis, backup harian).

## 8. Troubleshooting

| Gejala | Solusi |
|---|---|
| `ECONNREFUSED` ke 55432/6380 | Container mati (WSL idle) → `docker compose up -d` lagi |
| Vite menampilkan modul usang setelah banyak perubahan | Restart `npm run dev` frontend |
| `Konfigurasi environment tidak valid` saat backend start | Lengkapi `backend/.env` sesuai `.env.example` |
| Prisma error tabel/kolom tidak ada | `npx prisma migrate deploy` lalu `npx prisma generate` |
