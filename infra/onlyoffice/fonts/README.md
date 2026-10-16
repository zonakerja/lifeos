# Font tambahan ONLYOFFICE

Taruh berkas font (`.ttf`, `.otf`, `.ttc`) di folder ini, lalu restart container ONLYOFFICE:

```bash
wsl -e sh -c "cd /mnt/d/Development/Application/LifeOS && docker compose --profile office restart onlyoffice"
```

Saat start, ONLYOFFICE membuat ulang daftar font (± 1–2 menit). Font baru muncul di editor setelah dokumen dibuka
ulang (kadang perlu muat ulang halaman). Daftar font yang terpasang terlihat di **Tools → ONLYOFFICE → Font**.

- Image ONLYOFFICE sudah membawa ± 150 keluarga font, termasuk Arial, Times New Roman, Calibri, Cambria, Tahoma,
  Verdana, Georgia, Courier New, dan font bebas (Liberation, Carlito, DejaVu, Noto, …). Tambahkan hanya yang belum ada,
  mis. **Bookman Old Style**, **Century Gothic**, **Garamond**, **Segoe UI**, atau font kop instansi.
- Pakai berkas font yang memang boleh Anda pakai (lisensi). Berkas font **tidak ikut Git** (`.gitignore`) — salin juga
  ke server produksi (`docs/DEPLOYMENT.md`).
- Nama keluarga font di editor = nama di dalam berkas font, bukan nama berkasnya.
