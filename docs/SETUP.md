# Setup & Menjalankan LifeOS

Panduan development lokal. Bagian §1–§6 adalah **petunjuk operasional** (setup awal, menyalakan, mematikan, cek
status) untuk laptop Windows + Docker di WSL; §7 dan seterusnya adalah referensi teknis.

| Mau apa? | Baca |
|---|---|
| Pertama kali memasang di laptop (atau setelah reset) | §3 Setup awal |
| Mulai bekerja hari ini | §4 Menyalakan |
| Selesai bekerja / mau menutup laptop | §5 Mematikan |
| Tidak yakin apa yang sedang menyala | §6 Cek status |
| Port bentrok / bingung port | §2 Aturan port |

Semua perintah di §3–§6 dijalankan di **PowerShell** (Windows Terminal) dari folder proyek
`D:\Development\Application\LifeOS`, kecuali disebut lain.

## 1. Prasyarat

| Kebutuhan | Versi | Catatan |
|---|---|---|
| Node.js | LTS sesuai `.nvmrc` (npm bawaan) | Disarankan via **nvm** (Windows: nvm-windows). **Arsitektur harus sama dengan Windows** (x64 atau ARM64) — lihat §3 langkah 0 |
| Docker Engine + Compose v2 | terbaru | Docker Desktop **tidak** wajib — Docker Engine di WSL/Linux cukup |
| lazydocker (opsional) | terbaru | Tampilan terminal untuk melihat/menghentikan container & log; dipasang di WSL |
| Git | terbaru | |

Cek cepat (semua harus menampilkan versi):

```powershell
node -v; npm -v; git --version
node -p "process.arch"          # harus sama dengan arsitektur Windows: x64 (Intel/AMD) atau arm64 (Snapdragon)
wsl -e sh -c "docker --version && docker compose version && command -v lazydocker"
```

### Catatan Windows (x64 & ARM64)

Berlaku untuk kedua jenis Windows, kecuali butir bertanda **[ARM64]**. Cek jenis Windows Anda:

```powershell
$env:PROCESSOR_ARCHITECTURE     # AMD64 = Windows x64 (Intel/AMD) · ARM64 = Windows ARM (Snapdragon)
```

- **[ARM64] Node.js harus versi arm64.** nvm-windows memasang versi **x64 secara default**, dan Windows ARM tetap
  bisa menjalankannya lewat emulasi — tanpa pesan error, tetapi lebih lambat, dan paket native (`@node-rs/argon2`,
  esbuild, oxlint, rolldown) ikut terpasang versi x64. Selalu sebut `arm64` pada `nvm install` dan `nvm use` (§3
  langkah 0), lalu pastikan `node -p "process.arch"` menampilkan `arm64`.
- Docker Engine dijalankan di **WSL Ubuntu**; CLI `docker` tidak ada di PATH Windows. Jalankan perintah compose lewat:
  ```powershell
  wsl -e sh -c "cd /mnt/d/Development/Application/LifeOS && docker compose up -d"
  ```
  Port container tetap bisa diakses dari Windows lewat `localhost`.
- WSL berhenti sendiri saat tidak ada proses yang berjalan di dalamnya, sehingga container ikut mati. Selama bekerja,
  biarkan satu jendela WSL tetap terbuka: **lazydocker** (`wsl -e lazydocker`) atau `wsl -e sh -c "sleep infinity"`.
- Docker di WSL menyala otomatis setiap WSL hidup (systemd). Container ber-`restart: unless-stopped`: container yang
  **tidak** dihentikan dengan `docker compose stop` akan ikut menyala lagi saat WSL hidup kembali.
- **[ARM64]** Paket native tanpa prebuilt win32-arm64 akan gagal dipasang. Proyek ini sudah memakai alternatif yang aman
  (`@node-rs/argon2`, Prisma tanpa engine Rust + adapter `pg`; lihat ARCHITECTURE.md §2.2).
