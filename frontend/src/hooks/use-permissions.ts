import { useAccessScope } from "@/components/common/access-scope";
import { canWrite, isAdminRole, useAuthStore } from "@/stores/auth-store";

/**
 * Hak akses UI. Data milik sendiri selalu boleh diubah; di dalam `<AccessScope item>` (item yang dibagikan user lain)
 * `canEdit` mengikuti izin berbagi dan `uploadOwnerId` = pemilik item untuk upload lampiran.
 */
export function usePermissions() {
  const role = useAuthStore((s) => s.user?.role);
  const scope = useAccessScope();
  return {
    role,
    canEdit: canWrite(role) && !scope?.readOnly,
    uploadOwnerId: scope?.ownerId,
    isAdmin: isAdminRole(role),
    isSuperAdmin: role === "super_admin",
  };
}
