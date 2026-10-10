import { Briefcase, Clock, GraduationCap, Users } from "lucide-react";

/** Ikon & warna per tipe agenda bawaan; tipe lain memakai gaya umum. */
export const scheduleTypeStyle = (type?: string) => {
  switch (type) {
    case "Meeting":
      return { icon: Briefcase, className: "bg-mod-planner text-white shadow-mod-planner/30" };
    case "Kuliah":
      return { icon: GraduationCap, className: "bg-mod-notes text-white shadow-mod-notes/30" };
    case "Janji Temu":
      return { icon: Users, className: "bg-mod-overview text-white shadow-mod-overview/30" };
    default:
      return { icon: Clock, className: "bg-mod-settings text-white shadow-mod-settings/30" };
  }
};
