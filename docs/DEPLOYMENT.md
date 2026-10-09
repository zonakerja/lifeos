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
| caddy | `caddy` (alpine) | volume `caddy-data` (sertifikat) |
| frontend | dibangun dari `frontend/Dockerfile` | — |
| backend | dibangun dari `backend/Dockerfile` (user non-root) | — |
| postgres | `pgvector/pgvector` (PostgreSQL + pgvector) | volume `postgres-data` |
| redis | `redis` alpine (AOF, password) | volume `redis-data` |
| storage | `chrislusf/seaweedfs` | volume `storage-data` |
| backup | `pgvector/pgvector` + `infra/backup/backup.sh` | folder `./backups` |

Tag image di-pin di `docker-compose.prod.yml`; daftar versinya ada di [ARCHITECTURE.md §2.1](ARCHITECTURE.md#21-komponen-dan-versi-per-2026-10-10).

## 0. Sebelum membeli VPS & domain

> **Status per 2026-10-09:** VPS dan domain **belum dibeli**. Aplikasi sudah siap deploy dan sudah diuji lengkap
> secara lokal (stack produksi + HTTPS dengan `APP_DOMAIN=localhost`). Ikuti bagian ini saat siap membeli.

### 0.1 Memilih VPS

| Kebutuhan | Rekomendasi |
|---|---|
| CPU / RAM | **2 vCPU / 4 GB RAM** (nyaman). Minimal 2 vCPU / 2 GB **+ swap 2 GB** (proses build image butuh memori). |
| Disk | ≥ 40 GB SSD/NVMe (OS + Docker ±10 GB, sisanya database, berkas upload, dan backup). Tambah sesuai volume arsip. |
| OS | **Ubuntu 24.04 LTS** (atau 22.04). |
| Arsitektur | x86_64 (umum) atau ARM64 — keduanya didukung (image dibangun dari source, base image multi-arsitektur). |
| Lokasi | Data center terdekat dengan pengguna (mis. Jakarta / Singapura) untuk latensi rendah. |
| Akses | Akses **root/SSH** penuh (bukan shared hosting / cPanel). Docker harus bisa dipasang. |
| IP | IPv4 publik statis (wajib); IPv6 opsional. |
| Port | Penyedia tidak memblokir port **80 dan 443** (dibutuhkan untuk HTTPS otomatis). |

Fitur tambahan yang berguna: snapshot/backup VPS dari penyedia, dan firewall di panel penyedia.

### 0.2 Domain & DNS

1. Beli domain (mis. `namakamu.id`/`.com`) di registrar mana pun, atau pakai subdomain dari domain yang sudah ada
   (mis. `lifeos.namakamu.id`).
2. Setelah VPS aktif dan IP-nya diketahui, buat record DNS di panel registrar/DNS:

   | Tipe | Nama | Nilai | Keterangan |
   |---|---|---|---|
   | A | `lifeos` (atau `@` untuk domain utama) | IP publik VPS | wajib |
   | AAAA | sama | IPv6 VPS | hanya bila VPS punya IPv6 |

   Bila memakai Cloudflare, set proxy **"DNS only" (awan abu-abu)** saat pertama kali agar Caddy bisa menerbitkan
   sertifikat Let's Encrypt.
3. Tunggu propagasi (beberapa menit – beberapa jam), lalu cek dari laptop: `nslookup lifeos.namakamu.id` harus
   menampilkan IP VPS.
4. Domain inilah yang diisi ke `APP_DOMAIN` di `.env` (tanpa `https://`).

### 0.3 Yang perlu disiapkan untuk `.env`

| Variabel | Isi |
|---|---|
| `APP_DOMAIN` | domain/subdomain dari langkah 0.2, mis. `lifeos.namakamu.id` |
| `ACME_EMAIL` | email aktif (notifikasi sertifikat Let's Encrypt) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `S3_SECRET_ACCESS_KEY` | string acak masing-masing berbeda: jalankan `openssl rand -hex 32` di VPS untuk tiap variabel |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | akun super admin pertama (password ≥ 8 karakter, ganti setelah login pertama) |

Simpan salinan `.env` di password manager — tanpa `POSTGRES_PASSWORD` & secret yang sama, backup database tetap bisa
dipulihkan tetapi sesi login lama tidak berlaku.

### 0.4 Checklist hari-H

- [ ] VPS aktif, bisa SSH (`ssh root@<IP>`), buat user non-root bila perlu.
- [ ] DNS `APP_DOMAIN` sudah mengarah ke IP VPS (cek `nslookup`).
- [ ] Ikuti §1 (Docker + firewall) → §2 (instalasi) di bawah.
- [ ] Login di `https://<APP_DOMAIN>`, ganti password admin, hapus `SEED_ADMIN_PASSWORD` dari `.env`.
- [ ] Jalankan smoke test dari laptop (§5) untuk memastikan semuanya berfungsi.
- [ ] Atur penyalinan folder `backups/` ke luar server (§4).

**Belum punya domain?** Untuk uji coba sementara, aplikasi bisa dijalankan tanpa HTTPS dengan
`APP_DOMAIN=http://<IP-VPS>` dan `COOKIE_SECURE=false` di `.env`. **Jangan dipakai untuk data sungguhan**: password dan
sesi dikirim tanpa enkripsi. Setelah domain siap, ubah `APP_DOMAIN` ke domain, hapus `COOKIE_SECURE`, lalu
`docker compose -f docker-compose.prod.yml up -d`.

## 1. Persiapan VPS

- Spesifikasi & domain: lihat §0.
- OS: Ubuntu 22.04/24.04 LTS (atau distro lain yang didukung Docker).

```bash
# (VPS RAM 2 GB) tambahkan swap 2 GB agar build image tidak kehabisan memori
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

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
