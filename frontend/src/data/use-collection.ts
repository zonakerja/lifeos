import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api/client";
import { recordsApi } from "@/lib/api/endpoints";
import { queryKeys } from "@/data/query-keys";
import { useAuthStore } from "@/stores/auth-store";
import type { RecordType } from "@/types/api";

/**
 * ============================================================================
 * useCollection — data layer untuk entitas domain yang disimpan di /records.
 * ----------------------------------------------------------------------------
 * - Membaca koleksi via TanStack Query (cache bersama antar komponen).
 * - Menulis PER ITEM (PUT/DELETE /records/:type/:clientId), bukan seluruh array.
 * - `setItems(updater)` berperilaku seperti setState: perubahan dihitung dengan diff
 *   (item baru/berubah → upsert, item hilang → delete).
 * - Update optimistis; upsert di-debounce per item (mis. saat mengetik) dan
 *   diserialkan per item agar urutan tulis terjaga. Bila gagal → toast + resync.
 * ============================================================================
 */

type EntityBase = { id?: string | number; userId?: string };

interface CollectionOptions<T> {
  /** Kunci unik entitas. Default: String(item.id). */
  getId?: (item: T) => string;
  /** Jeda debounce upsert per item (ms). Default 500. */
  debounceMs?: number;
  enabled?: boolean;
}

const EMPTY: never[] = [];
const defaultGetId = (item: EntityBase) => String(item.id);

// ---- Antrian tulis global (dibagi semua komponen yang memakai type yang sama) ----
type PendingWrite = { timer: ReturnType<typeof setTimeout>; run: () => Promise<unknown> };
const pending = new Map<string, PendingWrite>();
const chains = new Map<string, Promise<unknown>>();

const enqueue = (key: string, task: () => Promise<unknown>) => {
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  chains.set(key, next);
  void next.finally(() => {
    if (chains.get(key) === next) chains.delete(key);
  });
  return next;
};

const flushKey = (key: string) => {
  const write = pending.get(key);
  if (!write) return;
  clearTimeout(write.timer);
  pending.delete(key);
  void enqueue(key, write.run);
};

/** Kirim semua tulisan yang masih tertunda (mis. sebelum logout / tutup tab). */
export const flushPendingWrites = async () => {
  for (const key of Array.from(pending.keys())) flushKey(key);
  await Promise.allSettled(Array.from(chains.values()));
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    for (const key of Array.from(pending.keys())) flushKey(key);
  });
}

const handleWriteError = (client: QueryClient, type: RecordType) => (error: unknown) => {
  toast.error("Gagal menyimpan perubahan", { description: errorMessage(error) });
  void client.invalidateQueries({ queryKey: queryKeys.records(type) });
};

export function useCollection<T extends EntityBase>(type: RecordType, options: CollectionOptions<T> = {}) {
  const { getId = defaultGetId as (item: T) => string, debounceMs = 500, enabled = true } = options;
  const client = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const queryKey = useMemo(() => queryKeys.records(type), [type]);

  // Super admin melihat data semua user; role lain hanya miliknya.
  const ownerFilter = user && user.role !== "super_admin" ? user.id : undefined;

  const query = useQuery({
    queryKey,
    enabled: enabled && !!user,
    queryFn: async () => {
      const records = await recordsApi.list<T>(type, { userId: ownerFilter });
      return records.map((record) => ({ ...record.payload, userId: record.userId }) as T);
    },
  });

  const items = (query.data ?? EMPTY) as T[];

  const scheduleUpsert = useCallback(
    (item: T) => {
      const id = getId(item);
      const key = `${type}:${id}`;
      const existing = pending.get(key);
      if (existing) clearTimeout(existing.timer);
      const run = () => recordsApi.upsert(type, id, item, item.userId).catch(handleWriteError(client, type));
      pending.set(key, { run, timer: setTimeout(() => flushKey(key), debounceMs) });
    },
    [client, debounceMs, getId, type],
  );

  const scheduleRemove = useCallback(
    (item: T) => {
      const id = getId(item);
      const key = `${type}:${id}`;
      const existing = pending.get(key);
      if (existing) {
        clearTimeout(existing.timer);
        pending.delete(key);
      }
      void enqueue(key, () =>
        recordsApi.remove(type, id, item.userId).catch((error: unknown) => {
          // Item yang belum sempat tersimpan di server tidak perlu dihapus
          if ((error as { status?: number })?.status === 404) return;
          handleWriteError(client, type)(error);
        }),
      );
    },
    [client, getId, type],
  );

  /** Seperti setState: terima array baru atau updater (prev => next). */
  const setItems = useCallback(
    (updater: T[] | ((prev: T[]) => T[])) => {
      const prev = client.getQueryData<T[]>(queryKey) ?? [];
      const next = typeof updater === "function" ? updater(prev) : updater;
      client.setQueryData(queryKey, next);

      const prevById = new Map(prev.map((item) => [getId(item), item]));
      const nextIds = new Set<string>();
      for (const item of next) {
        const id = getId(item);
        nextIds.add(id);
        const old = prevById.get(id);
        if (!old || (old !== item && JSON.stringify(old) !== JSON.stringify(item))) {
          scheduleUpsert(item);
        }
      }
      for (const item of prev) {
        if (!nextIds.has(getId(item))) scheduleRemove(item);
      }
    },
    [client, getId, queryKey, scheduleRemove, scheduleUpsert],
  );

  const upsert = useCallback(
    (item: T) =>
      setItems((prev) => {
        const id = getId(item);
        const exists = prev.some((p) => getId(p) === id);
        return exists ? prev.map((p) => (getId(p) === id ? item : p)) : [...prev, item];
      }),
    [getId, setItems],
  );

  const remove = useCallback(
    (id: string | number) => setItems((prev) => prev.filter((p) => getId(p) !== String(id))),
    [getId, setItems],
  );

  return useMemo(
    () => ({
      items,
      setItems,
      upsert,
      remove,
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error,
      refetch: query.refetch,
    }),
    [items, setItems, upsert, remove, query.isLoading, query.isError, query.error, query.refetch],
  );
}
