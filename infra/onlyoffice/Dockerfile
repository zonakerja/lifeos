# ONLYOFFICE Docs Community + plugin AI resmi ONLYOFFICE yang dijalankan dengan AI LifeOS (docs/ONLYOFFICE.md §3.4).
# - Plugin AI tidak ikut image Community → dipasang saat build (butuh internet sekali; versi terbaru di marketplace).
# - Jembatan LifeOS (lifeos-ai-bridge.js) disisipkan ke plugin: tab AI memakai provider & API key user di
#   Pengaturan → AI lewat backend LifeOS, tanpa pengaturan key di editor. Tab AI hanya tampil bila user mengaktifkannya
#   (config editor dari backend: customization.ai.disabled). Build gagal bila struktur plugin berubah (cek grep).
# Font tambahan TIDAK dimasukkan ke image: folder infra/onlyoffice/fonts di-mount ke /usr/share/fonts/truetype/custom
# dan daftar font dibuat ulang otomatis setiap container start (GENERATE_FONTS=true bawaan image).
FROM onlyoffice/documentserver:10.0

COPY lifeos-ai-bridge.js /tmp/lifeos-ai-bridge.js

RUN set -e; \
  documentserver-pluginsmanager.sh -r false --install="ai"; \
  P="/var/www/onlyoffice/documentserver/sdkjs-plugins/{9DC93CDB-B576-4F0C-B55E-FCC9C48DD007}"; \
  test -f "$P/config.json"; \
  cp /tmp/lifeos-ai-bridge.js "$P/scripts/lifeos-ai-bridge.js"; \
  grep -q 'window.Asc.plugin.init = async function() {' "$P/scripts/code.js"; \
  sed -i 's|window.Asc.plugin.init = async function() {|&\n\tif (window.lifeosApplyAiSettings) window.lifeosApplyAiSettings();|' "$P/scripts/code.js"; \
  grep -q 'src="scripts/code.js"' "$P/index.html"; \
  sed -i 's|<script type="text/javascript" src="scripts/code.js"></script>|<script type="text/javascript" src="scripts/lifeos-ai-bridge.js"></script>\n  &|' "$P/index.html"; \
  grep -q 'lifeos-ai-bridge.js' "$P/index.html"; \
  grep -q 'lifeosApplyAiSettings' "$P/scripts/code.js"; \
  for f in "$P/scripts/code.js" "$P/index.html" "$P/scripts/lifeos-ai-bridge.js"; do gzip -kf9 "$f"; done; \
  chown -R ds:ds "$P"; \
  rm /tmp/lifeos-ai-bridge.js
