# AI Agent — Riset & Rencana Integrasi

Status: **riset selesai 2026-10-17, menunggu keputusan user (§6)**. Belum ada kode/infra yang diubah. Dokumen ini
menjadi acuan thread integrasi AI Agent: penjelasan istilah, hasil riset OpenClaw / Hermes Agent / n8n, kondisi LifeOS,
pilihan arsitektur, rekomendasi, dan daftar tugas (user & Claude). Kebutuhan dari user:
1. **Agen SRIKANDI** (mengambil PDF final bertanda tangan elektronik lalu menautkannya ke konsep) dan **agen pembuat
   dokumen bertemplat**, dikelompokkan di menu **Tools** ([ONLYOFFICE.md §3.7](ONLYOFFICE.md)).
2. **Knowledge AI terspesialisasi** (§2.4): user sendiri memberi pengetahuan & "melatih" AI agar pengetahuannya sama
   dengan user tanpa harus memberi input berulang.
3. **Agen e-Kinerja Kemenhub** (§2.5): mengirim & mengambil data dengan akun e-Kinerja user.
4. **Agen SIMAN** (§2.6): koneksi ke aplikasi SIMAN (BMN, DJKN Kemenkeu).

> Catatan sumber: angka versi/port diambil dari dokumentasi resmi per 17 Okt 2026. Ketiga proyek rilis sangat cepat
> (mingguan) → saat memasang, selalu cek halaman resmi dan **pin tag versi** (jangan `latest`).

## 1. Istilah singkat (untuk yang belum familier)

| Istilah | Arti sederhana | Contoh di LifeOS |
|---|---|---|
| **AI biasa (chat/generate)** | Model menjawab satu pertanyaan. Tidak bisa melakukan apa pun di luar teks. | `POST /ai/generate` saat ini: ringkas berkas, sarankan ikon. |
| **AI Agent** | Model yang diberi **alat (tools)** — mis. "cari catatan", "buat todo", "unggah berkas" — lalu memutuskan sendiri alat mana dipanggil, berulang sampai tugas selesai. | "Buat nota dinas undangan rapat dari templat, isi dari agenda besok, simpan ke Project X." |
| **Tool calling / function calling** | Fitur API Gemini/Claude/OpenAI tempat model menjawab "panggil fungsi X dengan argumen Y". Dasar teknis semua agent. | Belum dipakai LifeOS (klien provider hanya teks + lampiran). |
| **MCP (Model Context Protocol)** | Standar terbuka "colokan USB" antara agent dan aplikasi: aplikasi membuka **MCP server** berisi daftar tools; agent apa pun (Claude Desktop, Hermes, OpenClaw, n8n, …) bisa memakainya tanpa integrasi khusus. | Usulan: **MCP server LifeOS** (§5). |
| **Workflow automation** | Alur kerja berupa kotak-kotak tersambung yang berjalan otomatis (pemicu → langkah → langkah). Deterministik: selalu sama, mudah diaudit. Bisa memuat langkah AI. | n8n: "setiap pagi jam 7 ambil berkas dari folder/email → unggah ke LifeOS". |
| **Gateway / channel** | Agent pribadi berjalan terus di server dan diajak bicara lewat Telegram/WhatsApp/Discord. | OpenClaw & Hermes. |
| **Skill** | Paket instruksi/skrip yang menambah kemampuan agent. Dari marketplace = kode pihak ketiga (risiko). | ClawHub (OpenClaw), skill Hermes (standar agentskills.io). |
| **Prompt injection** | Teks berbahaya di dokumen/web yang "menyuruh" agent melakukan hal lain (mis. mengirim data). Risiko utama agent. | Dokumen yang dibaca agent harus dianggap data, bukan perintah. |

## 2. Hasil riset ketiga kandidat

### 2.1 Ringkasan perbandingan