- npm 11 memblokir install script yang belum disetujui; daftar yang diizinkan ada di field `allowScripts`
  pada `backend/package.json`. Paket baru yang butuh postinstall: `npm approve-scripts <pkg>` lalu `npm rebuild <pkg>`.

## 2. Aturan port (berlaku di semua terminal & semua thread Claude)

LifeOS adalah satu-satunya proyek di laptop ini, jadi setiap komponen memakai **port default yang tetap**. Port ini
tidak boleh diganti per sesi/thread — konfigurasi (`.env`, proxy Vite, CORS, compose, `.claude/launch.json`, smoke
test) semuanya mengandalkan angka yang sama.

| Komponen | Port | Alamat | Diatur di |
|---|---|---|---|
| Frontend (Vite dev server) | **5173** | http://localhost:5173 | `frontend/vite.config.ts` (`strictPort`) |
| Backend (NestJS API) | **4000** | http://localhost:4000/api/v1 · Swagger `/api/docs` | `backend/.env` `PORT` |
| PostgreSQL | **5432** | db `lifeos` (+ `lifeos_shadow`) | `docker-compose.yml` |
| Redis | **6379** | — | `docker-compose.yml` |
| SeaweedFS S3 API / filer UI | **8333** / **8888** | filer: http://localhost:8888 | `docker-compose.yml` |
| Prisma Studio (opsional) | 5555 | `npm --prefix backend run prisma:studio` | default Prisma |
| Vite preview build (opsional) | 4173 | `npm --prefix frontend run preview` | default Vite |
| Stack produksi uji lokal (opsional) | 80 / 443 | http://localhost | `docker-compose.prod.yml` (Caddy) |

Aturan main:

1. **Satu komponen = satu proses.** Sebelum menyalakan apa pun, cek dulu (§6). Bila port sudah dipakai, berarti
   komponen itu **sudah menyala** (dari terminal lain, lazydocker, atau thread Claude lain) — pakai yang sudah ada,
   jangan menyalakan salinan kedua.
2. **Port tidak pernah "pindah".** Vite dikunci `strictPort: true` dan NestJS memakai `PORT` tetap; bila port sudah
   dipakai, server **gagal start** dengan pesan `Port 5173 is already in use` / `EADDRINUSE :::4000` — bukan diam-diam
   pindah ke 5174/4001. Pesan itu artinya: matikan proses lama (§5) atau pakai yang sudah berjalan.
3. **Thread Claude** mengikuti aturan yang sama (CLAUDE.md §2a): Claude mengecek status lebih dulu, memakai server yang
   sudah berjalan bila ada, dan hanya menyalakan yang belum aktif (lewat `.claude/launch.json`, port sama).
4. Port 80/443 hanya dipakai stack produksi uji; matikan stack itu (`docker compose -p <nama> down -v`) setelah selesai.

## 3. Setup awal (sekali saja)

Lakukan sekali di laptop baru, setelah `git clone`, atau setelah reset total. Butuh koneksi internet (± 10–15 menit
untuk unduhan image Docker dan paket npm).

**Langkah 0 — Node.js** (major sesuai `.nvmrc`, saat ini 24). Pilih cabang sesuai hasil
`$env:PROCESSOR_ARCHITECTURE` (§1). Perintah `nvm use` mengubah symlink sistem, jadi jalankan di PowerShell
**Run as administrator** bila muncul error izin.

*Cabang A — Windows ARM64 (`ARM64`, Snapdragon):*

```powershell
cd D:\Development\Application\LifeOS
nvm install 24 arm64            # pasang Node 24 terbaru versi arm64
nvm list                        # catat nomor versi lengkapnya, mis. 24.21.0
nvm use 24.21.0 arm64           # WAJIB menyebut arm64; tanpa itu nvm mencari versi x64 ("Version not installed")
node -p "process.version + ' ' + process.arch"   # harus berakhir "arm64"
```

*Cabang B — Windows x64 (`AMD64`, Intel/AMD):*

