import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  BookOpen,
  BookOpenText,
  BookUser,
  Bot,
  BotMessageSquare,
  CalendarDays,
  CalendarRange,
  CheckCheck,
  ClipboardList,
  Contact,
  DatabaseZap,
  FilePen,
  FilePlus2,
  FileSignature,
  FileX,
  FolderTree,
  Grid2x2,
  HardDrive,
  Hourglass,
  Inbox,
  Layers,
  LayoutGrid,
  Library,
  ListChecks,
  ListTodo,
  MessageCircle,
  MessagesSquare,
  NotebookPen,
  Package,
  Plug,
  Settings,
  Settings2,
  Share2,
  Sparkles,
  StickyNote,
  Tag,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/types/api";

export type ModuleKey =
  | "overview"
  | "planner"
  | "notes"
  | "productivity"
  | "files"
  | "requests"
  | "agent"
  | "kinerja"
  | "srikandi"
  | "tools"
  | "settings"
  | "profile";

export interface ModuleTab {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Role yang boleh melihat tab. Kosong = semua role. */
  roles?: UserRole[];
}

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  description: string;
  path: string;
  icon: LucideIcon;
  tabs?: ModuleTab[];
  /** Tidak tampil sebagai modul di sidebar (dibuka dari menu lain, mis. menu user). */
  hiddenInSidebar?: boolean;
  /** Di sidebar tampil sebagai menu yang bisa dibuka berisi sub menu (= tab), seperti Pengaturan. */
  sidebarSubmenu?: boolean;
  /** Kelompok sidebar: `workspace` (default), `agent` (AI Agent) atau `system` (Tools, Pengaturan). */
  sidebarGroup?: "workspace" | "agent" | "system";
}