| | **n8n** | **Hermes Agent** (Nous Research) | **OpenClaw** |
|---|---|---|---|
| Jenis | **Platform workflow automation** (+ node AI Agent) | **Agent pribadi** yang "tumbuh": memori, skill dibuat sendiri, cron | **Agent pribadi / asisten** di aplikasi chat |
| Cara pakai | Editor visual di browser (kotak & panah) | Chat lewat CLI / Telegram / Discord / Slack / WhatsApp / Signal / email | Chat lewat 20+ channel (WhatsApp, Telegram, Discord, Slack, Teams, …) + dashboard |
| Lisensi | **Sustainable Use License** (source-available, bukan open source OSI): gratis untuk pemakaian internal/pribadi; **dilarang** menjadikan n8n layanan untuk pihak lain / membiarkan user eksternal membuat workflow lewat produk kita | **MIT** | **MIT** |
| Image Docker | `n8nio/n8n` (tag `stable` ≈ 2.43.x saat riset) | `nousresearch/hermes-agent` (tag versi `X.Y.Z`, amd64 + arm64) | `ghcr.io/openclaw/openclaw` (mirror `openclaw/openclaw`), tag versi `2026.x.y`, varian `-browser`; amd64 + arm64 |
| Port bawaan | 5678 (UI + webhook) | 8642 (API kompatibel OpenAI, opsional) · 9119 (dashboard, opsional) | 18789 (gateway + dashboard) |
| Data | `/home/node/.n8n` + database (SQLite default, **PostgreSQL** disarankan) | `/opt/data` (config, `.env` berisi key, sesi, memori, skill; SQLite) | `/home/node/.openclaw` (state, config, token) |
| Penyedia AI | Kredensial di n8n (Gemini, Claude, OpenAI, Ollama, …) | `config.yaml` (OpenRouter, OpenAI, Anthropic, endpoint kustom, lokal) | Plugin provider (Claude, OpenAI/Codex, lokal) |
| MCP | **Ya, dua arah**: *MCP Server Trigger* (n8n menjadi MCP server, SSE/HTTP) dan *MCP Client Tool* (agent n8n memakai MCP server lain) | **Ya (klien)**: `mcp_servers` di `config.yaml` (stdio / HTTP + header), filter tools per server; katalog resmi (`hermes mcp install n8n`) | Lewat plugin/skill (tidak menonjol di dokumentasi utama) |
| Browser otomatis | Tidak bawaan (butuh node komunitas / layanan luar) | **Ya** (image memuat Chromium) | **Ya** (varian `-browser`, Playwright) |
| Kekuatan | Alur terjadwal yang pasti & mudah diaudit; ratusan integrasi (email, Google Drive, HTTP, DB) | Memori jangka panjang, cron bahasa alami, belajar skill sendiri, dashboard berautentikasi | Paling populer, banyak channel, ekosistem skill besar |
| Risiko / catatan | Lisensi membatasi bila LifeOS kelak dijual sebagai layanan; fitur enterprise (SSO, audit log) berbayar | Proyek muda & cepat berubah; SQLite **bisa rusak di bind mount VM** (`/mnt/d` WSL = 9p) → pakai named volume | **Catatan keamanan berat 2026**: ratusan skill berbahaya di ClawHub (pencuri kredensial), CVE-2026-25253 (CVSS 8.8), puluhan ribu instance terbuka tanpa autentikasi; agent bisa menjalankan perintah shell |
| RAM kira-kira | ± 0,5–1 GB (+ PostgreSQL bersama) | contoh compose resmi: batas 4 GB / 2 core (Chromium) | ± 1–2 GB (lebih dengan browser); build dari source ≥ 6 GB |

### 2.2 Posisi masing-masing (kesimpulan)

- **n8n ≠ agent pribadi.** n8n adalah "ban berjalan" otomatisasi. Cocok untuk pekerjaan yang **langkahnya sudah jelas**
  dan berulang (ambil berkas dari email/folder → unggah ke LifeOS → tautkan). Paling mudah diaudit dan paling kecil
  risikonya.
- **Hermes & OpenClaw = asisten pribadi yang selalu menyala** (seperti "Jarvis" di Telegram). Cocok untuk perintah
  bebas lewat chat ("tambahkan todo besok jam 9", "ringkas notulen kemarin"). Keduanya butuh **akses ke LifeOS** lewat
  API/MCP — tanpa itu mereka tidak tahu apa pun tentang data LifeOS.
- **Hermes vs OpenClaw**: fungsinya mirip. Hermes lebih baru tetapi desain keamanannya lebih ketat secara default
  (dashboard wajib login di bind non-loopback, menolak berjalan sebagai root, hard-stop loop tool). OpenClaw lebih
  populer tetapi punya riwayat keamanan buruk 2026; bila dipilih: **tanpa skill ClawHub**, gateway hanya localhost,
  sandbox aktif, versi terbaru.
- **Agen pembuat dokumen bertemplat tidak butuh ketiganya.** Semua bahan sudah ada di LifeOS (templat, ONLYOFFICE,
  `AiService`, data agenda/project) → paling aman & rapi dibuat **di dalam backend LifeOS** (tool calling + pengisian
  templat), memakai provider & key milik user seperti fitur AI lain.

