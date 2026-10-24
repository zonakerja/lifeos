import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { integrationsApi } from "@/lib/api/endpoints";
import { queryKeys } from "./query-keys";

export function useIntegrationScopes() {
  return useQuery({ queryKey: queryKeys.integrationScopes, queryFn: integrationsApi.scopes, staleTime: Infinity });
}

export function useApiTokens() {
  return useQuery({ queryKey: queryKeys.integrationTokens, queryFn: integrationsApi.tokens });
}

/** Log aktivitas agen (50 terbaru), diperbarui tiap 30 detik selama halaman terbuka. */
export function useAgentActivity() {
  return useQuery({
    queryKey: queryKeys.agentActivity,
    queryFn: () => integrationsApi.activity(50),
    refetchInterval: 30_000,
  });
}

export function useApiTokenMutations() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: queryKeys.integrationTokens });
  return {
    create: useMutation({ mutationFn: integrationsApi.createToken, onSuccess: refresh }),
    revoke: useMutation({ mutationFn: integrationsApi.revokeToken, onSuccess: refresh }),
  };
}