/** Sumber tunggal navigasi: sidebar, router, breadcrumb, hero halaman. */
export const MODULES: ModuleDef[] = [
  {
    key: "overview",
    label: "Overview",
    description: "Ringkasan hari ini: agenda, rutinitas, tugas, dan progres proyek.",
    path: "/",
    icon: LayoutGrid,
  },
  {
    key: "planner",
    label: "Planner",
    description: "Agenda harian, jadwal, rutinitas, dan referensi tipe agenda.",
    path: "/planner",
    icon: CalendarDays,
    tabs: [
      { id: "daily", label: "Harian", icon: Activity },
      { id: "schedule", label: "Jadwal", icon: CalendarRange },
      { id: "routines", label: "Rutinitas", icon: Settings2 },
      { id: "references", label: "Referensi", icon: Tag },
    ],
  },
  {
    key: "notes",
    label: "Notes Space",
    description: "Catatan bebas, daftar, catatan berbasis AI, dan notebook riset AI dari sumber Anda.",
    path: "/notes",
    icon: StickyNote,
    tabs: [
      { id: "free", label: "Catatan Bebas", icon: NotebookPen },
      { id: "lists", label: "List Bebas", icon: ListChecks },
      { id: "ai", label: "Notes AI", icon: Sparkles },
      { id: "notebook", label: "My Notebook", icon: BookOpenText },
    ],
  },
  {
    key: "productivity",
    label: "Productivity",
    description: "Metode PARA: Projects, Areas, Resources, dan Archives.",
    path: "/productivity",
    icon: Layers,
    tabs: [
      { id: "overview", label: "Overview", icon: LayoutGrid },
      { id: "projects", label: "Projects", icon: Layers },
      { id: "areas", label: "Areas", icon: Grid2x2 },
      { id: "resources", label: "Resources", icon: BookOpen },
      { id: "archives", label: "Archives", icon: Archive },
    ],
  },
  {
    key: "requests",
    label: "Approval",
    description:
      "Pengajuan & surat dari satker, instansi, atau masyarakat — lewat aplikasi, agen, atau bot WhatsApp: analisis kelengkapan, telaah, konsep jawaban, dan dokumen dari templat — semua menunggu persetujuan Anda.",
    path: "/requests",
    icon: Inbox,
    tabs: [
      { id: "queue", label: "Antrian Verifikasi", icon: ListTodo },
      { id: "done", label: "Selesai", icon: CheckCheck },
      { id: "whatsapp", label: "Percakapan WA", icon: MessageCircle },
      { id: "contacts", label: "Grup & Kontak", icon: Contact },
    ],
  },
  {
    key: "files",
    label: "File Control",
    description: "Manajemen kearsipan: pemberkasan, penataan, sirkulasi, dan penyusutan.",
    path: "/file-control",
    icon: ArchiveRestore,
    tabs: [
      { id: "pending", label: "Gantung", icon: Hourglass },
      { id: "physical", label: "Fisik", icon: Package },
      { id: "digital", label: "Digital", icon: HardDrive },
      { id: "arrangement", label: "Penataan", icon: FolderTree },
      { id: "transactions", label: "Transaksi", icon: ArrowRightLeft },
      { id: "static", label: "Statis", icon: Archive },
      { id: "destroyed", label: "Musnah", icon: FileX },
      { id: "references", label: "Referensi", icon: Tag },
      { id: "shared", label: "Dibagikan", icon: Users },
    ],
  },
  {
    key: "agent",
    label: "Asisten Agen",
    description:
      "Agen AI Hermes yang bekerja dengan data LifeOS: chat, skill dokumen bertemplat, dan tugas atas pengajuan — hasilnya selalu Anda periksa di Approval.",
    path: "/agent",
    icon: BotMessageSquare,
    sidebarGroup: "agent",
    tabs: [
      { id: "chat", label: "Chat", icon: MessagesSquare },
      { id: "status", label: "Status & Skill", icon: Activity },
    ],
  },
  {
    key: "kinerja",
    label: "Laporan Kinerja",
    description:
      "Rencana aksi bulanan e-Kinerja yang Anda pilih dari Productivity, dipetakan ke RHK SKP yang diambil robot — robot hanya mengisikan draf.",
    path: "/kinerja",
    icon: ClipboardList,
    sidebarGroup: "agent",
    tabs: [
      { id: "plan", label: "Rencana Aksi", icon: ClipboardList },
      { id: "connector", label: "Connector", icon: Bot },
    ],
  },
  {
    key: "srikandi",
    label: "SRIKANDI",
    description:
      "Register naskah keluar sebelum didaftarkan ke SRIKANDI, lalu naskah ber-TTD diambil robot kembali ke LifeOS — tanda tangan & pengiriman tetap oleh Anda.",
    path: "/srikandi",
    icon: FileSignature,
    sidebarGroup: "agent",
    tabs: [
      { id: "register", label: "Register Naskah Keluar", icon: FilePlus2 },
      { id: "outgoing", label: "Daftar Naskah Keluar", icon: FileSignature },
      { id: "references", label: "Referensi", icon: BookUser },
      { id: "connector", label: "Connector", icon: Bot },
    ],
  },
  {
    key: "tools",
    label: "Tools",
    description:
      "Alat bantu kerja yang dipakai di seluruh aplikasi: editor dokumen ONLYOFFICE, basis pengetahuan, dan indeks pengetahuan AI (RAG).",
    path: "/tools",
    icon: Wrench,
    sidebarSubmenu: true,
    sidebarGroup: "system",
    tabs: [
      { id: "onlyoffice", label: "ONLYOFFICE", icon: FilePen },
      { id: "knowledge", label: "Basis Pengetahuan", icon: Library },
      { id: "index", label: "Indeks Pengetahuan", icon: DatabaseZap },
    ],
  },
  {
    key: "settings",
    label: "Pengaturan",
    description: "Branding aplikasi, pengguna, berbagi, model & API key AI, dan integrasi agen AI.",
    path: "/settings",
    icon: Settings,
    sidebarSubmenu: true,
    sidebarGroup: "system",
    tabs: [
      { id: "app", label: "Aplikasi", icon: Settings2, roles: ["super_admin", "admin"] },
      { id: "users", label: "Manajemen User", icon: Users, roles: ["super_admin", "admin"] },
      { id: "sharing", label: "Berbagi", icon: Share2 },
      { id: "api", label: "Model AI", icon: Sparkles },
      { id: "integrations", label: "Integrasi", icon: Plug },
    ],
  },
  {
    key: "profile",
    label: "Profil Saya",
    description: "Informasi pribadi dan password akun Anda.",
    path: "/profile",
    icon: UserRound,
    hiddenInSidebar: true,
  },
];

export const getModule = (key: ModuleKey) => MODULES.find((m) => m.key === key)!;

export const visibleTabs = (module: ModuleDef, role?: UserRole) =>
  (module.tabs ?? []).filter((tab) => !tab.roles || (role && tab.roles.includes(role)));

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  member: "Member",
};
