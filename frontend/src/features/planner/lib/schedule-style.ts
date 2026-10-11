import {
  BookOpen,
  Briefcase,
  Clock,
  Coffee,
  GraduationCap,
  HeartPulse,
  type LucideIcon,
  Plane,
  Star,
  Users,
  Video,
} from "lucide-react";
import type { AgendaColor, AgendaIcon, AgendaType } from "@/types/entities";

/** Pilihan warna tipe agenda (token warna modul; kelas statis agar terbaca Tailwind). */
export const AGENDA_COLORS: Record<AgendaColor, { label: string; swatch: string; badge: string }> = {
  planner: { label: "Biru", swatch: "bg-mod-planner", badge: "bg-mod-planner text-white shadow-mod-planner/30" },
  notes: { label: "Oranye", swatch: "bg-mod-notes", badge: "bg-mod-notes text-white shadow-mod-notes/30" },
  overview: { label: "Ungu", swatch: "bg-mod-overview", badge: "bg-mod-overview text-white shadow-mod-overview/30" },
  productivity: {
    label: "Hijau",
    swatch: "bg-mod-productivity",
    badge: "bg-mod-productivity text-white shadow-mod-productivity/30",
  },
  files: { label: "Merah", swatch: "bg-mod-files", badge: "bg-mod-files text-white shadow-mod-files/30" },
  settings: { label: "Magenta", swatch: "bg-mod-settings", badge: "bg-mod-settings text-white shadow-mod-settings/30" },
};

/** Pilihan ikon tipe agenda. */
export const AGENDA_ICONS: Record<AgendaIcon, { label: string; icon: LucideIcon }> = {
  briefcase: { label: "Kerja", icon: Briefcase },
  graduation: { label: "Belajar", icon: GraduationCap },
  users: { label: "Pertemuan", icon: Users },
  video: { label: "Online", icon: Video },
  plane: { label: "Perjalanan", icon: Plane },
  book: { label: "Bacaan", icon: BookOpen },
  heart: { label: "Kesehatan", icon: HeartPulse },
  coffee: { label: "Santai", icon: Coffee },
  star: { label: "Penting", icon: Star },
  clock: { label: "Umum", icon: Clock },
};

/** Gaya bawaan untuk tipe agenda default (dipakai bila tipe belum diberi warna/ikon). */
const BUILTIN_STYLE: Record<string, { color: AgendaColor; icon: AgendaIcon }> = {
  Meeting: { color: "planner", icon: "briefcase" },
  Kuliah: { color: "notes", icon: "graduation" },
  "Janji Temu": { color: "overview", icon: "users" },
  Lainnya: { color: "settings", icon: "clock" },
};

const COLOR_KEYS = Object.keys(AGENDA_COLORS) as AgendaColor[];

/** Warna default yang stabil untuk nama tipe tanpa pengaturan warna. */
export const defaultAgendaColor = (name: string): AgendaColor => {
  if (BUILTIN_STYLE[name]) return BUILTIN_STYLE[name].color;
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOR_KEYS[hash % COLOR_KEYS.length];
};

export const defaultAgendaIcon = (name: string): AgendaIcon => BUILTIN_STYLE[name]?.icon ?? "clock";

/** Warna & ikon efektif sebuah tipe agenda. */
export const resolveAgendaStyle = (name: string, type?: Pick<AgendaType, "color" | "icon">) => {
  const color = type?.color && AGENDA_COLORS[type.color] ? type.color : defaultAgendaColor(name);
  const icon = type?.icon && AGENDA_ICONS[type.icon] ? type.icon : defaultAgendaIcon(name);
  return { color, icon };
};

/** Ikon & kelas warna untuk agenda bertipe `type` (mengikuti pengaturan di tab Referensi). */
export const scheduleTypeStyle = (type: string | undefined, types: AgendaType[]) => {
  const name = type ?? "";
  const { color, icon } = resolveAgendaStyle(
    name,
    types.find((t) => t.name === name),
  );
  return { icon: AGENDA_ICONS[icon].icon, className: AGENDA_COLORS[color].badge };
};
