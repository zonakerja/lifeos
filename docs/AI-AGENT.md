# AI Agent — Riset & Rencana Integrasi

Status: **tahap 1, 2 & 3 (token akses + MCP) selesai 2026-10-24 — hasil di §17–§18**; rencana terkini §9–§16 (revisi 2026-10-24 §16: data SIMAN & MyIntress dari OnTrack, bukan robot LifeOS) (kajian RAG, Obsidian, Hermes vs OpenClaw,
tiga pekerjaan yang didelegasikan, konektor SRIKANDI/SIMAN/e-Kinerja, tahapan & to-do revisi). §1–§8 = riset awal
2026-10-17 (tetap berlaku sebagai latar; urutan tahap & to-do di §5–§7 digantikan §14–§15). Belum ada kode/infra yang
diubah. Dokumen ini
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
| **K. Basis Pengetahuan Saya** (§2.4) | Menu baru (Pengaturan → Model AI atau Tools → Pengetahuan): profil kerja & instruksi tetap, koleksi pengetahuan (dokumen + catatan pengetahuan, prioritas di RAG), memori usulan AI yang disetujui, contoh gaya, uji pengetahuan. Disuntikkan ke semua fitur AI LifeOS. | Tidak |
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

- [ ] Tahap A–C: **tidak perlu akun baru** — memakai provider AI yang sudah diatur di Pengaturan → Model AI.
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

---

# Bagian II — Riset tahap 2 & rencana terkini (2026-10-18)

Arahan user: integrasi SRIKANDI / SIMAN / e-Kinerja **dibahas detail nanti** (sketsa kebutuhan dicatat di §13); fokus
sekarang = kaji ulang RAG, integrasi **Obsidian** sebagai jaringan pengetahuan, pilihan **Hermes / OpenClaw**, dan tiga
pekerjaan yang ingin didelegasikan/dikolaborasikan:
1. **Chatbot WhatsApp** menjawab pertanyaan sesuai ketentuan (peraturan + praktik lapangan, dibangun di Obsidian).
2. **Memproses pengajuan dokumen bertemplat** dari satker (masuk via WhatsApp) → dokumen ONLYOFFICE → dikirim ke
   SRIKANDI (manual / agen). Contoh: Penetapan Status Penggunaan (PSP) BMN, SK Penetapan Panitia Penghapusan, SK
   Pelaksanaan Pemanfaatan BMN (sewa, KSP, dsb.).
3. **Menjawab surat satker** (permintaan arahan/tanggapan) memakai pengetahuan & memori — **kolaborasi**: hasil agen selalu
   diverifikasi/diedit user.

## 9. Kajian ulang RAG / indeks pengetahuan yang sudah ada

Yang sudah dibangun (ARCHITECTURE §3.2): ekstraksi berkas → potongan ± 1.800 karakter di `ai_chunks` → embedding
`gemini-embedding-2` (768 dimensi) memakai **key Gemini milik user** → pencarian gabungan makna (pgvector HNSW) + kata
persis (full-text) dengan RRF. 17 tipe record + isi berkas diindeks otomatis; sakelar per user; tanpa key Gemini =
pencarian kata saja.

| # | Temuan | Dampak | Usulan perbaikan |
|---|---|---|---|
| R-1 | **Chatbot melayang (global) tidak memakai indeks.** `floating-chatbot.tsx` menyusun konteks di browser dari data yang dipotong (`lifeos-context.ts`: ringkasan resource 250 karakter, judul Notes AI, dst.) lalu memanggil `/ai/generate`. Indeks hanya dipakai **My Notebook** dan `GET /ai/index/search`. | Chatbot tidak bisa menjawab dari **isi dokumen**/peraturan; prompt membengkak seiring data bertambah. | **RAG tahap 2**: `POST /ai/chat` di backend (pola `notebook-context.ts`: cari → potongan bersitasi → jawab), riwayat permanen. Endpoint ini juga dipakai bot WhatsApp & agen. |
| R-2 | **Data yang dikirim ke Google**: setiap potongan teks record & berkas dikirim ke API embedding Gemini (sekali per perubahan), + OCR gambar/PDF scan, + teks pertanyaan. Menurut ketentuan Gemini API, **kuota gratis (unpaid)** boleh dipakai Google untuk memperbaiki produk dan **dibaca reviewer manusia**; **layanan berbayar** (billing Cloud aktif) tidak dipakai untuk melatih model. | Untuk surat dinas / data BMN / data satker, key Gemini **gratis tidak layak**. | User: aktifkan **billing** di project Google Cloud key tersebut (biaya embedding kecil) atau matikan indeks; opsi lanjut: embedding lokal di server (model embedding terbuka lewat Ollama) agar isi tidak keluar sama sekali. Tampilkan peringatan di Pengaturan → Model AI. |
| R-3 | Embedding **hanya Gemini**. | User yang hanya punya key Claude/OpenAI tidak mendapat pencarian makna. | Abstraksi penyedia embedding (Gemini / OpenAI / lokal); ganti model = indeks ulang (dimensi kolom). |
| R-4 | Tidak ada **koleksi / prioritas / metadata**: peraturan, catatan harian, dan todo bercampur dengan bobot sama; tidak ada status berlaku, nomor peraturan, tanggal. | Jawaban bisa merujuk catatan lama / aturan yang sudah dicabut. | Kolom `collection` (mis. `knowledge`, `workspace`) + `metadata` jsonb (jenis, nomor, status, berlaku sejak, dicabut oleh, tag) di `ai_chunks`; filter "hanya yang berlaku"; prioritas koleksi pengetahuan. |
| R-5 | **Pemotongan buta struktur** (per 1.800 karakter). | Pasal/ayat terpotong di tengah; sitasi kurang tepat. | Pemotongan sadar struktur untuk Markdown/peraturan: per judul (`#`), Pasal, Ayat; judul induk ikut di setiap potongan. |
| R-6 | Tanpa **reranking** & tanpa **graf tautan**. | Hasil teratas kadang bukan yang paling relevan; hubungan antar-aturan tidak dimanfaatkan. | Rerank oleh model (opsional) + ekspansi lewat tautan (§10: GraphRAG ringan). |
| R-7 | Item **dibagikan** tidak ikut dicari; pencarian hanya data milik sendiri. | Sudah tercatat di CLAUDE.md §11. | Tetap — basis pengetahuan dimiliki satu user. Bot publik memakai koleksi pengetahuan milik user pemilik bot (§12.1). |
| R-8 | Belum ada **evaluasi** mutu jawaban. | Tidak terukur saat ganti model/provider. | Set uji pertanyaan + jawaban acuan (§2.4 poin 5). |

## 10. Obsidian sebagai jaringan pengetahuan

**Apa itu**: aplikasi catatan (Windows, Mac, Linux, Android, iOS) yang menyimpan catatan sebagai **berkas Markdown biasa**
di satu folder ("vault"). Kekuatannya: tautan antar-catatan `[[Nama Catatan]]`, **backlink** otomatis, **graph view**
(peta jaringan pengetahuan), properti YAML di kepala catatan (`nomor:`, `status:`, `tags:`), templat, dan ribuan plugin.
**Gratis untuk pemakaian kerja/komersial sejak 20 Feb 2025** (lisensi komersial kini opsional). Aplikasinya tidak open
source, tetapi datanya Markdown terbuka → tidak terkunci.

**Peran yang diusulkan**: **Obsidian = tempat Anda menulis & merawat pengetahuan** (peraturan, tafsir pasal, praktik
lapangan, FAQ, contoh kasus, alur PSP/penghapusan/pemanfaatan). **LifeOS = mesin yang membaca vault, mengindeks, dan
melayani** chatbot, agen, dan WhatsApp. Satu arah utama (vault → LifeOS) agar tidak ada konflik; LifeOS hanya menulis ke
folder `00-Inbox/` (usulan pengetahuan baru dari pertanyaan yang belum terjawab / jawaban yang Anda setujui) untuk Anda
kurasi di Obsidian.

### 10.1 Cara vault sampai ke server

| Cara | Biaya | Kelebihan | Kekurangan |
|---|---|---|---|
| **Git** (plugin komunitas Obsidian Git → repo privat / repo di server) | Gratis | **Riwayat & audit perubahan** (cocok untuk aturan: siapa mengubah apa, kapan), mudah di-backup | Di Android agak repot; konflik bila menyunting di dua perangkat bersamaan |
| **Syncthing** (sinkron folder P2P laptop ↔ HP ↔ server) | Gratis | Paling mudah di Android, otomatis, tanpa cloud pihak ketiga | Tanpa riwayat versi bawaan (bisa diaktifkan "file versioning") |
| **Obsidian Sync** + klien resmi **`obsidian-headless` (CLI `ob`)** di server (rilis Feb 2026) | Langganan Obsidian Sync | Paling mulus lintas perangkat, terenkripsi, resmi | Berbayar; data lewat server Obsidian |
| **Self-hosted LiveSync** (plugin komunitas + CouchDB) | Gratis | Real-time, self-host | Paling rumit (CouchDB tambahan), klien headless masih komunitas |

**Rekomendasi**: **Syncthing** untuk laptop ↔ HP ↔ server (mudah) **+ Git di server** (LifeOS meng-commit snapshot vault
setiap ada perubahan → riwayat/audit & backup). Bila kelak berlangganan Obsidian Sync, cukup ganti ke `ob` tanpa
mengubah LifeOS. Plugin "Local REST API"/MCP Obsidian **tidak** dipakai di server (butuh aplikasi desktop menyala).

### 10.2 Konektor Obsidian di LifeOS (rancangan)

- Service pemantau folder vault (volume `obsidian-vault`, hanya-baca kecuali `00-Inbox/`) → setiap berkas `.md` berubah:
  baca properti YAML, judul, isi; potong per judul/Pasal (R-5); indeks ke `ai_chunks` dengan `sourceType = "obsidian"`,
  `collection = "knowledge"`, `metadata` dari properti.
- Tabel `knowledge_links` (dari `[[tautan]]`, tag, properti `dasar_hukum:`) → saat menjawab, potongan teratas
  **diperluas ke catatan yang ditautkan** (mis. tanya sewa → catatan "Sewa BMN" → tertaut PMK pemanfaatan + SOP + contoh
  kasus) — "GraphRAG ringan" tanpa layanan baru.
- Aturan status: catatan `status: dicabut` tidak dipakai untuk menjawab (hanya sebagai riwayat), catatan `status: draf`
  dan `publik: false` tidak dipakai bot publik.
- UI: Tools / Pengaturan → **Pengetahuan**: status sinkron, jumlah catatan, catatan bermasalah (tanpa properti wajib),
  graf ringkas, uji pertanyaan.
- Lampiran PDF peraturan di vault ikut diekstrak (pipeline ekstraksi yang ada).

### 10.3 Struktur vault yang disarankan (Anda yang mengisi)

```
Pengetahuan-BMN/
├── 00-Inbox/                 usulan dari LifeOS/agen (Anda kurasi)
├── 10-Peraturan/             satu catatan per peraturan (+ PDF); properti: jenis, nomor, tahun, status, mencabut
│   └── Pasal/                catatan per pasal penting (tafsir Anda, tertaut ke peraturan)
├── 20-Topik/                 PSP, Penghapusan, Pemanfaatan (Sewa, KSP, KSPI, BGS/BSG, Pinjam Pakai), Pemindahtanganan…
├── 30-Praktik-Lapangan/      kasus nyata, kendala, cara penyelesaian, "yang sering salah"
├── 40-FAQ/                   tanya-jawab siap pakai bot (pertanyaan, jawaban, dasar hukum)
├── 50-Persyaratan/           checklist kelengkapan per jenis pengajuan (dipakai agen pengajuan §12.2)
├── 60-Gaya-Surat/            contoh surat/nota dinas yang baik + catatan gaya
└── 90-Templat/               templat catatan Obsidian (peraturan, FAQ, kasus)
```

Contoh properti catatan:

```yaml
---
jenis: faq            # peraturan | pasal | topik | praktik | faq | persyaratan | gaya
topik: [sewa, pemanfaatan]
dasar_hukum: ["[[PMK tentang Pemanfaatan BMN]]"]
status: berlaku       # berlaku | draf | dicabut
publik: true          # boleh dipakai bot WhatsApp satker
diperbarui: 2026-10-18
---
```

## 11. Hermes atau OpenClaw?

**Rekomendasi: Hermes Agent saja (bukan keduanya).**

| Aspek | Hermes | OpenClaw |
|---|---|---|
| Memori | **Bawaan & terstruktur**: catatan agen + profil user (selalu dimuat, dibatasi ± 2.200 & 1.375 karakter), riwayat sesi SQLite + pencarian FTS5, skill yang dibuat sendiri | Berkas Markdown + pencarian SQLite, diambil saat agen memanggil alat pencari |
| Keamanan bawaan | Persetujuan perintah aktif, dashboard wajib login, menolak berjalan sebagai root, hard-stop loop tool, allowlist per channel (Cloud API: tanpa allowlist semua pesan ditolak) | Sandbox mati secara default; riwayat 2026: ratusan skill berbahaya di ClawHub, CVE-2026-25253, banyak instance terbuka |
| WhatsApp | **Dua jalur**: Baileys (QR, nomor pribadi, tidak resmi) dan **WhatsApp Business Cloud API resmi** (`hermes whatsapp-cloud`) | Banyak channel, umumnya via jalur tidak resmi |
| MCP | Klien MCP bawaan (`mcp_servers`, filter tools per server) | Lewat plugin |
| Lisensi | MIT | MIT |

**Kenapa tidak keduanya**: fungsinya tumpang-tindih (sama-sama gateway chat + agen), dua kali biaya RAM, pembaruan, dan
permukaan serangan, tanpa kemampuan tambahan yang berarti. Karena **semua pengetahuan & aksi ada di LifeOS (MCP)**,
mengganti Hermes ke OpenClaw kelak cukup mengganti klien.

**Catatan penting — "memory poisoning"**: studi arXiv 2606.04329 (2026) menemukan Hermes **lebih mudah diracuni lewat
memori** (tingkat keberhasilan serangan ± 67% vs 34% OpenClaw) karena memorinya selalu disuntikkan ke prompt. Artinya:
pesan dari orang luar (satker) **tidak boleh** bisa menulis memori agen. Mitigasi wajib (§12.1): dua instans terpisah —
bot publik tanpa memori tulis & tanpa alat berbahaya; asisten pribadi (memori aktif) hanya untuk Anda. Pengetahuan
"resmi" tetap di Obsidian/LifeOS (dikurasi Anda), bukan di memori agen — memori Hermes cukup untuk preferensi kerja &
konteks percakapan.

## 12. Rancangan tiga pekerjaan

Prinsip: **LifeOS = sumber kebenaran + antrian kerja + alat (MCP); Hermes = antarmuka chat & otak agen; Anda = pemeriksa
akhir.** Setiap keluaran agen yang bersifat resmi masuk **Antrian Verifikasi** di LifeOS (baru → diproses → menunggu
verifikasi → disetujui → dikirim), tercatat di log aktivitas.

```
Satker --WhatsApp (Cloud API resmi)--> Hermes "publik" --MCP (baca pengetahuan publik, buat/cek pengajuan)--+
Anda   --WhatsApp/Telegram----------> Hermes "pribadi" (memori) --MCP (penuh, aksi tulis dikonfirmasi)-----+
Obsidian (laptop/HP) --Syncthing--> vault di server --> Konektor Obsidian --> indeks pengetahuan            |
                                                                                                            v
                         LifeOS: /ai/chat (RAG) · Pengajuan · Mesin templat -> ONLYOFFICE · Antrian Verifikasi
                                 · (nanti) Robot SRIKANDI / SIMAN / e-Kinerja
```

### 12.1 Chatbot WhatsApp (tanya ketentuan)

- **Jalur WhatsApp: Cloud API resmi Meta** (nomor khusus layanan, Meta Business account, webhook HTTPS publik → butuh
  VPS + domain; uji dev lewat tunnel). Baileys (WhatsApp Web) **tidak disarankan** untuk layanan ke satker: tidak resmi,
  nomor bisa diblokir. **Kebijakan Meta sejak 15 Jan 2026 melarang asisten AI serba-guna** di WhatsApp Business API, tetapi
  bot **khusus tugas** (layanan informasi/konsultasi BMN, penerimaan pengajuan) tetap diizinkan → bot dibatasi topik
  (menolak pertanyaan di luar BMN/kedinasan). Perhatikan jendela 24 jam (di luar itu hanya pesan templat berbayar).
- **Hermes publik**: allowlist nomor satker terdaftar, toolset hanya MCP LifeOS `knowledge.search` (koleksi `publik: true`,
  `status: berlaku`), `request.create`, `request.status`; tanpa shell, browser, berkas lokal, cron; **memori tulis mati**;
  aturan menjawab: selalu sebut dasar hukum + tanggal pembaruan, jawab "akan dikonfirmasi" bila tidak yakin.
- Pertanyaan yang tidak terjawab / ragu → tiket ke Anda (LifeOS + notifikasi ke Hermes pribadi) → jawaban Anda dikirim ke
  satker **dan** diusulkan menjadi catatan FAQ baru di `00-Inbox/` (lingkaran belajar tanpa input berulang).
- Riwayat percakapan per satker disimpan di LifeOS (audit), bukan hanya di Hermes.

### 12.2 Pengajuan dokumen bertemplat (PSP, SK Panitia Penghapusan, SK Pemanfaatan — sewa, KSP, …)

> **Revisi 2026-10-31**: alur ini kini dikerjakan **agen Hermes lewat skill/workflow**, LifeOS menyediakan alat MCP &
> Approval — lihat §22.

1. Satker mengirim surat permohonan + lampiran via WhatsApp → Hermes publik `request.create` → LifeOS modul baru
   **Pengajuan** (jenis, satker, nomor & tanggal surat, berkas; berkas masuk Asset → ekstraksi teks).
2. Agen membaca berkas → mengisi **formulir terstruktur per jenis** (mis. PSP: daftar BMN, kode barang, NUP, nilai
   perolehan, dasar perolehan) → **cek kelengkapan** memakai checklist `50-Persyaratan/` → bila kurang, membalas satker
   daftar kekurangan.
3. **Mesin templat**: templat DOCX instansi (Tools → ONLYOFFICE, sudah ada 29 templat) diberi placeholder
   (`{nomor_surat}`, `{nama_satker}`, tabel berulang `{#barang}…{/barang}`) → diisi otomatis (pustaka pure JS
   `docxtemplater` — inti MIT, cocok ARM64; alternatif ONLYOFFICE Document Builder) → dokumen baru tertaut ke Pengajuan.
4. Anda memeriksa/menyunting di ONLYOFFICE → **Setujui** → (manual) unggah ke SRIKANDI, atau (nanti) robot SRIKANDI
   §13 → PDF final bertanda tangan ditautkan kembali (fitur konsep ↔ final sudah ada) → satker diberi kabar status.

### 12.3 Menjawab surat satker (kolaborasi)

- Surat masuk (WhatsApp, unggah manual, atau nanti dari SRIKANDI) → agen merangkum pokok permasalahan, mencari dasar
  hukum & praktik (koleksi pengetahuan + **surat/jawaban serupa sebelumnya**), lalu menyusun **konsep jawaban** dengan
  templat Nota Dinas/Surat + catatan gaya `60-Gaya-Surat/`.
- Keluaran: konsep DOCX di ONLYOFFICE + **lembar telaah** (ringkasan masalah, dasar hukum bersitasi, opsi tanggapan,
  risiko) di Antrian Verifikasi. Anda menyunting → hasil final disimpan sebagai **contoh gaya** & jawaban acuan untuk kasus
  berikutnya (agen makin mirip Anda tanpa fine-tuning).
- Agen **tidak pernah** mengirim jawaban surat sendiri.

## 13. Sketsa konektor SRIKANDI / SIMAN / e-Kinerja (dibahas detail nanti)

