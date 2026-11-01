import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { publicLinksApi, robotApi } from "@/lib/api/endpoints";
import type { RobotConnector, RobotSystem } from "@/types/api";
import { queryKeys } from "./query-keys";

export function useRobotStatus() {
  return useQuery({ queryKey: queryKeys.robotStatus, queryFn: robotApi.status, refetchInterval: 30_000 });
}

export function useRobotConnectors() {
  return useQuery({ queryKey: queryKeys.robotConnectors, queryFn: robotApi.connectors });
}

export function useRobotRuns(system: RobotSystem) {
  return useQuery({ queryKey: queryKeys.robotRuns(system), queryFn: () => robotApi.runs(system) });
}

export function useRobotRun(id: string | null) {
  return useQuery({ queryKey: queryKeys.robotRun(id ?? "-"), queryFn: () => robotApi.run(id!), enabled: !!id });
}

/** Konektor terbaru dari server → pasang ke cache + muat ulang log run. */
function useApplyConnector() {
  const client = useQueryClient();
  return (connector: RobotConnector) => {
    client.setQueryData<RobotConnector[]>(queryKeys.robotConnectors, (prev) =>
      prev?.map((c) => (c.system === connector.system ? connector : c)),
    );
    void client.invalidateQueries({ queryKey: ["robot", "runs"] });
    // Login ulang / cek sesi mengubah notifikasi sesi kedaluwarsa & jadwal yang dijeda
    void client.invalidateQueries({ queryKey: ["automation"] });
  };
}

export function useRobotMutations() {
  const client = useQueryClient();
  const apply = useApplyConnector();
  const refreshRuns = () => void client.invalidateQueries({ queryKey: ["robot", "runs"] });
  return {
    update: useMutation({
      mutationFn: ({
        system,
        ...input
      }: {
        system: RobotSystem;
        baseUrl?: string;
        extraHosts?: string[];
        loginMarkers?: string[];
      }) => robotApi.update(system, input),
      onSuccess: apply,
    }),
    forget: useMutation({ mutationFn: robotApi.forget, onSuccess: apply }),
    check: useMutation({ mutationFn: robotApi.check, onSuccess: apply, onError: refreshRuns }),
    captureSession: useMutation({ mutationFn: robotApi.captureSession, onSuccess: refreshRuns }),
    finish: useMutation({ mutationFn: robotApi.finish, onSuccess: apply }),
    setCredentials: useMutation({
      mutationFn: ({
        system,
        ...input
      }: {
        system: RobotSystem;
        username: string;
        password: string;
        accountPassword: string;
      }) => robotApi.setCredentials(system, input),
      onSuccess: apply,
    }),
    deleteCredentials: useMutation({ mutationFn: robotApi.deleteCredentials, onSuccess: apply }),
    /** Langkah login otomatis selesai → konektor terbaru dipasang ke cache */
    applyConnector: apply,
    removeRun: useMutation({ mutationFn: robotApi.removeRun, onSuccess: refreshRuns }),
  };
}

export function usePublicLinks(uploadId: string | null) {
  return useQuery({
    queryKey: queryKeys.publicLinks(uploadId ?? "-"),
    queryFn: () => publicLinksApi.list(uploadId!),
    enabled: !!uploadId,
  });
}

export function usePublicLinkMutations(uploadId: string) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: queryKeys.publicLinks(uploadId) });
  return {
    create: useMutation({
      mutationFn: (input: { days?: number | null; label?: string }) => publicLinksApi.create(uploadId, input),
      onSuccess: refresh,
    }),
    revoke: useMutation({ mutationFn: publicLinksApi.revoke, onSuccess: refresh }),
  };
}
