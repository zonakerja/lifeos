import { Waypoints } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateAiSettings } from "@/data/use-ai-settings";
import { errorMessage } from "@/lib/api/client";
import type { AiProviderId, AiRouting, AiSettings } from "@/types/api";

const DEFAULT = "__default__";

type TaskKey = "chat" | "general" | "agent" | "ocr" | "embedding";
type RoutingKey = keyof AiRouting;
type BackupKey = "chatBackup" | "generalBackup" | "agentBackup";

/** Tugas yang punya pilihan cadangan sendiri. */
const BACKUP_OF: Partial<Record<TaskKey, BackupKey>> = {
  chat: "chatBackup",
  general: "generalBackup",
  agent: "agentBackup",
};

const ROWS: { key: TaskKey; label: string; hint: string; defaultLabel: string }[] = [
  {
    key: "chat",
    label: "Chat & telaah",
    hint: "Asisten LifeOS (chatbot) dan My Notebook. Pilih model dengan penalaran & tulisan terbaik.",
    defaultLabel: "Ikuti provider aktif",
  },
  {
    key: "general",
    label: "Fitur AI lain",
    hint: "Ringkasan resource, Notes AI, saran ikon, tulisan tangan, AI di editor dokumen. Model cepat & hemat cukup.",
    defaultLabel: "Ikuti provider aktif",
  },
  {
    key: "agent",
    label: "Agen (Hermes)",
    hint: "Model untuk Asisten Agen & skill di Approval, lewat LifeOS (key tidak disimpan di Hermes). Agen memakai banyak token — model Flash/hemat disarankan.",
    defaultLabel: "Ikuti provider aktif",
  },
  {
    key: "ocr",
    label: "Baca gambar & PDF scan (OCR)",
    hint: "Dipakai saat berkas diunggah agar isinya bisa dicari & diringkas. Gagal/kuota habis → provider lain dicoba.",
    defaultLabel: "Otomatis (Gemini → OpenAI → Claude)",
  },
  {
    key: "embedding",
    label: "Embedding indeks pengetahuan",
    hint: "Mesin pencarian makna. Mengganti provider membangun ulang seluruh indeks (vektor tidak bisa dicampur).",
    defaultLabel: "Otomatis (Gemini, lalu OpenAI)",
  },
];

/**
 * Pembagian tugas AI: provider berbeda per jenis pekerjaan (mis. chat dengan OpenAI, OCR & embedding dengan Gemini).
 * Hanya provider yang sudah punya key yang bisa dipilih; audio selalu ke provider yang mendukungnya (Gemini).
 */
export function AiRoutingCard({ settings }: { settings: AiSettings }) {
  const update = useUpdateAiSettings();
  const configured = settings.providers.filter((p) => p.configured);
  const label = (id: string | null) => {
    const p = settings.providers.find((x) => x.id === id);
    return p ? (p.via ? `${p.label} lewat ${p.via}` : p.label) : "—";
  };

  const change = async (key: RoutingKey, value: string) => {
    try {
      await update.mutateAsync({ routing: { [key]: value === DEFAULT ? null : value } });
      toast.success(
        key === "embedding"
          ? "Provider embedding diubah — indeks dibangun ulang di latar belakang."
          : "Pembagian tugas disimpan.",
      );
    } catch (error) {
      toast.error("Gagal menyimpan pembagian tugas", { description: errorMessage(error) });
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 font-semibold">
          <Waypoints className="size-4" /> Pembagian tugas AI
        </p>
        <p className="text-xs text-muted-foreground">
          Pakai provider yang paling cocok untuk tiap pekerjaan. Bila provider pilihan kehabisan kuota, sibuk, atau
          tidak terjangkau, <b>cadangan</b> dicoba lebih dulu, lalu provider lain yang punya key.
          {!settings.fallbackEnabled && " Cadangan sedang nonaktif — nyalakan Cadangan otomatis di atas."}
        </p>
      </div>
      {configured.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Simpan API key minimal satu provider dulu.</p>
      ) : (
        <div className="flex flex-col divide-y">
          {ROWS.map((row) => {
            const options =
              row.key === "embedding" ? configured.filter((p) => p.id === "gemini" || p.id === "openai") : configured;
            const value = (settings.routing[row.key] as string | null | undefined) ?? DEFAULT;
            const effective = settings.effective[row.key];
            const backupKey = BACKUP_OF[row.key];
            const backupValue = backupKey ? (settings.routing[backupKey] ?? DEFAULT) : DEFAULT;
            const backupEffective = backupKey ? settings.effective[backupKey] : null;
            const backupOptions = configured.filter((p) => p.id !== effective);
            return (
              <div key={row.key} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-xs text-muted-foreground">{row.hint}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Dipakai sekarang: <b>{effective ? label(effective) : "tidak ada (butuh key)"}</b>
                    {backupKey && effective && (
                      <>
                        {" "}
                        · cadangan: <b>{backupEffective ? label(backupEffective) : "tidak ada"}</b>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex w-full shrink-0 flex-col gap-1.5 sm:w-60">
                  <Select value={value} disabled={update.isPending} onValueChange={(v) => void change(row.key, v)}>
                    <SelectTrigger className="w-full" aria-label={`Provider ${row.label}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT}>{row.defaultLabel}</SelectItem>
                      {options.map((p) => (
                        <SelectItem key={p.id} value={p.id as AiProviderId}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {backupKey && configured.length > 1 && (
                    <Select
                      value={backupValue}
                      disabled={update.isPending || !settings.fallbackEnabled}
                      onValueChange={(v) => void change(backupKey, v)}
                    >
                      <SelectTrigger size="sm" className="w-full" aria-label={`Cadangan ${row.label}`}>
                        <span className="text-muted-foreground">Cadangan:</span>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DEFAULT}>Otomatis</SelectItem>
                        {backupOptions.map((p) => (
                          <SelectItem key={p.id} value={p.id as AiProviderId}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
