import { useEffect, useMemo } from "react";
import { useAgendaTypes } from "@/data/collections";
import { generateId } from "@/lib/ids";
import { useAuthStore } from "@/stores/auth-store";
import type { AgendaType } from "@/types/entities";

const DEFAULT_AGENDA_TYPES = ["Meeting", "Kuliah", "Janji Temu", "Lainnya"];

const seededKey = (userId: string) => `lifeos-agenda-types-seeded:${userId}`;

/**
 * Tipe agenda tersimpan di server per user.
 * Saat pertama kali kosong, tipe default disemai sekali per user.
 */
export function useAgendaTypeList() {
  const collection = useAgendaTypes();
  const user = useAuthStore((s) => s.user);
  const { items, isLoading, setItems } = collection;

  useEffect(() => {
    if (!user || isLoading || collection.isError || items.length > 0 || user.role === "viewer") return;
    if (localStorage.getItem(seededKey(user.id))) return;
    localStorage.setItem(seededKey(user.id), "1");
    setItems(DEFAULT_AGENDA_TYPES.map((name, order): AgendaType => ({ id: generateId("type"), name, order })));
  }, [user, isLoading, collection.isError, items.length, setItems]);

  const sorted = useMemo(() => [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [items]);
  // Nama unik: super admin melihat tipe milik semua user (nama bisa sama)
  const names = useMemo(
    () => (sorted.length > 0 ? [...new Set(sorted.map((t) => t.name))] : DEFAULT_AGENDA_TYPES),
    [sorted],
  );

  return { ...collection, items: sorted, names };
}
