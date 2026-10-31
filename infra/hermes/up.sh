#!/bin/sh
# Menyalakan Hermes (profile agent) di laptop. Dijalankan dari Windows:
#   wsl -e sh /mnt/d/Development/Application/LifeOS/infra/hermes/up.sh
# Backend LifeOS berjalan di Windows → alamatnya = gateway default WSL (berubah setelah restart, dihitung setiap kali).
set -e
cd "$(dirname "$0")/../.."
LIFEOS_API_HOST=$(ip route show default | awk '{print $3; exit}')
export LIFEOS_API_HOST
echo "Backend LifeOS (Windows) = $LIFEOS_API_HOST:4000"
docker compose --profile agent up -d hermes

# Mount skill LifeOS (/opt/data/skills/lifeos) membuat Docker membuat /opt/data/skills milik root di volume → skill
# bawaan Hermes gagal disalin. Sekali saja: serahkan ke user hermes (UID 10000) lalu mulai ulang.
if [ "$(docker exec -u 0 lifeos-hermes stat -c %u /opt/data/skills)" != "10000" ]; then
  docker exec -u 0 lifeos-hermes chown 10000:10000 /opt/data/skills
  docker restart lifeos-hermes >/dev/null
  echo "Folder skill diperbaiki, Hermes dimulai ulang."
fi

# Model lewat LifeOS + MCP LifeOS (tanpa API key di Hermes); dimulai ulang hanya bila konfigurasi berubah.
# Izin agen diaktifkan dari LifeOS: Asisten Agen → Status & Skill → Siapkan agen.
docker exec lifeos-hermes sh /opt/lifeos/configure.sh
if docker exec lifeos-hermes sh -c 'test -f /opt/data/.lifeos-config-changed && rm /opt/data/.lifeos-config-changed'; then
  docker restart lifeos-hermes >/dev/null
  echo "Hermes dimulai ulang dengan konfigurasi baru."
fi
