import { useQuery } from "@tanstack/react-query";
import { uploadsApi } from "@/lib/api/endpoints";

/**
 * URL sementara (bertanda tangan, ±10 menit) untuk menampilkan file backend di
 * elemen seperti <audio>/<img>. Di-cache 8 menit agar tidak membuat link baru terus.
 */
export function useAssetUrl(uploadId?: string | null) {
  return useQuery({
    queryKey: ["asset-url", uploadId],
    queryFn: () => uploadsApi.createLink(uploadId!),
    enabled: !!uploadId,
    staleTime: 8 * 60_000,
    gcTime: 9 * 60_000,
  }).data;
}
