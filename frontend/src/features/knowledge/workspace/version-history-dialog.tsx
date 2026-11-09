import { History, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  useKnowledgeSource,
  useKnowledgeVersion,
  useKnowledgeVersions,
  useRestoreKnowledgeVersion,
} from "@/data/use-knowledge-workspace";
import { ApiError, errorMessage } from "@/lib/api/client";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { KnowledgeNoteVersion } from "@/types/api";
import { diffStats, lineDiff } from "./line-diff";
import { useWorkspaceStore } from "./workspace-store";

/** Label asal versi (kapan riwayat dicatat). */
export const VERSION_REASON_LABEL: Record<string, string> = {
  observed: "Terpantau saat pindai vault",
  before_save: "Sebelum disimpan dari editor LifeOS",
  before_properties: "Sebelum properti diubah",
  before_task: "Sebelum tugas dicentang",
  before_link: "Sebelum tautan disematkan",
  before_move: "Sebelum tautan diperbarui (pindah / ganti nama)",
  before_restore: "Sebelum versi lain dipulihkan",
  before_merge: "Sebelum catatan digabung",
  before_extract: "Sebelum teks diekstrak",
  before_tag: "Sebelum tag diganti nama",
};

const sizeLabel = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`);

/**
 * Riwayat versi catatan (K7, seperti File recovery Obsidian): daftar versi, perubahan dibanding isi sekarang, dan Pulihkan
 * (isi sekarang disimpan ke riwayat dulu sehingga pemulihan bisa dibatalkan dengan memulihkan versi itu lagi).
 */
export function VersionHistoryDialog() {
  const dialog = useWorkspaceStore((s) => s.dialog);
  const close = useWorkspaceStore((s) => s.close);
  const open = dialog?.kind === "versions";
  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="grid-cols-1 sm:max-w-4xl">
        {open && <VersionHistory key={dialog.id} id={dialog.id} title={dialog.title} onDone={close} />}
      </DialogContent>
    </Dialog>
  );
}

function VersionHistory({ id, title, onDone }: { id: string; title: string; onDone: () => void }) {
  const { data: versions, isLoading } = useKnowledgeVersions(id);
  const { data: source, isFetching: sourceFetching } = useKnowledgeSource(id, { fresh: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"diff" | "full">("diff");
  const [confirming, setConfirming] = useState(false);
  const restore = useRestoreKnowledgeVersion();
  const selected = versions?.find((v) => v.id === selectedId) ?? versions?.find((v) => !v.current) ?? versions?.[0];
  const { data: detail, isLoading: detailLoading } = useKnowledgeVersion(id, selected?.id ?? null);

  const doRestore = () => {
    if (!selected || !source) return;
    restore.mutate(
      { id, versionId: selected.id, baseHash: source.hash },
      {
        onSuccess: () => {
          const active = useWorkspaceStore.getState().active;
          if (active?.id === id && active.mode === "edit") active.setMode("read");
          toast.success("Versi dipulihkan", { description: "Isi sebelumnya tersimpan di riwayat." });
          onDone();
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError && error.status === 409 ? "Catatan baru saja berubah" : "Gagal memulihkan versi",
            { description: errorMessage(error) },
          ),
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <History className="size-5 text-module" /> Riwayat versi — {title}
        </DialogTitle>
        <DialogDescription>
          LifeOS menyimpan isi catatan sebelum menimpanya, dan versi yang terpantau saat vault dipindai (maks. 30
          versi).
        </DialogDescription>
      </DialogHeader>
      {isLoading ? (
        <Spinner className="m-6" />
      ) : !versions?.length ? (
        <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          Belum ada riwayat. Versi dicatat mulai sekarang setiap catatan berubah.
        </p>
      ) : (
        <div className="grid min-h-0 grid-cols-1 gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
          <ul className="flex max-h-[30svh] flex-col gap-1 overflow-y-auto md:max-h-[60svh]">
            {versions.map((v) => (
              <li key={v.id}>
                <VersionItem version={v} active={v.id === selected?.id} onSelect={() => setSelectedId(v.id)} />
              </li>
            ))}
          </ul>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border p-0.5">
                {(["diff", "full"] as const).map((m) => (
                  <Button key={m} size="xs" variant={mode === m ? "secondary" : "ghost"} onClick={() => setMode(m)}>
                    {m === "diff" ? "Perubahan" : "Isi versi"}
                  </Button>
                ))}
              </div>
              <Button
                size="sm"
                className="ml-auto"
                disabled={!selected || selected.current || !source || sourceFetching || restore.isPending}
                onClick={() => setConfirming(true)}
              >
                <RotateCcw /> Pulihkan versi ini
              </Button>
            </div>
            <div className="max-h-[50svh] min-h-40 overflow-auto rounded-xl border bg-muted/20 p-2 font-mono text-xs">
              {detailLoading || !detail || !source || sourceFetching ? (
                <Spinner />
              ) : mode === "full" ? (
                <pre className="whitespace-pre-wrap break-words">{detail.content}</pre>
              ) : (
                <DiffView before={detail.content} after={source.raw} />
              )}
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Pulihkan versi ini?"
        itemName={selected ? formatDateTime(selected.createdAt) : ""}
        description="Isi catatan diganti dengan versi ini. Isi sekarang disimpan ke riwayat sehingga bisa dipulihkan lagi."
        confirmLabel="Pulihkan"
        destructive={false}
        onConfirm={doRestore}
      />
    </>
  );
}

function VersionItem({
  version,
  active,
  onSelect,
}: {
  version: KnowledgeNoteVersion;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border px-2.5 py-1.5 text-left text-xs hover:bg-muted",
        active && "border-module/50 bg-module-soft",
      )}
    >
      <span className="flex items-center gap-1.5 font-semibold">
        {formatDateTime(version.createdAt)}
        {version.current && (
          <Badge variant="outline" className="h-4 px-1 text-[10px]">
            sekarang
          </Badge>
        )}
      </span>
      <span className="block truncate text-muted-foreground">
        {VERSION_REASON_LABEL[version.reason] ?? version.reason} · {sizeLabel(version.size)}
      </span>
    </button>
  );
}

/** Perubahan dari versi terpilih ke isi sekarang: merah = hanya di versi itu, hijau = ditambahkan sesudahnya. */
function DiffView({ before, after }: { before: string; after: string }) {
  const lines = lineDiff(before, after);
  if (!lines) return <p>Catatan terlalu panjang untuk dibandingkan — lihat "Isi versi".</p>;
  const { added, removed } = diffStats(lines);
  if (!added && !removed) return <p className="text-muted-foreground">Versi ini sama dengan isi sekarang.</p>;
  return (
    <div>
      <p className="mb-1.5 font-sans text-[11px] text-muted-foreground">
        Dibanding isi sekarang: <span className="text-destructive">−{removed} baris di versi ini</span> ·{" "}
        <span className="text-success">+{added} baris sesudahnya</span>
      </p>
      {lines.map((line, i) =>
        line.type === "skip" ? (
          <p key={i} className="py-0.5 text-center text-[10px] text-muted-foreground">
            ⋯ {line.count} baris sama
          </p>
        ) : (
          <p
            key={i}
            className={cn(
              "px-1 break-words whitespace-pre-wrap",
              line.type === "add" && "bg-success/10 text-success",
              line.type === "del" && "bg-destructive/10 text-destructive line-through decoration-destructive/40",
            )}
          >
            {line.type === "add" ? "+ " : line.type === "del" ? "− " : "  "}
            {line.text || " "}
          </p>
        ),
      )}
    </div>
  );
}
