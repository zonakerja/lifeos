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

/** Sakelar AI di editor milik user (+ provider AI LifeOS yang akan menjawab). */
export function useOfficePreferences() {
  return useQuery({ queryKey: queryKeys.officePreferences, queryFn: officeApi.preferences });
}

export function useUpdateOfficePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ai: boolean) => officeApi.updatePreferences({ ai }),
    onSuccess: (data) => client.setQueryData(queryKeys.officePreferences, data),
  });
}

/** Templat dokumen milik user (Tools → ONLYOFFICE → Templat dokumen). */
export function useOfficeTemplates(enabled = true) {
  return useQuery({ queryKey: queryKeys.officeTemplates, queryFn: officeApi.templates, enabled });
}

/** Font yang terpasang di server ONLYOFFICE. */
export function useOfficeFonts() {
  return useQuery({ queryKey: queryKeys.officeFonts, queryFn: officeApi.fonts, staleTime: 60_000 });
}

/** Kesehatan & versi server ONLYOFFICE (halaman Tools → ONLYOFFICE). */
export function useOfficeDiagnostics() {
  return useQuery({ queryKey: queryKeys.officeDiagnostics, queryFn: officeApi.diagnostics, refetchOnMount: "always" });
}