### 2.3 SRIKANDI

- SRIKANDI (Sistem Informasi Kearsipan Dinamis Terintegrasi; ANRI, KemenPANRB, Kominfo, BSSN) **tidak memiliki
  dokumentasi API publik** untuk mengunduh naskah/dokumen bertanda tangan elektronik (hasil pencarian hanya regulasi &
  panduan pemakaian; jalur dukungan resmi: helpdesk ANRI).
- Pilihan teknis untuk "agen SRIKANDI":
  1. **API resmi** (terbaik) — hanya bila instansi/ANRI memberi akses integrasi. Perlu ditanyakan ke admin SRIKANDI
     instansi / helpdesk ANRI.
  2. **Otomasi browser** (Hermes/OpenClaw/Playwright login sebagai user lalu mengunduh PDF) — rapuh (tampilan berubah →
     rusak), butuh menyimpan kredensial SSO/akun pemerintah di server, mungkin terhalang CAPTCHA/OTP, dan **bisa
     melanggar ketentuan penggunaan sistem pemerintah**. Tidak disarankan sebelum ada izin tertulis dari pengelola.
  3. **Semi-otomatis (aman, bisa langsung)** — user mengunduh PDF dari SRIKANDI seperti biasa, lalu LifeOS
     mempermudah: unggah massal / folder pantau / alamat email masuk → agent **mencocokkan PDF dengan konsepnya**
     (nomor surat, perihal, tanggal dibaca dari teks PDF) lalu menautkan lewat `PUT /office/files/:id/draft`
     (endpoint sudah ada). Ini memberi ± 80% manfaat tanpa risiko kredensial.

### 2.4 Knowledge AI terspesialisasi ("AI yang tahu pekerjaan saya")

Ada tiga cara membuat AI "tahu" pengetahuan khusus. Hasil riset:

| Cara | Apa yang terjadi | Cocok untuk | Kendala |
|---|---|---|---|
| **Fine-tuning** ("melatih ulang model") | Model dilatih lagi dengan ratusan–ribuan contoh tanya-jawab → pengetahuan "tertanam" di model. | Gaya bahasa & format tetap (mis. gaya surat dinas). | **Gemini API sudah tidak menyediakan tuning** (pindah ke Vertex AI/Google Cloud), **Claude tidak menyediakan fine-tuning** di API publik, hanya OpenAI. Terikat satu provider (bertentangan dengan multi-provider LifeOS). Pengetahuan yang tertanam **tidak bisa diperbarui/dihapus** (aturan berubah → latih ulang), mahal, dan model tetap bisa mengarang fakta. Riset umum: fine-tuning membantu gaya, **jarang** memperbaiki pengetahuan faktual. |
| **RAG** (pencarian pengetahuan) | Pengetahuan disimpan di database; setiap pertanyaan, potongan yang relevan dicari lalu diberikan ke AI bersama sumbernya. | Fakta, regulasi, SOP, data pekerjaan yang terus bertambah. | Kualitas bergantung pada kerapian sumber. **Sudah ada** di LifeOS (`ai_chunks`, pgvector, My Notebook bersitasi). |
| **Instruksi & memori tetap** | Profil + aturan kerja + memori yang disetujui user selalu ikut di setiap permintaan AI. | Hal yang harus selalu diingat: jabatan, unit, singkatan, preferensi, gaya. | Harus ringkas (masuk setiap prompt). |

**Rekomendasi: "Basis Pengetahuan Saya" = gabungan RAG + instruksi/memori tetap + contoh gaya, bukan fine-tuning.**
Bekerja dengan semua provider (Gemini/Claude/OpenAI), bisa diperbarui kapan saja, setiap jawaban menunjukkan sumbernya,
dan data tetap di server LifeOS. Isinya (usulan):
1. **Profil kerja & instruksi tetap** — jabatan, unit kerja, tugas pokok, istilah/singkatan instansi, gaya bahasa,
   aturan ("selalu rujuk KM terbaru", "format tanggal …"). Diisi user sekali, ikut di setiap fitur AI (chatbot, Notes AI,
   agen dokumen, My Notebook).
