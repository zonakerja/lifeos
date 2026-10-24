# syntax=docker/dockerfile:1
# ============================================================================
# LifeOS Backend (NestJS + Prisma). Image produksi multi-stage.
#   docker build -t lifeos-backend ./backend
# Saat start: menerapkan migrasi database lalu menjalankan API.
# ============================================================================

FROM node:24-trixie-slim AS base
# OpenSSL dibutuhkan schema engine Prisma (migrate deploy); tanpa ini Prisma salah mendeteksi versi libssl
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
# Skema & config dibutuhkan postinstall (prisma generate → src/generated/prisma)
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build \
  && npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production \
  NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
# Templat dokumen kosong ONLYOFFICE (POST /office/documents) + templat vault Obsidian (Tools → Basis Pengetahuan)
COPY --from=build --chown=node:node /app/templates ./templates
COPY --from=build --chown=node:node /app/package.json /app/prisma.config.ts ./
# Folder font ONLYOFFICE (volume bersama) & folder vault Obsidian; dibuat di image agar dimiliki user node
RUN mkdir -p /app/office-fonts /app/knowledge-vaults && chown node:node /app/office-fonts /app/knowledge-vaults
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://localhost:4000/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main.js"]
