# Tech Stack LifeOS — Versi, Status Upgrade & Bahan Kajian

Dokumen ini mencatat versi yang dipakai, hasil thread **upgrade major dependensi (2026-10-09)**, paket yang
ditunda beserta alasannya, dan bahan kajian untuk menentukan tech stack terbaik ke depan.
Perbarui setiap kali ada upgrade major atau keputusan baru (ringkasannya juga di CLAUDE.md §12).

Aturan pemilihan versi: hanya rilis **stabil** (tanpa `-rc/-beta/-next`), sudah dirilis **≥ 2–4 minggu**, ekosistem
plugin sudah mendukung (cek `peerDependencies`), Node tetap **LTS**, harus jalan di **Windows 11 ARM64**
(prebuilt arm64 / pure JS / WASM). Instalasi memakai `npm install --before=<tanggal>` agar rilis yang baru keluar
hari itu tidak ikut terpasang.

## 1. Versi saat ini (2026-10-09)

| Lapisan | Komponen | Versi |
|---|---|---|
| Runtime | Node.js (`.nvmrc`, Dockerfile, CI) | 24 LTS (image `node:24-trixie-slim`, Debian 13) |
| Bahasa | TypeScript (backend & frontend) | 6.0.3 |
| Backend | NestJS (`@nestjs/*`) | 12.1 (config/jwt/passport/swagger/mapped-types 12.0, throttler 6.7) |
| | Express (via platform-express) | 5.2 |
| | Prisma ORM + adapter pg | 7.10 (generator `prisma-client`, CJS, tanpa engine Rust) |
| | BullMQ / ioredis | 6.3 / 5.11 |
| | class-validator / class-transformer | 0.15 / 0.5 |
| | nestjs-pino / pino | 5.3 / 10.4 |
| | dotenv | 18.0 |
| | ESLint / typescript-eslint / globals | 10.12 / 8.71 / 17.13 |
| | Vitest | 5.0 |
| Frontend | React / React DOM | 19.3 |
| | Vite / @vitejs/plugin-react | 8.3 / 6.1 |
| | React Router / TanStack Query / Zustand / zod | 8.4 / 5.104 / 5.0 / 4.6 |
| | Tailwind CSS / shadcn CLI | 4.3 / 4.21 |
| | oxlint / Vitest | 1.87 / 5.0 |
| Infra | PostgreSQL + pgvector | 16 + 0.8.7 (`pgvector/pgvector:0.8.7-pg16`) |
| | Redis | 8.10 (`redis:8.10-alpine`) |
| | SeaweedFS (S3) | 4.48 |
| | Caddy / nginx | 2.11 / 1.30 (stable) |
| CI | checkout / setup-node / setup-buildx / build-push | v7 / v7 / v4 / v7, runner `ubuntu-24.04` |

## 2. Yang sudah di-upgrade (thread 2026-10-09)

| # | Paket | Dari → Ke | Perubahan yang dilakukan |
|---|---|---|---|
| 1 | Semua paket minor/patch | — | `npm update` dalam major yang sama (React 19.3, Vite 8.3.4, NestJS 11.2 sementara, dll.) |
| 2 | TypeScript (backend) | 5.9 → 6.0 | tsconfig `module/moduleResolution: nodenext` (node10 & `baseUrl` deprecated), `types: ["node"]`, `rootDir` build. Frontend sudah 6.0 → rentang disamakan `~6.0.3` |
| 3 | Build fix | — | `tsBuildInfoFile` di dalam `dist` (TS 6 menaruhnya di samping tsconfig → build bersih bisa tidak meng-emit apa pun) |
| 4 | ESLint + @eslint/js + globals | 9 → 10, 16 → 17 | `defineConfig` dari `eslint/config` |
| 5 | NestJS (semua `@nestjs/*`) + class-validator + @types/multer | 11 → 12, 0.14 → 0.15, 1 → 2 | Proyek tetap CommonJS; paket Nest (ESM) dimuat via `require(esm)` Node 24. Tanpa perubahan kode |
| 6 | Prisma + client + adapter-pg | 6.19 → 7.10 | Generator `prisma-client` → `src/generated/prisma` (postinstall, tidak di-commit), import diganti, URL & shadow DB di `prisma.config.ts`, cek drift `--to-schema` |
| 7 | BullMQ | 5 → 6 | Tanpa perubahan kode (API yang dihapus tidak dipakai) |
| 8 | dotenv | 17 → 18 | Tanpa perubahan kode |
| 9 | Image & CI | — | node bookworm → trixie (+ `openssl` untuk schema engine Prisma), nginx 1.27 (EOL) → 1.30, Caddy 2.10 → 2.11, Redis 7.4 → 8.10, actions major terbaru |

Verifikasi tiap langkah: lint, typecheck, unit test, build, smoke test (±50 skenario, termasuk ekstraksi lewat
BullMQ), cek drift Prisma, build image Docker. Akhir: stack produksi penuh dijalankan lokal (Caddy → nginx/backend,
Redis berpassword) + smoke test lewat Caddy + cek UI (login, Planner, Notes, Productivity, File Control, reload sesi).

## 3. Ditunda / belum di-upgrade

