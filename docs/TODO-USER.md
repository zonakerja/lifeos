# To-Do Anda (pemilik LifeOS)

Dokumen ini berisi **semua yang perlu Anda kerjakan sendiri** agar fitur LifeOS — terutama AI Agent, basis pengetahuan,
Pengajuan, dan bot WhatsApp — benar-benar terpakai. Ditulis langkah demi langkah dengan bahasa sederhana.

- Kerjakan berurutan dari **Bagian A** (bisa sekarang, gratis, di laptop) lalu **Bagian B** (butuh VPS & domain).
- Centang `[x]` di daftar ringkas setelah selesai (atau minta Claude mencentangnya).
- Bila ada langkah yang macet, cukup tulis ke Claude: *"Saya di langkah B6.4, muncul pesan …"*.
- Dokumen teknis untuk pengembang tetap di `docs/DEPLOYMENT.md`, `docs/SETUP.md`, `docs/AI-AGENT.md`; dokumen ini
  merujuk ke sana bila perlu perintah lengkap.

> **Aturan keamanan yang selalu berlaku**: jangan pernah mengirim password, API key, token, atau kode OTP ke Claude
> lewat chat. Isi sendiri di tempatnya (halaman Pengaturan LifeOS, file `.env` di server, atau panel penyedia).

---

## Daftar ringkas

### A. Sekarang (di laptop, tanpa biaya tambahan)

- [ ] **A1** Isi API key AI (OpenAI & Gemini) dan atur pembagian tugas AI
- [ ] **A2** Pasang Obsidian dan sambungkan vault ke LifeOS
- [ ] **A3** Isi basis pengetahuan (persyaratan, peraturan, FAQ)
- [ ] **A4** Siapkan templat SK/surat dengan penanda `${…}` dan unggah
- [ ] **A5** Atur profil layanan bot, grup & kontak WhatsApp, coba bot lewat Simulator
- [ ] **A6** Coba satu alur Pengajuan sampai dokumen jadi
- [ ] **A7** (opsional) Coba asisten pribadi Hermes lewat Telegram di laptop

### B. Saat siap online (butuh biaya: VPS, domain, WhatsApp)

- [ ] **B1** Beli VPS
- [ ] **B2** Beli domain & arahkan DNS
- [ ] **B3** Pasang LifeOS di VPS
- [ ] **B4** Aktifkan backup luar server & pemantauan
- [ ] **B5** Sinkronkan vault Obsidian laptop/HP ↔ VPS (Syncthing)
- [ ] **B6** Daftarkan WhatsApp Business Cloud API dan sambungkan bot
- [ ] **B7** (opsional) Pasang Hermes pribadi di VPS

### C. Hal lain yang menunggu Anda

- [ ] **C1** Selesaikan prototipe OnTrack (API & MCP SIMAN/MyIntress) → serahkan finishing ke Claude
- [ ] **C2** Putuskan kapan robot e-Kinerja & SRIKANDI dikerjakan (tahap 6)
- [ ] **C3** Uji tulisan tangan S Pen di HP Android (Catatan Bebas)
- [ ] **C4** Push ke GitHub bila ingin cadangan kode (minta Claude, lalu cek tab Actions)

---

## A1. API key AI & pembagian tugas

**Tujuan**: LifeOS (chatbot, analisis pengajuan, bot WhatsApp, ringkasan) memakai akun AI Anda sendiri.

1. Buat API key **OpenAI**: buka <https://platform.openai.com> → login → menu **API keys** → **Create new secret key**
   → salin (hanya tampil sekali). Isi saldo/billing di menu **Billing** (bayar sesuai pemakaian).
