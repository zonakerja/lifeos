import { canWrite, isAdminRole, useAuthStore } from "@/stores/auth-store";

/** Hak akses UI berdasarkan role user (viewer = read-only). */
export function usePermissions() {
  const role = useAuthStore((s) => s.user?.role);
  return {
    role,
    canEdit: canWrite(role),
    isAdmin: isAdminRole(role),
    isSuperAdmin: role === "super_admin",
  };
}
