import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/data/query-keys";
import { officeApi } from "@/lib/api/endpoints";

/** Apakah editor ONLYOFFICE aktif di server (env `ONLYOFFICE_URL`). Jarang berubah → cache panjang. */
export function useOfficeStatus() {
  return useQuery({ queryKey: queryKeys.officeStatus, queryFn: officeApi.status, staleTime: 5 * 60_000 });
}

/** Riwayat versi satu berkas (versi saat ini + hingga 9 versi sebelumnya). */
export function useOfficeVersions(uploadId: string | null) {
  return useQuery({
    queryKey: queryKeys.officeVersions(uploadId ?? ""),
    queryFn: () => officeApi.versions(uploadId!),
    enabled: !!uploadId,
    refetchOnMount: "always",
  });
}

export function useRestoreOfficeVersion(uploadId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => officeApi.restore(uploadId, version),
    onSuccess: (data) => client.setQueryData(queryKeys.officeVersions(uploadId), data),
  });
}

/** Kesehatan & versi server ONLYOFFICE (halaman Tools → ONLYOFFICE). */
export function useOfficeDiagnostics() {
  return useQuery({ queryKey: queryKeys.officeDiagnostics, queryFn: officeApi.diagnostics, refetchOnMount: "always" });
}