2. Buat API key **Gemini**: buka <https://aistudio.google.com> → **Get API key** → **Create API key** → salin.
3. **Penting untuk data kantor**: key Gemini **gratis** boleh dipakai Google untuk melatih model dan dibaca reviewer
   manusia. Untuk surat/berkas kantor, aktifkan **billing** pada project Google Cloud key tersebut
   (<https://console.cloud.google.com/billing>) — setelah billing aktif, data tidak dipakai untuk pelatihan. Atau
   gunakan OpenAI untuk tugas yang menyentuh data kantor.
4. Di LifeOS: **Pengaturan → AI** → tempel key OpenAI dan key Gemini masing-masing → **Simpan** → **Uji**.
5. Masih di halaman itu, kartu **Pembagian tugas AI** — saran untuk Anda:
   - Provider aktif & **Chat & telaah** → **OpenAI** (dipakai juga untuk analisis Pengajuan & bot WhatsApp)
   - **Fitur AI lain** → Gemini (hemat)
   - **OCR** → otomatis
   - **Embedding** → Gemini bila billing sudah aktif, atau OpenAI
6. Nyalakan **Indeks pengetahuan** (kartu di halaman yang sama) bila belum.

## A2. Pasang Obsidian & sambungkan vault

**Obsidian** = aplikasi catatan gratis tempat Anda menulis pengetahuan (peraturan, persyaratan, FAQ). LifeOS membaca
folder catatan itu (disebut **vault**) dan menjadikannya bahan jawaban AI.

**Di laptop (Windows):**

1. Buka <https://obsidian.md/download> → unduh installer **Windows** (bila tersedia pilihan ARM64, pilih itu) →
   jalankan → ikuti sampai selesai.
2. Pastikan lingkungan LifeOS menyala (minta Claude "nyalakan lingkungan pengembangan").
3. Di LifeOS: **Tools → Basis Pengetahuan** → **Buat vault baru dari templat** → beri nama folder, mis. `bmn` →
   **Buat**. LifeOS membuat folder `D:\Development\Application\LifeOS\infra\knowledge-vaults\bmn` lengkap dengan
   struktur folder `00-Inbox`, `10-Peraturan`, … dan catatan *Mulai di sini*.
4. Buka Obsidian → **Open folder as vault** → pilih folder di langkah 3 → **Open**. Bila ditanya *Trust author and
   enable plugins?* pilih **Trust** (vault ini milik Anda sendiri).
5. Tulis/ubah catatan di Obsidian → simpan otomatis → dalam beberapa detik LifeOS membacanya (Tools → Basis
   Pengetahuan menampilkan jumlah catatan). Tombol **Pindai** memaksa baca ulang.

**Di HP Android (opsional, nanti setelah B5)**: pasang **Obsidian** dari Play Store; vault HP disinkronkan lewat
Syncthing (B5).

## A3. Isi basis pengetahuan

Setiap catatan diawali **properti** (blok di antara `---`). Contoh catatan persyaratan PSP di folder `50-Persyaratan`:

```markdown
---
jenis: persyaratan
status: berlaku
publik: true
diperbarui: 2026-10-20
dasar_hukum:
  - "[[Nama peraturan yang menjadi dasar]]"
---

# Persyaratan permohonan PSP BMN

1. Surat permohonan PSP ditandatangani kepala satker.
2. Daftar BMN (kode barang, NUP, nilai perolehan).
3. …
```

Arti properti:

| Properti | Isi | Pengaruh |
|---|---|---|
| `status` | `berlaku` / `draf` / `dicabut` | Hanya `berlaku` dipakai menjawab; `dicabut` tidak pernah dipakai |
| `publik` | `true` / `false` | `true` = boleh dipakai **bot WhatsApp** untuk semua kontak. Default `false` (hanya untuk Anda) |
| `grup` | daftar kode grup, mis. `[UMUM]` | Catatan hanya dipakai bot untuk anggota grup itu (mis. info khusus satker tertentu / masyarakat) |
| `diperbarui` | tanggal | Disebut bot sebagai "diperbarui …" |
| `dasar_hukum` | daftar | Disebut sebagai dasar; tautan `[[…]]` ke catatan peraturan ikut dibaca |

Yang perlu Anda tulis (prioritas):

1. `50-Persyaratan/` — satu catatan per jenis: **PSP**, **Penghapusan**, **Pemanfaatan (sewa, KSP, pinjam pakai, …)**.
   Ini dipakai fitur **Analisis kelengkapan** di Pengajuan.
2. `10-Peraturan/` — ringkasan pasal penting per peraturan (boleh juga taruh PDF peraturan di folder ini; LifeOS
   membaca isinya).
3. `40-FAQ/` — pertanyaan yang sering ditanyakan pengguna bot WhatsApp. Jawaban yang Anda kirim manual dari
   **Percakapan WA** bisa disimpan otomatis ke `00-Inbox` sebagai draf FAQ — rapikan, pindahkan ke `40-FAQ`, ubah
   `status: berlaku` dan `publik: true`.
4. `60-Gaya-Surat/` — contoh surat jawaban yang baik (gaya bahasa Anda).

## A4. Templat SK/surat

LifeOS mengisi templat Word (DOCX) secara otomatis dari data pengajuan.

1. Buka templat di Word/ONLYOFFICE. Ganti bagian yang berubah-ubah dengan **penanda** berbentuk `${nama_isian}`
   (huruf kecil, angka, garis bawah), contoh: `${nama_satker}`, `${hal}`, `${jabatan_tujuan}`, `${daftar_bmn}`.
2. Paragraf yang isinya ditulis AI → ganti seluruh paragraf dengan **petunjuk dalam kurung siku**, contoh:
   `[Paragraf pembuka: sebutkan surat permohonan satker dan dasar hukumnya.]`
3. Penanda milik SRIKANDI — `${nomor_naskah}`, `${tanggal_naskah}`, `${ttd_pengirim}` — **biarkan**; LifeOS tidak
   mengisinya.
4. Simpan sebagai `.docx` → LifeOS **Tools → ONLYOFFICE → Templat dokumen → Unggah templat**.
5. Templat yang perlu dibuat: **SK PSP**, **SK Panitia Penghapusan**, **SK/Surat Persetujuan Pemanfaatan**. Ke-29
   templat SRIKANDI yang sudah diunggah (Surat Dinas, Nota Dinas, …) langsung bisa dipakai.

## A5. Profil layanan, grup, kontak WhatsApp & Simulator

**Grup** = kelompok pengguna bot (satker, instansi, masyarakat umum, unit layanan, …). Grup yang Anda pilih untuk sebuah
nomor menentukan **data apa yang boleh diakses** nomor itu lewat bot.

1. **Pengajuan → Grup & Kontak → Profil layanan bot** → isi **Nama layanan** (mis. *Layanan Informasi BMN Kantor X*)
   dan **Topik yang dilayani** → **Simpan**. Pertanyaan di luar topik ditolak sopan oleh bot.
2. **+ Grup** → isi:
   - **Kode** (untuk satker pakai kode satker SIMAN/SAKTI; untuk lainnya bebas, mis. `UMUM`) dan **Nama**,
   - **Jenis**: Satuan kerja / Instansi / Masyarakat umum / Internal / Lainnya,
   - **Boleh mengirim berkas pengajuan** (nyalakan bila grup ini boleh mengajukan lewat WhatsApp),
   - **Anggota melihat status pengajuan seluruh grup** — nyalakan untuk satker (rekan satu kantor saling melihat),
     **matikan** untuk masyarakat umum (tiap orang hanya melihat pengajuannya sendiri).
3. **+ Kontak** → nama, nomor WhatsApp (format bebas, mis. `0812-3456-7890`), jabatan/keterangan, pilih **grup**,
   centang **Terverifikasi** hanya bila Anda yakin nomor itu benar milik orang tersebut.
4. **Pengajuan → Percakapan WA → Simulator** → pilih kontak → coba kirim:
   - pertanyaan, mis. *"Apa syarat PSP laptop?"* (dijawab dari catatan `publik: true` atau berproperti `grup` = kode
     grup kontak, dan `status: berlaku`),
   - `#status` (pengajuan seluruh grup atau milik sendiri, sesuai pengaturan grup),
   - berkas PDF/foto + keterangan (menjadi **pengajuan baru** di Antrian Verifikasi).
5. Pertanyaan yang tidak bisa dijawab bot muncul dengan tanda **Perlu dijawab** → tulis balasan → **Kirim** (opsional
   centang *Simpan juga sebagai FAQ*).
6. Selama WhatsApp belum disambungkan (B6), semua balasan berstatus **Simulasi** — tidak terkirim ke siapa pun.

## A6. Coba alur Pengajuan

1. **Pengajuan → Pengajuan Baru** → isi jenis, pemohon, nomor & tanggal surat, perihal, lampirkan berkas → **Simpan**.
2. Di detail: **Analisis dengan AI** → periksa kelengkapan (Ada / Tidak ada / Perlu dicek).
3. **Telaah dengan AI** → periksa telaah & konsep jawaban; ubah bila perlu (ikon pensil).
4. **Buat dari templat** → pilih templat → **Isi dengan AI** → periksa isian → **Buat dokumen** → rapikan di
   ONLYOFFICE.
5. Putuskan: **Setujui** → (setelah diproses di SRIKANDI) **Tandai sudah dikirim**, atau **Tolak / kembalikan** dengan
   alasan. Bila pengajuan datang dari WhatsApp, pemohon otomatis diberi kabar.
6. Beri masukan ke Claude soal format telaah/konsep yang Anda inginkan.

## A7. (Opsional) Asisten pribadi Hermes lewat Telegram di laptop

Hermes = agen AI yang Anda ajak chat lewat Telegram; ia memakai LifeOS lewat **MCP** (mencari pengetahuan, melihat
agenda/tugas, mencatat pengajuan). Untuk mencoba di laptop:

1. **Buat token LifeOS**: **Pengaturan → Integrasi → Buat token** → nama `Hermes laptop`, izin yang diperlukan
   (mis. baca pengetahuan, baca data kerja, baca & catat pengajuan), masa berlaku 30 hari → **salin token** dan
   **contoh konfigurasi Hermes** yang tampil.
2. **Buat bot Telegram**: di Telegram cari **@BotFather** → kirim `/newbot` → isi nama & username berakhiran `bot` →
   simpan token yang diberikan (rahasia).
3. **Cari ID Telegram Anda**: kirim pesan ke **@userinfobot** → catat angka ID.
4. **Pasang Hermes di WSL Ubuntu** — buka PowerShell, ketik `wsl`, lalu:

   ```bash
   curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
   source ~/.bashrc
   hermes model            # pilih provider & model (pakai API key OpenAI/Gemini Anda)
   hermes gateway setup    # pilih Telegram, isi token bot & ID Telegram Anda
   ```

5. Tambahkan MCP LifeOS: buka `~/.hermes/config.yaml` (`nano ~/.hermes/config.yaml`) dan tempel bagian
   `mcp_servers` dari contoh konfigurasi di langkah 1. Dari WSL, alamat LifeOS di laptop adalah
   `http://<IP Windows>:4000/api/v1/mcp` (minta Claude membantu mengisi alamat ini).
6. Jalankan `hermes gateway` → kirim pesan ke bot Telegram Anda, mis. *"Cari ketentuan PSP di basis pengetahuan saya"*.
7. Hermes **pribadi** ini hanya untuk Anda (`TELEGRAM_ALLOWED_USERS` = ID Anda). Bot untuk pengguna layanan **bukan** Hermes,
   melainkan bot WhatsApp bawaan LifeOS (B6).

---

## B1. Beli VPS

**VPS** = komputer sewaan di internet tempat LifeOS berjalan 24 jam.

**Spesifikasi yang disarankan**

| Pemakaian | RAM / CPU | Disk |
|---|---|---|
| LifeOS + bot WhatsApp | 4 GB / 2 vCPU | ≥ 40 GB SSD |
| + ONLYOFFICE (editor dokumen) | **8 GB / 4 vCPU** (disarankan) | ≥ 60 GB |
| + Hermes pribadi + robot (nanti) | 12–16 GB / 4–6 vCPU | ≥ 80 GB |

Syarat penyedia: sistem operasi **Ubuntu 24.04 LTS**, akses **root/SSH** penuh (bukan shared hosting/cPanel), **IPv4
publik**, port **80 & 443** tidak diblokir, lokasi **Jakarta** (atau Singapura). Bandingkan beberapa penyedia VPS lokal
maupun internasional; pilih yang punya fitur *snapshot*.

**Langkah**

1. Buat akun di penyedia pilihan → pilih paket sesuai tabel → OS **Ubuntu 24.04** → lokasi Jakarta.
2. Buat **SSH key** di laptop (sekali saja) — PowerShell:

   ```powershell
   ssh-keygen -t ed25519
   ```

   Tekan Enter untuk lokasi bawaan, isi *passphrase* (catat di password manager). Lalu tampilkan kunci publiknya:

   ```powershell
   Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
   ```

   Salin teks yang muncul ke kolom **SSH key** saat membuat VPS.
3. Selesaikan pembayaran → catat **alamat IP** VPS.
4. Coba masuk: `ssh root@<IP-VPS>` (ketik `yes` saat ditanya). Berhasil = muncul prompt `root@…`.

## B2. Beli domain & DNS

1. Beli domain di registrar (penjual domain) mana pun, mis. `namaanda.id` atau `.com`. Bisa juga memakai subdomain
   dari domain yang sudah Anda punya.
2. Di panel DNS registrar, tambahkan **record A**: Nama `lifeos` (atau `@`) → Nilai = **IP VPS**. Bila memakai
   Cloudflare, set ke **DNS only** (awan abu-abu).
3. Tunggu beberapa menit, lalu cek di PowerShell: `nslookup lifeos.namaanda.id` → harus menampilkan IP VPS.
4. Alamat aplikasi nanti: `https://lifeos.namaanda.id`.

## B3. Pasang LifeOS di VPS

Ikuti `docs/DEPLOYMENT.md` §0.4 → §1 → §1.2 → §2 (perintah bisa disalin apa adanya). Ringkasnya:

1. Masuk VPS (`ssh root@<IP>`), buat user biasa, pasang Docker, nyalakan firewall (§1).
2. Amankan SSH (§1.2).
3. `git clone https://github.com/zonakerja/lifeos.git`, salin `.env.example` → `.env`, isi domain, email, dan semua
   rahasia (`openssl rand -hex 32` untuk tiap rahasia). **Simpan salinan `.env` di password manager.**
4. `docker compose -f docker-compose.prod.yml up -d --build`, lalu buat akun admin (§2).
5. Buka `https://<domain>` → login → ganti password admin.
6. ONLYOFFICE (bila VPS 8 GB): §9. Isi API key AI lagi di Pengaturan → AI (server baru).

Tidak yakin? Minta Claude memandu sambil Anda menjalankan perintah, satu per satu.

## B4. Backup luar server & pemantauan

1. Buat akun **Cloudflare** → **R2** → buat bucket (mis. `lifeos-backup`) → buat **API token R2** (izin
   *Object Read & Write*) → catat *Access Key ID*, *Secret*, dan *endpoint*. Detail: DEPLOYMENT §4.1.
2. Isi `OFFSITE_S3_*` dan `BACKUP_ENCRYPTION_PASSWORD` di `.env` → `docker compose -f docker-compose.prod.yml up -d`.
   **Simpan `BACKUP_ENCRYPTION_PASSWORD` di password manager** — tanpa ini backup tidak bisa dibuka.
3. Buat akun **healthchecks.io** → buat check harian → isi URL-nya ke `BACKUP_HEALTHCHECK_URL` (§5.1).
4. Daftarkan pemantau uptime (mis. UptimeRobot) untuk `https://<domain>/api/v1/health`.

## B5. Sinkron vault Obsidian (Syncthing)

**Syncthing** menyalin folder vault antara laptop, HP, dan VPS secara otomatis (gratis, tanpa cloud pihak ketiga).

1. **Laptop**: unduh dari <https://syncthing.net/downloads/> (untuk Windows tersedia installer "Syncthing Windows
   Setup" yang membuat Syncthing berjalan otomatis) → buka antarmuka web <http://localhost:8384>.
2. **HP Android** (opsional): pasang **Syncthing-Fork** (Play Store/F-Droid).
3. **VPS**: ikuti DEPLOYMENT §10 (pasang paket `syncthing`, buka antarmukanya hanya lewat tunnel SSH).
4. Di laptop: **Add Remote Device** → masukkan *Device ID* VPS (dan HP). Lalu bagikan folder vault Anda ke perangkat
   tersebut; di VPS arahkan ke `…/lifeos/knowledge-vaults/<nama folder>`.
5. Di LifeOS (VPS): **Tools → Basis Pengetahuan → Pakai folder yang sudah ada** → pilih folder itu.

## B6. WhatsApp Business Cloud API (bot layanan)

Bot memakai **jalur resmi Meta** (bukan WhatsApp Web), jadi nomor tidak berisiko diblokir. Butuh: VPS + domain
HTTPS (B1–B3) dan **nomor HP khusus** untuk bot (jangan nomor WhatsApp pribadi; nomor itu tidak bisa sekaligus dipakai
di aplikasi WhatsApp biasa).

Nama menu Meta bisa sedikit berubah; ikuti yang paling mirip. Panduan resmi: <https://developers.facebook.com/docs/whatsapp/cloud-api/get-started>.

1. **Akun Meta Business**: buka <https://business.facebook.com> → buat akun bisnis (nama instansi/unit kerja, email
   dinas).
