import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vaultsApi } from "@/lib/api/endpoints";

const vaultKey = (id: string) => ["vaults", id] as const;
const accessKey = (id: string) => ["vaults", id, "accesses"] as const;

/** Detail brankas digital milik sendiri (berkas, jumlah akses). */
export function useVault(id: string | undefined) {
  return useQuery({ queryKey: vaultKey(id ?? "-"), queryFn: () => vaultsApi.get(id!), enabled: !!id, retry: false });
}

/** Log akses brankas (siapa membuka: waktu, IP, perkiraan lokasi, peramban). */
export function useVaultAccesses(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: accessKey(id ?? "-"),
    queryFn: () => vaultsApi.accesses(id!),
    enabled: !!id && enabled,
    refetchInterval: 30_000,
  });
}

export function useVaultActions(id: string | undefined) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: ["vaults"] });
  return {
    rotate: useMutation({ mutationFn: () => vaultsApi.rotate(id!), onSuccess: refresh }),
    remove: useMutation({ mutationFn: () => vaultsApi.remove(id!), onSuccess: refresh }),
    refresh,
  };
}
