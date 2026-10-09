# Deployment ke VPS

Panduan memasang LifeOS di satu VPS Linux memakai `docker-compose.prod.yml`.

## Arsitektur produksi

```
Internet ──► Caddy :80/:443 (HTTPS otomatis Let's Encrypt, HSTS, kompresi)
               ├── /api/*  ──► backend  (NestJS, migrasi otomatis saat start, log JSON)
               └── lainnya ──► frontend (nginx: SPA statis + CSP & header keamanan)
             jaringan internal Docker (tidak terbuka ke internet):
               postgres (pgvector) · redis (password) · storage (SeaweedFS S3) · backup (harian)
```

| Service | Image | Data |
|---|---|---|
| caddy | `caddy:2.10-alpine` | volume `caddy-data` (sertifikat) |
| frontend | dibangun dari `frontend/Dockerfile` | — |
| backend | dibangun dari `backend/Dockerfile` (user non-root) | — |
| postgres | `pgvector/pgvector:0.8.7-pg16` | volume `postgres-data` |
| redis | `redis:7.4-alpine` (AOF, password) | volume `redis-data` |
| storage | `chrislusf/seaweedfs:4.48` | volume `storage-data` |
| backup | `pgvector/pgvector:0.8.7-pg16` + `infra/backup/backup.sh` | folder `./backups` |

## 1. Persiapan VPS

- Spesifikasi minimal: 2 vCPU, 2 GB RAM (disarankan 4 GB), 20 GB disk + ruang untuk berkas & backup.
- OS: Ubuntu 22.04/24.04 LTS (atau distro lain yang didukung Docker).
- Domain/subdomain dengan record DNS **A** (dan **AAAA** bila ada IPv6) ke IP VPS.

```bash
# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER        # login ulang setelah ini

# Firewall: hanya SSH, HTTP, HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

## 2. Instalasi

```bash
git clone https://github.com/zonakerja/lifeos.git && cd lifeos
cp .env.example .env
nano .env        # isi APP_DOMAIN, ACME_EMAIL, semua secret & password (openssl rand -hex 32)
chmod 600 .env

docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps          # tunggu semua healthy
docker compose -f docker-compose.prod.yml exec backend node dist/database/seed.js   # super admin dari SEED_ADMIN_*
```

Buka `https://<APP_DOMAIN>` dan login dengan `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Setelah login pertama,
ganti password lewat **Pengaturan → Profil** lalu hapus `SEED_ADMIN_PASSWORD` dari `.env`.

> Alias praktis: `alias dc='docker compose -f docker-compose.prod.yml'`.

## 3. Pembaruan aplikasi

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build      # migrasi database dijalankan otomatis
docker image prune -f
```

Disarankan backup manual sebelum pembaruan besar (lihat §4).

## 4. Backup & restore

Service `backup` membuat backup setiap `BACKUP_INTERVAL_HOURS` (default 24 jam) ke `./backups`:
`db-<waktu>.dump` (pg_dump format custom) dan `storage-<waktu>.tar.gz` (berkas upload), dan menghapus backup yang
lebih tua dari `BACKUP_RETENTION_DAYS` (default 14). **Salin folder `backups/` ke luar server** secara berkala
(mis. `rclone`/`rsync` ke penyimpanan lain) — backup di disk yang sama tidak melindungi dari kerusakan VPS.

```bash
# Backup manual sekarang
docker compose -f docker-compose.prod.yml exec backup sh /scripts/backup.sh --once

# Restore database (aplikasi dihentikan dulu)
docker compose -f docker-compose.prod.yml stop backend
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore --clean --if-exists --no-owner -U lifeos -d lifeos < backups/db-YYYYMMDD-HHMMSS.dump

# Restore berkas object storage
docker compose -f docker-compose.prod.yml stop storage
docker run --rm -v lifeos-prod_storage-data:/data -v "$PWD/backups:/backups" alpine \
  sh -c "rm -rf /data/* && tar -xzf /backups/storage-YYYYMMDD-HHMMSS.tar.gz -C /data"
docker compose -f docker-compose.prod.yml up -d
```

## 5. Operasional

| Kebutuhan | Perintah |
|---|---|
| Status & health | `dc ps` · `curl https://<domain>/api/v1/health` (readiness) · `/api/v1/health/live` (liveness) |
| Log aplikasi (JSON) | `dc logs -f backend` — setiap request punya `reqId` (header `X-Request-Id`) |
| Log akses | `dc logs -f caddy` |
| Rotasi log | otomatis (json-file 10 MB × 5 per service) |
| Uji end-to-end | `API_URL=https://<domain>/api/v1 SMOKE_ADMIN_EMAIL=... SMOKE_ADMIN_PASSWORD=... npm --prefix backend run test:smoke` (membuat & menghapus user sementara) |

## 6. Keamanan yang sudah diterapkan

- Hanya port 80/443 yang terbuka; database, Redis (berpassword), dan storage hanya di jaringan internal.
- HTTPS + HSTS (Caddy), CSP ketat & header keamanan (nginx), Helmet di API, rate limit (login 10/menit).
- Refresh token di cookie `httpOnly` + `Secure` + `SameSite=Strict`; access token 15 menit di memori; rotasi token
  dengan deteksi pemakaian ulang; ganti password mencabut sesi lain.
- Berkas upload disajikan dengan `CSP: sandbox`, konten aktif (HTML/SVG/JS) dipaksa diunduh.
- Container backend berjalan sebagai user non-root; secret hanya dari `.env` (tidak ada di image).

## 7. Object storage eksternal (opsional)

Untuk memakai S3/Cloudflare R2/Backblaze B2 alih-alih SeaweedFS lokal, isi di `.env`:
`S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `ASSET_BUCKET` (dan `S3_FORCE_PATH_STYLE=false`
bila penyedia memakai virtual-hosted style). Backup berkas lalu menjadi tanggung jawab penyedia tersebut.