2. **Aplikasi Meta**: <https://developers.facebook.com> → **My Apps → Create App** → pilih kegunaan yang
   berhubungan dengan **WhatsApp** (*Connect with customers through WhatsApp*) → pilih akun bisnis dari langkah 1.
3. Di aplikasi → **WhatsApp → API Setup**: Meta memberi **nomor uji** gratis. Catat **Phone number ID**. Tambahkan
   nomor HP Anda sebagai penerima uji untuk mencoba.
4. **Tambahkan nomor asli**: di halaman yang sama → **Add phone number** → isi nama tampilan (mis. *Layanan BMN …*),
   verifikasi lewat SMS/telepon → nama tampilan menunggu persetujuan Meta. Catat **Phone number ID** nomor asli.
5. **Token permanen**: <https://business.facebook.com> → **Settings → Users → System users** → **Add** (peran Admin) →
   **Assign assets**: aplikasi (Full control) dan akun WhatsApp → **Generate token** → pilih aplikasi, izin
   `whatsapp_business_messaging` dan `whatsapp_business_management`, masa berlaku **Never** → salin token (rahasia).
6. **App Secret**: di aplikasi → **App settings → Basic** → **App secret** → **Show** → salin (rahasia).
7. **Verify token**: buat sendiri teks acak minimal 16 karakter (di VPS: `openssl rand -hex 16`).
8. Isi `.env` di VPS:

   ```bash
   WHATSAPP_PHONE_NUMBER_ID=<Phone number ID>
   WHATSAPP_ACCESS_TOKEN=<token permanen langkah 5>
   WHATSAPP_APP_SECRET=<App secret langkah 6>
   WHATSAPP_VERIFY_TOKEN=<teks acak langkah 7>
   WHATSAPP_OWNER_EMAIL=<email akun LifeOS Anda>
   ```

   lalu `docker compose -f docker-compose.prod.yml up -d`.
