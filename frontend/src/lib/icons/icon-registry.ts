import {
  Activity,
  AlarmClock,
  Apple,
  Archive,
  Award,
  Baby,
  Backpack,
  Banknote,
  Bed,
  Bell,
  Bike,
  BookOpen,
  Brain,
  Briefcase,
  BriefcaseBusiness,
  Bug,
  Building,
  Building2,
  Bus,
  Cake,
  Calculator,
  CalendarClock,
  CalendarDays,
  Camera,
  Car,
  Cat,
  ChartBar,
  ChartLine,
  ChartPie,
  Church,
  CircleHelp,
  Clapperboard,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Cloud,
  CloudRain,
  Code,
  Coffee,
  Coins,
  Compass,
  Cpu,
  CreditCard,
  Database,
  Dog,
  Droplets,
  Dumbbell,
  FileSignature,
  FileText,
  Flag,
  Flame,
  Flower2,
  FolderOpen,
  Footprints,
  Fuel,
  Gamepad2,
  Gift,
  Globe,
  GraduationCap,
  Hammer,
  HandCoins,
  Handshake,
  Headphones,
  Heart,
  HeartPulse,
  Hospital,
  Hotel,
  Hourglass,
  House,
  Key,
  Landmark,
  Languages,
  Laptop,
  Leaf,
  Library,
  Lightbulb,
  Lock,
  Luggage,
  type LucideIcon,
  Mail,
  Map as MapIcon,
  MapPin,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Mic,
  Monitor,
  Moon,
  Mountain,
  Music,
  NotebookPen,
  Palette,
  PartyPopper,
  Pencil,
  Phone,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Presentation,
  Printer,
  Receipt,
  Salad,
  School,
  Server,
  Settings,
  Shield,
  Ship,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sofa,
  Sparkles,
  Sprout,
  Stamp,
  Star,
  Stethoscope,
  Sun,
  Syringe,
  Tag,
  Target,
  Tent,
  Timer,
  TrainFront,
  Trees,
  Trophy,
  Tv,
  Umbrella,
  User,
  UserRoundCheck,
  Users,
  UsersRound,
  Utensils,
  Video,
  Volleyball,
  Wallet,
  Wifi,
  Wine,
  Wrench,
} from "lucide-react";

/**
 * Paket ikon aplikasi (sumber tunggal) — dipakai pemilih ikon (`IconPicker`) dan fitur mana pun yang menyimpan ikon
 * sebagai **key string** (mis. tipe agenda Planner). Key = nama ikon lucide (kebab-case) agar mudah dirujuk; label &
 * kata kunci berbahasa Indonesia dipakai pencarian dan saran ikon AI. Menambah ikon cukup menambah entri di sini.
 */
export interface AppIcon {
  key: string;
  label: string;
  category: IconCategory;
  /** Kata kunci pencarian (Indonesia + Inggris) */
  keywords: string;
  icon: LucideIcon;
}

export const ICON_CATEGORIES = [
  { id: "kerja", label: "Kerja & Kantor" },
  { id: "rapat", label: "Rapat & Komunikasi" },
  { id: "belajar", label: "Belajar" },
  { id: "waktu", label: "Waktu & Jadwal" },
  { id: "perjalanan", label: "Perjalanan" },
  { id: "kesehatan", label: "Kesehatan & Olahraga" },
  { id: "keuangan", label: "Keuangan & Belanja" },
  { id: "rumah", label: "Rumah & Keluarga" },
  { id: "santai", label: "Makan & Hiburan" },
  { id: "acara", label: "Acara & Ibadah" },
  { id: "teknologi", label: "Teknologi" },
  { id: "alam", label: "Alam & Cuaca" },
  { id: "umum", label: "Umum" },
] as const;

export type IconCategory = (typeof ICON_CATEGORIES)[number]["id"];

const i = (key: string, icon: LucideIcon, label: string, category: IconCategory, keywords = ""): AppIcon => ({
  key,
  icon,
  label,
  category,
  keywords,
});