| Paket | Sekarang | Terbaru | Alasan ditunda | Tinjau ulang bila |
|---|---|---|---|---|
| TypeScript 7 (native/Go) | 6.0 | 7.0.2 | Keputusan user: backend & frontend disamakan di 6. Backend juga terblokir: `typescript-eslint` hanya `<6.1`, plugin `@nestjs/swagger` hanya `^5.5 \|\| ^6`, Nest CLI memakai compiler API TS | `typescript-eslint` & `@nestjs/swagger` mendukung TS 7 → upgrade keduanya bersamaan |
| ioredis 6 | 5.11 | 6.0.0 | Default protokol RESP3; BullMQ 6 masih diuji dengan ioredis 5.11 | BullMQ memakai ioredis 6 di devDependencies/CI-nya |
| Prisma 8 | 7.10 | 8.0.0-rc | Masih release candidate (tag `latest` CLI menunjuk rc — jangan `npm i prisma@latest`) | 8.0.0 stabil ≥ 2–4 minggu |
| KaTeX 0.19 | 0.16.47 | 0.19.0 | Rilis 2026-10-01 (terlalu baru); `rehype-katex` & `micromark-extension-math` masih mengunci `^0.16` | Lihat §4 (ada advisory keamanan) |
| @types/node 26 | 24 | 26 | Mengikuti runtime Node 24 | Saat pindah ke Node 26 |
| Node 26 | 24 | 26.11 | Node 26 baru menjadi Active LTS akhir Oktober 2026; Node 24 masuk Maintenance LTS (didukung sampai April 2028) | Node 26 Active LTS + image `node:26-trixie-slim` stabil ± 1 bulan |
| PostgreSQL 17/18 | 16 | — | Butuh dump/restore (format data tidak kompatibel); dikerjakan terpisah | Thread khusus dengan prosedur docs/DEPLOYMENT.md |
| ESM untuk backend | CommonJS | — | Opsional di NestJS 12; perubahan luas (ekstensi `.js` di semua import), tanpa manfaat fungsional saat ini | Bila library penting menjadi ESM-only yang tidak bisa di-`require` |
| Patch rilis hari ini (bullmq 6.3.12, lucide-react 1.54) | — | — | Dirilis pada hari upgrade | Otomatis lewat PR Dependabot (minor/patch) |

## 4. Temuan audit keamanan (`npm audit`, 2026-10-09)

| Lokasi | Paket | Severity | Masuk produksi? | Catatan & rekomendasi |
|---|---|---|---|---|
| Backend | `mysql2` 3.15.3 (dipin oleh CLI `prisma` 7) | high | Ya (CLI `prisma` dipakai untuk `migrate deploy` di image), tapi kode MySQL **tidak pernah dipanggil** (kita PostgreSQL) | Opsi: `overrides` `mysql2@^3.24` (major sama). Atau tunggu patch Prisma |
| Backend | `deepmerge-ts` 7.x (via `@prisma/config`) | high (stack exhaustion objek rekursif) | Ya, hanya untuk membaca `prisma.config.ts` (input kita sendiri) | Risiko praktis rendah; fix hanya di major 8 → tunggu patch Prisma |
| Frontend | `katex` < 0.18.2 | low (prototype pollution memintas `trust`) | Ya (render Markdown/Math) | Opsi: `overrides` `katex@^0.18.11` (masih minor seri lama + diuji render matematika) sambil menunggu `rehype-katex` mendukung versi baru |
| Frontend | `braces`/`micromatch`/`fast-glob` (via CLI `shadcn`) | high | **Tidak** (dev tool, tidak masuk bundle) | Abaikan; ikut update `shadcn` berikutnya |

Prisma 6 tidak membawa `mysql2`/`deepmerge-ts` rentan — temuan backend muncul karena Prisma 7.

## 5. Bahan kajian "tech stack terbaik"

1. **Keamanan dependensi transitif** (§4): putuskan apakah memakai `overrides` npm untuk `mysql2` & `katex`
   sekarang, atau menunggu upstream. Rekomendasi: `katex` override ke 0.18.x + uji render; `mysql2` override
   (major sama, kode tidak dipakai).
2. **TypeScript 7**: performa typecheck jauh lebih cepat; tunggu `typescript-eslint` & `@nestjs/swagger`. Alternatif
   jangka panjang: lint backend memakai `oxlint` (sudah dipakai frontend; type-aware via `oxlint-tsgolint`) sehingga
   tidak bergantung pada `typescript-eslint`.
3. **Node 26 LTS**: rencanakan setelah akhir Oktober 2026 (+ masa stabil), satu commit: `.nvmrc`, Dockerfile, CI,
   `@types/node`.
4. **PostgreSQL 18 + pgvector**: penting sebelum data produksi besar (lebih mudah upgrade saat data masih kecil /
   sebelum VPS dibeli). Butuh dump/restore.
5. **Redis vs Valkey**: Redis 8 berlisensi AGPLv3/RSALv2/SSPL (aman untuk self-host). Valkey (fork BSD) adalah
   alternatif bila lisensi menjadi pertimbangan; BullMQ mendukung keduanya.
6. **Seed backend**: `ts-node` (rilis terakhir 2023) masih dipakai untuk `prisma db seed` di development; pertimbangkan
   `tsx` atau menjalankan hasil build (`node dist/database/seed.js`).
7. **Migrasi ESM backend**: hanya bila ada kebutuhan nyata (lihat §3).
