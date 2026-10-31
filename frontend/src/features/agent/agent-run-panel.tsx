import { useQueryClient } from "@tanstack/react-query";
import { BotMessageSquare, Loader2, Square } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Markdown } from "@/components/common/markdown";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAgentReady, useAgentRunWatcher, useAgentSkills } from "@/data/use-agent";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/lib/api/client";
import { agentApi } from "@/lib/api/endpoints";

const DEFAULT_SKILL = "telaah-pengajuan";

/**
 * Detail Approval → "Kerjakan dengan agen": Hermes menjalankan skill LifeOS atas pengajuan ini (baca berkas, cek
 * kelengkapan, telaah, isi templat) lalu menyimpan hasil ke pengajuan untuk diperiksa. Hanya tampil bila agen siap.
 */
export function AgentRunPanel({ requestId, decided }: { requestId: string; decided: boolean }) {
  const ready = useAgentReady();
  const { data: skills } = useAgentSkills(ready);
  const client = useQueryClient();
  const lifeos = (skills ?? []).filter((s) => s.lifeos);
  const [skill, setSkill] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const { run, error } = useAgentRunWatcher(runId, (r) => {
    void client.invalidateQueries({ queryKey: queryKeys.request(requestId) });
    void client.invalidateQueries({ queryKey: queryKeys.requests });
    if (r.status === "completed") toast.success("Agen selesai — periksa hasilnya di pengajuan ini.");
    else toast.error(r.error ?? `Tugas agen berakhir (${r.status}).`);
  });

  if (!ready || !lifeos.length) return null;
  const chosen = skill ?? (lifeos.some((s) => s.name === DEFAULT_SKILL) ? DEFAULT_SKILL : lifeos[0].name);
  const running = !!runId && !run?.done;

  const start = async () => {
    setStarting(true);
    try {
      const started = await agentApi.runSkill(requestId, chosen);
      setRunId(started.runId);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-2 rounded-xl border border-module/30 bg-module-soft/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <BotMessageSquare className="size-4 shrink-0 text-module" />
        <span className="text-sm font-semibold">Kerjakan dengan agen</span>
        <Select value={chosen} onValueChange={setSkill} disabled={running}>
          <SelectTrigger size="sm" className="min-w-0 sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {lifeos.map((s) => (
              <SelectItem key={s.name} value={s.name}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {running ? (
          <Button size="sm" variant="outline" onClick={() => runId && void agentApi.stop(runId).catch(() => undefined)}>
            <Square /> Hentikan
          </Button>
        ) : (
          <Button size="sm" onClick={() => void start()} disabled={starting || decided}>
            {starting ? <Loader2 className="animate-spin" /> : <BotMessageSquare />} Jalankan
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {decided
          ? "Pengajuan sudah diputuskan — buka kembali bila ingin agen mengerjakannya lagi."
          : "Hermes membaca surat & berkas, mencari persyaratan & dasar hukum, lalu menyimpan telaah, catatan kelengkapan, dan konsep jawaban ke pengajuan ini. Agen tidak menyetujui atau mengirim."}
      </p>
      {running && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Agen bekerja… (bisa beberapa menit)
        </p>
      )}
      {error && <p className="text-xs text-warning">{error}</p>}
      {run?.done && run.output && (
        <div className="rounded-lg bg-card p-2 text-sm">
          <Markdown content={run.output} />
        </div>
      )}
    </div>
  );
}
