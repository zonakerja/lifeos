# syntax=docker/dockerfile:1
# ============================================================================
# Image service `backup` (docker-compose.prod.yml): pg_dump/pg_restore + rclone + curl.
# Base HARUS sama dengan image service `postgres` (versi pg_dump = versi server).
# ============================================================================

FROM rclone/rclone:1.75.2 AS rclone

FROM pgvector/pgvector:0.8.7-pg18
# curl untuk heartbeat pemantauan; binary rclone statis dari image resminya
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
# Remote rclone dikonfigurasi lewat env (backup.sh); file kosong mencegah NOTICE "config file not found"
ENV RCLONE_CONFIG=/etc/rclone/rclone.conf
RUN mkdir -p /etc/rclone && touch /etc/rclone/rclone.conf
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod 755 /usr/local/bin/backup.sh
HEALTHCHECK --interval=5m --timeout=10s --start-period=10m CMD ["backup.sh", "--health"]
ENTRYPOINT ["backup.sh"]