Kebutuhan dari user (dicatat apa adanya):
1. **SRIKANDI** — robot mengisi isian & mengunggah dokumen; tujuan dan penandatangan diisi di LifeOS lalu diteruskan ke
   SRIKANDI.
2. **SIMAN** — **hanya mengambil data** aset secara berkala (harian/mingguan), bukan pengajuan. **Revisi 2026-10-24:
   tidak lagi dikerjakan robot LifeOS — data diambil dari OnTrack Data Hub lewat API/MCP (§16).**
3. **e-Kinerja** — SKP awal ditetapkan & diisi sendiri di e-Kinerja; yang diotomasi tiap bulan: **rincian rencana aksi,
   jumlah dokumen, link dokumen**. SKP dimasukkan juga ke LifeOS; agen memetakan pekerjaan LifeOS ke tiap RHK/kegiatan,
   lalu robot mengisikannya ke e-Kinerja.
4. SRIKANDI & SIMAN memakai **MFA authenticator**; di komputer/server yang sama kode diminta ± sebulan sekali → LifeOS
   butuh **konektor sesi** yang mendeteksi login kedaluwarsa dan meminta pembaruan.

Arah teknis awal:
- **Playwright** (bukan Selenium): satu bahasa dengan backend (TypeScript), menunggu elemen otomatis, image Docker resmi
  arm64/amd64, mendukung profil browser persisten. Berjalan sebagai service/container terpisah `robot` (antrian BullMQ,
  satu job per sistem, jeda wajar), bukan di proses backend.
- **Konektor sesi**: profil browser **persisten** per user per sistem (cookie/penanda "perangkat tepercaya" ikut tersimpan,
  dienkripsi seperti key AI) → cek sesi sebelum tiap job → kedaluwarsa = job ditunda + notifikasi → Anda membuka
  **Pengaturan → Konektor → Perbarui login**: LifeOS menampilkan **browser jarak jauh** (tayangan langsung browser robot)
  tempat Anda mengetik sendiri username, password, dan kode authenticator → sesi tersimpan, status "aktif s.d. …".
  **LifeOS tidak menyimpan kata sandi dan tidak menyimpan rahasia TOTP** (menyimpan rahasia TOTP = MFA tidak berarti).
- Batas tindakan: SRIKANDI berhenti pada **simpan konsep / kirim ke pemeriksa** dengan konfirmasi Anda — **robot tidak
  pernah menandatangani** (TTE tetap oleh pejabat di SRIKANDI). ~~SIMAN hanya baca (unduh ekspor → tabel snapshot aset +
  perubahan)~~ (diganti OnTrack, §16). e-Kinerja: pemetaan RHK diusulkan agen, Anda setujui, baru robot mengisi; tangkapan layar tiap langkah di log.
- **Link dokumen e-Kinerja** harus bisa dibuka atasan/penilai → LifeOS perlu **tautan publik bertoken** (baca-saja,
  kedaluwarsa, bisa dicabut) — fitur ini belum ada (tercatat "Belum: tautan publik").
- Server robot sebaiknya **VPS di Indonesia** dengan IP tetap (situs pemerintah sering menolak IP luar negeri; IP
  berubah dapat memicu MFA ulang).
- Tetap perlu **izin pengelola sistem** (SRIKANDI: admin instansi/ANRI; SIMAN: DJKN/pengelola BMN; e-Kinerja: Biro SDM)
  karena otomasi memakai akun resmi.

## 14. Tahapan revisi (menggantikan §5)

| Tahap | Isi | Hasil yang bisa dicoba |
|---|---|---|
| **1. Fondasi pengetahuan** | R-1 `POST /ai/chat` RAG backend + riwayat; R-4/R-5 koleksi, metadata, pemotongan sadar struktur; peringatan data Gemini (R-2); profil kerja & instruksi tetap (§2.4) | Chatbot LifeOS menjawab dari isi dokumen/peraturan dengan sitasi |
| **2. Konektor Obsidian** | Volume vault + pemantau + indeks `obsidian` + `knowledge_links` + halaman Pengetahuan + `00-Inbox` | Menulis di Obsidian → beberapa detik kemudian bisa ditanyakan di LifeOS |
| **3. Token akses + MCP LifeOS** | Token pribadi bercakupan, MCP server (`knowledge.search`, `request.*`, `document.*`, `task.*`), log aktivitas | Hermes / Claude Desktop bisa memakai LifeOS |
| **4. Pengajuan + mesin templat + Antrian Verifikasi** ✅ 2026-10-24 (§19) | Modul Pengajuan (PSP / penghapusan / pemanfaatan), ekstraksi field, cek kelengkapan, placeholder templat → ONLYOFFICE, telaah & konsep jawaban surat | Use case 2 & 3 bisa dikerjakan lewat UI LifeOS (unggah manual) sebelum WhatsApp |
| **5. Bot WhatsApp + Hermes pribadi** ✅ bot 2026-10-24 (§20; Hermes publik diganti bot bawaan LifeOS) — sebelumnya: **5. Hermes** | Compose profile `agent`: `hermes-private` (memori, Telegram/WhatsApp Anda) + `hermes-public` (WhatsApp Cloud API, terkunci) | Use case 1 lewat WhatsApp; pengajuan masuk otomatis |
| **5b. Konektor OnTrack** (revisi 2026-10-24, §16) | Klien REST API OnTrack (API key) di backend + OnTrack sebagai server MCP kedua untuk Hermes; data SIMAN & MyIntress untuk pengajuan, telaah, dan chatbot | Agen bisa mencocokkan NUP/kode barang & data keuangan tanpa robot di LifeOS |
| **6. Robot & konektor sesi** — 6a mesin ✅ 2026-10-25 (§21), 6b alur pengisian menunggu eksplor halaman | Service Playwright + profil persisten + browser jarak jauh; **hanya e-Kinerja (bulanan) → SRIKANDI** (SIMAN pindah ke OnTrack) | Detail dibahas setelah tahap 4–5 |

Kebutuhan server (perkiraan): LifeOS + ONLYOFFICE ± 8 GB; + 2 instans Hermes + robot Playwright → **VPS 12–16 GB**, lokasi
Indonesia, domain HTTPS (wajib untuk webhook WhatsApp Cloud API).

## 15. Keputusan & to-do (revisi, menggantikan §6–§7)

### 15.1 Keputusan

| ID | Pertanyaan | Rekomendasi |
|---|---|---|
| AG-10 | Urutan tahap §14 (1 → 6)? | Ya |
| AG-11 | Obsidian sebagai sumber pengetahuan, LifeOS hanya membaca (+ folder `00-Inbox`)? | Ya |
| AG-12 | Sinkron vault: Syncthing (+ Git di server) / Obsidian Sync / Git saja? | Syncthing + Git di server |
| AG-13 | Agen: **Hermes saja**, dua instans (pribadi & publik)? | Ya |
| AG-14 | WhatsApp satker lewat **Cloud API resmi** (nomor khusus) — bukan nomor pribadi/Baileys? | Ya |
| AG-15 | Key Gemini: aktifkan billing (paid tier) atau pindah ke embedding lokal? | Aktifkan billing dulu; embedding lokal nanti |
| AG-16 | Placeholder templat: Anda menandai sendiri di DOCX, atau agen mengusulkan placeholder lalu Anda setujui? | Agen mengusulkan, Anda setujui |
| AG-17 | Pengguna bot WhatsApp: hanya nomor satker terdaftar (allowlist) atau siapa pun? | Allowlist |

AG-7 (RAG + instruksi/memori, bukan fine-tuning), AG-8 (memori disetujui user), dan AG-9 (mode asisten, tanpa menyimpan
kata sandi) tetap berlaku; AG-9 diperjelas oleh §13 (robot boleh, kata sandi & rahasia TOTP tetap tidak disimpan).

### 15.2 To-do user

- [ ] **Pasang Obsidian** (laptop & HP) dan buat vault `Pengetahuan-BMN` dengan struktur §10.3; mulai dari 10–20 catatan
      inti (peraturan utama, FAQ yang paling sering ditanyakan, checklist PSP / penghapusan / sewa / KSP).
- [ ] **Pasang Syncthing** (laptop & HP) bila AG-12 disetujui (folder server disiapkan Claude di tahap 2).
- [ ] **Google Cloud**: aktifkan billing di project key Gemini (AG-15) — atau sampaikan bila ingin embedding lokal.
- [ ] Siapkan **3 contoh per jenis pengajuan** (surat permohonan satker + SK/dokumen hasil yang sudah jadi; boleh
      disamarkan) untuk PSP, SK Panitia Penghapusan, SK Pemanfaatan (sewa, KSP).
- [ ] Siapkan **5–10 pasang surat satker + jawaban Anda** (contoh gaya & bahan evaluasi).
- [ ] (Tahap 5) **Meta Business account** + **nomor khusus** untuk WhatsApp Cloud API; tanyakan ke instansi apakah boleh
      memakai nomor/nama instansi; bot Telegram (@BotFather) opsional untuk Hermes pribadi.
- [ ] (Tahap 6) Izin pengelola SRIKANDI / SIMAN / e-Kinerja untuk otomasi akun; login & kode authenticator selalu Anda
      ketik sendiri.
- [ ] (Saat siap) VPS Indonesia 12–16 GB + domain.

### 15.3 To-do Claude

1. Tahap 1 — `POST /ai/chat` + riwayat permanen, chatbot melayang memakai endpoint baru; `collection`/`metadata` di
   `ai_chunks` (migrasi), pemotongan per judul/Pasal, filter status; peringatan unpaid tier; profil kerja; unit + smoke.
2. Tahap 2 — konektor vault (volume dev atau folder Syncthing), pemantau, parser YAML/wikilink, `knowledge_links`,
   ekspansi graf saat mencari, halaman Pengetahuan, penulis `00-Inbox`.
3. Tahap 3–6 sesuai §14; setiap tahap: perbarui dokumen ini, ARCHITECTURE, CLAUDE.md, aturan port (Hermes 8642/9119 bila
   dibuka, robot tanpa port publik).

### 15.4 Sumber tambahan (tahap 2)

