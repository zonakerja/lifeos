import { ClipboardList } from "lucide-react";
import { HeroStat, ModulePage } from "@/components/layout/module-page";
import { useActionPlanEntries, useSkpTargets } from "@/data/collections";
import { entryStatus } from "@/features/productivity/lib/action-plan";
import { RobotSettings } from "@/features/tools/robot/robot-settings";
import { ActionPlanBoard } from "./action-plan-board";

/** AI Agent → Laporan Kinerja: rencana aksi bulanan e-Kinerja (produk jadi dari Productivity) + SKP & RHK dari robot. */
export function Component() {
  const { items } = useActionPlanEntries();
  const { items: targets } = useSkpTargets();
  // Status dihitung ulang seperti di papan (entri lama tanpa realisasi = belum lengkap)
  const ready = items.filter(
    (e) =>
      entryStatus(
        e,
        targets.find((t) => t.id === e.targetId),
      ) === "ready",
  ).length;
  return (
    <ModulePage
      module="kinerja"
      meta={
        <HeroStat>
          <ClipboardList className="size-3.5" /> {ready} siap diisikan
        </HeroStat>
      }
    >
      {(tab) => (tab === "connector" ? <RobotSettings systems={["ekinerja"]} /> : <ActionPlanBoard />)}
    </ModulePage>
  );
}