export const APP_ICONS: AppIcon[] = [
  // Kerja & Kantor
  i("briefcase", Briefcase, "Kerja", "kerja", "kantor pekerjaan meeting dinas work office"),
  i("briefcase-business", BriefcaseBusiness, "Bisnis", "kerja", "bisnis usaha klien proyek business"),
  i("building", Building, "Gedung", "kerja", "kantor gedung instansi building"),
  i("building-2", Building2, "Perusahaan", "kerja", "perusahaan korporat kantor pusat company"),
  i("landmark", Landmark, "Pemerintahan", "kerja", "pemerintah dinas kementerian bank lembaga government"),
  i("file-text", FileText, "Dokumen", "kerja", "dokumen surat laporan berkas document"),
  i("file-signature", FileSignature, "Tanda Tangan", "kerja", "kontrak tanda tangan perjanjian notaris sign"),
  i("clipboard-list", ClipboardList, "Daftar Tugas", "kerja", "tugas checklist todo daftar task"),
  i("clipboard-check", ClipboardCheck, "Evaluasi", "kerja", "evaluasi review audit pemeriksaan selesai"),
  i("folder-open", FolderOpen, "Berkas", "kerja", "folder arsip berkas file"),
  i("archive", Archive, "Arsip", "kerja", "arsip kearsipan simpan archive"),
  i("presentation", Presentation, "Presentasi", "kerja", "presentasi paparan pemaparan slide demo"),
  i("chart-bar", ChartBar, "Laporan", "kerja", "laporan statistik kinerja grafik report"),
  i("chart-line", ChartLine, "Progres", "kerja", "progres tren pertumbuhan analisis"),
  i("target", Target, "Target", "kerja", "target sasaran tujuan goal okr"),
  i("flag", Flag, "Milestone", "kerja", "milestone tenggat deadline penanda"),
  i("award", Award, "Penghargaan", "kerja", "penghargaan sertifikat prestasi lomba"),
  i("stamp", Stamp, "Pengesahan", "kerja", "stempel legalisir pengesahan administrasi"),
  i("printer", Printer, "Cetak", "kerja", "cetak print fotokopi"),
  // Rapat & Komunikasi
  i("users", Users, "Pertemuan", "rapat", "rapat pertemuan tim grup diskusi meeting"),
  i("users-round", UsersRound, "Komunitas", "rapat", "komunitas organisasi arisan kumpul"),
  i("user", User, "Personal", "rapat", "pribadi personal satu orang"),
  i("user-round-check", UserRoundCheck, "Janji Temu", "rapat", "janji temu konsultasi appointment tamu"),
  i("handshake", Handshake, "Kerja Sama", "rapat", "kerja sama mou negosiasi kesepakatan deal"),
  i("messages-square", MessagesSquare, "Diskusi", "rapat", "diskusi forum obrolan chat fgd"),
  i("message-circle", MessageCircle, "Pesan", "rapat", "pesan chat whatsapp"),
  i("phone", Phone, "Telepon", "rapat", "telepon panggilan call"),
  i("mail", Mail, "Email", "rapat", "email surat surel undangan"),
  i("video", Video, "Online", "rapat", "online daring zoom meet webinar video conference"),
  i("mic", Mic, "Narasumber", "rapat", "narasumber pidato podcast rekaman seminar"),
  i("megaphone", Megaphone, "Pengumuman", "rapat", "pengumuman sosialisasi kampanye promosi"),
  // Belajar
  i("graduation-cap", GraduationCap, "Kuliah", "belajar", "kuliah kampus wisuda sekolah pendidikan"),
  i("school", School, "Sekolah", "belajar", "sekolah kelas les"),
  i("book-open", BookOpen, "Membaca", "belajar", "baca buku bacaan belajar"),
  i("library", Library, "Perpustakaan", "belajar", "perpustakaan referensi pustaka"),
  i("notebook-pen", NotebookPen, "Catatan", "belajar", "catatan menulis jurnal notulen"),
  i("pencil", Pencil, "Menulis", "belajar", "menulis tulis ujian pr tugas"),
  i("backpack", Backpack, "Pelajar", "belajar", "pelajar siswa tas sekolah"),
  i("lightbulb", Lightbulb, "Ide", "belajar", "ide inovasi gagasan brainstorming"),
  i("brain", Brain, "Pelatihan", "belajar", "pelatihan training workshop bimtek kursus berpikir"),
  i("languages", Languages, "Bahasa", "belajar", "bahasa kursus inggris terjemahan"),
  i("calculator", Calculator, "Hitung", "belajar", "hitung matematika akuntansi statistika"),
  // Waktu & Jadwal
  i("calendar-days", CalendarDays, "Kalender", "waktu", "kalender jadwal agenda acara"),
  i("calendar-clock", CalendarClock, "Terjadwal", "waktu", "terjadwal pengingat reminder"),
  i("clock", Clock, "Umum", "waktu", "jam waktu umum lainnya"),
  i("alarm-clock", AlarmClock, "Alarm", "waktu", "alarm bangun pagi pengingat"),
  i("timer", Timer, "Fokus", "waktu", "timer fokus pomodoro durasi"),
  i("hourglass", Hourglass, "Tenggat", "waktu", "tenggat menunggu deadline"),
  // Perjalanan
  i("plane", Plane, "Perjalanan Dinas", "perjalanan", "pesawat terbang dinas luar kota mudik liburan"),
  i("car", Car, "Mobil", "perjalanan", "mobil berkendara servis kendaraan"),
  i("bus", Bus, "Bus", "perjalanan", "bus angkutan transportasi umum"),
  i("train-front", TrainFront, "Kereta", "perjalanan", "kereta krl mrt commuter"),
  i("ship", Ship, "Kapal", "perjalanan", "kapal laut pelabuhan feri"),
  i("bike", Bike, "Sepeda", "perjalanan", "sepeda gowes motor"),
  i("map-pin", MapPin, "Lokasi", "perjalanan", "lokasi tempat kunjungan survei lapangan"),
  i("map", MapIcon, "Peta", "perjalanan", "peta rute wisata"),
  i("compass", Compass, "Eksplorasi", "perjalanan", "jelajah eksplorasi petualangan"),
  i("luggage", Luggage, "Liburan", "perjalanan", "liburan koper cuti travel"),
  i("hotel", Hotel, "Hotel", "perjalanan", "hotel menginap akomodasi"),
  i("fuel", Fuel, "BBM", "perjalanan", "bensin bbm isi bahan bakar"),
  // Kesehatan & Olahraga
  i("heart-pulse", HeartPulse, "Kesehatan", "kesehatan", "kesehatan medis checkup kontrol"),
  i("stethoscope", Stethoscope, "Dokter", "kesehatan", "dokter konsultasi periksa klinik"),
  i("hospital", Hospital, "Rumah Sakit", "kesehatan", "rumah sakit rs puskesmas"),
  i("pill", Pill, "Obat", "kesehatan", "obat minum obat vitamin apotek"),
  i("syringe", Syringe, "Vaksin", "kesehatan", "vaksin imunisasi suntik lab"),
  i("activity", Activity, "Aktivitas", "kesehatan", "aktivitas detak kebugaran"),
  i("dumbbell", Dumbbell, "Gym", "kesehatan", "gym fitness olahraga angkat beban"),
  i("footprints", Footprints, "Jalan / Lari", "kesehatan", "lari jogging jalan kaki langkah"),
  i("volleyball", Volleyball, "Olahraga", "kesehatan", "olahraga bola voli futsal badminton"),
  i("trophy", Trophy, "Kompetisi", "kesehatan", "lomba turnamen juara kompetisi"),
  i("apple", Apple, "Gizi", "kesehatan", "gizi buah diet sehat"),
  i("salad", Salad, "Diet", "kesehatan", "diet salad makan sehat"),
  // Keuangan & Belanja
  i("wallet", Wallet, "Keuangan", "keuangan", "keuangan dompet uang anggaran budget"),
  i("credit-card", CreditCard, "Pembayaran", "keuangan", "bayar kartu kredit transfer cicilan"),
  i("banknote", Banknote, "Gaji", "keuangan", "gaji uang tunai pendapatan"),
  i("piggy-bank", PiggyBank, "Tabungan", "keuangan", "tabungan investasi menabung"),
  i("receipt", Receipt, "Tagihan", "keuangan", "tagihan struk listrik internet pajak"),
  i("hand-coins", HandCoins, "Donasi", "keuangan", "donasi sedekah zakat iuran"),
  i("coins", Coins, "Koin", "keuangan", "koin recehan kas"),
  i("chart-pie", ChartPie, "Anggaran", "keuangan", "anggaran alokasi porsi budget"),
  i("shopping-cart", ShoppingCart, "Belanja", "keuangan", "belanja bulanan pasar supermarket"),
  i("shopping-bag", ShoppingBag, "Shopping", "keuangan", "shopping mall beli"),
  // Rumah & Keluarga
  i("house", House, "Rumah", "rumah", "rumah keluarga home"),
  i("sofa", Sofa, "Bersantai", "rumah", "santai istirahat rumah"),
  i("bed", Bed, "Tidur", "rumah", "tidur istirahat"),
  i("baby", Baby, "Anak", "rumah", "anak bayi keluarga posyandu"),
  i("dog", Dog, "Hewan Peliharaan", "rumah", "anjing hewan peliharaan pet"),
  i("cat", Cat, "Kucing", "rumah", "kucing hewan peliharaan"),
  i("shirt", Shirt, "Pakaian", "rumah", "cuci baju laundry pakaian"),
  i("wrench", Wrench, "Perbaikan", "rumah", "perbaikan servis bengkel maintenance"),
  i("hammer", Hammer, "Renovasi", "rumah", "renovasi tukang bangun"),
  i("flower-2", Flower2, "Taman", "rumah", "taman bunga kebun"),
  // Makan & Hiburan
  i("coffee", Coffee, "Ngopi", "santai", "kopi santai coffee break nongkrong"),
  i("utensils", Utensils, "Makan", "santai", "makan siang malam restoran kuliner"),
  i("pizza", Pizza, "Kuliner", "santai", "kuliner jajan pizza"),
  i("wine", Wine, "Jamuan", "santai", "jamuan gala dinner pesta"),
  i("music", Music, "Musik", "santai", "musik konser latihan band"),
  i("headphones", Headphones, "Podcast", "santai", "dengar podcast audio"),
  i("gamepad-2", Gamepad2, "Game", "santai", "game main hiburan"),
  i("tv", Tv, "Tontonan", "santai", "tv nonton film serial"),
  i("clapperboard", Clapperboard, "Film", "santai", "film bioskop produksi video"),
  i("camera", Camera, "Foto", "santai", "foto dokumentasi kamera"),
  i("palette", Palette, "Seni", "santai", "seni desain lukis kreatif"),
  // Acara & Ibadah
  i("party-popper", PartyPopper, "Perayaan", "acara", "pesta perayaan syukuran ulang tahun"),
  i("gift", Gift, "Hadiah", "acara", "hadiah kado"),
  i("cake", Cake, "Ulang Tahun", "acara", "ulang tahun kue milad"),
  i("heart", Heart, "Pernikahan", "acara", "nikah resepsi kondangan cinta"),
  i("church", Church, "Ibadah", "acara", "ibadah gereja kebaktian"),
  i("moon", Moon, "Ibadah Malam", "acara", "malam ramadan pengajian tahajud"),
  i("sparkles", Sparkles, "Spesial", "acara", "spesial istimewa"),
  i("star", Star, "Penting", "acara", "penting prioritas favorit"),
  // Teknologi
  i("laptop", Laptop, "Laptop", "teknologi", "laptop kerja remote"),
  i("monitor", Monitor, "Komputer", "teknologi", "komputer layar desktop"),
  i("smartphone", Smartphone, "Ponsel", "teknologi", "hp ponsel aplikasi mobile"),
  i("code", Code, "Pemrograman", "teknologi", "coding program developer sprint"),
  i("server", Server, "Server", "teknologi", "server infrastruktur deploy"),
  i("database", Database, "Data", "teknologi", "data database basis data"),
  i("cpu", Cpu, "Hardware", "teknologi", "hardware perangkat keras"),
  i("wifi", Wifi, "Internet", "teknologi", "internet wifi jaringan"),
  i("cloud", Cloud, "Cloud", "teknologi", "cloud awan backup"),
  i("bug", Bug, "Bug", "teknologi", "bug perbaikan error"),
  // Alam & Cuaca
  i("sun", Sun, "Pagi / Cerah", "alam", "pagi matahari cerah siang"),
  i("cloud-rain", CloudRain, "Hujan", "alam", "hujan cuaca"),
  i("umbrella", Umbrella, "Musim Hujan", "alam", "payung hujan"),
  i("leaf", Leaf, "Lingkungan", "alam", "lingkungan hijau daun"),
  i("trees", Trees, "Alam", "alam", "alam hutan outdoor"),
  i("mountain", Mountain, "Mendaki", "alam", "gunung mendaki hiking"),
  i("tent", Tent, "Kemah", "alam", "kemah camping outbound"),
  i("sprout", Sprout, "Bertumbuh", "alam", "tanam bertumbuh kebun"),
  i("flame", Flame, "Semangat", "alam", "api semangat streak"),
  i("droplets", Droplets, "Air", "alam", "air minum hidrasi"),
  // Umum
  i("bell", Bell, "Pengingat", "umum", "pengingat notifikasi bel"),
  i("tag", Tag, "Label", "umum", "label kategori tag"),
  i("settings", Settings, "Pengaturan", "umum", "pengaturan konfigurasi"),
  i("lock", Lock, "Privat", "umum", "privat rahasia kunci"),
  i("shield", Shield, "Keamanan", "umum", "keamanan proteksi asuransi"),
  i("key", Key, "Akses", "umum", "kunci akses"),
  i("globe", Globe, "Global", "umum", "dunia global internasional"),
  i("circle-help", CircleHelp, "Lainnya", "umum", "lainnya tanya bantuan"),
];

