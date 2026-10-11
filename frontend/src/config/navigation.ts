import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  BookOpen,
  CalendarDays,
  CalendarRange,
  FileX,
  FolderTree,
  Grid2x2,
  HardDrive,
  Hourglass,
  Layers,
  LayoutGrid,
  ListChecks,
  type LucideIcon,
  NotebookPen,
  Package,
  Settings,
  Settings2,
  Share2,
  Sparkles,
  StickyNote,
  Tag,
  UserRound,
  Users,
} from "lucide-react";
import type { UserRole } from "@/types/api";

export type ModuleKey = "overview" | "planner" | "notes" | "productivity" | "files" | "settings";

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
    description: "Catatan bebas, catatan berbasis AI, dan daftar.",
    path: "/notes",
    icon: StickyNote,
    tabs: [
      { id: "free", label: "Catatan Bebas", icon: NotebookPen },
      { id: "ai", label: "Notes AI", icon: Sparkles },
      { id: "lists", label: "List Bebas", icon: ListChecks },
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
    key: "settings",
    label: "Pengaturan",
    description: "Profil, berbagi, pengguna, branding aplikasi, dan API key AI.",
    path: "/settings",
    icon: Settings,
    tabs: [
      { id: "profile", label: "Profil Saya", icon: UserRound },
      { id: "sharing", label: "Berbagi", icon: Share2 },
      { id: "users", label: "Manajemen User", icon: Users, roles: ["super_admin", "admin"] },
      { id: "app", label: "Aplikasi", icon: Settings2, roles: ["super_admin", "admin"] },
      { id: "api", label: "AI", icon: Sparkles },
    ],
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