2. **Koleksi pengetahuan** — dokumen yang user unggah/tandai sebagai pengetahuan (regulasi, SOP, juknis, contoh surat,
   catatan pengalaman) + **catatan pengetahuan** pendek (tanya-jawab / fakta). Memakai indeks RAG yang ada, diberi
   prioritas & label "pengetahuan resmi" di atas data harian. Bisa diberi masa berlaku / diganti versi baru.
3. **Memori otomatis yang disetujui** — saat chat, AI mengusulkan "simpan fakta ini?" (mis. "Kepala Bagian = Bpk. X") →
   user menyetujui/menyunting → masuk memori. Tidak ada yang tersimpan tanpa persetujuan; daftar memori bisa dihapus.
4. **Contoh gaya (few-shot)** — pasangan "permintaan → hasil yang bagus" (mis. nota dinas yang disetujui atasan) agar
   agen dokumen meniru gaya user. Ini "melatih" tanpa fine-tuning.
5. **Uji pengetahuan** — daftar pertanyaan + jawaban benar menurut user; tombol "Uji" menilai apakah AI sudah menjawab
   seperti user (dipakai setiap mengganti provider/model).

Fine-tuning tetap bisa ditambahkan nanti (khusus OpenAI, untuk gaya) bila contoh sudah ratusan — data contoh dari poin 4
bisa diekspor menjadi set latih.

### 2.5 e-Kinerja Kemenhub

- Aplikasi: **[e-kinerja.kemenhub.go.id](https://e-kinerja.kemenhub.go.id/)** — login memakai **akun SIK** (Sistem
  Informasi Kepegawaian Kemenhub); dipakai untuk SKP, matriks pembagian peran hasil (MPPH), realisasi & umpan balik,
  terintegrasi dengan e-Kinerja BKN. Dasar: Permen PANRB 6/2022 dan **KM 254 Tahun 2022** (juknis manajemen kinerja
  pegawai Kemenhub). Ada juga aplikasi lama/terkait **AP2KP** (ap2kp.dephub.go.id: SKP, log harian, tukin).
- **Tidak ditemukan API publik** untuk aplikasi pegawai. Integrasi resmi biasanya hanya antarsistem instansi (mis. ke
  BKN), bukan untuk aplikasi pribadi.
- Data yang paling berguna: LifeOS **sudah mencatat** todo, action/task, agenda + hasil, notulen (Notes AI), dokumen →
  bahan **realisasi kinerja & bukti dukung**.
- Pilihan:
  1. **Asisten pengisian (aman, bisa langsung)** — LifeOS menyusun rekap realisasi per periode/rencana hasil kerja SKP
     (AI merangkum task & agenda selesai + tautan bukti dukung, berkas bukti siap unduh/ZIP) → user menyalin/mengunggah
     sendiri ke e-Kinerja. **Ambil data**: user mengekspor/mengunduh SKP (PDF/Excel) → diimpor ke LifeOS (AI membaca,
     membuat struktur Area/Kegiatan sesuai rencana hasil kerja) sehingga pekerjaan harian tertaut ke SKP.
  2. **Ekstensi browser "isi otomatis"** — berjalan di browser user yang **sudah login sendiri**; ekstensi mengisi
     formulir dari data LifeOS, user memeriksa & menekan Simpan/Kirim sendiri. Kredensial tidak pernah disimpan LifeOS.
     Tetap rapuh bila tampilan e-Kinerja berubah.
  3. **Robot dengan akun tersimpan** (agent login sendiri memakai username/password SIK user, mengirim data otomatis) —
     **tidak direkomendasikan**: akun SIK adalah akun kepegawaian resmi (kemungkinan juga membuka data kepegawaian lain),
     menyimpan kata sandinya di server = risiko besar bila bocor; data e-Kinerja adalah **pernyataan resmi kinerja ASN**
     yang harus diperiksa manusia sebelum dikirim; bisa melanggar ketentuan keamanan sistem instansi (SPBE) / aturan akun
     personal; login bisa butuh OTP/CAPTCHA. Hanya layak bila ada izin tertulis Biro SDM/Pusdatin, dan sebaiknya lewat
     API resmi.
  4. **API resmi** — tanyakan ke pengelola (Biro Kepegawaian & Organisasi / Pusdatin Kemenhub).

### 2.6 SIMAN (Sistem Informasi Manajemen Aset Negara)

- **SIMAN v2** milik DJKN Kemenkeu untuk pengelolaan **Barang Milik Negara (BMN)**: berbasis web, wajib untuk semua
  K/L sejak implementasi penuh Juli–Des 2024; dasar **PMK 118/2023**; terintegrasi dengan **SAKTI** (aplikasi keuangan
  satker) dan rencana tanda tangan digital (NADINE); ada aplikasi **SIMAN 2 Mobile** (sensus/inventarisasi BMN).