- Obsidian: [gratis untuk kerja](https://obsidian.md/blog/free-for-work/), [license overview](https://obsidian.md/license),
  [Headless Sync resmi](https://obsidian.md/help/sync/headless), [headless + systemd](https://prokopov.me/posts/obsidian-headless-sync-systemd/),
  [LiveSync headless (komunitas)](https://github.com/VII-VII/obsidian-headless-sync), [Local REST API plugin](https://community.obsidian.md/plugins/rest-api),
  [panduan MCP Obsidian 2026](https://mcp.directory/blog/obsidian-mcp-complete-guide-2026).
- Hermes vs OpenClaw: [Composio](https://composio.dev/content/openclaw-vs-hermes-agent), [Gizmodo](https://gizmodo.com/best-web-hosting/openclaw-vs-hermes),
  [Firecrawl](https://www.firecrawl.dev/blog/openclaw-vs-hermes), [studi memory poisoning (arXiv 2606.04329)](https://arxiv.org/pdf/2606.04329).
- WhatsApp: [Hermes — WhatsApp Cloud API](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/whatsapp-cloud),
  [Baileys vs Cloud API](https://hermes-agent.ai/integrations/whatsapp), [kebijakan chatbot WhatsApp 2026](https://respond.io/blog/whatsapp-chatbot-policy-2026).
- Gemini data: [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms_preview).
- Playwright sesi & MFA: [Checkly — authentication](https://www.checklyhq.com/learn/playwright/authentication/),
  [Supergood — MFA](https://supergood.ai/blog/handling-mfa-in-playwright).

---

## 16. Revisi 2026-10-24 — Data SIMAN & MyIntress dari OnTrack Data Hub

**Keputusan user**: robot pengambil data SIMAN **tidak dibuat di LifeOS**. Data master aset SIMAN (DJKN) dan data
keuangan MyIntress (DJPb) diambil dari aplikasi milik user sendiri, **OnTrack Data Hub** (`D:\Development\Application\OnTrack`),
yang memang dirancang untuk scraping + vault kredensial + penyedia data. Robot/agen **pengisian e-Kinerja dan SRIKANDI
tetap** direncanakan di LifeOS (§13, tahap 6).

### 16.1 Yang dimiliki OnTrack (dibaca dari `ARCHITECTURE.md`, `PRD.md`, kode `apps/api` per 2026-10-24)

| Bagian | Isi menurut dokumen | Status di kode |
|---|---|---|
| Stack | NestJS (port 3000) + React/Vite (5173) + PostgreSQL 16 (5432, DB `ontrack_db`) + Redis 7 (6379) + BullMQ + Playwright | ✅ kerangka |
| Vault & sesi | Kredensial portal AES-256-GCM + `storageState` Playwright + dialog OTP/Captcha *human-in-the-loop* | Modul `vault` ✅ |
| Data | Tabel `SimanBmnRecord`, `MyIntressPagu/Sp2d/Kontrak/Piutang/…Record`, `RefSatker`, `RefBagianAnggaran` | ✅ skema Prisma |
| Scraper SIMAN / MyIntress | Ekspor BMN Aktif (polling log unduhan 8–15 menit), SSO DIGIT Kemenkeu | ⏳ modul `siman`, `myintress`, `scraper-engine` **belum ada** |
| REST API (API Key / JWT) | `GET /api/v1/siman/assets?kategori=`, `GET /api/v1/myintress/pagu|realisasi|sp2d`, `POST /api/v1/jobs/trigger` | ⏳ belum ada |
| MCP (`/api/mcp`, SSE / Streamable HTTP) | Tools `query_siman_assets`, `query_myintress_data`, `trigger_scraping_job`, `get_job_status`; resources skema & ringkasan | ⏳ modul `mcp-server` **belum ada** |
| Peran | `SUPERADMIN` (orkestrasi, vault, penerbitan key MCP) · `USER` (lihat data, akun akses MCP) | Modul `auth`/`users` ✅ |

Artinya integrasi LifeOS ↔ OnTrack **bergantung pada penyelesaian modul siman/myintress/API/MCP di OnTrack** (dikerjakan
di thread/proyek OnTrack).

### 16.2 Pilihan cara menyambung

| Cara | Penilaian |
|---|---|
| **A. MCP + REST API** (direkomendasikan) | Agen (Hermes) memakai **OnTrack sebagai server MCP kedua** di samping MCP LifeOS; backend LifeOS memanggil **REST API OnTrack** dengan API key milik akun `USER` OnTrack (fitur non-agen: validasi NUP/kode barang di form Pengajuan, panel data aset di telaah surat, chatbot). Satu sumber kebenaran, hak akses & audit tetap di OnTrack, kontrak data jelas (API terdokumentasi Swagger). |
| B. Baca database OnTrack langsung | Cepat tapi rapuh: perubahan skema OnTrack langsung merusak LifeOS, melewati auth & audit OnTrack. Hanya bila suatu saat perlu laporan berat — itu pun lewat **user DB baca-saja + view** yang disepakati. |
| C. Clone (menyalin kode scraper ke LifeOS) | Tidak disarankan: dua scraper & dua vault kredensial akun yang sama → dua kali perawatan saat portal berubah, risiko sesi saling menendang. |
| D. Salin data ke LifeOS (cache) | Hanya bila perlu: tabel snapshot ringan (mis. daftar BMN per satker) yang diisi dari API OnTrack terjadwal, untuk pencarian cepat / RAG. Sumber tetap OnTrack. |

### 16.3 Rancangan di LifeOS (tahap 5b)

- Env baru backend: `ONTRACK_API_URL`, `ONTRACK_API_KEY` (opsional; kosong = fitur OnTrack tersembunyi) — atau per user di
  Pengaturan → Integrasi (key terenkripsi seperti key AI) bila nanti ada lebih dari satu pengguna OnTrack.
- `src/integrations/ontrack/` — klien REST (timeout, cache Redis singkat, pemetaan error → 422/429 sesuai §15 CLAUDE.md).
- Dipakai: (1) **Pengajuan PSP / penghapusan / pemanfaatan**: agen mencocokkan daftar BMN dari surat satker dengan master
  SIMAN (kode barang, NUP, nilai perolehan, status) dan menandai yang tidak cocok; (2) **telaah surat**: data aset &
  anggaran satker sebagai konteks; (3) **chatbot** (pribadi): pertanyaan data ("berapa aset tanah satker X?").
- Hermes: `mcp_servers` = `lifeos` + `ontrack`. **Hermes publik (satker) tidak diberi akses OnTrack** — data keuangan &
  aset bukan untuk dijawab ke pihak luar tanpa verifikasi; cukup lewat agen pengajuan yang hasilnya Anda periksa.
- Tidak ada scraping, vault SIMAN, maupun penjadwal SIMAN di LifeOS.

### 16.4 Lingkungan dev: bentrok port LifeOS ↔ OnTrack

Kedua aplikasi mengunci port yang sama (**5173, 5432, 6379**; OnTrack juga 3000) dan sama-sama `restart: unless-stopped`
→ hanya satu yang bisa menyala (kejadian 2026-10-24, CLAUDE.md §15). Untuk menguji integrasi, keduanya harus menyala
bersamaan. Pilihan:

| Pilihan | Catatan |
|---|---|
| **OnTrack pindah port host saat dev** (mis. web 5174, PostgreSQL 5433, Redis 6380; API tetap 3000) — direkomendasikan | Perubahan kecil di repo OnTrack (`docker-compose.yml`, `.env`, `ARCHITECTURE.md` §2.2); LifeOS tidak berubah. |
| OnTrack memakai PostgreSQL & Redis milik LifeOS (DB `ontrack_db` terpisah, Redis DB index lain) | Hemat RAM, tetapi versi PostgreSQL berbeda (OnTrack 16, LifeOS 18) dan dua proyek jadi saling bergantung. |
| Bergantian (salah satu dimatikan) | Tidak bisa menguji integrasi. |

Produksi (VPS yang sama): kedua stack di jaringan Docker bersama, LifeOS memanggil `http://ontrack-api:3000` (tanpa port
publik); bila VPS berbeda → HTTPS + API key + allowlist IP.

### 16.5 Keputusan & to-do tambahan

| ID | Pertanyaan | Rekomendasi |
|---|---|---|
| AG-18 | Cara sambung LifeOS ↔ OnTrack: MCP (agen) + REST API (fitur LifeOS)? | ✅ Ya |
| AG-19 | Bentrok port dev: OnTrack pindah ke 5174/5433/6380? | ✅ Ya |
| AG-20 | Hermes publik (satker) tanpa akses OnTrack; hanya Hermes pribadi & agen pengajuan? | ✅ Ya + data satker sendiri untuk nomor terverifikasi (lihat bawah) |
| AG-21 | Robot e-Kinerja & SRIKANDI dibangun di LifeOS, atau memanfaatkan mesin Playwright + vault + dialog OTP OnTrack (pola sama, sudah ada)? | Diputuskan saat tahap 6 — memakai ulang mesin OnTrack layak dipertimbangkan |

**Keputusan user (2026-10-24)**:
- **AG-18 ✅** MCP (agen) + REST API (fitur LifeOS).
- **AG-19 ✅** OnTrack pindah port host saat dev (dikerjakan user lewat Antigravity di repo OnTrack; aturan "satu port
  satu komponen, tanpa dualisme" tetap berlaku di kedua proyek). Matriks port gabungan laptop:

  | Komponen | LifeOS | OnTrack |
  |---|---|---|
  | Frontend (Vite) | 5173 | **5174** |
  | Backend / API | 4000 | 3000 (+ MCP `/api/mcp`) |
  | PostgreSQL | 5432 | **5433** |
  | Redis | 6379 | **6380** |
  | Lainnya | SeaweedFS 8333/8888, ONLYOFFICE 8080 | — |

- **AG-20 ✅ dengan perluasan**: Hermes publik **tidak** mendapat MCP OnTrack mentah. Namun pengguna WhatsApp yang
  **terverifikasi** dan di-assign user ke **satker tertentu** boleh menanyakan **data satkernya sendiri**. Rancangan: tabel
  `wa_contacts` di LifeOS (nomor WA, nama, satker, status verifikasi, di-assign user), MCP LifeOS menyediakan tool
  `satker.assets` / `satker.budget` yang **mengambil `satkerCode` dari pemetaan nomor pengirim di server** (tidak pernah
  dari isi pesan/argumen model) lalu memanggil REST API OnTrack dengan filter satker itu → model tidak bisa diakali untuk
  membuka satker lain. Nomor belum terverifikasi = hanya pengetahuan publik. Setiap akses tercatat di log.
- **AG-21 ✅ 2026-10-25 — mesin robot dibangun di LifeOS** (OnTrack belum punya mesin Playwright; detail §21). Catatan
  awal: robot e-Kinerja & SRIKANDI akan dibangun di LifeOS; keputusan memakai ulang mesin Playwright/vault
  OnTrack diambil setelah prototipe OnTrack selesai (finishing OnTrack akan diserahkan user ke Claude). Catatan untuk saat
  itu: e-Kinerja dan SRIKANDI adalah **dua sistem berbeda** → tetap butuh skrip/alur per sistem; yang bisa dipakai bersama
  hanya "mesin" (pool browser, vault sesi terenkripsi, dialog OTP human-in-the-loop, antrian & log). Untung memakai mesin
  yang sama: satu kode keamanan sesi, satu cara memperbarui login, satu tempat memantau. Konsekuensi: LifeOS bergantung pada
  OnTrack untuk pengisian, dan data yang diisi (konsep surat, realisasi kinerja) harus dikirim ke OnTrack.

To-do user (proyek OnTrack): selesaikan modul `siman`, `myintress`, REST API (`/api/v1/siman/assets`, …) dan
`mcp-server`; terbitkan **API key akun `USER`** untuk LifeOS; (bila AG-19 disetujui) pindahkan port dev OnTrack.

To-do Claude (LifeOS, setelah API OnTrack tersedia): klien `src/integrations/ontrack/` + env + uji kontrak (smoke dengan
OnTrack menyala), pemakaian di Pengajuan/telaah/chatbot, konfigurasi `mcp_servers` Hermes.

---

## 17. Hasil tahap 1 & 2 (2026-10-24)

Dikerjakan setelah user menyetujui lanjut tahap 1 & 2 (AG-10, AG-11). Detail teknis: [ARCHITECTURE.md §3.6](ARCHITECTURE.md);
produksi: [DEPLOYMENT.md §10](DEPLOYMENT.md).

**Tahap 1 — fondasi pengetahuan** (menjawab temuan §9):
- R-1 ✅ `POST /ai/chat` di backend: RAG atas koleksi pengetahuan + data kerja, sitasi `[n]`, riwayat percakapan
  permanen (`ai_conversations`, `ai_messages`). Chatbot melayang memakai endpoint ini: tombol percakapan baru, riwayat
  (buka/hapus), chip sitasi (catatan vault → dialog, berkas → pratinjau, item → halamannya), Salin, **Simpan ke
  Inbox** Obsidian. Ringkasan agenda/to-do dari browser tetap dikirim sebagai `<data_aplikasi>` (tautan `app:`).
- R-2 ✅ peringatan kuota gratis Gemini di Pengaturan → Model AI dan Tools → Basis Pengetahuan (billing tetap tindakan user).
- R-4 ✅ `ai_chunks.collection` + `metadata`; status `dicabut`/templat tidak dipakai menjawab.
- R-5 ✅ pemotongan sadar struktur (judul, BAB, Bagian, Pasal) untuk berkas, sumber notebook, dan catatan vault.
- Profil kerja & instruksi tetap (§2.4 poin 1) ✅ `users.ai_profile`, diisi di Tools → Basis Pengetahuan, ikut di chat
  LifeOS & My Notebook.
- Belum (tahap berikut): R-3 embedding selain Gemini, R-6 reranking, R-8 uji pengetahuan, memori usulan AI (AG-8),
  contoh gaya terstruktur (sementara: folder `60-Gaya-Surat` di vault).

**Tahap 2 — konektor Obsidian** ✅:
- Vault = subfolder di `KNOWLEDGE_VAULTS_DIR` (dev: `infra/knowledge-vaults/`, tidak ikut git; produksi:
  `./knowledge-vaults` + Syncthing). Pilih folder yang ada atau **buat dari templat** (struktur §10.3 + templat catatan
  di `90-Templat` + catatan "Mulai di sini"; `backend/templates/knowledge-vault/`).
- Server memantau perubahan (± 3 detik), membaca properti YAML, `[[tautan]]` (termasuk di properti `dasar_hukum`),
  tag, dan menyalin PDF/DOCX/XLSX di vault ke storage untuk diekstrak & diindeks.
- **GraphRAG ringan**: saat menjawab, catatan yang tertaut dengan catatan yang ditemukan ikut dibaca AI.
- Tools → **Basis Pengetahuan**: profil kerja, status vault (jumlah catatan/berkas/tautan, catatan perlu dirapikan,
  tautan ke catatan yang belum ada), daftar catatan (cari + filter status) dengan dialog isi + tautan keluar/backlink.
- `00-Inbox`: jawaban chat bisa disimpan sebagai catatan **draf** (sitasi diubah menjadi `[[wikilink]]`) untuk
  dikurasi di Obsidian — lingkaran belajar tanpa input berulang.

**Diuji**: unit backend (+22: pemotongan berstruktur, parser vault, konteks chat) & frontend (+7), smoke (+20: profil,
chat tanpa provider, isolasi percakapan & catatan, vault aman/templat/Inbox/lepas), skrip API vault (15 skenario: folder
tidak aman/tidak ada ditolak, templat, tautan & properti terselesaikan, tautan hilang & catatan tanpa properti
dilaporkan, indeks koleksi knowledge, potongan BAB/Pasal), chat dengan Gemini sungguhan (catatan `dicabut` tidak dipakai,
catatan tertaut ikut disitasi), UI di browser (desktop & HP: halaman Basis Pengetahuan, dialog catatan & backlink,
chatbot, sitasi, Simpan ke Inbox, riwayat percakapan).

**Langkah user berikutnya**: (1) Tools → Basis Pengetahuan → **Buat vault baru dari templat** (mis. `Pengetahuan-BMN`)
→ buka folder `infra/knowledge-vaults/Pengetahuan-BMN` di Obsidian (*Open folder as vault*) → mulai menulis;
(2) isi Profil kerja; (3) Tools → Indeks Pengetahuan → **Indeks ulang** sekali (aturan pemotongan baru); (4) aktifkan billing
Gemini untuk data kantor. Berikutnya: tahap 3 (token akses + MCP LifeOS).

---

## 18. Hasil 2026-10-24 (lanjutan): pembagian tugas AI + tahap 3 (token akses + MCP)

User menerima semua rekomendasi (key yang dimiliki: **Gemini & OpenAI**) lalu lanjut tahap 3.

**Pembagian tugas AI** (Pengaturan → Model AI → *Pembagian tugas AI*, kolom `users.ai_routing`):
- **Chat & telaah** (asisten LifeOS, My Notebook chat & ringkasan), **Fitur AI lain** (ringkasan resource, Notes AI,
  ikon, tulisan tangan, AI di ONLYOFFICE), **OCR** (gambar & PDF scan; urutan pilihan → Gemini → OpenAI → Claude, kuota
  habis → provider berikutnya), **Embedding** (Gemini `gemini-embedding-2` atau OpenAI `text-embedding-3-small`, keduanya
  768 dimensi → tanpa migrasi kolom; pencarian hanya membandingkan vektor model yang sama; ganti provider = indeks
  dibangun ulang otomatis). Kosong = ikuti provider aktif / urutan bawaan. Cadangan otomatis tetap berlaku.
- Saran untuk user (Gemini + OpenAI): provider aktif & Chat → **OpenAI** (kualitas tulisan & penalaran), Fitur AI lain →
  Gemini Flash (hemat), OCR → otomatis (Gemini), Embedding → Gemini (sudah ada indeksnya) atau OpenAI bila data kantor
  tidak boleh lewat Gemini gratis. Audio Notes AI selalu Gemini.
- Tautan dua arah Tools → Indeks Pengetahuan (indeks = mesin untuk semua data) ↔ Tools → Basis Pengetahuan (isi yang dikurasi).

**Tahap 3** ✅ (detail [ARCHITECTURE.md §3.7](ARCHITECTURE.md)):
- Pengaturan → **Integrasi**: buat token (nama, izin, masa berlaku 30/90/365 hari/tanpa batas) → token tampil sekali +
  contoh konfigurasi **Hermes** (`config.yaml` `mcp_servers`) dan **Claude Desktop/JSON**; daftar token (prefix, izin,
  kedaluwarsa, terakhir dipakai, cabut); **Aktivitas agen** (50 pemanggilan terakhir).
- MCP server `POST /api/v1/mcp` dengan 8 tools tersaring izin (lihat §3.7 ARCHITECTURE). Di produksi alamatnya
  `https://<domain>/api/v1/mcp` (lewat Caddy, tanpa konfigurasi tambahan).
- Diuji: unit (+4 routing, +4 token), skrip klien MCP resmi SDK (16 skenario: tools per izin, search/agenda/to-do,
  rentang terlalu panjang ditolak, tool di luar izin tidak ada, tanpa token / JWT biasa / token dicabut → 401, log),
  smoke (+19 JSON-RPC mentah: izin, isolasi token & to-do antar-user, log, cabut), UI (buat token, contoh konfigurasi,
  MCP lewat proxy dev, cabut). Embedding OpenAI belum diuji dengan key sungguhan (akun dev hanya punya key Gemini).

**Berikutnya**: tahap 4 (modul Pengajuan + mesin templat + Antrian Verifikasi + konsep jawaban surat) atau tahap 5
(Hermes + WhatsApp, butuh VPS & domain). OnTrack akan menjadi server MCP kedua untuk agen (§16).

## 19. Hasil 2026-10-24: tahap 4 (Pengajuan + mesin templat + Antrian Verifikasi + konsep jawaban surat)

> **Revisi 2026-10-31**: alur tetap per jenis dokumen (Analisis/Telaah bawaan) akan digantikan skill agen Hermes; tabel,
> Approval, dan mesin templat tetap — lihat §22.

Detail teknis: [ARCHITECTURE.md §3.8](ARCHITECTURE.md). Menu baru **Pengajuan** (sidebar Workspace) dengan tab
**Antrian Verifikasi** (Baru, Diproses, Menunggu verifikasi — yang menunggu keputusan di atas) dan **Selesai**
(Disetujui, Dikirim, Ditolak); `?request=<id>` membuka detail, `?request=new` formulir baru.

Alur (use case 2 & 3 §12, lewat UI sebelum WhatsApp):
1. **Catat pengajuan** — jenis, satker, nomor/tanggal surat, perihal, isi, berkas pemohon (diunggah saat Simpan; gagal
   → berkas dibuang). Agen juga bisa mencatat lewat MCP (`create_request`, izin baru `requests:write`).
2. **Analisis dengan AI** — ringkasan, data surat (mengisi yang kosong), **kelengkapan** per dokumen (Ada / Tidak ada /
   Perlu dicek) terhadap persyaratan di Basis Pengetahuan (tulis persyaratan per jenis di vault, mis. `50-Persyaratan/`),
   kekurangan, saran. Tanpa persyaratan di basis pengetahuan, layar memberi tahu bahwa penilaian dari pengetahuan umum AI.
3. **Telaah dengan AI** — telaah (pokok masalah, dasar hukum bersitasi `[n]`, analisis, opsi, risiko) + **konsep
   jawaban** surat; keduanya bisa disunting & disalin. AI diminta tidak mengarang dasar hukum yang tidak ada di sumber.
4. **Buat dari templat** — pilih templat DOCX instansi → isian `${…}` & paragraf `[…]` tampil sebagai formulir →
   **Isi dengan AI** (hanya mengisi yang kosong) → sunting → dokumen dibuka di ONLYOFFICE; penanda SRIKANDI dibiarkan.
   Status → Menunggu verifikasi.
5. **Keputusan user** — Setujui → Tandai sudah dikirim (setelah diproses di SRIKANDI), Tolak/kembalikan (alasan
   tercatat), Buka kembali. Riwayat mencatat siapa (Anda / agen AI) dan kapan.

Diuji: unit backend (mesin templat 6, logika prompt 8) & frontend (4), smoke
(+20: validasi, isolasi user, filter status, templat & penanda SRIKANDI, dokumen terisi, persetujuan, MCP tools/izin,
hapus berantai berkas), UI desktop & HP dengan **Gemini sungguhan** (analisis, telaah, isi templat Surat Dinas →
ONLYOFFICE). Ditemukan saat uji: paragraf AI bernomor menjadi pindah baris yang teregang di paragraf rata kiri-kanan →
dipecah menjadi beberapa paragraf.

**Catatan untuk user**: isi vault dengan persyaratan per jenis pengajuan (PSP, penghapusan, pemanfaatan) dan peraturan
BMN agar kelengkapan & telaah bersitasi; templat SK (PSP, panitia penghapusan, pemanfaatan) perlu penanda `${…}` /
paragraf `[…]` seperti templat Surat Dinas. **Berikutnya**: tahap 5 (Hermes + WhatsApp — pengajuan masuk otomatis,
`satker_code` untuk pengguna terverifikasi per satker, AG-20) dan tahap 5b (OnTrack).

## 20. Hasil 2026-10-24: tahap 5 (bot WhatsApp satker) + dokumen to-do pemilik

**Keputusan desain (revisi §12.1)**: bot untuk satker dibangun **di dalam LifeOS**, bukan instans "Hermes publik".
Alasan: AG-20 mensyaratkan satker pengirim ditentukan server dari nomor terdaftar. Di Hermes, nomor pengirim hanya
sampai ke MCP lewat argumen yang ditulis model — bisa dimanipulasi lewat pesan (prompt injection). Dengan webhook
Cloud API langsung ke LifeOS, nomor dijamin tanda tangan Meta dan satkernya dibaca dari tabel kontak; sekaligus tidak
ada memori agen yang bisa diracuni penanya (studi memory poisoning §11) dan tidak perlu container/RAM tambahan.
**Hermes tetap dipakai sebagai asisten pribadi** Anda (Telegram/WhatsApp pribadi) lewat MCP (tahap 3); langkah
pemasangan ada di [TODO-USER.md](TODO-USER.md) A7/B7.

Yang dibangun (detail teknis [ARCHITECTURE.md §3.9](ARCHITECTURE.md), operasional [DEPLOYMENT.md §12](DEPLOYMENT.md)):
- **Pengajuan → Satker & Kontak** (kemudian dibuat umum menjadi **Grup & Kontak**, §20.1): satker (kode, nama) dan nomor WhatsApp pengguna satker (jabatan, satker,
  Terverifikasi, Aktif). Hanya kontak aktif & terverifikasi yang dilayani; nomor lain dibalas "belum terdaftar".
- **Pengajuan → Percakapan WA**: status bot (aktif / mode simulasi + alamat webhook), daftar percakapan (yang perlu
  dijawab di atas), isi percakapan dengan status tiap pesan, balasan petugas (+ simpan sebagai FAQ ke Inbox vault),
  **Tandai selesai**, dan **Simulator** untuk mencoba tanpa Meta.
- Perilaku bot: pertanyaan dijawab dari catatan **`publik: true` & `status: berlaku`** (menyebut dasar hukum &
  tanggal pembaruan; ragu / tanpa sumber → diteruskan ke petugas; di luar topik ditolak), `#status` = pengajuan
  satker sendiri, berkas = pengajuan baru di Antrian Verifikasi (berkas susulan ≤ 30 menit digabung), perubahan status
  oleh Anda → kabar ke pemohon (dalam jendela 24 jam WhatsApp).
- MCP: tool `list_whatsapp_followups` (izin `requests:read`) agar Hermes pribadi bisa mengingatkan pertanyaan yang
  belum dijawab. Hermes tidak diberi alat untuk mengirim WhatsApp.
- **Dokumen [TODO-USER.md](TODO-USER.md)**: semua pekerjaan pemilik langkah demi langkah (API key & pembagian tugas
  AI, Obsidian, isi basis pengetahuan, templat, satker & simulator, Hermes, VPS, domain, backup, Syncthing, WhatsApp
  Cloud API). **Diperbarui setiap ada pekerjaan baru untuk pemilik.**

Diuji: unit backend (whatsapp-logic 10) & frontend (3), smoke (+26: webhook nonaktif, satker/kontak + isolasi,
nomor tak terdaftar sekali per 24 jam, berkas → pengajuan + berkas susulan, `#status` hanya satker sendiri, kabar status,
pertanyaan diteruskan & balasan manual), UI desktop & HP dengan **Gemini sungguhan** (jawaban bersumber catatan uji
publik, penolakan pertanyaan di luar topik + upaya "abaikan aturanmu", balasan manual tersimpan sebagai FAQ di Inbox).
Webhook Meta sungguhan belum diuji (menunggu VPS, domain, dan akun Meta — TODO-USER B1–B6).

**Berikutnya**: tahap 5b konektor OnTrack (menunggu API OnTrack), pesan templat WhatsApp (kabar status di luar 24 jam),
dan tahap 6 robot e-Kinerja/SRIKANDI.

### 20.1 Revisi 2026-10-24: grup kontak umum (bukan khusus satker)

Permintaan user: fitur Pengajuan & bot dibuat umum — hari ini melayani satker, kelak bisa masyarakat umum / unit
pelayanan. Intinya: **grup yang di-assign ke kontak menentukan data yang boleh diakses**.

- **Satker → Grup kontak** (`contact_groups`): kode, nama, **jenis** (satker, instansi/mitra, masyarakat umum,
  internal, lainnya), dan **hak akses**: *boleh mengirim berkas pengajuan* dan *melihat status pengajuan seluruh grup*
  (mati = tiap orang hanya melihat pengajuannya sendiri — cocok untuk masyarakat umum). Kontak tanpa grup = hanya
  pengetahuan publik + pengajuannya sendiri.
- **Pengetahuan khusus grup**: properti catatan Obsidian `grup: [KODE]` → catatan itu dipakai menjawab anggota grup
  tersebut saja (selain catatan `publik: true`). Diuji: anggota grup mendapat jawaban dari catatan khusus grup; kontak
  tanpa grup diteruskan ke petugas.
- **Profil layanan bot** (Grup & Kontak → *Profil layanan bot*): nama layanan & topik yang dilayani (bawaan BMN) —
  dipakai di prompt dan teks balasan; pertanyaan di luar topik ditolak.
- **Pengajuan**: kolom `satker`/`satker_code` menjadi `applicant` (pemohon) / `group_code` (data lama dipertahankan
  lewat RENAME COLUMN); label "Satker pemohon" → "Pemohon"; prompt analisis/telaah tidak lagi mengasumsikan satker/BMN
  (peran pemroses dibaca dari profil kerja).
- Diuji ulang: unit backend (+6) & frontend, smoke (grup berbagi melihat pengajuan rekan satu grup tetapi tidak grup lain;
  grup masyarakat hanya melihat miliknya & tidak bisa mengirim berkas; profil layanan; grup jenis tak dikenal ditolak),
  UI desktop + Gemini sungguhan.

## 21. Hasil 2026-10-25: tahap 6a — mesin robot SRIKANDI & e-Kinerja

Permintaan user: "siapkan teknologi untuk integrasi ke e-Kinerja dan SRIKANDI" (pengujian dilakukan user nanti).

**Keputusan AG-21**: mesin robot dibangun **di LifeOS**. Repo OnTrack per 2026-10-25 baru berisi modul auth, users,
vault, audit — belum ada mesin Playwright untuk dipakai ulang. Kebutuhan kedua sistem sama (sesi login manusia + MFA,
robot tidak menyimpan kata sandi), jadi satu mesin di LifeOS; OnTrack kelak bisa memakai pola yang sama.

**Temuan uji nyata**: robot membuka https://srikandi.arsip.go.id → diarahkan ke `/auth/login` yang memakai **CAPTCHA** (selain
nama pengguna & kata sandi). Ini menguatkan rancangan: robot **tidak pernah** mengisi/menebak CAPTCHA atau OTP — pengguna
sendiri mengetiknya di browser jarak jauh.

Yang dibangun (teknis: [ARCHITECTURE.md §3.10](ARCHITECTURE.md), operasional: [DEPLOYMENT.md §13](DEPLOYMENT.md)):
1. **Service robot** (`robot/`, Playwright 1.63 + Chromium, container terpisah tanpa penyimpanan): browser jarak jauh,
   cek sesi, eksplor halaman (tangkapan layar + struktur halaman), batas host & tombol.
2. **Tools → Konektor Robot**: kartu SRIKANDI & e-Kinerja — alamat sistem (+ host SSO, penanda login), **Login (browser
   jarak jauh)** = tayangan langsung browser robot di dalam LifeOS (klik, ketik, tempel, gulir; ketikan dikirim
   berurutan), **Selesai & simpan sesi** (sesi terenkripsi), **Cek sesi**, **Lupakan sesi**, **Eksplor halaman** (rekam
   halaman sistem untuk memetakan formulir), riwayat robot + detail rekaman (gambar + struktur yang bisa disalin).
3. **Tautan publik berkas** (prasyarat link dokumen e-Kinerja): tombol **Tautan publik** di pratinjau berkas — masa
   berlaku 30/90/365 hari/tanpa batas, keterangan, jumlah dibuka, cabut.

**Belum** (tahap 6b, butuh Anda): alur pengisian. Langkahnya — Anda login lewat browser jarak jauh → buka halaman
yang ingin diotomasi (form konsep naskah SRIKANDI, form realisasi e-Kinerja) → **Rekam halaman** → beri tahu Claude;
Claude memetakan kolom dari rekaman lalu menulis alurnya (robot berhenti di "simpan konsep" / "kirim ke pemeriksa" dengan
konfirmasi Anda; tidak pernah TTE). Untuk e-Kinerja juga dibutuhkan data SKP/rencana aksi di LifeOS (pemetaan pekerjaan →
RHK) — dirancang bersama saat halaman e-Kinerja sudah direkam. Tetap perlu **izin pengelola sistem** (admin SRIKANDI
instansi, Biro SDM untuk e-Kinerja).

Diuji: unit robot (5) + backend (4) + frontend (3); smoke (+28: tautan publik — buat, buka tanpa login, header aman,
hanya pemilik, hitung akses, cabut; konektor — katalog, validasi alamat, sistem tak dikenal, browser jarak jauh terhadap
situs uji publik: tayangan, isolasi sesi antar-user, alamat di luar konektor ditolak, tombol terlarang ditolak, klik,
simpan sesi terenkripsi, cek sesi, eksplor + tangkapan layar, riwayat, lupakan, batal); UI desktop: tayangan login SRIKANDI
sungguhan di dalam LifeOS, klik & ketik diteruskan (kata uji, tanpa login), batal menutup sesi robot.

### 21.1 Revisi 2026-10-25: brankas kredensial + login otomatis (CAPTCHA & OTP diketik pengguna)

Permintaan user: SRIKANDI memakai CAPTCHA + Authenticator (OTP hanya saat login pertama, lalu ± sebulan sekali);
e-Kinerja memakai CAPTCHA; simpan kredensial dengan teknologi yang aman; contoh OnTrack (OCR CAPTCHA MyIntress +
dialog OTP SIMAN).

**Keputusan (revisi prinsip "LifeOS tidak menyimpan kata sandi")**: kredensial sistem **boleh disimpan** atas permintaan
user, di brankas terenkripsi. **CAPTCHA tidak dibaca mesin (tanpa OCR)**: CAPTCHA dipasang SRIKANDI/e-Kinerja khusus untuk
menolak login otomatis — menembusnya berarti mengakali pengamanan sistem pemerintah. Gantinya pola *human-in-the-loop*
OnTrack: robot mengisi nama pengguna & kata sandi, LifeOS menampilkan potongan gambar CAPTCHA, user mengetik ± 5 detik.
Kode OTP selalu diketik user; **rahasia TOTP tetap tidak disimpan** (menyimpannya = MFA tidak berarti). Karena sesi
dipakai ulang (Session Reuse First, sama dengan OnTrack), langkah ini hanya saat sesi habis.

- **Brankas** (`backend/src/robot/credential-vault.ts`): AES-256-GCM, kunci khusus env `CREDENTIAL_ENCRYPTION_KEY` (64 hex,
  terpisah dari `AI_ENCRYPTION_KEY`, **tanpa kunci bawaan** — berbeda dari OnTrack yang punya kunci cadangan di kode), IV
  acak per nilai, AAD = `user + sistem + kolom` (ciphertext tidak bisa dipindah ke user/sistem/kolom lain), kolom
  `robot_connectors.username_enc/password_enc` + `credential_hint` tersamar. Menyimpan/mengganti wajib **kata sandi akun
  LifeOS** (argon2 verify). Tidak ada endpoint untuk membaca kembali kredensial; nilai hanya didekripsi saat login
  otomatis dan dikirim ke robot lewat jaringan internal; robot mengisinya dengan `fill` (tidak dicatat).
- **Login otomatis** (`POST /robot/connectors/:system/auto-login` → `POST /robot/sessions/:id/answer`): robot memindai formulir
  (`robot/src/login-form.ts`: kolom nama pengguna/NIP, kata sandi, CAPTCHA, OTP satu kolom atau kotak per digit, tombol
  Masuk/Verifikasi, pesan galat situs), mengisi kredensial, lalu berhenti di tahap `captcha` (gambar dipotong dari elemen
  bertanda captcha / terdekat di atas kolomnya) atau `otp`; kata sandi diisi ulang bila situs mengosongkannya setelah CAPTCHA
  salah; `done` = sesi disimpan. Formulir tak dikenali → **Buka tayangan** (browser jarak jauh dengan sesi yang sama).
- UI: kartu konektor → **Simpan kredensial** (nama pengguna, kata sandi, konfirmasi kata sandi LifeOS) / Ganti / Hapus,
  **Login otomatis** (dialog gambar CAPTCHA atau kotak OTP 6 digit + pesan dari situs + Ulangi + Buka tayangan),
  **Login manual (tayangan)**.
- Diuji: unit robot (+7 pengenalan formulir) & backend (+4 brankas: AAD, kunci salah, ciphertext diubah), smoke (+10:
  konfirmasi kata sandi LifeOS, kredensial tidak pernah dikembalikan, isolasi user, jawaban tidak valid, login otomatis
  tanpa formulir login, hapus); uji nyata halaman login SRIKANDI dengan **nilai palsu** — robot mengisi formulir dan berhenti
  di CAPTCHA tanpa mengirim (tidak ada percobaan login), gambar CAPTCHA terpotong rapi, penyerahan ke tayangan berfungsi.
  **Login sungguhan dengan akun user belum diuji** — dilakukan user (TODO-USER A8).

- **Revisi 2026-10-25 (lanjutan)**: user sudah login SRIKANDI & e-Kinerja lewat LifeOS. Modal "berhasil" setelah login e-Kinerja kini
  ditutup robot (`dismissInfoDialog` + aturan murni `infoDialogButton`: hanya modal berteks berhasil/sukses/selamat datang dengan
  tombol OK/Tutup; modal keputusan — kirim, hapus, setujui, tanda tangan, "yakin" — tidak pernah disentuh). Kartu Konektor Robot
  ditata ulang menjadi blok berjarak (Sesi & login, Pengaturan alamat, Eksplor, Alur, Riwayat). Alur pengisian (tahap 6b) akan
  dipelajari dengan panduan user langkah demi langkah.

### 21.2 Tahap 6b dimulai 2026-10-25: peta alur e-Kinerja → Rencana Aksi

Rekaman pertama (Eksplor `https://e-kinerja.kemenhub.go.id/skp`) = **daftar SKP** milik user, satu blok per SKP:
Periode (`01-Jan-2026 s.d 31-Dec-2026`), Pendekatan, Kantor, **Status** (`Draft` / `Disetujui`), Pejabat Penilai, lalu
tautan **Detail SKP** `/skp/detail/<id>`, **Rencana Aksi** `/skp/renaksi/<id>`, Penilaian Bawahan/Rekan, tombol Edit/Hapus
SKP (robot **tidak pernah** menyentuh Edit/Hapus/Tambah SKP). Alur yang dipetakan bersama user:

1. Buka `/skp` → pilih SKP berdasarkan **tahun/periode** yang diminta user (tahun berjalan bawaan) → ambil `<id>` dari
   tautan Rencana Aksi blok itu. SKP berstatus Draft belum bisa diisi rencana aksinya (user belum submit SKP 2026) →
   robot berhenti dan memberi tahu.
2. Buka `/skp/renaksi/<id>` → isi rencana aksi per Rencana Hasil Kerja / bulan → **berhenti sebelum simpan final /
   kirim** (keputusan kirim di tangan user). Struktur halaman & formulirnya **belum direkam**.

Karena formulir tambah aksi muncul setelah klik (modal), Eksplor berbasis alamat tidak cukup → ditambah **Rekam halaman
ini** di browser jarak jauh (`POST /robot/sessions/:id/capture`, robot `captureSession`: tangkapan layar + snapshot
aksesibilitas halaman yang sedang tampil, tanpa klik apa pun; sesi tetap terbuka). Rekaman yang ditunggu dari user:
TODO-USER A8 (contoh Rencana Aksi SKP 2025 yang sudah disetujui + formulirnya, Detail SKP 2026).

### 21.3 Renaksi dari Productivity (2026-10-25)

Keputusan user: rencana aksi diisi **setiap bulan** dari data Productivity (action, task, kegiatan, agenda), tetapi **user
memilih** item yang masuk — tidak semua. Data yang dibutuhkan e-Kinerja: **pemetaan ke RHK**, **uraian kegiatan**, **link
dokumen**. Robot menerima produk jadi dan hanya mengisikannya (draf, tanpa kirim).

- Productivity → tombol **Renaksi** (ikon papan klip) di Action/Task, Agenda, Kegiatan/Sub Kegiatan → dialog bulan + RHK +
  uraian + link dokumen (lampiran web link / berkas LifeOS → tautan publik tanpa kedaluwarsa / ketik sendiri).
- Tab **Productivity → Renaksi**: entri per bulan dikelompokkan per RHK, status *Belum lengkap* / *Siap diisikan* /
  *Terisi di e-Kinerja*, kartu RHK tahun itu.
- Data: record type `skp_target` (RHK per tahun) & `action_plan_entry` (`period`, `targetId`, `description`,
  `documentUrl`, asal item, `status`). Robot 6b nanti: buka `/skp` → SKP periode itu → `/skp/renaksi/<id>` → untuk tiap entri
  `ready` bulan itu isi formulir sesuai RHK → berhenti sebelum simpan final/kirim → tandai `filled` setelah user memastikan.
- Belum: struktur formulir Rencana Aksi (menunggu rekaman user, TODO-USER A8); ambil daftar RHK otomatis dari Detail SKP.

### 21.4 SKP & RHK diambil robot; tab Laporan Kinerja (2026-10-25)

- Detail SKP (`/skp/detail/<id>`, direkam 2026-10-25 dari SKP 1 Mei–31 Des 2025): tabel **HASIL KERJA** dengan kolom NO,
  RHK pimpinan yang diintervensi (+ "Indikator : …"), **Rencana Hasil Kerja**, Aspek (KUANTITAS/KUALITAS/WAKTU), Indikator
  Kinerja Individu, Target Tahunan; baris pemisah **UTAMA** / **TAMBAHAN**. Satu RHK muncul di beberapa baris (satu per
  aspek) → digabung menjadi satu RHK dengan beberapa indikator (`groupRhk`). Halaman juga punya tombol Tambah RHK, Cetak,
  Ajukan SKP — **tidak pernah disentuh** robot.
- Job robot `POST /jobs/ekinerja/skp { year }`: buka `/skp` → blok SKP (Periode, Status, Pendekatan, Pejabat Penilai,
  nomor dari tautan Rencana Aksi) → Detail SKP untuk SKP yang beririsan dengan tahun itu (maks. 8). Backend menyimpan
  record `skp` & `skp_target` (ID stabil) lewat `RecordsService`; RHK yang hilang dihapus kecuali masih dipakai entri
  (ditandai `stale`).
- **Beberapa SKP dalam setahun** (SKP dipecah karena mutasi/jabatan berubah): entri memilih SKP dari bulannya; bila SKP
  berganti di tengah bulan, dialog meminta memilih SKP.
- Tab Productivity **Renaksi → Laporan Kinerja**. Uji 2026-10-25: tahun 2025 → 7 SKP terbaca, RHK dari 2 SKP (Jan–Apr &
  Mei–Des, masing-masing 3 RHK × 2 indikator), entri September 2025 otomatis memakai SKP Mei–Des.

### 21.5 Grup menu AI Agent (2026-10-25)

Sidebar: **Workspace** · **AI Agent** (Approval = Pengajuan berganti nama, Laporan Kinerja, SRIKANDI) · **Sistem**.
(Revisi 2026-10-31: Approval kembali ke Workspace; AI Agent hanya Laporan Kinerja & SRIKANDI — §22.)
Laporan Kinerja kini modul sendiri (`/kinerja`), SRIKANDI menampilkan sesi robot SRIKANDI + status alur naskah.
RHK menyimpan RHK pimpinan yang diintervensi + indikatornya. Pada SKP berstatus Draft, sel RHK berisi tombol **Edit RHK** /
**Hapus RHK**; robot membuang tombol sebelum membaca teks (diuji SKP 2026: 6 RHK bersih) — robot tidak pernah mengkliknya.
"Eksplor halaman" dihapus dari UI Konektor Robot; rekaman halaman lewat **Rekam halaman ini** di tayangan.

### 21.6 SRIKANDI: ambil naskah keluar ber-TTD (2026-10-25)

- Connector dipindah dari Tools ke menu masing-masing: **Laporan Kinerja → Connector** (e-Kinerja), **SRIKANDI → Connector**.
- Halaman SRIKANDI `/pembuatan-naskah-keluar/naskah-keluar` (direkam): tabel *Daftar Naskah Keluar* — No, Tanggal Naskah,
  Nomor Naskah, Hal, Asal Naskah, Status Verifikator, Status Penandatanganan, Status Kirim, Status Berkas, Aksi (Lihat →
  `/naskah-keluar/detail?id=<terenkripsi>`). Detail: metadata, penampil PDF (Unduh PDF), lampiran, verifikator, penandatangan,
  linimasa.
- **SRIKANDI → Naskah Keluar → Ambil dari SRIKANDI**: robot membaca daftar; naskah dengan status penandatanganan selesai
  (`isSigned`) yang belum ada di LifeOS dibuka detailnya dan PDF yang dimuat penampil ditangkap dari respons jaringan (tidak
  mengklik apa pun) → berkas LifeOS (context `srikandi`, ikut ekstraksi teks & indeks) + record `srikandi_letter`.
- Uji 2026-10-25: 182/SDJ.KEU/X/2026 (1 Okt 2026, TERKIRIM) → PDF 2 halaman 785 KB dengan nomor, tanggal, QR & keterangan TTE
  BSrE; ambil ulang tidak mengunduh ganda.
- Lampiran (2026-10-25, permintaan user): robot mengklik hanya "Lihat" pada butir daftar lampiran (melihat, bukan mengubah),
  menangkap berkasnya (respons, unduhan sementara, atau ambil ulang dari `s3.arsip.go.id`) → berkas LifeOS context `srikandi`.
  Diuji: Laporan_Hasil_Studi_Akhir…Merge.pdf (4,7 MB) & Tesis_Mohammad_Yusuf.pdf (4,6 MB, 232 halaman), teks terbaca.
- Belum: halaman berikutnya bila naskah > 10, tautan naskah final ↔ Approval /
  Resource Global + File Control (menunggu keputusan user), naskah masuk.

### 21.7 Naskah ber-TTD → Resource Global, File Control & konsep Approval (2026-10-25)

Keputusan user: naskah ber-TTD beserta lampirannya otomatis masuk **Resource Global** (tag *Dokumen Final*) dan **File Control**
(Gantung), serta ditautkan ke konsepnya di **Approval** bila ada. Setelah setiap "Ambil dari SRIKANDI":
- tiap berkas (naskah & lampiran) → satu resource `res-sk-<uploadId>` (dibuat sekali; resource yang dihapus user tidak muncul lagi);
- konsep dicari di dokumen hasil templat semua pengajuan: teks konsep memuat **hal** naskah (atau judul/perihal pengajuan
  ≥ 85% sama) → `assets.draft_id` naskah final → konsep (sama dengan alur "Dokumen final" ONLYOFFICE) + catatan di riwayat
  pengajuan; status pengajuan tidak diubah (Disetujui/Dikirim tetap keputusan user);
- halaman Naskah Keluar menampilkan "Resource Global · File Control"; detail Approval menandai konsep yang punya final.
- **Revisi user (hari yang sama)**: naskah final ditautkan ke **dokumen mentah yang di-push ke SRIKANDI**, yang wajib melewati
  gerbang **Register Naskah Keluar** (sumbernya Approval AI Agent *atau* konsep Productivity) — bukan ditebak dari isi dokumen
  Approval. Pencocokan otomatis dicabut; tautan dibuat saat Register dibangun.
Diuji: 182/SDJ.KEU/X/2026 → 3 resource (naskah + 2 lampiran) berstatus Gantung; pengajuan uji berkonsep Nota Dinas dengan
hal sama → tertaut otomatis (data uji dihapus). Naskah 182 sendiri tidak punya konsep di Approval (dibuat sebelum fitur ini).

### 21.8 Referensi SRIKANDI & rencana Register Naskah Keluar (2026-10-25)

- Tab SRIKANDI: **Daftar Naskah Keluar** (dulu "Naskah Keluar") · **Referensi** · **Connector**. Berikutnya (dipandu user):
  **Register Naskah Keluar** = gerbang LifeOS sebelum naskah di-push ke SRIKANDI (dari Approval atau konsep Productivity);
  naskah final dari Daftar Naskah Keluar ditautkan ke entri register.
- **Referensi** (menu Pengguna SRIKANDI, direkam & diambil robot, hanya membaca): Daftar Penandatangan (nama, jabatan, unit,
  pangkat, status), Daftar Tujuan Naskah (jenis internal/eksternal, kepada), Grup Tujuan Naskah, Daftar Verifikator, Daftar
  Tembusan, Grup Tembusan, Grup Tujuan Disposisi. Tabel 10 baris/halaman; robot membaca semua halaman, membandingkan dengan
  **Hitung Total**. Uji 2026-10-25: penandatangan 22/22, tujuan 311/312, grup tujuan 4/4, verifikator 27/27, tembusan 47/47,
  grup tembusan 0, grup disposisi 6/7 — selisih = entri ganda di SRIKANDI (mis. "Tim Keuangan" dua kali). ± 1,5 menit.
- Ditemukan saat uji: setelah Hitung Total diklik SRIKANDI menampilkan "Mohon Tunggu" & menonaktifkan tombol halaman; judul
  kolom terbaca kapital (CSS) sehingga kunci jabatan kosong dan orang sama berjabatan beda tergabung — keduanya diperbaiki.
- Belum: anggota tiap grup (tombol "Lihat"), pilihan referensi di formulir Register.

### 21.9 Peta halaman Rencana Aksi e-Kinerja (direkam 2026-10-30, SKP 2026 Disetujui)

`/skp/renaksi/<id SKP>` (hanya dibaca robot) = **satu blok per bulan** (Januari–Desember):
- Bulan yang sudah diajukan: Rating Hasil Kerja, Rating Perilaku Kerja, Predikat, Persentase Tunkin, tautan **Cetak Evaluasi**
  (`/skp/renaksi/print/<skp>/<id bulan>`) & **Cetak Lapbul** (`/print_lapbul/…`), tab **Kinerja** | **Perilaku**, dan
  "Tanggal Pengajuan Penilaian : dd-mm-yyyy (Hari Kerja Ke-n)".
- Tabel Kinerja: kolom No, **Indikator** (berisi *RHK* + *Indikator*), **Rencana Aksi dan Realisasi** (berisi *Renaksi*,
  *Realisasi*, *Bukti Data Dukung* = tautan), **Feedback** (👍 / "Belum ada feedback").
- Bulan yang belum diisi: "Belum ada pengisian Rencana Aksi" + tombol **Isi Rencana Aksi Kerja Bulan <bulan>** (hanya di
  bulan berjalan; mis. Oktober). Formulirnya **belum direkam**.

Pola isian user Jan–Sep 2026 (contoh gaya):
- Satu baris **per indikator**, bukan per RHK. RHK dengan 2 indikator (kuantitas/kualitas + waktu) mendapat 2 baris dengan
  **Renaksi & Bukti Data Dukung sama**; Realisasi baris kuantitas = uraian hasil ("Laporan hasil pelaksanaan kegiatan tugas
  belajar bulan Agustus 2026"), baris waktu = "Penyampaian tepat waktu".
- Bukti Data Dukung = tautan folder Google Drive per bulan.
- Bulan September diajukan 26-10-2026 dan masih menunggu feedback.

Dampak ke Laporan Kinerja LifeOS (perlu disesuaikan, menunggu formulir): entri harus menyimpan **Renaksi** dan **Realisasi**
terpisah (kini satu "uraian"), dipetakan ke **indikator** (otomatis semua indikator RHK, realisasi indikator waktu bawaan
"Penyampaian tepat waktu"), dan satu link bukti bisa dipakai bersama.

**Langkah 1 formulir (direkam 2026-10-30 dengan izin user; tidak ada yang dicentang/disimpan):** tombol **Isi Rencana Aksi
Kerja Bulan <bulan>** membuka modal **"Pilih Indikator Kinerja"** = tabel semua indikator SKP (No, RHK + Indikator, Aspek &
Target, kotak centang **Pilih**) + tombol **Simpan**. SKP 2026 punya **11 indikator** (RHK 1–3 masing-masing kuantitas +
waktu/target, RHK 4–8 hanya kuantitas, mis. "Jumlah Laporan BMN Tingkat Eselon I – 1 Laporan"). Target aspek waktu bisa
Bulanan / Triwulanan / Semesteran. Isian Renaksi/Realisasi/Bukti Data Dukung kemungkinan muncul **setelah Simpan** (langkah
2) — belum dilihat karena Simpan membuat baris bulan itu di e-Kinerja (butuh keputusan user).

**Uji pengisian Oktober 2026 (2026-10-30, izin user: centang sesuai pemetaan LifeOS, narasi & link dummy, dihapus setelahnya,
tidak boleh "Kirim Penilaian Ke Atasan"):**
1. **Isi Rencana Aksi Kerja Bulan <bulan>** → modal *Pilih Indikator Kinerja* → centang indikator (uji: 8, 9, 10) → **Simpan**
   → halaman dimuat ulang; bulan itu kini berisi satu baris per indikator terpilih (RHK + Indikator, Renaksi/Realisasi/
   Bukti Data Dukung "Belum diisi").
2. Tiap baris punya tiga tombol: **Isi Rencana Aksi** → modal *Isi renaksi* (satu textarea, "Diisi rencana aksi yang akan
   dilakukan") + Simpan; **Isi Realisasi** → modal *Isi realisasi* (textarea) + Simpan; **Isi Bukti Data Dukung** → modal
   *Isi bukti_dukung* (textarea untuk tautan, contoh Google Drive) + Simpan. Setiap Simpan **menambah butir bernomor**
   ("1. …") — satu indikator bisa punya beberapa butir renaksi/realisasi/bukti; tombol tetap "Isi …" (tambah, bukan ubah).
3. Di bawah tabel bulan: **Edit Rencana Aksi Kerja** (membuka ulang pilihan indikator) dan **Kirim Penilaian Ke Atasan**
   (= mengajukan ke atasan — **robot tidak pernah menekannya**).
4. **Tidak ada tombol ubah/hapus per butir** (tidak di DOM, tidak muncul saat hover). **Menghapus = Edit Rencana Aksi Kerja**
   (modal pilihan indikator yang sama, terisi centang saat ini) → lepas centang indikator → Simpan: baris indikator itu
   **beserta semua butir renaksi/realisasi/bukti-nya terhapus**. Tidak bisa mengosongkan bulan: Simpan tanpa centang ditolak
   "Simpan Gagal – Harus memilih minimal 1 indikator" (bulan yang sudah dibuat selalu punya ≥ 1 indikator). Mengoreksi butir
   yang salah ketik = lepas centang indikatornya (hapus semua butirnya), centang lagi, isi ulang.
   Pembersihan uji (izin user): indikator 8 (berisi dummy) & 10 dilepas → Oktober kini hanya berisi **indikator 9 kosong**
   ("Belum diisi"), tidak ada teks/tautan uji tersisa, tidak diajukan. Setelah Oktober dibuat, tombol "Isi Rencana Aksi Kerja
   Bulan november" ikut muncul.

Rancangan robot pengisian (6b): untuk bulan B, indikator = gabungan indikator RHK dari entri `ready` LifeOS bulan itu →
centang di modal → Simpan → per indikator: Isi Rencana Aksi (renaksi), Isi Realisasi (realisasi; indikator aspek WAKTU
bawaan "Penyampaian tepat waktu"), Isi Bukti Data Dukung (tautan) → berhenti; user memeriksa lalu menekan Kirim sendiri.
Karena tiap Simpan menambah butir dan butir tidak bisa diubah, robot wajib membaca isi bulan dulu dan **tidak menambah butir
yang sama dua kali** (idempoten), serta berhenti bila bulan sudah diajukan.

### 21.10 Robot pengisian Rencana Aksi e-Kinerja (tahap 6b, 2026-10-31)

- **Model LifeOS** (Laporan Kinerja): satu entri = item Productivity yang dipilih user → bulan, SKP, RHK, **indikator** yang
  dicentang (bawaan semua indikator RHK), **Rencana aksi**, **Realisasi** (indikator kuantitas/kualitas), **Realisasi
  indikator waktu** (bawaan "Penyampaian tepat waktu"), **Bukti data dukung**. Lengkap = siap diisikan.
- **Isi ke e-Kinerja** (tombol per bulan, dengan konfirmasi) → backend menyusun baris per indikator per SKP (butir sama dari
  beberapa entri digabung) → robot:
  1. buka `/skp/renaksi/<SKP>`, tandai blok bulan (penelusuran node teks yang terlihat);
  2. bulan tanpa tombol Isi/Edit atau berating = sudah diajukan → berhenti;
  3. indikator yang belum menjadi baris → modal *Pilih Indikator Kinerja* (Isi Rencana Aksi Kerja Bulan … / Edit Rencana
     Aksi Kerja) → **hanya mencentang**, tidak pernah melepas → Simpan;
  4. tiap baris: tambahkan butir Renaksi / Realisasi / Bukti yang **belum ada** (pembanding longgar: spasi, huruf, titik akhir);
  5. baca ulang → entri yang semua butirnya ada = **Terisi di e-Kinerja**; tangkapan layar disimpan di riwayat run Connector.
- Pengaman: `safeClick` menolak tombol berteks kirim/ajukan/hapus; "Kirim Penilaian Ke Atasan" tidak pernah diklik; tombol
  Isi harus menyebut nama bulan itu. `dryRun: true` = baca + rencana langkah tanpa klik.
- Uji 2026-10-30 (Oktober 2026, data dummy `[UJI LifeOS]`, izin user): 2 entri (indikator 9 = baris yang sudah ada, indikator 8
  = dicentang robot) → 1 indikator dicentang, 6 butir ditambah, isi di e-Kinerja sesuai; jalankan ulang → 0 butir, 2 entri
  terisi (idempoten). Ditemukan & diperbaiki: blok bulan terbaca "sudah diajukan" (templat rating tersembunyi & nama bulan
  berupa teks lepas) dan butir tidak terbaca (label bagian tidak bersaudara langsung dengan `<ol>`) — yang terakhir akan
  menggandakan butir bila dijalankan ulang, sehingga **dryRun wajib dicoba lebih dulu setiap kali alur diubah**.
- **Pembersihan data uji**: menghapus butir uji = Edit Rencana Aksi Kerja (lepas centang indikator 9 → simpan; lalu centang 9
  & lepas 8 → simpan) sampai Oktober kembali "indikator 9 kosong". Klik Edit lewat tayangan robot sempat ditahan pengaman otomatis
  Claude → dilakukan setelah izin user ("Izinkan robot"). Selesai 2026-10-31: Oktober kembali "indikator 9 kosong", tidak ada
  teks/tautan uji, tidak diajukan; entri uji LifeOS `uji-renaksi-1/2` dihapus.

### 21.10a Pemantauan & sinkron dua arah Rencana Aksi e-Kinerja (2026-10-31)

Permintaan user: isian renaksi yang sudah diinput ke e-Kinerja (belum dikirim ke atasan) terpantau di LifeOS sampai
penilaian dikirim; data LifeOS dan e-Kinerja tidak boleh berbeda (bisa saja user sudah mengirim tgl 15); isian yang sudah
ada di e-Kinerja bisa diubah lalu dikirim ulang dengan **pengenal perubahan**.

**Keadaan bulan** (dibaca dari `/skp/renaksi/<SKP>`, `monthSummary`): `rated` (ada Rating Hasil Kerja/Perilaku, Predikat,
Tunkin), `submitted` ("Tanggal Pengajuan Penilaiaan : dd-mm-yyyy ( Hari Kerja Ke-n )", kolom ke-4 = Feedback), `draft`
(tombol Edit Rencana Aksi Kerja + Kirim Penilaiaan Ke Atasan), `empty` (tombol Isi … Bulan), `unavailable` (bulan belum dibuka).
Uji 2026-10-31: Jan–Agu dinilai (Baik, 60%), Sep diajukan 26-10-2026 (hari kerja ke-18, "Belum ada feedback"), Okt draf, Nov
kosong, Des belum dibuka. Feedback dibaca dari kolom berjudul "Feedback" (👍 / "Belum ada feedback").

**Model LifeOS**:
- Record type baru `action_plan_month` (migrasi `20261031130000_action_plan_months`, ID `apm-<nomor SKP>-<YYYY-MM>`):
  period, skpId, status, submittedAt (+ `extra`: workday, ratings, rows = isi per indikator + feedback).
- Entri `action_plan_entry` + `pushedSignature` (tanda tangan isi saat terakhir terisi: RHK, renaksi, realisasi, realisasi
  waktu, bukti, indikator — dinormalkan; **sama persis** di backend `entrySignature` & frontend), `pushed` (isi lama, untuk
  mengenali butir lama), `deleted` (hapus tertunda), `sourceType: "ekinerja"` (diimpor).
- Status tampilan (`displayStatus`): Belum lengkap · Siap diisikan · Terisi · **Berubah — perlu dikirim** (tanda tangan beda) ·
  **Akan dihapus** · **Tidak ada di e-Kinerja** (terisi tetapi butir hilang dari potret) · **Terkunci** (bulan diajukan/dinilai:
  tombol ubah/hapus disembunyikan, dialog menolak simpan, bulan entri terkirim tidak bisa dipindah).

**Alur**:
- **Pantau e-Kinerja** (`POST /robot/ekinerja/renaksi/sync { year }` → robot `/jobs/ekinerja/renaksi/read`, hanya membaca,
  ± 4 dtk): semua bulan SKP tahun itu → potret; bulan draf: butir yang hanya ada di e-Kinerja **diimpor** jadi entri
  (`importCandidates`: dipasangkan per urutan renaksi/realisasi/bukti, indikator satu RHK dengan renaksi & bukti sama digabung;
  butir yang cocok dengan isi sekarang/lama entri atau entri ber-tanda hapus tidak diimpor); entri yang butirnya sudah ada →
  terisi + tanda tangan dasar.
- **Periksa** (dryRun) & **Kirim perubahan** (`POST /robot/ekinerja/renaksi/fill { period, dryRun? }`): backend membaca bulan dulu
  (impor) → isian lengkap bulan (`buildSyncPlan`: semua entri tidak ber-tanda hapus) → robot `mode: "sync"`: `syncPlan` =
  indikator baru dicentang, indikator berisi yang tidak diminta lagi dilepas, baris yang memuat butir di luar isian LifeOS
  **ditulis ulang** (e-Kinerja tidak punya ubah/hapus per butir: lepas centang = baris & butirnya terhapus → centang lagi → isi
  ulang). Bulan minimal 1 indikator: bila lintasan pertama mengosongkan bulan, satu indikator sementara dicentang lalu dilepas di
  lintasan kedua (`modalPasses`). Semua isian dihapus → baris berisi dikosongkan (`emptyRows`), baris indikator tetap. Baris
  e-Kinerja yang **kosong** tidak pernah dilepas. Selesai: entri yang butirnya terbaca → terisi + `pushedSignature` baru, entri
  ber-tanda hapus dihapus. Bulan diajukan/dinilai tidak disentuh. Tetap tidak pernah menekan "Kirim Penilaiaan Ke Atasan".

**Uji 2026-10-31** (izin user, draf Oktober, data `[UJI LifeOS]`): (1) entri baru → 3 butir terisi, entri terisi + tanda
tangan; (2) realisasi diubah → status Berubah → Kirim → baris satu-satunya ditulis ulang lewat indikator sementara, realisasi
lama hilang, tetap 1 indikator; (3) entri dihapus → baris dikosongkan, entri terhapus. Pantau ulang: Oktober kembali **draf, 1
indikator "Mengikuti workshop… – Jumlah Laporan" kosong**, tanpa data uji. Impor dari e-Kinerja hanya diuji unit (belum ada butir
yang hanya di e-Kinerja pada bulan draf).

### 21.10b Brankas digital bukti data dukung (2026-10-31)

Permintaan user: link bukti dibuka atasan / pejabat pembina kepegawaian → **satu poin renaksi = satu tautan**, satu renaksi bisa
beberapa berkas (terisolasi per renaksi); karena tautan terbuka bagi siapa pun yang mengetahuinya, halaman memuat informasi
pelindungan data pribadi & larangan penyalahgunaan, dan **setiap pembukaan dicatat** (IP + lokasi) — juga diberitahukan di
halaman brankas.

- Dialog renaksi → Bukti data dukung **Brankas digital** (bawaan bila item punya berkas): centang lampiran berkas item /
  unggah berkas baru → Simpan → tautan `<domain>/brankas/bv_<token>` menjadi `documentUrl` entri. Ubah berkas kemudian =
  tautan sama (tidak perlu kirim ulang ke e-Kinerja). Batal = unggahan baru dibuang. Unggahan brankas yang dilepas centangnya,
  berkas yang dikeluarkan dari brankas, dan isi brankas yang dihapus (entri dihapus / bukti diganti) ikut dihapus dari storage
  bila tidak dipakai brankas lain; lampiran item tetap utuh (2026-11-01).
- Laporan Kinerja → baris entri **Brankas · n berkas · dibuka n×** → dialog: tautan (salin/buka), berkas (pratinjau), **log akses**
  (waktu, aksi, berkas, IP, perkiraan lokasi, jaringan/ISP, peramban; jumlah IP berbeda), **Ganti tautan** (tautan lama mati;
  entri terkirim → status Berubah → Kirim perubahan).
- Halaman publik `/brankas/:token` (tanpa login): daftar berkas (Lihat/Unduh), **Pemberitahuan Pelindungan Data Pribadi** (hanya
  untuk atasan/penilai/PPK; dilarang menyebarkan, menyalin, mengunggah ulang; sanksi UU No. 27 Tahun 2022 Pasal 65 jo. 67 +
  disiplin ASN), **Akses Anda tercatat** dengan waktu, IP, perkiraan lokasi, peramban pengunjung.
- Lokasi = perkiraan dari IP lewat ipapi.co (gratis tanpa key, ± 1.000 pencarian/hari; `GEOIP_PROVIDER=none` mematikan) — biasanya
  kota penyedia internet/VPN, bukan lokasi pasti. Di laptop semua akses tercatat "Jaringan lokal / privat" (lewat proxy Vite).
- Teknis: docs/ARCHITECTURE.md §3.10 (Brankas digital).

### 21.11 Riset Register Naskah Keluar SRIKANDI (2026-10-31)

Sumber: *Buku Panduan SRIKANDI V3 Kemenko PMK 2026* bab 4 (teks + tangkapan layar formulir), tutorial kumparan (V3), dan
rekaman LifeOS 2026-10-25. **Formulir Registrasi di akun user belum direkam** — rekaman 25 Okt hanya Daftar/Detail Naskah
Keluar & menu Pengguna (submenu Naskah Keluar tertutup). Aplikasi SRIKANDI sama secara nasional, tetapi isi pilihan (unit,
jenis naskah, klasifikasi, penomoran) diatur per instansi → wajib dipastikan dengan rekaman dari akun user.

**Menu SRIKANDI** (Penciptaan Arsip → Naskah Keluar): *Registrasi Naskah Keluar* · *Daftar Naskah Keluar* (sudah dibaca robot)
· *Pemberkasan Naskah Keluar* · *Log Naskah Keluar* (draf milik konseptor) · *Tandatangan Naskah*. Breadcrumb "Pembuatan
Naskah Keluar / Registrasi Naskah Keluar" → alamat kemungkinan `/pembuatan-naskah-keluar/…` (belum dipastikan).

**Dua tipe form**:
- **Naskah Keluar** — konsep diunggah → *Kirim Konsep* ke verifikator → verifikator SETUJU/DITOLAK (+catatan; ditolak →
  dikembalikan "Ke Konseptor", konseptor ubah & *Perbarui Naskah*) → penandatangan SETUJU/TOLAK lalu TTE BSrE (isi nomor naskah +
  passphrase) → konseptor *Tandatangan Naskah* → Pilih Aksi → *Kirim Naskah* → "Naskah ini telah dikirim".
- **Naskah Final** — naskah dibuat & ditandatangani di luar SRIKANDI (PDF bernomor) → registrasi → *Kirim Naskah* langsung,
  tanpa verifikasi/TTE di sistem.

**Isian formulir** (bintang = wajib):

| Bagian | Isian |
|---|---|
| Detil Isi Naskah | Tipe Form* (Naskah Keluar / Naskah Final) · Dikirimkan melalui* (unit kerja) · Jenis Naskah* · Sifat Naskah* · Klasifikasi* (kode klasifikasi arsip, mis. KA.01) · Nomor Naskah* (ketik atau **AMBIL NOMOR** bila penomoran otomatis diatur TU; "nomor sementara, guna penyesuaian file digital") · Nomor Referensi (pilih naskah lain, opsional) · Hal* · Isi Ringkas* · (bagian tengah antara Nomor Referensi & File belum terlihat di panduan — cek rekaman) |
| File naskah* | Satu berkas DOCX/PDF (disarankan PDF); 3 spasi sebelum & sesudah area e-sign; nomor/tanggal boleh manual |
| Lampiran Naskah | JPG, PNG, DOC(X), PDF, XLS(X), PPT(X), MP4, WAV; **≤ 5 MB per berkas, total ≤ 20 MB**; nama berkas **tanpa titik, koma, simbol** `!@#$%^&*()` |
| Tujuan Utama | Grup Tujuan · Utama (Internal/Eksternal Srikandi)* (multi) · Utama Eksternal Non Srikandi |
| Tujuan Tembusan | Grup Tembusan · Tembusan (Internal/Eksternal Srikandi) · Tembusan Eksternal Non Srikandi |
| Verifikator & Penandatangan (hanya tipe Naskah Keluar) | Verifikator* (multi) · Penandatangan* · Tipe Tanda Tangan* (Elektronik / Konvensional) · Visual TTE* (QR Code / Spesimen Gambar) |
| Tombol | **SIMPAN** (→ modal "Berhasil — Data berhasil diinput", masuk Log Naskah Keluar, **belum terkirim**) · RESET |

Prasyarat: penandatangan, verifikator, dan tujuan harus sudah ada di menu Pengguna — daftar ini **sudah diambil LifeOS**
(tab Referensi, §21.8). Pilihan Jenis/Sifat/Klasifikasi/Unit belum diambil.

**Titik aman robot**: SIMPAN hanya membuat draf di Log Naskah Keluar (bisa diubah dengan ikon kertas-pena → Perbarui Naskah).
*Kirim Konsep* (ke verifikator) dan *Kirim Naskah* (ke tujuan) = tindakan keluar → **hanya user** (atau robot dengan
konfirmasi eksplisit per naskah — diputuskan user). TTE/passphrase tidak pernah disentuh robot.

**Dibangun 2026-10-31 (bagian LifeOS, tanpa robot)** — tab **SRIKANDI → Register Naskah Keluar** (tab pertama):
- Record type `srikandi_outgoing` (migrasi `20261031120000_srikandi_outgoing`; kolom `form_type, subject, number, status,
  upload_id, source_type, source_id, letter_id, submitted_at`, sisanya di `extra`). Isian = formulir SRIKANDI di atas; tujuan,
  tembusan, verifikator, penandatangan dipilih dari **Referensi** (disalin `{id,label}`, penanda kuning bila referensi hilang);
  Jenis/Sifat/Klasifikasi/Unit diketik dengan saran (pilihan instansi belum diambil robot).
- File naskah & lampiran: dokumen pengajuan **Approval**, **berkas LifeOS** (100 terbaru), atau **unggah** (context
  `srikandi-register`, `owned` → ikut terhapus bersama entri; batal = dibuang). Validasi: PDF/DOCX, lampiran ≤ 5 MB / total
  ≤ 20 MB / format SRIKANDI; nama berkas bertitik/koma/simbol hanya peringatan (`cleanAttachmentName` untuk robot nanti).
- Status: Belum lengkap → Siap didaftarkan (dihitung `registerIssues`) → **Terdaftar di SRIKANDI** (sementara ditandai
  manual "Tandai terdaftar") → **Naskah final tertaut** ("Tautkan final": saran dari nomor/hal sama, dipilih user; file DOCX
  ikut `PUT /office/files/:final/draft` → `draftLinked`). Daftar Naskah Keluar menampilkan tombol **Register** pada naskah tertaut.
- Approval → detail → Dokumen dari templat → tombol **SRIKANDI** (`links.srikandiRegisterFromRequest`) membuka entri baru terisi
  (hal, file, asal); bila dokumen sudah punya entri, tombol **Register** membukanya.
- Logika murni + test `features/srikandi/register-logic.ts` (9). Smoke +2 (round-trip `srikandi_outgoing`).
- Belum: robot pendaftaran (menunggu rekaman), pilihan Jenis/Sifat/Klasifikasi/Unit dari SRIKANDI, berkas register belum
  dihitung "Dipakai" oleh dialog hapus lampiran fitur lain.

**Rancangan Register Naskah Keluar di LifeOS** (usulan awal):
1. Entri register (record type baru, mis. `srikandi_outgoing`) dibuat dari **dokumen Approval** atau **konsep Productivity**
   (berkas `uploadId`) → isian di atas dipilih dari Referensi + pilihan formulir yang diambil robot; validasi LifeOS (wajib,
   ukuran & nama lampiran, PDF/DOCX). Penanda `${nomor_naskah}`/`${tanggal_naskah}`/`${ttd*}` dari templat dibiarkan.
2. Status: draf → siap → **tersimpan di SRIKANDI** (robot SIMPAN, menyimpan id detail log + tangkapan layar) → dikirim konsep
   (oleh user) → ditandatangani/terkirim (dibaca dari Daftar Naskah Keluar).
3. Tautan final ↔ mentah (keputusan §21.7): saat "Ambil dari SRIKANDI", naskah final dicocokkan ke entri register lewat id/hal
   log yang dicatat saat SIMPAN (nomor bisa berubah saat TTE) → `assets.draft_id` final → berkas mentah.
4. Robot: job baru `POST /jobs/srikandi/register` (isi formulir, unggah, SIMPAN, baca log), `dryRun` dulu, `safeClick` menolak
   Kirim Konsep/Kirim Naskah/Tandatangani; job baca-saja untuk pilihan dropdown formulir.

### 21.12 Uji pendaftaran sungguhan & robot Register (2026-10-31)

Atas perintah user ("boleh membuat konsep / ambil nomor, **tidak boleh Ajukan/Kirim Konsep**, hapus konsep setelah uji"),
formulir di akun user dipetakan lewat browser jarak jauh, lalu robot pendaftaran dibangun dan diuji ke SRIKANDI sungguhan.

**Peta formulir di akun user** (`/pembuatan-naskah-keluar/registrasi-naskah-keluar`; berbeda dari panduan Kemenko PMK):
- Menu Naskah Keluar: Registrasi Naskah Keluar · Daftar Naskah Keluar · Log Naskah Keluar · Verifikasi Naskah · Tandatangan
  Naskah. Log punya tombol **Kirim Banyak Konsep** (robot tidak pernah menyentuhnya).
- **Mode Registrasi**: Registrasi Standar (bawaan) / E-Form. **Tipe Naskah**: Naskah Keluar / **Naskah Banyak** / Naskah Final.
- Semua pilihan = **react-select dengan pencarian ke server** (opsi muncul setelah mengetik): Dikirimkan melalui (unit kerja
  seluruh Kemenhub, mis. "Bagian Keuangan Setditjen Hubud"), Jenis Naskah (Surat Cuti, Nota Dinas, Surat Dinas, Surat Tugas,
  Surat Undangan, Surat Keputusan, Surat Kuasa, Berita Acara, Surat Keterangan, Surat pengantar, Pengumuman, Laporan,
  Telaahan Staf, Risalah/Notulen rapat, Perjanjian Kerjasama, …), Sifat Naskah (Biasa, Terbatas, Rahasia, Sangat Rahasia),
  Klasifikasi ("KU.204 - Laporan Keuangan"), Nomor Referensi, **Diberkaskan Oleh Unit Pengolah** (opsional, baru), Grup
  Tujuan/Tembusan, Utama & Tembusan (opsi = "Nama - Jabatan - Instansi" dari Daftar Tujuan, kadang berawalan
  "[ PERLU PEMBARUAN ]"), Utama/Tembusan Eksternal Non Srikandi, Verifikator & Penandatangan (opsi "Nama - Jabatan").
- **Ambil Nomor** hanya mengisi penanda seperti `XXX/KEU/ND/2026` — nomor sungguhan diberikan saat TTE (tidak memakan
  nomor urut). File naskah DOCX/PDF **maks. 5 MB** (+ tombol HAPUS file); lampiran sesuai §21.11. Tanda tangan: Elektronik /
  Konvensional, Visual TTE QR Code / Spesimen Gambar, **Ukuran QR Code** 1x1/2x2/3x3 (bawaan 3x3).
- **SIMPAN** → SweetAlert "Berhasil" → draf di Log (Status Kirim **BELUM**, aksi Edit · View · Status · **Hapus**). Hapus →
  konfirmasi "Log Naskah <nomor> akan dihapus?" → "Data Berhasil Dihapus".
- **Jebakan**: menekan **Enter** di kotak cari react-select tanpa opsi cocok **mengirim formulir** (ditolak server "The
  klasifikasi id field is required" — tidak tersimpan). Robot selalu **mengklik opsi**, tidak pernah Enter. ID detail Log
  (`?id=U2Fsd…`) terenkripsi **acak per muat halaman** → draf dikenali dari **hal** (+ status kirim), bukan dari ID. Kolom Aksi
  Log berada di luar layar (tabel bergulir horizontal).

**Program** (robot + backend + UI):
- Robot `POST /jobs/srikandi/register` (`robot/src/srikandi-register.ts` logika murni + test, `BrowserPool.srikandiRegister`):
  cek Log dulu (draf berhal sama & belum terkirim → `exists`, tidak dibuat ulang) → buka formulir → tipe naskah → tiap pilihan:
  label → kolom react-select berikutnya (penanda `data-lifeos-select`), ketik `searchTerm` (bagian sebelum " - " / koma gelar),
  tunggu opsi, klik opsi `pickOption` (persis → nama/kode sama, dibedakan jabatan → satu-satunya yang memuat) → nomor (ketik /
  Ambil Nomor) → hal & isi ringkas → `setInputFiles` file naskah & lampiran (nama lampiran dibersihkan) → tujuan, tembusan,
  verifikator, penandatangan, tipe TTD, visual TTE → `dryRun` berhenti (tangkapan layar halaman penuh) atau **Simpan** (pesan
  selain "berhasil" = galat) → baca Log → draf. `safeClick` menolak kirim/ajukan/hapus. Batas body 40 MB (berkas base64).
- Backend `POST /robot/srikandi/register/:id { dryRun? }` (`RobotService.registerSrikandiOutgoing`; logika murni + test
  `backend/src/robot/srikandi-register.ts`): entri milik user, `registerBlockers`, jabatan referensi menjadi petunjuk nama
  kembar, berkas dibaca dari object storage, run + tangkapan layar di Riwayat Connector; simpan → entri `submitted`,
  `submittedAt`, `srikandiNumber`. Entri yang sudah terdaftar ditolak 400.
- UI tab Register: baris **Siap didaftarkan** → **Daftarkan ke SRIKANDI** (konfirmasi; toast + "Lihat" tangkapan layar);
  menu ⋯ → **Periksa di SRIKANDI (tanpa simpan)** (dialog rekaman `RunDialog`) dan **Tandai terdaftar (manual)**.

**Uji 2026-10-31** (entri `[UJI LifeOS]`, PDF 1 halaman, Nota Dinas, KU.204, Ambil Nomor, tujuan/verifikator Enie Kurniawati,
penandatangan Arif Priyo Utomo): dryRun 20 dtk (9 isian sesuai) → simpan 23 dtk → draf `XXX/KEU/ND/2026` status BELUM di Log →
jalankan ulang: LifeOS menolak, robot mengenali draf (`exists`, tidak ganda) → **konsep dihapus** dari Log (aksi Hapus +
konfirmasi, lewat browser jarak jauh; Log kembali hanya naskah 182) → entri & berkas uji di LifeOS dihapus. Kirim Konsep tidak
pernah diklik. Belum: tipe Naskah Banyak & E-Form, Nomor Referensi, Diberkaskan Oleh Unit Pengolah, ukuran QR (bawaan 3x3).

**Klasifikasi arsip sebagai referensi** (permintaan user 2026-10-31): halaman `/klasifikasi-arsip/klasifikasi` (Daftar
Klasifikasi: Kode · Nama Klasifikasi · Status Aktif/Non-Aktif · Aksi Lihat; 10 baris/halaman, Hitung Total = **1.048**
baris ±105 halaman; di bawahnya Bagan Klasifikasi pohon). Menjadi kategori referensi `classification` (label "KODE - Nama",
titik akhir kode dibuang → sama dengan pilihan formulir Registrasi, mis. "KU.204 - Laporan Keuangan"). Diambil **terpisah**
lewat tab Referensi → kategori Klasifikasi → **Ambil klasifikasi** (`POST /robot/srikandi/classifications/sync` → job
references dengan `categories: ["classification"]`, batas 160 halaman); "Ambil referensi" bawaan tetap 7 kategori menu
Pengguna. Formulir Register: Klasifikasi = pilihan dari referensi berstatus Aktif (`classificationChoices`), ketik bebas bila
belum diambil. Robot kini memeriksa ulang login setelah tabel dimuat (SRIKANDI baru mengalihkan ke /auth/login setelah
memuat data) → sesi kedaluwarsa dilaporkan, bukan 0 baris. Uji 2026-10-31 (setelah user login ulang): **1.048/1.048**
klasifikasi, 107 halaman, 69 dtk; 1.032 AKTIF + 16 NON-AKTIF (status terbaca huruf kapital); label sama persis dengan opsi
formulir ("KU.204 - Laporan Keuangan", "AJ - ANGKUTAN JALAN").

## 22. Revisi 2026-10-31 — Dokumen bertemplat ditangani agen (Hermes: skill & workflow), Approval kembali ke Workspace

**Keputusan user (2026-10-31)**:
1. Menu **Approval** kembali ke kelompok **Workspace** (setelah Productivity). Kelompok **AI Agent** hanya berisi modul
   agen: **Laporan Kinerja** (robot e-Kinerja) dan **SRIKANDI** (robot SRIKANDI). Sudah diterapkan di `navigation.ts`.
2. Penanganan permintaan **dokumen bertemplat** (Penetapan PSP, Penetapan Panitia Penghapusan, pelaksanaan pemanfaatan BMN,
   dsb.) yang pada tahap 4 (§19) dibangun sebagai **fitur dengan alur tetap** di LifeOS (jenis pengajuan tetap, tombol
   Analisis/Telaah dengan prompt bawaan, formulir templat) **diubah menjadi pekerjaan agen**: **Hermes** menangani
   permintaan lewat **skill dan/atau workflow**; LifeOS cukup menyediakan data, alat (MCP), dan tempat verifikasi.
3. **OnTrack Data Hub** menyediakan **MCP** dan **API Service** sebagai **sumber kebenaran** data **SIMAN** (master aset —
   terutama untuk PSP) dan **MyIntress** (akuntansi & laporan keuangan). LifeOS & Hermes tersambung lewat keduanya (sesuai
   AG-18, §16).

### 22.1 Pembagian peran (arsitektur baru)

```
Pemohon --WhatsApp--> bot LifeOS (Cloud API, §20) --+--> Approval: pengajuan "baru" + berkas pemohon
Anda ----Telegram/WA/chat--> Hermes pribadi --------+
                                                    v
Hermes (skill per jenis dokumen) --MCP lifeos---> baca pengajuan & teks berkas, cari persyaratan/peraturan di basis
        |                                         pengetahuan, ambil templat + isiannya, buat dokumen, catat telaah,
        |                                         ubah status → menunggu verifikasi
        +--MCP ontrack (atau API)--> master aset SIMAN (NUP, kode barang, nilai, status), data MyIntress
                                                    v
Anda: Approval (Workspace) → periksa telaah & dokumen di ONLYOFFICE → Setujui / Tolak → (SRIKANDI, robot SRIKANDI §21)
```

| Bagian | Tugas |
|---|---|
| **Hermes (agen)** | Otak & alur kerja: memahami permintaan, memilih skill per jenis dokumen, memanggil alat, menyusun telaah & isian templat. Logika "cara membuat SK PSP" ditulis sebagai **skill** (teks prosedur + contoh), bukan kode LifeOS → bisa diubah tanpa rilis aplikasi. |
| **LifeOS** | Sumber kebenaran dokumen & pengetahuan + **alat MCP** (pengajuan, berkas, basis pengetahuan, templat & mesin templat, ONLYOFFICE) + **Approval** = antrian verifikasi manusia + log aktivitas agen. Tidak lagi menyimpan alur tetap per jenis dokumen. |
| **OnTrack** | Sumber kebenaran data SIMAN & MyIntress lewat **MCP** (untuk agen) dan **API Service** (untuk fitur LifeOS). |
| **Anda** | Pemeriksa akhir: hanya Anda yang menyetujui/menandai dikirim. Agen tidak pernah menyetujui, menandatangani, atau mengirim. |

Aturan tetap berlaku: pengajuan dari WhatsApp tetap diterima **bot LifeOS** (AG-20 — kelompok/hak akses diambil server dari
nomor bertanda tangan Meta, bukan dari agen); Hermes publik tetap tidak ada. Agen bekerja atas pengajuan yang sudah tercatat.

### 22.2 Rancangan skill Hermes (draf, dikerjakan setelah keputusan §22.4)

Satu skill per jenis dokumen (format `SKILL.md` yang dipakai Hermes — dicek ulang saat implementasi), mis.
`penetapan-psp`, `panitia-penghapusan`, `pemanfaatan-bmn`, `jawaban-surat`. Isi tiap skill:
1. **Pemicu**: kapan skill dipakai (jenis/perihal pengajuan, kata kunci).
2. **Masukan**: pengajuan (`get_request`), teks berkas pemohon, persyaratan di basis pengetahuan (`50-Persyaratan/<jenis>`),
   peraturan (`search_knowledge`, hanya status berlaku), data aset SIMAN dari OnTrack (PSP: cocokkan NUP/kode barang/nilai
   perolehan dengan daftar di surat, tandai yang tidak cocok), data MyIntress bila relevan.
3. **Langkah**: cek kelengkapan → susun telaah bersitasi (dasar hukum hanya dari sumber) → pilih templat → isi penanda
   `${…}` & paragraf `[…]` → buat dokumen → catat telaah & daftar kekurangan di pengajuan → status **menunggu verifikasi**.
4. **Batas**: tidak menyetujui/mengirim; data ragu → tulis "perlu dicek" alih-alih menebak; penanda SRIKANDI
   (`nomor_naskah`, `tanggal_naskah`, `ttd*`) dibiarkan.
5. **Contoh**: satu contoh telaah & dokumen yang sudah Anda setujui (gaya Anda).

Skill disimpan di repo/vault (diusulkan `agents/hermes/skills/` di repo LifeOS atau folder vault `70-Agen/`) lalu disalin /
disinkronkan ke `~/.hermes/skills/` — agar ikut versi & cadangan.

### 22.3 Dampak ke LifeOS (rencana, belum dikerjakan — dokumentasi dulu)

| Bagian sekarang (§19, ARCHITECTURE §3.8) | Arah |
|---|---|
| Tabel `requests`, status, riwayat, berkas pemohon & dokumen hasil, keputusan user | **Tetap** — menjadi antrian Approval umum untuk keluaran agen. |
| `REQUEST_KINDS` tetap (psp/penghapusan/pemanfaatan/surat/lainnya) | Dilonggarkan menjadi **label jenis** yang diisi pemohon/agen (daftar saran, bukan enum tertutup). |
| Tombol **Analisis dengan AI** / **Telaah dengan AI** + prompt bawaan (`request-logic.ts`) & tool MCP `analyze_request` | Digantikan skill Hermes; dipertahankan sementara sebagai cadangan sampai skill teruji, lalu diputuskan (AG-23). |
| Mesin templat (`template-engine.ts`), `GET /requests/templates/:id/fields`, `POST /:id/documents` | **Tetap** — diekspos sebagai **tool MCP** agar agen bisa mengisi templat; "Isi dengan AI" di UI tetap untuk pemakaian manual. |
| Tool MCP yang perlu ditambah | `list_templates`, `get_template_fields`, `create_request_document` (isian → DOCX), `read_request_file` (teks ekstraksi berkas pemohon), `update_request` (data surat, telaah, kekurangan, status → menunggu verifikasi; **tidak** bisa disetujui/dikirim), cakupan token yang sesuai. |
| Detail Approval di UI | Menampilkan hasil agen (telaah, kelengkapan, dokumen, log aktivitas agen) + tombol keputusan Anda. |
| Integrasi OnTrack (§16.3) | Hermes: `mcp_servers` = `lifeos` + `ontrack`. LifeOS: klien REST `src/integrations/ontrack/` untuk fitur non-agen (mis. panel data aset di detail Approval). |

### 22.4 Keputusan & to-do

| ID | Pertanyaan | Rekomendasi |
|---|---|---|
| AG-22 | Skill Hermes disimpan di mana? | Repo LifeOS `agents/hermes/skills/` (ikut git & review), disalin ke Hermes saat pasang |
| AG-23 | Tombol Analisis/Telaah bawaan + `analyze_request` dihapus setelah skill teruji? | Ya, setelah 2–3 pengajuan nyata berhasil lewat skill |
| AG-24 | Hermes berjalan di mana untuk alur ini? | Laptop (WSL) untuk uji; VPS (B7) untuk harian |
| AG-25 | Urutan kerja | (1) tool MCP templat & `update_request` di LifeOS → (2) skill `penetapan-psp` tanpa OnTrack → (3) sambung MCP OnTrack setelah tersedia → (4) skill jenis lain |

**Keputusan user (2026-10-31): AG-22 … AG-25 disetujui sesuai rekomendasi** (skill di repo `agents/hermes/skills/`; tombol
Analisis/Telaah bawaan dihapus setelah 2–3 pengajuan nyata berhasil lewat skill; Hermes di laptop untuk uji, VPS untuk
harian; urutan kerja AG-25).

**Langkah (1) selesai 2026-10-31 — alat MCP untuk skill** (cakupan token `requests:read` / `requests:write`):

| Tool | Cakupan | Isi |
|---|---|---|
| `read_request_files` | read | Teks ekstraksi berkas pemohon (masih dibaca → error, coba lagi) |
| `list_templates` | read | Templat DOCX milik pemilik (`query` menyaring nama) |
| `get_template_fields` | read | Penanda `${…}` (+ tanda `srikandi`) & paragraf petunjuk `[…]` |
| `update_request` | write | Data surat, `notes` (kelengkapan/kekurangan), `review` (telaah), `draftReply`; `submitForReview` → Menunggu verifikasi, selain itu → Diproses; riwayat `by: agen`; **ditolak** untuk pengajuan yang sudah disetujui/dikirim/ditolak |
| `create_request_document` | write | Isi templat → DOCX dokumen pengajuan (riwayat `by: agen`, status → Menunggu verifikasi) |

Service: `RequestsService.templates`, `fileTexts`, `agentUpdate` (status hanya maju), `createDocument(…, by)`. Smoke +7
(daftar tool per cakupan, templat, isian, berkas kosong, simpan telaah → menunggu verifikasi, dokumen dari templat, tolak
pengajuan yang sudah diputuskan). **Berikutnya (2)**: draf skill `penetapan-psp` di `agents/hermes/skills/` — butuh contoh
nyata dari user (C5).

To-do user: siapkan contoh nyata (surat permohonan + dokumen jadi) untuk PSP & panitia penghapusan;
selesaikan MCP/API OnTrack (C1). To-do Claude: setelah keputusan, kerjakan langkah AG-25 (1) lalu draf skill pertama.

## 23. Integrasi Hermes tahap pertama (2026-10-31)

**Pertanyaan user**: bisakah Hermes punya UI/UX, haruskah dikelola langsung lewat Hermes, apa yang dipasang di laptop & VPS?

**Keputusan**: pemakaian harian lewat **UI LifeOS**; Hermes = mesin agen di belakang. Dashboard bawaan Hermes
(`HERMES_DASHBOARD`, port 9119) dan Open WebUI tidak dipakai (login terpisah, tidak tahu konteks Approval). Pengaturan teknis
sesekali: model & API key (wizard Hermes), skill (berkas repo), MCP (`infra/hermes/lifeos-mcp.yaml`).

| Bagian | Isi |
|---|---|
| Container | `nousresearch/hermes-agent:v0.22.2` (profile `agent`, `gateway run`, `API_SERVER_ENABLED`), port dev `127.0.0.1:8642`, volume `lifeos-hermes-data` → `/opt/data`; produksi tanpa port publik |
| Skrip | `infra/hermes/up.sh` (hitung IP Windows → `lifeos-api`, nyalakan, perbaiki pemilik folder skill, jalankan `configure.sh`). `setup.sh` (wizard interaktif) dihapus 2026-10-31 — lihat §23.1 |
| Skill | `agents/hermes/skills/` → `/opt/data/skills/lifeos` (kategori lifeos). Skill uji `telaah-pengajuan` (kelengkapan, telaah bersitasi, konsep jawaban → `update_request` + `submitForReview`) |
| Backend | `src/agent/` — status, skill, chat, jalankan skill atas pengajuan, pantau & hentikan run; hanya `HERMES_OWNER_EMAIL` |
| UI | **AI Agent → Asisten Agen** (Chat, Status & Skill) + **Kerjakan dengan agen** di detail Approval |

Diuji 2026-10-31: Hermes menyala (`/health` ok, 58 skill bawaan + `telaah-pengajuan` terbaca `hermes skills list`), container →
backend Windows lewat `lifeos-api` = 200, MCP tanpa token = 401, UI Status & Skill + panel Approval tampil, unit +6, smoke +4.
Ditemukan: `/v1/skills` Hermes 0.22.2–0.22.5 error 500 (bug argumen) → daftar skill dari repo; mount skill membuat folder
`skills` milik root → `up.sh` memperbaikinya. **Belum diuji**: run agen sungguhan — menunggu user menjalankan `setup.sh`
(memilih model & mengetik API key, menempel token LifeOS). Pengajuan uji `[UJI] Permohonan PSP laptop Satker Contoh` dibuat
di akun admin dev untuk percobaan pertama (boleh dihapus).

**Persiapan VPS** (DEPLOYMENT §14): service `hermes` di `docker-compose.prod.yml` (profile `agent`, batas memori 1,5 GB),
backend beralias `lifeos-api` (konfigurasi MCP sama dengan dev), env `HERMES_API_KEY` / `HERMES_OWNER_EMAIL`, volume
`hermes-data` dicadangkan terpisah (berisi rahasia), VPS 8 GB bila ONLYOFFICE + robot + Hermes menyala bersama.

Berikutnya: user menjalankan setup → uji run `telaah-pengajuan` → skill `penetapan-psp` (C5) → MCP OnTrack.

### 23.1 Siapkan agen tanpa terminal (2026-10-31)

**Permintaan user**: penyiapan Hermes (API key model + token) tanpa terminal; key yang tersedia hanya Google Gemini (kredit
Google Cloud). **Keputusan**: "satu pintu" seperti AI di ONLYOFFICE — Hermes tidak menyimpan API key model.

| Bagian | Isi |
|---|---|
| Model | `config.yaml` Hermes: `model.provider: custom`, `base_url: http://lifeos-api:4000/api/v1/agent/llm/v1`, `default: lifeos-agent`, `api_key: "${API_SERVER_KEY}"` (ditulis `infra/hermes/configure.sh`, idempoten, tanpa rahasia). Backend `AgentLlmController` (`GET models`, `POST chat/completions`) meneruskan ke endpoint OpenAI-compatible resmi provider user (Gemini `…/v1beta/openai`, OpenAI) dengan key tersimpan; **Claude** diterjemahkan ke Messages API native (lihat di bawah); model = Pembagian tugas → **Agen (Hermes)** (`ai_routing.agent`, kosong = provider aktif). Streaming diteruskan apa adanya; error provider diteruskan dengan status aslinya (Hermes mencoba ulang 503/429 sendiri). Logika murni + test `agent-llm.ts`, `agent-claude.ts`. |
| Izin | Satu kunci bersama `HERMES_API_KEY` (= `API_SERVER_KEY` container) di dua arah. Tombol **Siapkan agen** membuat token akses "Agen Hermes (otomatis)" milik `HERMES_OWNER_EMAIL` dengan hash kunci itu + cakupan pilihan (bawaan semua, termasuk `ai:model` baru) → MCP & model memakai isolasi/log token biasa; dicabut di Pengaturan → Integrasi. Kunci harus 24–128 huruf/angka/`_`/`-` (`openssl rand -hex 32`). |
| UI | Kartu **Siapkan agen** di Asisten Agen → Status & Skill: Hermes menyala, model (provider · model, tautan Pengaturan → Model AI), izin agen (dialog cakupan), panggilan model terakhir. |

Diuji 2026-10-31: `configure.sh` dua kali (idempoten, kunci tidak tertulis ke berkas), Siapkan agen (token + izin), `GET
models` dengan kunci agen = 200, JWT login = 401, Hermes → proxy LifeOS terbukti (log Hermes: `provider=custom
base_url=…/agent/llm/v1`), MCP Hermes ditolak sebelum Siapkan agen lalu tersambung sendiri setelahnya. Jawaban model
sungguhan belum terlihat: Gemini (`gemini-3.8-flash`) sedang 503 "high demand" — jalur native (Uji di Pengaturan) juga 503,
jadi bukan masalah proxy; Hermes mencoba ulang otomatis.

**Claude lewat API native (2026-11-05)**: Hermes tetap berbicara format OpenAI ke LifeOS; `agent-claude.ts` menerjemahkannya ke
Messages API. Alasan: endpoint kompatibel OpenAI milik Anthropic tanpa prompt caching dan menolak beberapa parameter pada model
terbaru; `api_mode: anthropic_messages` di Hermes mengharuskan konfigurasi Hermes diubah setiap ganti provider (kembali ke
terminal). Yang aktif: cache otomatis (`cache_control` tingkat atas), effort `medium` (atau `reasoning_effort` dari permintaan),
`temperature`/`top_p` dibuang, `tool_choice` paksa → `auto` pada model yang menolaknya, `drop_block` + `fallbacks: "default"` pada
model terbaru, kredit habis → 402. Pemanggilan alat dikirim di akhir stream (yang sebelum `fallback` tidak boleh dijalankan). Blok
giliran alat disimpan di memori backend karena Hermes membuang `reasoning_details` di rute custom, lalu dikirim balik utuh selama
Hermes tidak mengubah giliran itu. Diuji unit (SDK sungguhan + respons SSE tiruan) dan klien OpenAI → backend uji → server Anthropic
tiruan (alat → hasil → jawaban, pemikiran terkirim balik); **Claude sungguhan & Hermes sungguhan dengan Claude belum diuji**.

## 24. Persetujuan otomatis lewat "Kebijakan Otomatis" (rancangan 2026-11-01, tahap 1 dibangun 2026-11-06)

**Permintaan user**: beberapa tugas agen boleh **disetujui otomatis**. Contoh **Generasi PSP**: dokumen masuk lewat WhatsApp →
dokumen dibaca → daftar aset di lampiran diambil → dicocokkan dengan master aset SIMAN (OnTrack) → bila **≥ 75% benar**,
dokumen PSP dibuat dari templat lalu dikirim ke SRIKANDI; bila tidak, dibuat **Telaah Staf** tentang data aset yang tidak sesuai.
Skill dibuat di Hermes, dan LifeOS harus mendukung alurnya.

**Prinsip**: yang menyetujui adalah **LifeOS berdasarkan aturan yang ditulis user**, bukan model AI. Agen hanya menyerahkan
data terstruktur. Server memeriksa ulang data itu ke sumber kebenaran (OnTrack), menghitung skor sendiri, lalu memutuskan
menurut kebijakan. Akibatnya:
- angka "75%" tidak bisa dikarang model, dan tidak bisa dimanipulasi isi dokumen pemohon (*prompt injection*);
- aturan §22 bahwa "agen tidak pernah menyetujui" tetap berlaku. Persetujuan otomatis tercatat sebagai keputusan
  **kebijakan milik user**, dengan alasan dan skor di riwayat.

### 24.1 Kondisi sekarang vs kebutuhan (hasil kajian kode)

| Langkah alur PSP | Kondisi LifeOS | Yang perlu dibuat |
|---|---|---|
| Dokumen dikirim lewat WhatsApp | ✅ bot → `RequestsService.create` (source `whatsapp`, berkas context `request`) | — |
| Agen jalan sendiri saat pengajuan masuk | ❌ hanya tombol **Kerjakan dengan agen** (`AgentService.runSkill`); run dicatat di memori (hilang saat restart) | **Pemicu** + tabel `agent_runs` |
| Membaca dokumen | ✅ `read_request_files` | — |
| Mengambil daftar aset dari lampiran | 🟡 bisa dikerjakan skill, tetapi belum ada tempat menyimpan hasil terstruktur | Tool MCP `submit_asset_check` + kolom hasil |
| Mencocokkan dengan master aset | ❌ MCP/API OnTrack belum ada (C1) | Klien REST `src/integrations/ontrack/` (verifikasi oleh server) |
| Skor ≥ ambang → buat PSP dari templat | 🟡 `create_request_document` ada; status dari agen paling jauh *menunggu verifikasi* (`advanceStatus`) | **Mesin kebijakan** yang boleh menetapkan *disetujui (otomatis)* |
| Kirim ke SRIKANDI | 🟡 robot Register menyimpan **konsep** (`registerSrikandiOutgoing`), tetapi entri `srikandi_outgoing` hanya dibuat dari UI | Pembuatan entri Register dari server + antrian kirim tertunda |
| Skor < ambang → Telaah Staf | ✅ templat + `update_request` → menunggu verifikasi | Templat Telaah Staf (diunggah user) |
| Kabar ke pemohon | ✅ `onStatusChange` → WhatsApp | Kait juga untuk keputusan otomatis |

### 24.2 Alur yang dirancang

```
WhatsApp → pengajuan "baru" (jenis psp, grup X)
   │  Pemicu (kebijakan cocok: jenis + grup + skill) → agent_runs (antri) → Hermes /v1/runs (skill penetapan-psp)
   v
Hermes: read_request_files → ambil daftar aset → submit_asset_check([{nup, kode_barang, nama, nilai, …}])
   v
LifeOS (server, deterministik): ambil master aset per NUP dari OnTrack → bandingkan per kolom → skor
   ├─ skor ≥ ambang & semua syarat kebijakan terpenuhi
   │     → Hermes membuat dokumen PSP (create_request_document; aset sesuai keputusan AG-26)
   │     → LifeOS: status "disetujui · otomatis (kebijakan <nama>)" + riwayat (skor, rincian, versi kebijakan)
   │     → entri Register Naskah Keluar dibuat → masa tunda (bisa dibatalkan) → robot simpan KONSEP di SRIKANDI
   │     → kabar WhatsApp ke pemohon
   └─ skor < ambang / data tidak lengkap / OnTrack tak terjangkau
         → Hermes membuat Telaah Staf (rincian ketidaksesuaian dari hasil verifikasi server)
         → status "menunggu verifikasi" → keputusan di tangan user (alur biasa)
```

Hasil verifikasi server diserahkan kembali ke agen (respons `submit_asset_check`). Hermes lalu memilih cabang PSP atau Telaah
Staf. Meski begitu, **status akhir tetap ditetapkan server**: agen yang memanggil cabang PSP padahal skor kurang akan ditolak.

### 24.3 Komponen LifeOS yang dibangun

| Komponen | Isi |
|---|---|
| **Tabel `agent_policies`** | Milik user. Isi: nama, skill, pemicu (jenis pengajuan, grup kontak yang diizinkan), mode `off` / `shadow` / `auto`, ambang skor, kolom kritis (wajib cocok 100%, mis. NUP & kode barang), toleransi nilai, batas per hari, aksi lanjutan (`register_srikandi`), masa tunda (menit), versi (setiap perubahan menaikkan versi; keputusan mencatat versi). |
| **Tabel `agent_runs`** | Pengganti peta run di memori. Isi: pemicu (`button` / `policy`), skill, pengajuan, status (antri/berjalan/selesai/gagal), run ID Hermes, ringkasan. Dipantau worker BullMQ, sehingga run tetap terlacak setelah backend restart. Antrian `agent-runs` concurrency 1. |
| **Pemicu** | Kait `RequestsService` saat pengajuan baru dibuat (dan saat berkas bertambah dalam jendela intake WhatsApp), dijalankan setelah ekstraksi berkas selesai. Pengajuan yang cocok dengan kebijakan aktif masuk antrian `agent-runs`. |
| **Verifikasi aset (server)** | Klien OnTrack (REST ber-API key, AG-18) + logika murni `asset-check.ts` (+ test): normalisasi NUP/kode, banding per kolom, skor per aset & total, alasan per ketidakcocokan. Disimpan di pengajuan (`asset_check` jsonb: daftar dari agen, data OnTrack, skor, waktu, versi kebijakan). |
| **Tool MCP** | `submit_asset_check` (cakupan `requests:write`, input zod dibatasi jumlah aset). Respons = hasil verifikasi server + cabang yang diizinkan. `register_request_document` (buat entri Register dari dokumen pengajuan; hanya bila kebijakan mengizinkan). |
| **Mesin kebijakan** | `RequestsService.policyDecide(...)`: satu-satunya jalan selain user untuk mencapai status *disetujui*. Riwayat `by: "kebijakan"` + alasan. Mode **shadow** hanya mencatat "akan disetujui otomatis" tanpa mengubah status. |
| **Kirim tertunda** | Job BullMQ tertunda (masa tunda) → `registerSrikandiOutgoing` (konsep saja, tidak pernah Kirim Konsep). Bisa dibatalkan dari Approval selama masa tunda. Sesi SRIKANDI kedaluwarsa → job ditunda dan notifikasi (pola Otomasi). |
| **Pengaman** | Sakelar darurat global, batas per hari, jeda otomatis bila beberapa keputusan otomatis dibuka kembali / dibatalkan user, hanya grup kontak yang diizinkan, pengajuan yang berkasnya bertambah setelah diputuskan → manual. |
| **UI** | Approval → tab **Kebijakan Otomatis** (daftar, ubah, mode, statistik shadow: "cocok dengan keputusan Anda n/m") + penanda **Otomatis** di daftar & detail, panel **Verifikasi aset** (tabel per aset: cocok/tidak + kolom berbeda), tombol **Batalkan pengiriman** selama masa tunda; **Buka kembali** tetap ada. |

### 24.4 Tahapan

1. **Fondasi tanpa OnTrack**: `agent_runs` + worker (run dari tombol ikut pindah ke tabel), tabel kebijakan + UI, pemicu,
   mode shadow, `submit_asset_check` dengan **sumber master tiruan** (berkas CSV/JSON uji, hanya dev), keputusan otomatis +
   Register tertunda. Diuji dengan pengajuan `[UJI]` lewat Simulator WhatsApp.
2. **Skill `penetapan-psp`** (butuh C5): langkah ekstraksi aset, cabang PSP / Telaah Staf, contoh gaya.
3. **Sambung OnTrack** (setelah C1): klien REST menggantikan sumber tiruan. Mode shadow dijalankan pada pengajuan nyata
   sampai cocok dengan keputusan user beberapa kali, baru mode `auto`.
4. Kebijakan untuk jenis lain (panitia penghapusan, pemanfaatan) memakai komponen yang sama, dengan pemeriksa server
   sesuai jenisnya.

### 24.5 Keputusan

AG-26 s.d. AG-29 diputuskan user 2026-11-06 sesuai rekomendasi di bawah (AG-27: otomatis hanya sampai konsep tersimpan di
SRIKANDI; AG-28: tahap 1 dengan data master tiruan, shadow dulu lalu auto dinaikkan user sendiri).

| ID | Pertanyaan | Rekomendasi |
|---|---|---|
| AG-26 | Arti "75% benar", dan aset mana yang masuk PSP? | Skor = persen **aset** yang cocok penuh pada kolom kritis (NUP, kode barang) + kolom lain dalam toleransi. PSP **hanya memuat aset yang cocok**; aset yang tidak cocok masuk Telaah Staf terlampir. Bila semua harus satu dokumen, ambang dinaikkan ke 100%. |
| AG-27 | Sejauh mana "kirim ke SRIKANDI" otomatis? | Sampai **konsep tersimpan** di Log Naskah Keluar (setelah masa tunda 15 menit). Kirim Konsep / TTE tetap ditekan user, karena itu tindakan resmi atas nama pejabat. |
| AG-28 | Urutan kerja | Tahap 1 sekarang (fondasi + master tiruan), skill setelah C5, OnTrack setelah C1. Mode `auto` hanya setelah shadow cocok minimal 5 pengajuan nyata. |
| AG-29 | Kabar WhatsApp ke pemohon saat disetujui otomatis | Ya, tetapi baru setelah konsep tersimpan di SRIKANDI (bukan saat status berubah), agar tidak memberi kabar bila pengiriman dibatalkan. |

### 24.6 Tahap 1 yang dibangun (2026-11-06)

| Bagian | Isi |
|---|---|
| Data | `agent_policies` (aturan per pemilik: jenis, grup, skill, mode off/shadow/auto, ambang, kolom kritis, toleransi nilai %, batas harian, masa tunda, templat Register), `agent_runs` (semua run agen — tombol, chat, aturan — permanen; dulu di memori), `users.agent_auto_paused` (sakelar darurat), `requests.asset_check` & `requests.auto_decision`. Migrasi `20261106120000_agent_policies`. |
| Logika murni | `backend/src/agent/agent-policy.ts` (+ test): `compareAssets` (cocok lewat NUP + kode barang, lalu NUP saja; nama hanya informasi kecuali dijadikan kolom kritis), `matchPolicy` (aturan dengan grup menang atas aturan semua grup), `decidePolicy` (lolos hanya bila master tersedia, skor ≥ ambang, ada dokumen, belum diputuskan; shadow / sakelar darurat / batas harian = tidak diterapkan). |
| Verifikasi aset | Alat MCP `submit_asset_check` → `AssetVerificationService`: agen menyerahkan daftar aset dari berkas, **server** mencocokkan ke data master dan menghitung skor; respons `branch: lanjut | telaah`. Sumber master tahap 1 = berkas JSON tiruan `AGENT_ASSET_MASTER_FILE` (dev: `backend/test/fixtures/asset-master.json`, isi `[UJI]`); kosong = selalu telaah. OnTrack menggantikannya (C1). |
| Pemicu & run | `AgentPolicyService`: pengajuan baru milik pemilik agen yang cocok aturan → `agent_runs` `queued` (trigger `policy`). Pemantau `AgentService` (10 dtk) memulai run Hermes setelah pengajuan tenang 90 dtk dan berkasnya selesai dibaca (maks. tunggu 15 menit), lalu membaca status run; run > 45 menit = gagal. |
| Keputusan | Run selesai → `finalize`: run gagal = telaah; tanpa templat Register = tidak diterapkan. Diterapkan (auto) → status **Disetujui** (riwayat oleh "kebijakan") → entri Register `reg-auto-<id>` (isian disalin dari templat Register, berkas = dokumen terakhir pengajuan, nomor = Ambil Nomor) → job BullMQ `agent-send` setelah masa tunda → `registerSrikandiOutgoing` (Simpan konsep saja) → kabar status (WhatsApp) **setelah** konsep tersimpan. Tidak diterapkan → **Menunggu verifikasi** + alasan. |
| Endpoint | `GET/POST /agent/policies`, `PATCH/DELETE /agent/policies/:id`, `POST /agent/policies/pause { paused }`, `POST /agent/requests/:id/auto/cancel` (batalkan kiriman selama masa tunda → kembali menunggu verifikasi). Semua hanya pemilik agen. |
| UI | Approval → tab **Kebijakan Otomatis** (`policies-tab.tsx`: penjelasan, sakelar darurat, daftar aturan + statistik kecocokan shadow vs keputusan user, formulir aturan, peringatan alat bawaan Hermes saat mode auto). Daftar Approval: penanda keadaan otomatis. Detail: panel **Kebijakan Otomatis** (`auto-decision-panel.tsx`: keputusan + alasan, jadwal kirim, Batalkan kiriman, Buka di Register, tabel verifikasi aset). Riwayat menampilkan "oleh Kebijakan Otomatis". |
| Diuji | unit backend +9, frontend +4, smoke +5, uji API ujung-ke-ujung 12/12 (aturan shadow → antri → `submit_asset_check` 2/3 = 67% → run Hermes → keputusan "perlu telaah", tidak disetujui, statistik). Run Hermes berakhir **gagal** karena key Gemini 401 — jalur "lolos" dengan model sungguhan & pengiriman ke SRIKANDI **belum** diuji. |

**Belum**: skill `penetapan-psp` (C5), draf skill buatan Hermes yang diaktifkan user, pembatasan toolset Hermes (wajib sebelum
mode auto dipakai sungguhan), sumber master OnTrack.

## 25. Peta jalan penyempurnaan agen (permintaan user 2026-11-05, dikerjakan satu per satu)

| No | Pekerjaan | Status | Catatan |
|---|---|---|---|
| 1 | Komunikasi Hermes ↔ Obsidian ↔ LifeOS | ✅ kecuali jawaban model sungguhan | Hasil di §25.1 |
| 2 | Hermes membentuk skill & bekerja otomatis tanpa Approval; **Kirim Konsep di SRIKANDI tetap di tangan user** | 🚧 tahap 1 ✅ 2026-11-06 (§24.6) | Sisa: skill `penetapan-psp` (C5), draf skill dari Hermes, pembatasan toolset Hermes, uji dengan model sungguhan |
| 3 | Fitur Hermes seperti di aplikasi desktopnya, di dalam LifeOS | Belum | Daftar fitur yang diinginkan perlu dipastikan dengan user |
| 4 | Antarmuka Obsidian di LifeOS (Graph View, dsb.) | ✅ 2026-11-06 | Menu **Pengetahuan** — rencana §25.2, hasil §25.4 |
| 5 | Pembagian model: penalaran agen Claude dengan cadangan OpenAI; tugas biasa, RAG, chatbot dengan Gemini | ✅ 2026-11-06 | Cadangan per tugas di Pembagian tugas AI + cadangan di proxy agen (§25.3). Uji Claude sungguhan menunggu key/router user |

### 25.1 Hasil nomor 1 (2026-11-05)

```
Obsidian ⇄ berkas vault → LifeOS (pemantau → knowledge_notes + knowledge_links → ai_chunks)
                              ↑ MCP + kunci agen (18 alat)        ↑ proxy model
                            Hermes ────────────────────────────────┘
```

Obsidian dan Hermes tidak saling memanggil: **LifeOS adalah satu-satunya perantara**. Hermes membaca vault lewat
`search_knowledge` / `read_knowledge_note` dan menulis lewat `add_knowledge_inbox` (hanya folder `00-Inbox`, status draf).

**Terbukti sungguhan**: berkas baru di vault terbaca ± 3 detik dan bisa dicari; `hermes mcp test lifeos` dari dalam container
= tersambung, 18 alat; lewat MCP dengan kunci agen: cari → baca → ikuti tautan & backlink → tulis Inbox → berkas muncul di disk.

**Diperbaiki**:
- Embedding gagal (key ditolak, kuota, provider sibuk) membuat catatan baru **tidak tersimpan sama sekali** di indeks, sehingga
  tidak bisa dicari walau per kata. Kini potongan tetap disimpan tanpa vektor dan error tetap dicatat; vektornya menyusul saat
  percobaan ulang atau saat key diganti (menyimpan key memicu bangun ulang indeks).
- Kartu **Siapkan agen** punya langkah 4 Basis pengetahuan (vault, jumlah catatan, gangguan indeks) dan keterangan error 401.
- `read_knowledge_note` tidak lagi menampilkan tautan yang sama dua kali.

**Belum terbukti**: Hermes menjalankan alur ini dengan model sungguhan. API key Gemini tersimpan ditolak Google (401, terakhir
berhasil 31 Okt), jadi run agen berhenti di panggilan model pertama. Menunggu key baru dari user (TODO-USER A1).

**Temuan untuk nomor 2**: Hermes menyalakan toolset bawaan `terminal`, `file`, `browser`, `web`, `code_execution`, `cronjob`,
`delegation`, dan `computer_use` di container (backend terminal `local`, tanpa sandbox). Sebelum agen dibuat otomatis, toolset
perlu dibatasi ke yang dipakai skill LifeOS.

### 25.2 Rencana nomor 4 — menu **Pengetahuan** (antarmuka Obsidian di LifeOS, riset 2026-11-06)

Keputusan user: menu baru **Pengetahuan** di sidebar (Tools → Basis Pengetahuan tetap untuk pengaturan vault & profil kerja),
"full feature": Graph View, penjelajah vault, pencarian, sunting catatan + fitur lain yang berguna. Riset: fitur inti Obsidian
1.12 (Graph view global & lokal, File explorer, Backlinks + Unlinked mentions, Outgoing links, Outline, Tags, Properties,
Search beroperator, Quick switcher, Page preview, Bookmarks, Bases = tampilan tabel dari properti) — dipilih yang berguna
untuk basis pengetahuan BMN, bukan meniru Obsidian utuh (Canvas, plugin, tema tidak dibawa).

**Prinsip**
- Vault di disk tetap **sumber kebenaran**; LifeOS membaca dari `knowledge_notes`/`knowledge_links` dan menulis ke berkas
  (pemantau vault yang sudah ada membaca ulang ± 3 detik → indeks RAG & graf ikut).
- Menulis dari LifeOS **aman terhadap Obsidian/Syncthing**: setiap simpan membawa `hash` versi yang dibuka; bila berkas di disk
  sudah berubah → 409 + pilihan "Muat versi terbaru / Simpan sebagai salinan" (tidak pernah menimpa diam-diam). Tulis atomik
  (berkas sementara → rename), hanya `.md`, path dijaga tetap di dalam vault, ukuran ≤ `MAX_NOTE_BYTES`.
- Hapus = pindah ke folder `.trash` vault (sama dengan Obsidian), bukan hapus permanen.
- Agen Hermes **tetap hanya** menulis ke `00-Inbox` (alat MCP tidak berubah); menyunting catatan berlaku hanya untuk user di UI.

**Tata letak** (desktop ≥ 1024 px, 3 kolom seperti Obsidian; HP = tab Penjelajah | Catatan | Graf)
- Kiri: **Penjelajah** (pohon folder, jumlah catatan, ikon jenis/status, buat catatan/folder, ganti nama, pindah, hapus ke
  `.trash`) | tab **Pencarian** | **Tag** | **Penanda** (bookmark).
- Tengah: **Catatan** — mode Baca (Markdown + `[[tautan]]` bisa diklik, `![[sematan]]` gambar/PDF/catatan, callout `> [!note]`,
  pratinjau saat hover tautan) dan mode Sunting (editor Markdown sumber + bilah alat, pelengkap otomatis `[[` judul catatan,
  simpan otomatis bertanda hash). Tab beberapa catatan, riwayat maju/mundur, `?note=<id>` deep link.
- Kanan: **Properti** (frontmatter sebagai formulir: status, jenis, publik, grup, dasar_hukum, tag; bisa diubah), **Garis besar**
  (judul/BAB/Pasal → lompat), **Backlink** + **Sebutan tanpa tautan** (catatan yang menyebut judul tanpa `[[ ]]` → tombol
  "Tautkan"), **Tautan keluar** (termasuk yang belum ada → "Buat catatan"), **Graf lokal** (kedalaman 1–3).
- Tampilan **Graf** penuh: graf global force-directed, filter folder / tag / status / jenis / tampilkan yatim & lampiran /
  tautan tak ditemukan, **grup warna** (aturan folder/tag/status → warna token), kedalaman graf lokal, gaya (ukuran node =
  jumlah backlink, tebal garis, label saat zoom), klik = buka catatan, hover = sorot tetangga.
- Tampilan **Tabel** (setara Bases sederhana): catatan sebagai baris, kolom = properti terpilih, saring & urutkan (mis. semua
  peraturan `status: berlaku` + `jenis: peraturan`), ubah properti langsung di sel.

**Fitur pendukung**
- **Pencarian**: kata (judul, isi, path) dengan penyorot cuplikan + operator `path:`, `tag:`, `status:`, `jenis:`, dan mode
  **Makna (AI)** memakai `AiIndexService.search` koleksi `knowledge` (sudah ada).
- **Pembuka cepat** Ctrl+O (cari judul/alias → buka) dan **palet perintah** sederhana (catatan baru, buka graf, Inbox).
- **Inbox**: tampilan khusus `00-Inbox` (usulan agen/chatbot) dengan tombol **Pindahkan ke folder…** + set `status: berlaku`
  → kurasi bisa dilakukan tanpa membuka Obsidian.
- **Templat**: catatan baru dari `90-Templat` (isian `{{judul}}`, `{{tanggal}}`), sesuai struktur vault §10.3.
- **Kesehatan vault**: catatan bermasalah (`noteProblems`), tautan rusak, catatan yatim, duplikat judul — dipindah dari kartu
  Tools.
- **Tanya pengetahuan**: tombol "Tanya AI tentang catatan ini" → chatbot melayang dengan catatan sebagai konteks; sitasi
  chatbot yang menunjuk catatan vault membuka menu Pengetahuan (menggantikan dialog `KnowledgeNoteHost`).

**Teknologi**: graf `react-force-graph-2d` 1.29 (MIT, canvas, d3-force, dimuat malas) — dipilih atas sigma.js (WebGL, lebih
cocok > 10 rb node; vault user ratusan–ribuan). Markdown baca = komponen `Markdown` yang ada + plugin wikilink/callout;
editor = CodeMirror 6 mode Markdown (ringan, sama dengan Obsidian, dimuat malas) — bukan Tiptap, agar sintaks Obsidian
(`[[…]]`, frontmatter, callout) tidak rusak saat disimpan.

**Backend baru**: `GET /knowledge/graph` (node + edge ringkas), `GET /knowledge/tree`, `GET /knowledge/search?q=&mode=`,
`GET /knowledge/notes/:id/unlinked`, `PUT /knowledge/notes/:id { content, frontmatter?, baseHash }`, `POST /knowledge/notes`
(baru/dari templat), `POST /knowledge/notes/:id/move`, `DELETE /knowledge/notes/:id` (→ `.trash`), `POST /knowledge/folders`;
tag dibaca dari frontmatter + `#tag` di isi (kolom `tags` jsonb baru di `knowledge_notes`, migrasi). Penanda & grup warna graf
disimpan per user (`users.knowledge_prefs` jsonb).

**Tahapan** (masing-masing diuji & bisa dipakai sendiri): (a) Penjelajah + pembaca + panel kanan + pencarian kata & pembuka
cepat → (b) Graf global & lokal + filter & grup warna → (c) Sunting (editor, properti, buat/ganti nama/pindah/hapus, templat,
konflik hash) + Inbox kurasi → (d) Tabel properti, pencarian makna, sebutan tanpa tautan, kesehatan vault, Tanya AI.

### 25.3 Hasil nomor 5 (2026-11-06)

Pengaturan → Model AI → **Pembagian tugas AI**: baris Chat & telaah, Fitur AI lain, dan Agen (Hermes) punya pilihan
**Cadangan** (bawaan "Otomatis" = urutan katalog). Urutan percobaan: provider tugas → cadangan pilihan → provider lain yang
punya key; semuanya hanya bila sakelar **Cadangan otomatis** menyala. Proxy model agen kini ikut berpindah: gagal karena
kuota/limit (429), saldo (402), waktu habis, atau provider sibuk/rusak (5xx, 529) **sebelum** jawaban mulai dikirim → provider
berikutnya; key ditolak / model tidak ada tidak dialihkan. Kartu **Siapkan agen** menulis "Memakai cadangan karena … gagal".

Untuk rencana user: Agen = Claude (langsung atau lewat router) + cadangan OpenAI; Chat & telaah / Fitur AI lain = Gemini (+ cadangan
OpenAI); OCR & embedding = Gemini. Cukup diatur di kartu itu, tanpa kode.

### 25.4 Hasil nomor 4 (2026-11-06)

Menu **Pengetahuan** (Workspace, setelah Notes Space) dibangun sesuai rencana §25.2 dalam satu tahap (a–d sekaligus):
- **Catatan**: penjelajah (pohon folder + jumlah, menu klik kanan, seret-lepas ke folder, buat catatan/folder, ganti nama,
  pindah, hapus ke `.trash`), Cari (kata beroperator / makna AI), Tag (bertingkat), Penanda; pembaca dengan `[[tautan]]` +
  pratinjau saat hover, `![[sematan]]` gambar/berkas/catatan, callout; editor sumber (simpan otomatis + Ctrl+S, pelengkap `[[`,
  penolak bentrok); panel Properti, Garis besar, Backlink, Sebutan tanpa tautan (+ Tautkan), Tautan keluar (+ Buat catatan), Graf
  lokal (kedalaman 1–3), Tanya AI (jawaban → Inbox); Buka di Obsidian (`obsidian://`).
- **Graf** global (filter, Inbox/Templat/yatim/berkas/tautan belum ada, warna menurut status + grup warna tersimpan, label,
  ukuran, jarak), **Tabel** (kolom properti, urutkan, ubah status/jenis/publik di sel), **Inbox** (kurasi), **Kesehatan**,
  pembuka cepat Ctrl+O.

Uji: unit backend +26 (`vault-editor.spec.ts`) & frontend +9 (`knowledge-logic.test.ts`), uji API vault sementara 29/31 (2 sisa =
pemindaian awal belum selesai saat dicek, bukan bug), smoke +11, UI desktop 1024 px & HP 375 px (buat → sunting → properti →
hapus di vault dev; catatan uji dibersihkan). Bug yang ditemukan saat uji & diperbaiki: catatan di akar vault gagal dibuat,
properti ditolak (`id` ikut body), pembuka cepat crash (`CommandDialog` tanpa `<Command>`), id judul bergeser di StrictMode.

Belum / catatan: frontmatter di editor sumber tampil seperti judul (kosmetik parser Markdown); gambar sematan hanya PNG/JPG/GIF/
WEBP/BMP dan tidak ikut diindeks; Canvas, plugin, dan tema Obsidian memang tidak dibawa.

### 25.5 Lanjutan nomor 4: cermin hasil kerja, graf ala Obsidian, Tools dirapikan (2026-11-06)

Permintaan user: hasil kerja LifeOS (catatan, My Notebook, Productivity) harus tampil di Obsidian; graf seperti aplikasi
Obsidian; tumpang tindih menu Pengetahuan vs Tools → Basis Pengetahuan diselesaikan.

- **Cermin `80-LifeOS/`** (`KnowledgeExportService`, `vault-export.ts`): satu arah LifeOS → vault, diperbarui ± 1 menit setelah
  data berubah (sidik jari jumlah + waktu ubah per tabel) atau lewat **Sinkronkan sekarang**. Isi: `Catatan Bebas/`,
  `List Bebas/`, `Notes AI/` (tanggal + judul), `My Notebook/<notebook>.md` + `Catatan/` + `Riwayat Chat - …`, `Productivity/`
  `Project/` (Action berbobot sebagai checklist, Dasar Pelaksanaan, Agenda), `Area/` (struktur Sub Area → Kegiatan → Sub Kegiatan
  + task), `Agenda/` (yang punya hasil / induk / Notes AI), `Resource/`; indeks `LifeOS.md`. Frontmatter `sumber: lifeos`, `jenis:
  lifeos-…`, `lifeos_id`, alamat Buka di LifeOS. Tautan memakai path lengkap sehingga tidak ambigu.
- Aman: hanya berkas bertanda `sumber: lifeos` yang ditimpa/dihapus (catatan user di folder itu tidak disentuh); tidak diindeks
  ulang sebagai pengetahuan; baca saja di menu Pengetahuan (server menolak sunting/pindah/hapus); hanya data milik sendiri;
  berkas lampiran tidak disalin. Pengaturan per user di `knowledge_prefs.export` (bawaan mati).
- **Graf**: panel Filter / Grup / Tampilan / Gaya + tombol Animasi mengikuti Graph view Obsidian; tag bisa menjadi node; posisi
  node dipertahankan saat difilter; pengaturan disimpan per browser.
- **Tools → Basis Pengetahuan** = pengaturan (profil kerja, vault, cermin, cara memakai); daftar catatan & masalah hanya di menu
  Pengetahuan (tab Catatan & Kesehatan).

Uji: unit backend +4 (`vault-export.spec.ts`, termasuk "semua tautan terselesaikan") & frontend +3 (`graph-settings.test.ts`),
smoke +7 (aktifkan, sinkron, berkas ada, baca saja 400, hapus berkas, matikan), vault dev 47 berkas dicerminkan tanpa potongan
indeks, UI (Tools, graf + tag + animasi, catatan cermin → Buka di LifeOS).