```powershell
cd D:\Development\Application\LifeOS
nvm install 24                  # default nvm-windows = 64-bit (x64)
nvm list                        # catat nomor versi lengkapnya
nvm use <versi>                 # mis. nvm use 24.18.0
node -p "process.version + ' ' + process.arch"   # harus berakhir "x64"
```

**Salah arsitektur?** (mis. di Windows ARM terpasang x64: `nvm list` menampilkan *Currently using 64-bit
executable*). Pindah ke versi yang benar dulu, baru hapus yang salah — bila versi yang sedang aktif dihapus, perintah
`node` hilang sampai `nvm use` berikutnya:

```powershell
nvm install 24 arm64            # bila belum ada versi arm64
nvm use <versi-arm64> arm64
nvm uninstall <versi-x64>
```

Bila `node_modules` sudah pernah dipasang dengan Node arsitektur lain, hapus lalu pasang ulang agar paket native
sesuai: `Remove-Item -Recurse -Force backend\node_modules, frontend\node_modules` → ulangi langkah 4–5.

Setelah `nvm install`, nvm menyarankan `nvm use <versi>` **tanpa** `arm64` — abaikan saran itu. nvm-windows tidak
mengingat pilihan arsitektur: setiap `nvm install`/`nvm use` di Windows ARM selalu ditambah `arm64`
(juga saat upgrade Node nanti, mis. ke 26).

**Langkah 1 — jaga WSL tetap hidup.** Buka tab terminal baru dan biarkan terbuka selama bekerja:

```powershell
wsl -e lazydocker       # tampilan container (tekan q untuk keluar)
```

Jalankan dari folder proyek: lazydocker membaca `docker-compose.yml` di folder itu, sehingga panel *Services*
langsung menampilkan `postgres`, `redis`, `storage` (status `none` = container belum dibuat; normal sebelum langkah 2).
(Tanpa lazydocker: `wsl -e sh -c "sleep infinity"`.)

**Langkah 2 — nyalakan infrastruktur** (PostgreSQL, Redis, SeaweedFS) di tab terminal utama:

```powershell
wsl -e sh -c "cd /mnt/d/Development/Application/LifeOS && docker compose up -d --wait"
```

Pertama kali, Docker mengunduh image (beberapa menit). Selesai bila ketiga container berstatus *Healthy/Started*.

**Langkah 3 — buat database shadow** (dipakai Prisma untuk cek drift skema; sekali saja):

```powershell
wsl -e sh -c "docker exec lifeos-postgres psql -U postgres -c 'CREATE DATABASE lifeos_shadow'"
```

**Langkah 4 — backend**: file env, paket, tabel database, akun demo.

```powershell
Copy-Item backend\.env.example backend\.env
npm --prefix backend install                         # juga membuat Prisma Client (postinstall)
npm --prefix backend run prisma:deploy              # membuat semua tabel
npm --prefix backend run prisma:seed                 # pengaturan + akun demo
```

**Langkah 5 — frontend**:

```powershell
npm --prefix frontend install
```

**Langkah 6 — coba jalankan** mengikuti §4 langkah 3–4, buka http://localhost:5173 dan login
`admin@lifeos.com` / `123` (viewer: `viewer@lifeos.com` / `123`). Opsional, pastikan semuanya sehat:

```powershell
npm --prefix backend test; npm --prefix frontend test
npm --prefix backend run test:smoke                  # butuh backend yang sedang berjalan
```

Setelah ini, cukup ikuti §4 setiap mulai bekerja. Ulangi `npm install` (backend/frontend) hanya bila
`package.json` berubah (mis. setelah `git pull`), dan `npm --prefix backend run prisma:deploy` bila ada migrasi baru.

## 4. Menyalakan (setiap mulai bekerja)

0. **Cek status dulu** (§6) — nyalakan hanya yang belum aktif.
1. **Tab A — WSL & Docker**: `wsl -e lazydocker` (atau `wsl -e sh -c "sleep infinity"`). Biarkan terbuka.
2. **Infrastruktur** (aman dijalankan walau sebagian sudah menyala):
   ```powershell
   wsl -e sh -c "cd /mnt/d/Development/Application/LifeOS && docker compose up -d --wait"
   ```
