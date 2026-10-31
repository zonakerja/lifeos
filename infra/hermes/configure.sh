#!/bin/sh
# Konfigurasi Hermes untuk LifeOS — dijalankan DI DALAM container hermes oleh up.sh (dev) atau
#   docker compose -f docker-compose.prod.yml exec hermes sh /opt/lifeos/configure.sh   (produksi)
# Tidak berisi rahasia & aman diulang (idempoten). docs/AI-AGENT.md §23.
#
# - Model: provider "custom" = endpoint OpenAI-compatible LifeOS. LifeOS meneruskan ke provider & API key pilihan user
#   (Pengaturan → Model AI), jadi API key model TIDAK disimpan di Hermes.
# - Kunci Hermes → LifeOS = ${API_SERVER_KEY} (env container, sama dengan HERMES_API_KEY backend) untuk model & MCP.
#   Izinnya diaktifkan dari LifeOS: Asisten Agen → Status & Skill → Siapkan agen.
set -e
LIFEOS_BASE="${LIFEOS_BASE:-http://lifeos-api:4000/api/v1}"
CONFIG=/opt/data/config.yaml

if [ ! -f "$CONFIG" ]; then
  echo "config.yaml Hermes belum ada — jalankan Hermes sekali dulu."
  exit 1
fi

set_value() {
  current=$(hermes config get "$1" 2>/dev/null || true)
  if [ "$current" != "$2" ]; then
    hermes config set "$1" "$2" >/dev/null
    CHANGED=1
  fi
}

CHANGED=0
set_value model.provider custom
set_value model.base_url "$LIFEOS_BASE/agent/llm/v1"
set_value model.default lifeos-agent

# Nilai ${...} harus tertulis apa adanya (Hermes mengganti dengan env saat memuat config) → tulis lewat sed, bukan
# `hermes config set` yang menyimpan hasil terjemahannya.
if ! grep -q 'api_key: "\${API_SERVER_KEY}"' "$CONFIG"; then
  sed -i '/^model:/,/^[a-z]/{/^  api_key:/d}' "$CONFIG"
  sed -i 's/^model:$/model:\n  api_key: "${API_SERVER_KEY}"/' "$CONFIG"
  CHANGED=1
fi

# MCP server LifeOS (blok di lifeos-mcp.yaml); blok lama berbasis LIFEOS_MCP_TOKEN diganti
if grep -q 'LIFEOS_MCP_TOKEN' "$CONFIG"; then
  sed -i 's/\${LIFEOS_MCP_TOKEN}/${API_SERVER_KEY}/' "$CONFIG"
  CHANGED=1
fi
if ! grep -q '^mcp_servers:' "$CONFIG"; then
  sed "s#http://lifeos-api:4000/api/v1#$LIFEOS_BASE#" /opt/lifeos/lifeos-mcp.yaml >>"$CONFIG"
  CHANGED=1
elif ! grep -q '/api/v1/mcp' "$CONFIG"; then
  echo "PERINGATAN: config.yaml sudah punya mcp_servers lain — tambahkan blok dari infra/hermes/lifeos-mcp.yaml manual."
fi

if [ "$CHANGED" = 1 ]; then
  echo "Konfigurasi Hermes diperbarui (model lewat LifeOS + MCP LifeOS)."
  touch /opt/data/.lifeos-config-changed
else
  echo "Konfigurasi Hermes sudah sesuai."
fi
