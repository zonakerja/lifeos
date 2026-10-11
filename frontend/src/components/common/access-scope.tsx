import { createContext, type ReactNode, useContext, useMemo } from "react";
import { itemAccess } from "@/lib/sharing";
import type { ShareMeta } from "@/types/api";

interface AccessScopeValue {
  /** Item milik user lain tanpa izin edit → semua kontrol ubah di dalam scope disembunyikan */
  readOnly: boolean;
  /** Pemilik item bersama (izin edit): berkas yang diunggah di dalam scope disimpan atas nama pemilik */
  ownerId?: string;
}

const AccessScopeContext = createContext<AccessScopeValue | null>(null);

/**
 * Bungkus tampilan/dialog satu item. Di dalamnya `usePermissions().canEdit` mengikuti izin item (item yang dibagikan
 * dengan izin Lihat/Komentar menjadi baca-saja), dan upload lampiran diarahkan ke pemilik item.
 */
export function AccessScope({ item, children }: { item?: { share?: ShareMeta } | null; children: ReactNode }) {
  const parent = useContext(AccessScopeContext);
  const share = item?.share;
  const value = useMemo<AccessScopeValue>(() => {
    const access = itemAccess({ share });
    return {
      readOnly: (parent?.readOnly ?? false) || !access.canEdit,
      ownerId: access.ownerId ?? parent?.ownerId,
    };
  }, [parent, share]);
  return <AccessScopeContext.Provider value={value}>{children}</AccessScopeContext.Provider>;
}

export const useAccessScope = () => useContext(AccessScopeContext);