3. **Tab B — backend** (tunggu sampai muncul log `Nest application successfully started`):
   ```powershell
   npm --prefix backend run dev
   ```
4. **Tab C — frontend**:
   ```powershell
   npm --prefix frontend run dev
   ```
5. Buka http://localhost:5173. Cek API: http://localhost:4000/api/v1/health (harus `"status":"ok"`).

Alternatif: minta Claude menyalakannya — Claude memakai konfigurasi yang sama (`.claude/launch.json`, port 4000 &
5173) setelah mengecek status, jadi tidak akan bentrok dengan yang sudah berjalan.

Catatan: `401` dari `POST /auth/refresh` di console saat membuka aplikasi tanpa sesi, dan `502` pertama saat frontend
dibuka sebelum backend selesai kompilasi, adalah normal.

## 5. Mematikan (selesai bekerja / sebelum menutup laptop)

Data tetap aman — semua langkah di bawah hanya menghentikan proses, tidak menghapus data.

1. **Frontend & backend**: tekan `Ctrl+C` di Tab C dan Tab B (jawab `Y` bila ditanya *Terminate batch job*). Bila
   dinyalakan Claude, minta Claude "matikan semua".
2. **Infrastruktur Docker**:
   ```powershell
   wsl -e sh -c "cd /mnt/d/Development/Application/LifeOS && docker compose stop"
   ```
   (Di lazydocker: pilih container → tekan `s` untuk stop.) Gunakan **`stop`**, bukan `down -v` — `-v` menghapus data.
3. **Tab A**: keluar dari lazydocker (`q`) atau tekan `Ctrl+C` pada `sleep infinity`.
4. Opsional, membebaskan RAM laptop: `wsl --shutdown`.
5. Pastikan semua sudah mati dengan §6 (tidak ada port tersisa).

Menutup laptop tanpa langkah di atas juga tidak merusak data, tetapi dev server tetap memegang port. Bila nanti muncul
`Port 5173 is already in use` / `EADDRINUSE`, ada proses lama yang masih hidup — lihat §6 lalu hentikan.

### 5.1 Reset data development (opsional)

Data dev hanya data dummy dan boleh dihapus kapan saja (backend harus mati dulu):

```powershell
wsl -e sh -c "cd /mnt/d/Development/Application/LifeOS && docker compose down -v && docker compose up -d --wait"
wsl -e sh -c "docker exec lifeos-postgres psql -U postgres -c 'CREATE DATABASE lifeos_shadow'"
npm --prefix backend run prisma:deploy
npm --prefix backend run prisma:seed
```

## 6. Cek status (apa yang sedang menyala?)

```powershell
# Port LifeOS yang sedang dipakai + prosesnya (wslrelay = container Docker, node = dev server)
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 80,443,4000,5173,5432,6379,8333,8888 } |
  Sort-Object LocalPort -Unique |
  ForEach-Object { "{0}  pid={1}  {2}" -f $_.LocalPort, $_.OwningProcess, (Get-Process -Id $_.OwningProcess).ProcessName }

# Dev server LifeOS (node) — termasuk yang dinyalakan Claude
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*LifeOS*' } |
  Select-Object ProcessId, CommandLine

# WSL hidup? (bila tidak ada distro berjalan, semua container pasti mati)
wsl --list --running
```

Bila WSL berjalan, lihat container: `wsl -e sh -c "docker ps"` (atau buka lazydocker).

Menghentikan dev server yang tertinggal (terminalnya sudah tertutup): `Stop-Process -Id <pid>` dengan `pid` dari
perintah di atas.

## 7. Infrastruktur (Docker)

```bash
docker compose up -d          # dari root repo (di WSL)
docker compose ps
```

| Service | Host port | Kredensial dev |
|---|---|---|
| PostgreSQL + pgvector | `5432` | db `lifeos`, `postgres` / `postgres` |
| Redis | `6379` | — |
| SeaweedFS S3 API | `8333` | `lifeos` / `lifeos-secret` (`infra/seaweedfs/s3.json`) |
| SeaweedFS filer UI | `8888` | — |

