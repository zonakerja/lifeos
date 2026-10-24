# AI Agent — Riset & Rencana Integrasi

Status: **tahap 1 (fondasi pengetahuan) & tahap 2 (konektor Obsidian) selesai 2026-10-24 — hasil di §17**; rencana terkini §9–§16 (revisi 2026-10-24 §16: data SIMAN & MyIntress dari OnTrack, bukan robot LifeOS) (kajian RAG, Obsidian, Hermes vs OpenClaw,
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
| R-2 | **Data yang dikirim ke Google**: setiap potongan teks record & berkas dikirim ke API embedding Gemini (sekali per perubahan), + OCR gambar/PDF scan, + teks pertanyaan. Menurut ketentuan Gemini API, **kuota gratis (unpaid)** boleh dipakai Google untuk memperbaiki produk dan **dibaca reviewer manusia**; **layanan berbayar** (billing Cloud aktif) tidak dipakai untuk melatih model. | Untuk surat dinas / data BMN / data satker, key Gemini **gratis tidak layak**. | User: aktifkan **billing** di project Google Cloud key tersebut (biaya embedding kecil) atau matikan indeks; opsi lanjut: embedding lokal di server (model embedding terbuka lewat Ollama) agar isi tidak keluar sama sekali. Tampilkan peringatan di Pengaturan → AI. |
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
| **4. Pengajuan + mesin templat + Antrian Verifikasi** | Modul Pengajuan (PSP / penghapusan / pemanfaatan), ekstraksi field, cek kelengkapan, placeholder templat → ONLYOFFICE, telaah & konsep jawaban surat | Use case 2 & 3 bisa dikerjakan lewat UI LifeOS (unggah manual) sebelum WhatsApp |
| **5. Hermes** | Compose profile `agent`: `hermes-private` (memori, Telegram/WhatsApp Anda) + `hermes-public` (WhatsApp Cloud API, terkunci) | Use case 1 lewat WhatsApp; pengajuan masuk otomatis |
| **5b. Konektor OnTrack** (revisi 2026-10-24, §16) | Klien REST API OnTrack (API key) di backend + OnTrack sebagai server MCP kedua untuk Hermes; data SIMAN & MyIntress untuk pengajuan, telaah, dan chatbot | Agen bisa mencocokkan NUP/kode barang & data keuangan tanpa robot di LifeOS |
| **6. Robot & konektor sesi** | Service Playwright + profil persisten + browser jarak jauh; **hanya e-Kinerja (bulanan) → SRIKANDI** (SIMAN pindah ke OnTrack) | Detail dibahas setelah tahap 4–5 |

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
- **AG-21 — ditunda**: robot e-Kinerja & SRIKANDI akan dibangun di LifeOS; keputusan memakai ulang mesin Playwright/vault
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
- R-2 ✅ peringatan kuota gratis Gemini di Pengaturan → AI dan Tools → Basis Pengetahuan (billing tetap tindakan user).
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
(2) isi Profil kerja; (3) Pengaturan → AI → **Indeks ulang** sekali (aturan pemotongan baru); (4) aktifkan billing
Gemini untuk data kantor. Berikutnya: tahap 3 (token akses + MCP LifeOS).
