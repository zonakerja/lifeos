#!/bin/sh
# Backup berkala LifeOS (dijalankan service `backup` di docker-compose.prod.yml).
# - Database: pg_dump format custom → /backups/db-<waktu>.dump  (restore: pg_restore)
# - Object storage: arsip data SeaweedFS → /backups/storage-<waktu>.tar.gz
# Backup lebih tua dari BACKUP_RETENTION_DAYS hari dihapus otomatis.
set -eu

INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

run_backup() {
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  echo "[backup] mulai ${stamp}"
  pg_dump --format=custom --no-owner --file="/backups/db-${stamp}.dump.partial"
  mv "/backups/db-${stamp}.dump.partial" "/backups/db-${stamp}.dump"
  tar -czf "/backups/storage-${stamp}.tar.gz.partial" -C /storage .
  mv "/backups/storage-${stamp}.tar.gz.partial" "/backups/storage-${stamp}.tar.gz"
  find /backups -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'storage-*.tar.gz' \) -mtime "+${RETENTION_DAYS}" -delete
  echo "[backup] selesai ${stamp}"
}

if [ "${1:-}" = "--once" ]; then
  run_backup
  exit 0
fi

while true; do
  run_backup || echo "[backup] GAGAL — dicoba lagi pada jadwal berikutnya" >&2
  sleep $((INTERVAL_HOURS * 3600))
done