Bucket `lifeos-assets` dibuat otomatis oleh backend saat start.

Data PostgreSQL ada di volume Docker `lifeos-postgres18-data` (nomor major di nama volume; image 18+ di-mount ke
`/var/lib/postgresql`). Database `lifeos_shadow` (untuk cek drift, §10) dibuat manual sekali (§3 langkah 3).

### 7.1 Upgrade major PostgreSQL (data development)

Upgrade major (mis. 18 → 19) memakai volume baru + dump/restore; volume lama dibiarkan untuk rollback. Prosedur
produksi: [DEPLOYMENT.md §8](DEPLOYMENT.md#8-upgrade-major-postgresql-mis-18--19). Untuk data dev (folder
`backups/` di-ignore git):

```bash
# 1. Hentikan backend, backup semua database dari container lama
mkdir -p backups/pg-upgrade
docker exec lifeos-postgres pg_dumpall -U postgres > backups/pg-upgrade/dumpall.sql      # cadangan lengkap
for db in lifeos lifeos_shadow; do
  docker exec lifeos-postgres pg_dump -U postgres -Fc $db > backups/pg-upgrade/$db.dump
done

# 2. Ubah docker-compose.yml: tag image + nama volume baru (service postgres & daftar volumes), lalu
docker compose up -d --wait postgres                 # container baru, volume baru kosong

# 3. Restore
docker exec lifeos-postgres psql -U postgres -c "CREATE DATABASE lifeos_shadow"
for db in lifeos lifeos_shadow; do
  docker exec -i lifeos-postgres pg_restore -U postgres -d $db --no-owner --exit-on-error < backups/pg-upgrade/$db.dump
done
docker exec lifeos-postgres psql -U postgres -d lifeos -c "ANALYZE"

# 4. Verifikasi: bandingkan jumlah baris per tabel (query COUNT_SQL di DEPLOYMENT.md §8) sebelum & sesudah,
#    lalu (di backend/) npx prisma migrate deploy, cek drift (§10), npm run test:smoke, buka UI.
# 5. Rollback: kembalikan docker-compose.yml lalu docker compose up -d (volume lama masih utuh).
#    Bila sudah stabil: docker volume rm lifeos-postgres<lama>-data
```

## 8. Backend

```bash
cd backend
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
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
| `npm run prisma:studio` | GUI database di http://localhost:5555 |
| `npm run db:generate-models` | regenerate model domain dari `src/records/record-schema.ts` |
| `npm run prisma:deploy` | terapkan migrasi |
| `npm run prisma:seed` | seed data |
| `npm test` | unit test (Vitest) |
| `npm run test:smoke` | uji end-to-end terhadap server yang berjalan (user sementara dibuat & dihapus; `API_URL`, `SMOKE_ADMIN_EMAIL`, `SMOKE_ADMIN_PASSWORD`) |

## 9. Frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173 (port dikunci, §2)
```

Vite mem-proxy `/api` ke `http://localhost:4000`, sehingga frontend cukup memakai path relatif `/api/v1`
(override dengan `VITE_API_BASE_URL` bila API di host lain).

| Perintah | Fungsi |
|---|---|
| `npm run dev` | dev server + HMR |
| `npm run build` | typecheck + build produksi ke `dist/` |
| `npm run preview` | sajikan hasil build di http://localhost:4173 |
| `npm run lint` | oxlint (harus 0 warning) |
| `npm run format` / `format:check` | Prettier (config di root) |
| `npm test` | unit test (Vitest) |

## 10. Alur kerja database

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
     `CREATE DATABASE lifeos_shadow;` (§3 langkah 3)
  4. `npx prisma migrate deploy` lalu `npx prisma generate`.
  5. Cek tidak ada drift: perintah diff yang sama dengan `--exit-code` (tanpa `--script`) harus keluar 0.
