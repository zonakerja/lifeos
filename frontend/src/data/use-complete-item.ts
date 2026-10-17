import { useQuery } from "@tanstack/react-query";
import { recordsApi } from "@/lib/api/endpoints";
import type { RecordType, ShareMeta } from "@/types/api";
import { isPartialItem } from "./use-collection";

type Item = { id?: string | number; userId?: string; share?: ShareMeta; _partial?: string[] };

/** Ambil isi lengkap satu item (dipakai sebelum menghapus item yang berasal dari daftar ringan). */
export async function fetchCompleteItem<T extends Item>(type: RecordType, item: T): Promise<T> {
  if (!isPartialItem(item)) return item;
  const record = await recordsApi.get<T>(type, String(item.id), item.share ? item.userId : undefined);
  return { ...record.payload, userId: record.userId, ...(item.share ? { share: item.share } : {}) } as T;
}

/**
 * Item lengkap untuk editor. Koleksi `LIGHT_TYPES` dimuat sebagai daftar ringan (`_partial`: dokumen, coretan, teks
 * dokumen tidak ikut) → isi lengkap diambil sekali saat item dibuka. Item yang sudah lengkap (atau item baru)
 * dikembalikan apa adanya.
 */
export function useCompleteItem<T extends Item>(type: RecordType, item: T | null) {
  const partial = isPartialItem(item);
  const query = useQuery({
    queryKey: ["records", type, "complete", String(item?.id ?? ""), item?.userId ?? ""],
    queryFn: () => fetchCompleteItem(type, item!),
    enabled: partial,
    // Editor memegang draf sendiri; isi tidak perlu diambil ulang selama terbuka
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  return {
    item: partial ? (query.data ?? null) : item,
    isLoading: partial && query.isLoading,
    error: partial ? query.error : null,
  };
}
