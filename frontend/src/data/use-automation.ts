import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KIND_RECORDS } from "@/features/tools/automation/automation-utils";
import { automationApi } from "@/lib/api/endpoints";
import type { AutomationJob, AutomationKind, AutomationSchedule } from "@/types/api";
import { queryKeys } from "./query-keys";

/**
 * Jadwal otomasi milik user. Selama ada tugas antre/berjalan daftar dimuat ulang tiap 3 detik; tugas yang baru selesai
 * (waktu run terakhir berubah) memuat ulang record yang diperbaruinya + riwayat run.
 */
export function useAutomationJobs() {
  const client = useQueryClient();
  return useQuery({
    queryKey: queryKeys.automationJobs,
    queryFn: async () => {
      const prev = client.getQueryData<AutomationJob[]>(queryKeys.automationJobs);
      const next = await automationApi.jobs();
      for (const job of next) {
        const before = prev?.find((p) => p.kind === job.kind);
        if (!before || before.lastRunAt === job.lastRunAt) continue;
        for (const type of KIND_RECORDS[job.kind]) void client.invalidateQueries({ queryKey: queryKeys.records(type) });
        void client.invalidateQueries({ queryKey: queryKeys.automationRuns(job.kind) });
        void client.invalidateQueries({ queryKey: ["robot", "runs"] });
        void client.invalidateQueries({ queryKey: queryKeys.robotConnectors });
        void client.invalidateQueries({ queryKey: queryKeys.automationAlerts });
      }
      return next;
    },
    refetchInterval: (query) => (query.state.data?.some((j) => j.activeRun) ? 3000 : 60_000),
  });
}

/**
 * Notifikasi robot (sesi kedaluwarsa / belum login / tugas gagal) — dipakai lonceng & toast di AppShell, jadi diperiksa
 * berkala selama aplikasi terbuka.
 */
export function useAutomationAlerts() {
  return useQuery({
    queryKey: queryKeys.automationAlerts,
    queryFn: automationApi.alerts,
    refetchInterval: 2 * 60_000,
    refetchIntervalInBackground: true,
  });
}

export function useAutomationRuns(kind: AutomationKind | null) {
  return useQuery({
    queryKey: queryKeys.automationRuns(kind ?? "-"),
    queryFn: () => automationApi.runs(kind!),
    enabled: !!kind,
  });
}

export function useAutomationMutations() {
  const client = useQueryClient();
  const apply = (job: AutomationJob) =>
    client.setQueryData<AutomationJob[]>(queryKeys.automationJobs, (prev) =>
      prev?.map((j) => (j.kind === job.kind ? job : j)),
    );
  return {
    update: useMutation({
      mutationFn: ({ kind, ...input }: { kind: AutomationKind; enabled?: boolean; schedule?: AutomationSchedule }) =>
        automationApi.update(kind, input),
      onSuccess: (job) => {
        apply(job);
        void client.invalidateQueries({ queryKey: queryKeys.automationAlerts });
      },
    }),
    run: useMutation({
      mutationFn: automationApi.run,
      onSuccess: (_, kind) => {
        void client.invalidateQueries({ queryKey: queryKeys.automationJobs });
        void client.invalidateQueries({ queryKey: queryKeys.automationRuns(kind) });
      },
    }),
  };
}
