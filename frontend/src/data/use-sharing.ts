import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { queryKeys } from "@/data/query-keys";
import { type CommentTarget, commentsApi, sharesApi, usersApi } from "@/lib/api/endpoints";
import { isAdminRole, useAuthStore } from "@/stores/auth-store";
import type { ShareableType, SharePermission } from "@/types/api";

/** Penerima satu item milik sendiri. */
export function useItemShares(recordType: ShareableType, recordId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.itemShares(recordType, recordId),
    queryFn: () => sharesApi.forItem(recordType, recordId),
    enabled: enabled && !!recordId,
  });
}

/** Semua item yang dibagikan user ke orang lain. */
export function useOutgoingShares(enabled = true) {
  const user = useAuthStore((s) => s.user);
  return useQuery({ queryKey: queryKeys.sharesOutgoing, queryFn: sharesApi.outgoing, enabled: enabled && !!user });
}

export function useIncomingShares(enabled = true) {
  const user = useAuthStore((s) => s.user);
  return useQuery({ queryKey: queryKeys.sharesIncoming, queryFn: sharesApi.incoming, enabled: enabled && !!user });
}

/** Kunci `type:id` item milik sendiri yang sedang dibagikan → jumlah penerima (untuk penanda "Dibagikan"). */
export function useSharedOutKeys() {
  const { data } = useOutgoingShares();
  return useMemo(() => {
    const map = new Map<string, number>();
    for (const share of data ?? []) {
      const key = `${share.recordType}:${share.recordId}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [data]);
}

export function useShareMutations() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: queryKeys.shares });
  // Keluar dari berbagi mengubah data yang terlihat → muat ulang semua koleksi
  const invalidateRecords = () => client.invalidateQueries({ queryKey: ["records"] });
  return {
    create: useMutation({
      mutationFn: sharesApi.create,
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, permission }: { id: string; permission: SharePermission }) => sharesApi.update(id, permission),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => sharesApi.remove(id),
      onSuccess: () => Promise.all([invalidate(), invalidateRecords()]),
    }),
  };
}

/** Pencarian akun penerima (min. 3 huruf). */
export function useUserDirectory(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ["users", "directory", term],
    queryFn: () => usersApi.directory(term),
    enabled: term.length >= 3,
    staleTime: 30_000,
  });
}

export function useUserStats() {
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({ queryKey: queryKeys.userStats, queryFn: usersApi.stats, enabled: isAdminRole(role) });
}

export function useComments(target: CommentTarget, enabled = true) {
  return useQuery({
    queryKey: queryKeys.comments(target.recordType, target.recordId, target.ownerId),
    queryFn: () => commentsApi.list(target),
    enabled: enabled && !!target.recordId,
  });
}

export function useCommentMutations(target: CommentTarget) {
  const client = useQueryClient();
  const invalidate = () =>
    client.invalidateQueries({ queryKey: queryKeys.comments(target.recordType, target.recordId, target.ownerId) });
  return {
    create: useMutation({ mutationFn: (body: string) => commentsApi.create(target, body), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: string }) => commentsApi.update(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => commentsApi.remove(id), onSuccess: invalidate }),
  };
}
