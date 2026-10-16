#!/bin/sh
# Entrypoint image ONLYOFFICE LifeOS: menjalankan Document Server seperti biasa + pemantau folder font tambahan.
# Admin mengunggah/menghapus font dari Tools → ONLYOFFICE (backend menulis ke folder bersama yang di-mount di sini);
# setiap perubahan isi folder → daftar font dibuat ulang (documentserver-generate-allfonts.sh, ± 1–2 menit; editor yang
# sedang terbuka tersambung ulang sebentar karena layanan dokumen di-restart oleh skrip itu).
FONT_DIR=/usr/share/fonts/truetype/custom
LOG=/var/log/onlyoffice/lifeos-fonts.log
INTERVAL=${LIFEOS_FONT_WATCH_INTERVAL:-30}

fingerprint() {
  # Nama + ukuran + waktu ubah berkas font (README & .gitignore diabaikan)
  find "$FONT_DIR" -maxdepth 1 -type f \( -iname '*.ttf' -o -iname '*.otf' -o -iname '*.ttc' \) \
    -exec stat -c '%n %s %Y' {} + 2>/dev/null | sort | md5sum
}

(
  # Daftar font awal dibuat oleh skrip start bawaan (GENERATE_FONTS=true); pantau setelah server siap
  last=$(fingerprint)
  sleep 120
  while true; do
    sleep "$INTERVAL"
    now=$(fingerprint)
    [ "$now" = "$last" ] && continue
    # Tunggu unggahan beruntun selesai
    sleep 5
    now=$(fingerprint)
    echo "$(date -Iseconds) folder font berubah → membuat ulang daftar font" >> "$LOG"
    documentserver-generate-allfonts.sh false >> "$LOG" 2>&1
    last=$now
  done
) &

exec /app/ds/run-document-server.sh "$@"