const BY_KEY = new Map(APP_ICONS.map((icon) => [icon.key, icon]));

/** Key lama → key baru (data yang tersimpan sebelum paket ikon diperluas). */
const ALIASES: Record<string, string> = {
  graduation: "graduation-cap",
  book: "book-open",
  heart: "heart-pulse",
};

/** Key valid di registry (mendukung alias lama), atau null. */
export const resolveIconKey = (key?: string | null): string | null => {
  if (!key) return null;
  if (BY_KEY.has(key)) return key;
  const alias = ALIASES[key];
  return alias && BY_KEY.has(alias) ? alias : null;
};

/** Ikon untuk key; key tidak dikenal → `fallback` (default "clock"). */
export const getAppIcon = (key?: string | null, fallback = "clock"): AppIcon =>
  BY_KEY.get(resolveIconKey(key) ?? fallback) ?? BY_KEY.get("clock")!;

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Cari ikon per kata (semua kata harus cocok dengan key/label/kata kunci), opsional per kategori. */
export const searchIcons = (query: string, category?: IconCategory | null) => {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return APP_ICONS.filter((icon) => {
    if (category && icon.category !== category) return false;
    if (words.length === 0) return true;
    const haystack = normalize(`${icon.key} ${icon.label} ${icon.keywords}`);
    return words.every((w) => haystack.includes(w));
  });
};
