# Rencana & Kajian Upgrade Tech Stack

Dokumen ini berisi **komponen yang belum di-upgrade, kajiannya, dan rekomendasinya**. Versi yang sedang dipakai,
batasan platform, kebijakan dependensi, dan overrides aktif **tidak diulang di sini** — sumbernya
[ARCHITECTURE.md §2](ARCHITECTURE.md#2-tech-stack--kebijakan-dependensi).

Kajian per 2026-10-10. Perbarui setiap kali ada rilis/keputusan baru; ringkasan keputusan juga dicatat di CLAUDE.md §12.

## 1. Ringkasan rekomendasi

| Prioritas | Item | Rekomendasi | Waktu paling cepat | Usaha |
|---|---|---|---|---|
| Sedang | Node 24 → **26 LTS** | Upgrade setelah Node 26 menjadi LTS + masa stabil | ± 25 Nov 2026 | Kecil |
| Rendah | KaTeX 0.18.9 → **0.19** | Upgrade setelah umur ≥ 4 minggu + uji render | ± 29 Okt 2026 | Kecil |
| Pantau | TypeScript 6 → **7** | Tunggu TS 7.1 + dukungan `typescript-eslint` & `@nestjs/swagger` | Belum ada tanggal | Sedang |
| Pantau | Prisma 7 → **8** | Tetap di Prisma 7; evaluasi 3–6 bulan setelah GA | ≥ 2027 | **Besar** |
| Pantau | ioredis 5 → **6** | Tunggu BullMQ memakai ioredis 6 | Belum ada tanggal | Kecil |
| Tidak perlu | ESM backend, npm 12, Valkey, `@types/node` 26 (ikut Node) | Lihat §2.6 | — | — |

Urutan yang disarankan: **(1)** KaTeX 0.19 (≥ 29 Oktober 2026) → **(2)** Node 26 (≥ ± 25 November 2026) →
**(3)** tinjau kuartalan TS 7, Prisma 8, ioredis 6, dan temuan audit (§3). Major PostgreSQL berikutnya (19, rilis
± September 2027) mengikuti prosedur [DEPLOYMENT.md §8](DEPLOYMENT.md#8-upgrade-major-postgresql-mis-18--19).

Verifikasi standar setiap upgrade: lint, typecheck, unit test, build, smoke test (termasuk ekstraksi BullMQ), cek drift
Prisma, build image Docker; untuk perubahan infra juga stack produksi lokal + cek UI (resep di CLAUDE.md §14).

## 2. Kajian per item

### 2.1 Node.js 24 → 26 — prioritas sedang
- **Status**: Node 26 rilis 2026-05-05, menjadi **Active LTS 2026-10-28** (EOL 2029-04-30). Node 24 masuk Maintenance
  LTS 2026-10-20 dan didukung sampai **2028-04-30** — tidak mendesak. Mulai Node 27 rilis major menjadi tahunan.
- **Kesiapan**: image `node:26-trixie-slim` tersedia; dependensi native kita memakai N-API (`@node-rs/argon2`) atau pure
  JS; Prisma 7, NestJS 12, Vite 8, Vitest 5 mendukung Node ≥ 24. Node 26 masih membundel npm 11.
- **Perubahan**: `.nvmrc`, kedua `Dockerfile`, `engines`, `@types/node` 26, nvm-windows lokal; CI otomatis via `.nvmrc`.
- **Rekomendasi**: kerjakan ± 4 minggu setelah LTS (sekitar 25 November 2026), satu commit, semua cek + image.

### 2.2 KaTeX 0.18.9 → 0.19 — prioritas rendah
- 0.19.0 rilis 2026-10-01. Breaking change hanya pada callback opsi `strict` (karakter tanpa metrik) — kita memakai
  default `rehype-katex`, jadi dampaknya kecil.
- `rehype-katex` (rilis terakhir 7.0.1, Agustus 2024) masih mengunci `^0.16` → override `katex: "$katex"` tetap
  diperlukan (lihat ARCHITECTURE §2.3).
- Rekomendasi: upgrade setelah umur ≥ 4 minggu (± 29 Oktober 2026), uji render blok & inline di Notes AI.
- Dependabot mengabaikan `katex >=0.19.0` (`.github/dependabot.yml`) agar PR tidak datang lebih awal — **hapus aturan
  itu** saat upgrade dikerjakan.

### 2.3 TypeScript 6 → 7 — pantau
- TS 7.0 (compiler native/Go, build jauh lebih cepat) GA 2026-07-08, tetapi **belum punya API programatik stabil**
  (direncanakan di TS 7.1). Akibatnya `typescript-eslint` masih membatasi `typescript <6.1` (pelacakan di issue
  #10940), `@nestjs/swagger` (plugin CLI) hanya `^5.5 || ^6`, dan Nest CLI memakai compiler API.
- Frontend secara teknis bisa naik lebih dulu, tetapi keputusan proyek: **versi TS sama di backend & frontend**.
- Alternatif jangka panjang: lint backend dengan `oxlint` (type-aware via `oxlint-tsgolint`, sudah dipakai frontend) agar
  tidak bergantung pada `typescript-eslint`. Layak dikaji tersendiri.
- Pemicu tinjau ulang: rilis TS 7.1 + `typescript-eslint` & `@nestjs/swagger` mendukung TS 7 → upgrade keduanya sekaligus.

### 2.4 Prisma 7 → 8 — pantau (usaha besar)
- Prisma 8 masih **release candidate** (rc.22, 2026-10-08; GA diperkirakan Oktober 2026). Ini **tulis ulang**: CLI tidak
  lagi membaca `schema.prisma`, tidak ada `generate`/`migrate dev`/`db push`, paket per database
  (`@prisma/orm-postgres`), butuh Node ≥ 22.18 & TS ≥ 5.9. Fitur yang **belum ada**: `$extends`, `increment` atomik,
  dan kode error gaya `P2002`.
- Dampak ke LifeOS: `PrismaExceptionFilter` bergantung pada P2002/P2025/P2003; generator model domain
  (`generate-domain-models.mts`) menulis `schema.prisma`; alur migrasi & cek drift (docs/SETUP.md §5, CI) berubah total.
- Dukungan: Prisma 7 tetap menerima bug fix & patch keamanan **18 bulan setelah Prisma 8 GA**.
- Rekomendasi: **tetap di Prisma 7**. Evaluasi 3–6 bulan setelah GA ketika fitur & kode error setara; kerjakan
  terencana (mungkin diawali percobaan di branch). Jangan `npm i prisma@latest` — tag `latest` CLI menunjuk rc.

### 2.5 ioredis 5 → 6 — pantau
- ioredis 6.0.0 (2026-07-31) memakai protokol RESP3 secara default dan butuh Node ≥ 20. BullMQ 6 masih diuji dengan
  ioredis 5.11 (devDependencies-nya). Rekomendasi: tunggu BullMQ memakai ioredis 6, lalu upgrade bersama.

### 2.6 Tidak direkomendasikan saat ini
- **ESM untuk backend**: opsional di NestJS 12 (paket ESM dimuat via `require(esm)`); perubahan luas tanpa manfaat
  fungsional. Tinjau hanya bila ada library penting yang tidak bisa di-`require`.
- **npm 12**: tidak dibundel Node 24 maupun Node 26 (keduanya npm 11.x). Tetap pakai npm bawaan Node LTS.
- **Valkey** (fork Redis berlisensi BSD, 9.1): Redis 8 dipilih user dan lisensinya (AGPLv3/RSALv2/SSPL) aman untuk
  self-host. Pertimbangkan Valkey hanya bila lisensi menjadi isu; BullMQ mendukung keduanya.
- **`@types/node` 26**: mengikuti runtime (naik bersama Node 26).
- **Express 5.3** (rilis 2026-10-09): datang otomatis lewat `@nestjs/platform-express` / Dependabot minor.

## 3. Temuan audit yang masih dipantau (`npm audit`)

| Lokasi | Paket | Severity | Masuk produksi? | Tindak lanjut |
|---|---|---|---|---|
| Backend | `deepmerge-ts` 7.x (via `@prisma/config`) | high (stack exhaustion objek rekursif) | Ya, hanya membaca `prisma.config.ts` milik kita | Fix hanya di major 8 (API berbeda) → tunggu patch Prisma 7.x |
| Frontend | `braces`/`micromatch`/`fast-glob` (via CLI `shadcn`) | high | Tidak (dev tool) | Ikut update `shadcn` |

## 4. Sumber kajian

- Jadwal rilis Node.js: [nodejs/Release](https://github.com/nodejs/Release)
- Status Prisma 8 & dukungan Prisma 7: [Prisma ORM release status](https://www.prisma.io/docs/orm/release-status),
  [Prisma 8 roadmap](https://www.prisma.io/blog/prisma-next-roadmap)
- TypeScript 7 & ekosistem: [InfoQ — TypeScript 7.0](https://www.infoq.com/news/2026/08/typescript-7-released/),
  [Why your TypeScript 7 upgrade broke ESLint](https://dev.to/dev_encyclopedia/why-your-typescript-7-upgrade-broke-eslint-ts-jest-and-ts-morph-385k)
- PostgreSQL di Docker (path volume image 18+): [Docker Hub postgres](https://hub.docker.com/_/postgres/),
  [docker-library/postgres#1370](https://github.com/docker-library/postgres/issues/1370)
- Dependabot `docker-compose`: [GitHub — supported ecosystems](https://docs.github.com/en/enterprise-cloud@latest/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories);
  pola nama file: `FILENAME_REGEX` di
  [dependabot-core `docker_compose/file_fetcher.rb`](https://github.com/dependabot/dependabot-core/tree/main/docker/lib/dependabot/docker_compose)
- KaTeX 0.19: [release notes v0.19.0](https://github.com/KaTeX/KaTeX/releases/tag/v0.19.0)
- Data versi & peer dependency: `npm view <paket> time dist-tags peerDependencies`, Docker Hub tags API.
