# syntax=docker/dockerfile:1
# ============================================================================
# LifeOS Frontend: build Vite → disajikan nginx (SPA statis + header keamanan).
#   docker build -t lifeos-frontend ./frontend   (dipakai di docker-compose.prod.yml)
# ============================================================================

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO /dev/null http://127.0.0.1/healthz || exit 1