9. **Daftarkan webhook**: di aplikasi Meta → **WhatsApp → Configuration → Webhook → Edit** → Callback URL
   `https://<domain>/api/v1/whatsapp/webhook`, Verify token = isi langkah 7 → **Verify and save** → pada daftar
   *Webhook fields* **Subscribe** `messages`.
10. Di LifeOS **Pengajuan → Percakapan WA** kartu status berubah menjadi **Bot WhatsApp aktif**. Dari HP lain yang
    sudah didaftarkan sebagai kontak terverifikasi (A5), kirim pesan ke nomor bot → balasan muncul di WhatsApp dan di
    LifeOS.
11. **Verifikasi bisnis** (Meta → Security Center) agar batas jumlah percakapan naik dan nama tampilan disetujui.
12. Umumkan nomor bot ke pengguna (satker/masyarakat) beserta cara pakainya: bertanya, `#status`, kirim berkas pengajuan.

Hal yang perlu diketahui:
- **Biaya**: Meta menagih per pesan sesuai kategori; membalas pesan satker dalam 24 jam (pesan layanan) umumnya tidak
  dikenai biaya. Cek halaman harga WhatsApp Business Platform sebelum go-live.
- **Jendela 24 jam**: LifeOS hanya bisa mengirim pesan bebas ≤ 24 jam sejak satker terakhir mengirim pesan. Kabar status
  pengajuan setelah itu dicatat **Gagal kirim** (perlu pesan templat — bisa ditambahkan nanti).
