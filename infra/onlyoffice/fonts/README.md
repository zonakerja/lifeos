# Font tambahan ONLYOFFICE (development)

Cara utama: admin mengunggah font dari **Tools → ONLYOFFICE → Font → Unggah font** (.ttf/.otf/.ttc). Backend menulis
berkas ke folder ini (`ONLYOFFICE_FONTS_DIR="../infra/onlyoffice/fonts"` di `backend/.env`), lalu pemantau di container
ONLYOFFICE (`infra/onlyoffice/lifeos-entrypoint.sh`) membuat ulang daftar font ± 30 detik–2 menit kemudian (editor yang
sedang terbuka tersambung ulang sebentar). Menyalin berkas langsung ke folder ini juga terdeteksi otomatis.

- Image ONLYOFFICE sudah membawa ± 150 keluarga font, termasuk Arial, Times New Roman, Calibri, Cambria, Tahoma,
  Verdana, Georgia, Courier New, dan font bebas (Liberation, Carlito, DejaVu, Noto, …). Tambahkan hanya yang belum ada,
  mis. **Bookman Old Style**, **Century Gothic**, **Garamond**, **Segoe UI**, atau font kop instansi.
- Pakai berkas font yang memang boleh Anda pakai (lisensi). Berkas font **tidak ikut Git** (`.gitignore`). Produksi
  memakai volume `onlyoffice-fonts` (docs/DEPLOYMENT.md §9).
- Nama keluarga font di editor = nama di dalam berkas font, bukan nama berkasnya.
