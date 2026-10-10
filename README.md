# LifeOS

Personal operating system berbasis web untuk produktivitas pribadi dan pekerjaan:

- **Planner** — agenda harian, jadwal, rutinitas (dengan freeze period), todo.
- **Notes** — catatan bebas, catatan AI (transkripsi audio, ringkasan dokumen), daftar.
- **Productivity** — metode PARA (Projects, Areas, Resources, Archives) dengan task berbobot.
- **File Control** — manajemen kearsipan sesuai kaidah kearsipan Indonesia: pemberkasan, klasifikasi, JRA,
  penataan fisik/digital, peminjaman, penyusutan (pemusnahan/penyerahan statis), label QR & scan.

| Bagian | Teknologi |
|---|---|
| Frontend | React · TypeScript · Vite · Tailwind · shadcn/ui · TanStack Query · React Router |
| Backend | NestJS · Prisma · PostgreSQL (pgvector) · Redis (BullMQ) · S3-compatible storage |
| Deployment | Docker Compose · Caddy (HTTPS otomatis) · nginx · backup harian |

## Mulai cepat (development)

```bash
docker compose up -d                 # postgres, redis, object storage
cd backend && cp .env.example .env && npm install && npx prisma migrate deploy && npm run prisma:seed && npm run dev
cd frontend && npm install && npm run dev   # http://localhost:5173 — admin@lifeos.com / 123
```

## Dokumentasi

- [docs/SETUP.md](docs/SETUP.md) — lingkungan development, perintah, alur kerja database, pengujian.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — deployment VPS, pembaruan, backup & restore, operasional.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — fondasi: arsitektur, tech stack & versi, kebijakan dependensi, database, frontend, keamanan, konvensi.
- [docs/UPGRADE-PLAN.md](docs/UPGRADE-PLAN.md) — kajian & rencana upgrade komponen tech stack.
- [docs/FILE-CONTROL.md](docs/FILE-CONTROL.md) — spesifikasi & aturan bisnis modul kearsipan.
- [CLAUDE.md](CLAUDE.md) — knowledge base pengembangan (keputusan, status, pola wajib).

## Struktur repo

```
backend/              NestJS API (prisma/, src/, test/, Dockerfile)
frontend/             React SPA (src/, Dockerfile, nginx.conf)
infra/                Caddyfile, skrip backup, konfigurasi S3 dev
docs/                 dokumentasi
docker-compose.yml        infrastruktur development
docker-compose.prod.yml   stack produksi (VPS)
.github/              CI (lint, test, build, smoke test end-to-end) + Dependabot
```