- **Kebijakan Meta**: bot harus khusus tugas (BMN/kedinasan), bukan asisten AI serba-guna — sudah diatur di LifeOS
  (pertanyaan di luar topik ditolak).

## B7. (Opsional) Hermes pribadi di VPS

Sama seperti A7, tetapi dipasang di VPS agar menyala 24 jam. Gunakan alamat MCP `https://<domain>/api/v1/mcp` dan
token baru dari **Pengaturan → Integrasi** (cabut token laptop). Jalankan `hermes gateway start` dan pastikan hanya ID
Telegram Anda yang diizinkan. Minta Claude menyiapkan service otomatis (systemd) saat Anda sampai di langkah ini.

---

## C. Lain-lain

- **C1 OnTrack**: selesaikan prototipe modul SIMAN/MyIntress + REST API ber-API key + MCP di repo OnTrack (port
  5174/3000/5433/6380). Setelah siap, minta Claude: *"lanjut tahap 5b konektor OnTrack"*.
- **C2 Robot e-Kinerja & SRIKANDI** (tahap 6): dibahas setelah VPS & bot WhatsApp berjalan. LifeOS tidak akan
  menyimpan password atau kode OTP akun pemerintah; login tetap Anda yang lakukan.
- **C3 S Pen**: buka LifeOS di HP Android → Notes → Catatan Bebas → **Tulis tangan** → coba menulis & menghapus dengan
  tombol S Pen → laporkan hasilnya.
- **C4 GitHub**: minta Claude *"push ke GitHub"*, lalu buka tab **Actions** di repo untuk memastikan centang hijau.

---

## Riwayat dokumen

| Tanggal | Perubahan |
|---|---|
| 2026-10-24 | Dibuat: to-do AI (A1–A7), VPS & online (B1–B7, termasuk WhatsApp Cloud API), lain-lain (C1–C4) |
| 2026-10-24 | A3 & A5 diperbarui: grup kontak umum (bukan hanya satker), profil layanan bot, properti `grup` |
