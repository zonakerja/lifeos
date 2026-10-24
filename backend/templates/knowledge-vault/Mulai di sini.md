---
jenis: panduan
status: berlaku
publik: false
---
# Mulai di sini

Vault ini adalah **basis pengetahuan** LifeOS. Tulis pengetahuan Anda di sini (dengan Obsidian), dan LifeOS membacanya
otomatis untuk chatbot, agen dokumen, dan bot WhatsApp — tanpa perlu memberi input berulang.

## Struktur folder
- **00-Inbox** — Usulan catatan dari LifeOS (jawaban chat yang disimpan, pertanyaan yang belum terjawab). Kurasi lalu pindahkan.
- **10-Peraturan** — Satu catatan per peraturan (UU, PP, PMK, KM, Perdirjen, SE) + PDF-nya.
- **10-Peraturan/Pasal** — Catatan per pasal penting: tafsir & catatan Anda, tertaut ke peraturannya.
- **20-Topik** — Peta topik: PSP, Penghapusan, Pemanfaatan (Sewa, KSP, KSPI, BGS/BSG, Pinjam Pakai), Pemindahtanganan, dll.
- **30-Praktik-Lapangan** — Kasus nyata, kendala, cara penyelesaian, kesalahan yang sering terjadi.
- **40-FAQ** — Tanya-jawab siap pakai (pertanyaan, jawaban, dasar hukum).
- **50-Persyaratan** — Checklist kelengkapan per jenis pengajuan.
- **60-Gaya-Surat** — Contoh surat / nota dinas yang baik + catatan gaya bahasa.
- **90-Templat** — Templat catatan Obsidian (tidak dipakai untuk menjawab).

## Aturan singkat
1. Satu catatan = satu hal (satu peraturan, satu pasal, satu FAQ, satu kasus).
2. Isi **properti** di kepala catatan (pakai templat di `90-Templat`): `jenis`, `status` (berlaku / draf / dicabut),
   `publik` (boleh dijawab ke satker lewat WhatsApp), `diperbarui`.
3. Hubungkan catatan dengan `[[Nama Catatan]]` — LifeOS memakai tautan ini untuk mengambil catatan terkait saat menjawab.
4. Peraturan yang dicabut: ubah `status: dicabut` (jangan dihapus) — AI tidak lagi memakainya untuk menjawab.
5. PDF peraturan boleh disimpan di vault (mis. di `10-Peraturan`); LifeOS mengekstrak & mengindeks isinya.

## Mengaktifkan templat di Obsidian
Settings → Core plugins → **Templates** aktif → Template folder location: `90-Templat`. Lalu buat catatan baru →
perintah *Templates: Insert template*.