- **Tidak ditemukan dokumentasi API** untuk pihak luar — integrasi yang ada hanya antarsistem Kemenkeu (SAKTI). Akun
  SIMAN adalah akun operator/pejabat satker → transaksi BMN berdampak hukum & laporan keuangan negara.
- Pilihan sama dengan e-Kinerja: (1) **asisten** — LifeOS menyimpan/menyiapkan data pendukung (daftar barang, foto
  kondisi, BAST, dokumen penetapan status, jadwal pemeliharaan/sensus sebagai agenda, pengingat batas pelaporan), AI
  membaca ekspor SIMAN (Excel/PDF laporan) untuk rekap & pencarian, user menginput ke SIMAN sendiri; (2) ekstensi isi
  otomatis di browser user; (3) robot berakun tersimpan — **tidak direkomendasikan** (alasan sama, ditambah transaksi
  BMN); (4) API resmi lewat DJKN/pengelola BMN instansi.
- Perlu diketahui dulu: peran user di SIMAN (operator BMN satker? pejabat penatausahaan? hanya melihat?) dan data apa
  yang sering diinput/diambil.

### 2.7 Prinsip untuk agen yang terhubung ke aplikasi pemerintah (SRIKANDI, e-Kinerja, SIMAN)

1. **API resmi dulu**; tanpa API → mode asisten (LifeOS menyiapkan, user mengirim).
2. **LifeOS tidak menyimpan kata sandi akun pemerintah** (SIK, SSO ASN, SIMAN, SRIKANDI). Bila otomasi browser kelak
   diizinkan, berjalan di browser/sesi user sendiri.
3. **Manusia menekan tombol kirim** untuk data resmi (realisasi kinerja, transaksi BMN, naskah dinas).
4. Data kantor yang dikirim ke provider AI mengikuti kebijakan instansi (klasifikasi informasi; pertimbangkan model
   lokal untuk data rahasia — di luar cakupan tahap awal).

## 3. Kondisi LifeOS saat ini (titik sambung & yang belum ada)

| Sudah ada | Belum ada (dibutuhkan agent) |
|---|---|
| AI multi-provider di backend, key per user terenkripsi (`src/ai/`) | **Tool calling** di klien provider (Gemini/Claude/OpenAI hanya teks + lampiran) |
| RAG: `AiIndexService.search` (vektor + kata) | **Token akses untuk program luar** — auth sekarang hanya JWT 15 menit + cookie browser; agent/n8n tidak bisa login dengan cara itu |
| Records API seragam (`/records/:type`), uploads, ONLYOFFICE (`/office/documents { templateId }`, tautan konsep ↔ final) | **MCP server LifeOS** (daftar tools yang aman) |
| Isolasi data per user + berbagi (`ShareAccessService`) | Log aktivitas agent + konfirmasi sebelum aksi yang mengubah data |
| BullMQ + Redis (antrian job) | Penjadwal tugas agent per user |