- Prisma: URL koneksi ada di `backend/prisma.config.ts` (bukan di `schema.prisma`). Prisma Client di-generate ke
  `backend/src/generated/prisma` (tidak di-commit) oleh `postinstall`/`npm run prisma:generate`; import dari path itu,
  bukan dari `@prisma/client`. `migrate dev`/`db push` tidak lagi menjalankan generate/seed otomatis.

## 11. Continuous Integration

`.github/workflows/ci.yml` menjalankan di setiap push/PR: lint, format check, typecheck, unit test, build (frontend &
backend), smoke test end-to-end terhadap infrastruktur Docker nyata, cek drift skema database, dan build image Docker.
Dependabot memperbarui dependensi npm, image Docker (Dockerfile & `docker-compose*.yml`), dan GitHub Actions setiap
minggu (minor/patch saja; lihat ARCHITECTURE.md §2.3).

## 12. Deployment

Lihat [DEPLOYMENT.md](DEPLOYMENT.md) (VPS dengan `docker-compose.prod.yml`: Caddy + HTTPS otomatis, backup harian).

## 13. Troubleshooting

| Gejala | Solusi |
|---|---|
| `Port 5173 is already in use` / `EADDRINUSE :::4000` | Dev server lama masih berjalan (terminal lain/Claude/terminal yang tertutup). Cek §6: pakai yang sudah ada, atau `Stop-Process -Id <pid>` lalu nyalakan lagi |
| `ECONNREFUSED` ke 5432/6379/8333, `/health` 503 | Container mati (WSL berhenti) → buka lazydocker/`sleep infinity` lalu `docker compose up -d` lagi (§4) |
| `Cannot connect to the Docker daemon` di WSL | Tunggu beberapa detik setelah WSL baru hidup, lalu ulangi |
| `database "lifeos_shadow" already exists` | Aman diabaikan (sudah dibuat sebelumnya) |
| Vite menampilkan modul usang setelah banyak perubahan | Restart `npm run dev` frontend |
| `Konfigurasi environment tidak valid` saat backend start | Lengkapi `backend/.env` sesuai `.env.example` (mis. setelah `git pull` menambah variabel baru seperti `AI_ENCRYPTION_KEY`: buat dengan `node -p "require('crypto').randomBytes(32).toString('hex')"`) |
| Fitur AI: "AI belum diatur" / "Model … tidak tersedia" / "API key … ditolak" | Buka **Pengaturan → AI**: simpan API key, pilih provider aktif, ganti model bila provider menghentikannya, lalu **Uji koneksi** |
| Prisma error tabel/kolom tidak ada | `npx prisma migrate deploy` lalu `npx prisma generate` |
| `Cannot find module '../generated/prisma/client'` | Prisma Client belum dibuat → `npm --prefix backend install` atau `npm --prefix backend run prisma:generate` |
| Node/npm terasa lambat di Windows ARM, `node -p "process.arch"` = `x64` | Node x64 berjalan lewat emulasi → pasang versi arm64 (§3 langkah 0, "Salah arsitektur?") lalu pasang ulang `node_modules` |
| `nvm use 24.x.x` → `Version not installed` padahal ada di `nvm list` | Versi itu arm64 → `nvm use 24.x.x arm64` |
| `npm install`: `N high severity vulnerabilities` (backend 3, frontend 7) | Sudah diketahui (UPGRADE-PLAN.md §3): backend = satu rantai `deepmerge-ts` → `@prisma/config` → `prisma`; frontend = `braces` di CLI `shadcn` (alat dev, tidak masuk aplikasi). **Jangan** `npm audit fix --force` (mis. menurunkan Prisma ke 6 dan merusak proyek) |
| Teks merah `NativeCommandError` / `RemoteException` di PowerShell saat `npm install`/Prisma | Bukan error: PowerShell menampilkan output stderr (mis. "Loaded Prisma config…") sebagai merah. Lihat baris terakhir perintah |
| Login gagal `429` | Batas 10 login/menit (mis. smoke test berulang) — tunggu satu menit |