Prinsip yang wajib dijaga (CLAUDE.md §8): agent **selalu bertindak sebagai satu user** (tidak ada akses "admin melihat
semua"), API key AI tetap di backend, domain eksternal tidak dipanggil dari browser (CSP).

## 4. WSL & Docker (catatan pemasangan)

- Semua kandidat punya image **arm64** → jalan native di WSL Ubuntu aarch64 laptop user dan di VPS.
- Usulan: service baru di `docker-compose.yml` dengan **profile `agent`** (seperti `office`) agar tidak ikut menyala
  bila tidak dipakai. **Port baru** (perlu masuk aturan port CLAUDE.md §2): n8n **5678**, Hermes **8642/9119**,
  OpenClaw **18789** — hanya yang dipilih, bind `127.0.0.1` saja.
- Jaringan: container di WSL **tidak** menjangkau backend Windows lewat `host.docker.internal`; pakai IP gateway WSL
  (pola `ONLYOFFICE_BACKEND_URL=auto` yang sudah ada). Di produksi cukup `http://backend:4000` di jaringan compose.
- Data: **named volume**, bukan bind mount `/mnt/d/...` (SQLite Hermes/n8n bisa rusak di 9p/virtiofs). n8n memakai
  database `n8n` di PostgreSQL yang sama (DB terpisah) agar ikut backup harian.
- Jangan me-mount `/var/run/docker.sock` ke agent (sandbox OpenClaw memakainya) kecuali benar-benar perlu — itu setara
  akses root ke host.
- Produksi: lewat Caddy dengan login (atau tidak dibuka sama sekali; akses lewat Telegram/SSH tunnel). VPS 8 GB
  (rekomendasi ONLYOFFICE) masih cukup untuk n8n; Hermes/OpenClaw dengan Chromium menambah ± 1–2 GB.

## 5. Rekomendasi arsitektur (bertahap)

Prinsipnya: **LifeOS menjadi "sumber kebenaran" + penyedia tools; agent luar hanya klien.** Dengan begitu pilihan
agent bisa diganti kapan saja tanpa mengubah LifeOS.

| Tahap | Isi | Butuh agent luar? |
|---|---|---|
| **K. Basis Pengetahuan Saya** (§2.4) | Menu baru (Pengaturan → AI atau Tools → Pengetahuan): profil kerja & instruksi tetap, koleksi pengetahuan (dokumen + catatan pengetahuan, prioritas di RAG), memori usulan AI yang disetujui, contoh gaya, uji pengetahuan. Disuntikkan ke semua fitur AI LifeOS. | Tidak |
| **A. Fondasi** | (1) **Token akses pribadi** (Pengaturan → Integrasi): dibuat user, cakupan dipilih (baca / tulis per modul), bisa dicabut, disimpan ter-hash, kedaluwarsa; (2) **MCP server LifeOS** `POST /api/v1/mcp` (HTTP streamable) berisi tools terbatas: cari pengetahuan (RAG), baca/buat todo & agenda, buat catatan, daftar templat, buat dokumen dari templat, unggah & tautkan berkas final; (3) **log aktivitas agent** per token. Semua lewat izin user pemilik token. | Tidak (bisa diuji dengan Claude Desktop / MCP Inspector) |
| **B. Agen dokumen bertemplat** (Tools → Agen Dokumen) | Di backend: user memilih templat + memberi instruksi/sumber (agenda, project, catatan) → AI (tool calling provider user) menyusun isi → templat diisi (placeholder DOCX atau ONLYOFFICE Document Builder) → dokumen baru dibuka di ONLYOFFICE untuk diperiksa. | Tidak |
| **C. Agen dokumen final / "SRIKANDI semi-otomatis"** | Unggah massal PDF final → ekstraksi teks (sudah ada) → AI mencocokkan ke konsep (nomor/perihal/tanggal) → usulan tautan, user menyetujui → `PUT /office/files/:id/draft` + Resource Global + File Control. | Tidak |
| **D. Otomasi n8n** (opsional) | n8n di profile `agent`, memakai token akses + MCP/REST LifeOS: mis. email masuk berisi PDF → tahap C; laporan mingguan otomatis. | n8n |
| **E. Asisten chat pribadi** (opsional) | **Hermes Agent** (disarankan atas OpenClaw karena keamanan default) di Telegram, tersambung ke MCP LifeOS dengan token cakupan terbatas; aksi tulis butuh konfirmasi. | Hermes (atau OpenClaw) |
| **G. Asisten e-Kinerja & SIMAN** (§2.5–§2.6) | Tautkan pekerjaan LifeOS ke rencana hasil kerja SKP (impor SKP dari ekspor e-Kinerja); rekap realisasi + bukti dukung per periode siap salin/unggah; untuk SIMAN: data pendukung BMN, pengingat, rekap dari ekspor. User mengirim sendiri. | Tidak |
| **F. SRIKANDI / e-Kinerja / SIMAN penuh** | Hanya bila ada API resmi atau izin tertulis; alternatif: ekstensi browser isi otomatis di sesi user sendiri (kredensial tidak disimpan). | Tergantung jalur |

Rekomendasi urutan: **K → A → B → C → G** (semua di dalam LifeOS, tanpa layanan baru, aman di VPS), lalu putuskan
D/E/F. K dikerjakan pertama karena dipakai semua agen dan **mengisinya butuh waktu dari user** (bisa mulai mengumpulkan
dokumen sambil tahap lain dibangun). A adalah syarat untuk D, E, dan F.

## 6. To-do untuk user

### 6.1 Keputusan (mohon dijawab)

| ID | Pertanyaan | Rekomendasi |
|---|---|---|
| AG-1 | Urutan tahap: **K (Basis Pengetahuan) → A (token + MCP) → B (agen dokumen) → C → G**? | Ya |
| AG-7 | Knowledge AI memakai **RAG + instruksi/memori + contoh gaya** (bukan fine-tuning)? | Ya |
| AG-8 | Memori otomatis: AI hanya **mengusulkan**, tersimpan setelah user setuju? | Ya |
| AG-9 | e-Kinerja & SIMAN: mulai dari **mode asisten** (LifeOS menyiapkan, user mengirim), tanpa menyimpan kata sandi akun? | Ya |
| AG-2 | Agen dokumen bertemplat dibuat **di dalam LifeOS** (bukan n8n/OpenClaw)? | Ya |
| AG-3 | SRIKANDI: jalur **semi-otomatis** (tahap C) dulu, sambil menanyakan API resmi? | Ya |
| AG-4 | Asisten chat (tahap E): perlu? Bila ya, **Hermes** atau OpenClaw? Channel: Telegram / WhatsApp? | Hermes + Telegram, nanti |
| AG-5 | n8n (tahap D): perlu sekarang? Ada kebutuhan otomasi konkret (email, Google Drive, WhatsApp)? | Tunda sampai ada kasus jelas |
| AG-6 | Agen boleh **mengubah data** langsung, atau setiap aksi tulis harus dikonfirmasi user? | Konfirmasi untuk hapus/kirim; buat item boleh langsung + tercatat di log |

### 6.2 Informasi yang perlu dicari user

- [ ] Tanyakan ke admin SRIKANDI instansi / [helpdesk ANRI](http://helpdesk.anri.go.id/helpdesk/): apakah ada **API
      integrasi** atau fitur ekspor/notifikasi email untuk naskah yang sudah ditandatangani?
- [ ] Contoh 2–3 pasangan **konsep DOCX + PDF final** dari SRIKANDI (boleh disamarkan) untuk menguji pencocokan tahap C.
- [ ] **Knowledge**: mulai kumpulkan bahan — (a) profil kerja: jabatan, unit, tugas pokok & fungsi, atasan/unit
      mitra, singkatan instansi; (b) dokumen acuan: regulasi (KM/PM/PMK terkait), SOP, juknis, contoh surat terbaik;
      (c) 10–20 pertanyaan yang sering Anda jawab + jawaban versi Anda (untuk uji pengetahuan). Tandai dokumen yang
      **tidak boleh** dikirim ke provider AI (rahasia/terbatas).
- [ ] **e-Kinerja**: tanyakan ke Biro Kepegawaian & Organisasi / Pusdatin Kemenhub apakah ada **API atau izin
      integrasi** aplikasi pribadi; cek apakah e-Kinerja bisa **mengekspor SKP/realisasi** (Excel/PDF) — kirim contoh
      ekspor (boleh disamarkan) + tangkapan layar formulir realisasi/bukti dukung yang biasa diisi.
- [ ] **SIMAN**: jelaskan peran Anda di SIMAN (operator BMN / penatausahaan / hanya melihat), data yang sering diinput &
      diambil, dan contoh laporan ekspor; tanyakan ke pengelola BMN / KPKNL apakah ada jalur integrasi resmi.
- [ ] Daftar placeholder yang diinginkan di templat (mis. `{{nomor}}`, `{{perihal}}`, `{{tanggal}}`, `{{tujuan}}`) —
      atau biarkan AI mengisi bagian bertanda di templat instansi yang sudah diunggah.

### 6.3 Akun (tidak ada yang wajib untuk tahap A–C)

- [ ] Tahap A–C: **tidak perlu akun baru** — memakai provider AI yang sudah diatur di Pengaturan → AI.
- [ ] (Bila tahap E) Bot Telegram dari **@BotFather** (gratis) + ID Telegram user untuk allowlist.
- [ ] (Bila tahap D) n8n self-hosted **tidak perlu akun n8n** (pemilik dibuat saat pertama dibuka). Jangan memakai n8n
      Cloud bila data kantor tidak boleh keluar.
- [ ] (Opsional) Claude Desktop / MCP Inspector untuk mencoba MCP server LifeOS.

## 7. To-do untuk Claude (setelah keputusan)

0. Tahap K — tabel profil/instruksi AI per user, koleksi & catatan pengetahuan (memakai `ai_chunks` dengan penanda
   koleksi + prioritas), memori usulan + persetujuan, contoh gaya, uji pengetahuan; satu fungsi penyusun konteks yang
   dipakai `AiService.generate`, My Notebook, chatbot, dan agen; UI + unit + smoke.
1. Tahap A — tabel `api_tokens` (hash, cakupan, kedaluwarsa, terakhir dipakai) + guard token di samping JWT + UI
   Pengaturan → Integrasi; endpoint MCP (`@modelcontextprotocol/sdk`, transport HTTP streamable) dengan tools terbatas
   yang memanggil service yang sudah ada (izin berbagi tetap berlaku); tabel `agent_activity_logs`; unit + smoke.
2. Tool calling di tiga klien provider (`providers/*.client.ts`) + loop agent dengan batas langkah & waktu.
3. Tahap B — menu Tools → Agen Dokumen; pengisian templat DOCX (paket pure JS, cocok ARM64) atau ONLYOFFICE Document
   Builder; hasil dibuka di editor.
4. Tahap C — unggah massal final, pencocokan AI + persetujuan user, penautan otomatis.
4b. Tahap G — impor SKP (ekspor e-Kinerja) → tautan rencana hasil kerja ↔ Area/Project/Task; rekap realisasi + bukti
   dukung per periode; modul pendukung SIMAN sesuai jawaban user.
5. Infra opsional (D/E): service profile `agent` di compose dev & prod, aturan port, panduan SETUP/DEPLOYMENT.
6. Perbarui CLAUDE.md, ARCHITECTURE.md, dokumen ini di setiap tahap.

## 8. Sumber

- OpenClaw: [repo GitHub (MIT)](https://github.com/openclaw/openclaw), [panduan Docker resmi](https://github.com/openclaw/openclaw/blob/main/docs/install/docker.md),
  catatan keamanan: [barrack.ai](https://blog.barrack.ai/openclaw-security-vulnerabilities-2026/),
  [bitdoze](https://www.bitdoze.com/openclaw-security-guide/), [Aviatrix (skill ClawHub berbahaya)](https://aviatrix.ai/threat-research-center/openclaw-2026-clawhub-malicious-skills/).
- Hermes Agent: [repo GitHub (MIT)](https://github.com/NousResearch/hermes-agent),
  [panduan Docker resmi](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/docker.md),
  [MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp), [Docker Hub](https://hub.docker.com/r/nousresearch/hermes-agent).
- n8n: [instalasi Docker](https://docs.n8n.io/hosting/installation/docker/),
  [MCP Server Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger/),
  ringkasan lisensi: [teamazing](https://www.teamazing.com/blog/n8n-license-review-2026/) (cek juga teks lisensi resmi).
- Fine-tuning vs RAG: [forum Google — tuning Gemini API dihentikan](https://discuss.ai.google.dev/t/gemini-api-fine-tuning-disabled/92763),
  [perbandingan API Claude/OpenAI 2026](https://www.kunalganglani.com/blog/claude-api-vs-openai-api-2026.md) (cek dokumentasi resmi provider).
- e-Kinerja: [e-kinerja.kemenhub.go.id](https://e-kinerja.kemenhub.go.id/), [ToT eKinerja Kemenhub](https://www.slideshare.net/slideshow/tot-ekinerja-kemenhubpptx/256146141),
  [AP2KP](https://ap2kp.dephub.go.id/), [P4KIN Setkab (Permen PANRB 6/2022, e-Kinerja BKN)](https://setkab.go.id/wp-content/uploads/2023/09/P4KIN-Sekretariat-Kabinet.pdf).
- SIMAN: [DJKN — SIMAN v2](https://www.djkn.kemenkeu.go.id/kpknl-jayapura/baca-artikel/17430/Jaga-Aset-Negara-Aplikasi-SIMAN-Versi-2-sebagai-Pengembangan-Sistem-Pengelolaan-Barang-Milik-Negara.html),
  [DJKN — implementasi SIMAN v2](https://www.djkn.kemenkeu.go.id/kanwil-jatim/baca-artikel/17236/Implementasi-Aplikasi-SIMAN-Versi-2-dalam-Pengelolaan-BMN.html),
  [SIMAN 2 Mobile](https://play.google.com/store/apps/details?id=com.siman.sensusbmn&hl=en).
- SRIKANDI: [Instruksi Kepala ANRI No. 1/2021](https://archive.ipb.ac.id/wp-content/uploads/2022/06/Instruksi-Kepala-ANRI_Srikandi_nomor-1_-2021.pdf),
  [jurnal kearsipan ANRI](https://jurnalkearsipan.anri.go.id/index.php/ojs/article/view/131).
