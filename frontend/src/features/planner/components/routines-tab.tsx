import { Archive, ArchiveRestore, History, PencilLine, Plus, RefreshCw, Snowflake, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PaginationControl } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useCompletions, useRoutines } from "@/data/collections";
import { usePagination } from "@/hooks/use-pagination";
import { usePermissions } from "@/hooks/use-permissions";
import { useSearchParam } from "@/hooks/use-search-param";
import { useToday } from "@/hooks/use-today";
import { formatDayMonth, parseLocalYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Routine } from "@/types/entities";
import { describeFrequency, isPeriodActiveOn, isRoutineFrozenOn, yesterdayYMD } from "../lib/planner-logic";
import { searchRoutines } from "../lib/planner-search";
import { FreezeDialog, FreezeHistoryDialog, RoutineFormDialog } from "./routine-dialogs";

export function RoutinesTab() {
  const { items: routines, setItems } = useRoutines();
  const { items: completions, setItems: setCompletions } = useCompletions();
  const { canEdit } = usePermissions();
  const [showArchived, setShowArchived] = useState(false);
  // Dialog edit dikendalikan URL: ?edit=<id> | ?edit=new (mendukung deep link)
  const [editId, setEditId] = useSearchParam("edit");
  const editing: Routine | "new" | null = editId === "new" ? "new" : (routines.find((r) => r.id === editId) ?? null);
  const [deleting, setDeleting] = useState<Routine | null>(null);
  const [archiving, setArchiving] = useState<Routine | null>(null);
  const [freezing, setFreezing] = useState<Routine | null>(null);
  const [unfreezing, setUnfreezing] = useState<Routine | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);

  const update = (id: string, fn: (r: Routine) => Routine) =>
    setItems((prev) => prev.map((r) => (r.id === id ? fn(r) : r)));

  const today = useToday();
  const [query, setQuery] = useState("");
  const displayed = searchRoutines(
    routines.filter((r) => (showArchived ? r.archived : !r.archived)),
    query,
  );
  const { pageItems, setPage, controlProps } = usePagination(displayed, 10);
  const deletingCompletions = deleting ? completions.filter((c) => c.routineId === deleting.id).length : 0;
  // Referensi live agar dialog riwayat langsung mencerminkan perubahan
  const historyRoutine = routines.find((r) => r.id === historyId) ?? null;

  const confirmUnfreeze = () => {
    if (!unfreezing) return;
    const yesterday = yesterdayYMD();
    const label = formatDayMonth(today);
    update(unfreezing.id, (r) => ({
      ...r,
      freezePeriods: (r.freezePeriods ?? []).map((p) =>
        isPeriodActiveOn(p, today) ? { ...p, endDate: yesterday, reason: `${p.reason} (Unfrozen pada ${label})` } : p,
      ),
    }));
    setUnfreezing(null);
  };

  return (
    <SectionCard
      icon={RefreshCw}
      title="Rutinitas"
      description="Bangun kebiasaan baik setiap hari."
      action={
        <div className="flex flex-wrap gap-2">
          <Button
            variant={showArchived ? "secondary" : "outline"}
            size="sm"
            className={cn(showArchived && "bg-warning/20 text-warning-foreground dark:text-warning")}
            onClick={() => {
              setShowArchived((v) => !v);
              setPage(1);
            }}
          >
            <Archive /> {showArchived ? "Sembunyikan Arsip" : "Lihat Arsip"}
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => setEditId("new")}>
              <Plus /> Buat Baru
            </Button>
          )}
        </div>
      }
    >
      {routines.length > 0 && (
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          placeholder="Cari rutinitas atau pola (mis. mingguan)…"
          className="mb-4 md:w-80"
        />
      )}
      {displayed.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="bg-module-soft text-module">
              <RefreshCw />
            </EmptyMedia>
            <EmptyTitle>
              {query.trim()
                ? `Tidak ada rutinitas ${showArchived ? "diarsipkan" : "aktif"} yang cocok dengan "${query.trim()}"`
                : `Tidak ada rutinitas ${showArchived ? "diarsipkan" : "aktif"}`}
            </EmptyTitle>
            {!showArchived && !query.trim() && (
              <EmptyDescription>Buat rutinitas untuk membangun kebiasaan baik.</EmptyDescription>
            )}
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {pageItems.map((r) => {
            const frozen = isRoutineFrozenOn(r, today);
            return (
              <li
                key={r.id}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border p-4 transition-colors md:flex-row md:items-center md:justify-between",
                  r.archived
                    ? "bg-muted/60 opacity-80"
                    : frozen
                      ? "border-info/40 bg-info/8"
                      : "bg-card hover:border-module/30",
                )}
              >
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                      r.archived
                        ? "bg-muted text-muted-foreground"
                        : frozen
                          ? "bg-info/20 text-info"
                          : "bg-module-soft text-module",
                    )}
                  >
                    {r.archived ? (
                      <Archive className="size-5" />
                    ) : frozen ? (
                      <Snowflake className="size-5" />
                    ) : (
                      <RefreshCw className="size-5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-base font-bold">{r.title}</h4>
                      {frozen && (
                        <Badge className="bg-info text-info-foreground">
                          <Snowflake /> Sedang Freeze
                        </Badge>
                      )}
                      {r.archived && <Badge variant="secondary">Diarsipkan</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{describeFrequency(r)}</span>
                      {r.startDate && (
                        <span className="rounded-md bg-module-soft px-2 py-0.5 font-semibold text-module">
                          Mulai: {formatDayMonth(parseLocalYMD(r.startDate))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {canEdit && (
                  <div className="flex flex-wrap justify-end gap-1">
                    {!r.archived && (
                      <>
                        <Button variant="ghost" size="icon" title="Riwayat freeze" onClick={() => setHistoryId(r.id)}>
                          <History />
                        </Button>
                        {frozen ? (
                          <Button
                            size="sm"
                            className="bg-info text-info-foreground hover:bg-info/85"
                            onClick={() => setUnfreezing(r)}
                          >
                            Unfreeze
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Freeze"
                            className="hover:text-info"
                            onClick={() => setFreezing(r)}
                          >
                            <Snowflake />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" title="Ubah" onClick={() => setEditId(r.id)}>
                          <PencilLine />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      title={r.archived ? "Aktifkan kembali" : "Arsipkan"}
                      className={r.archived ? "text-success" : "hover:text-warning"}
                      onClick={() => setArchiving(r)}
                    >
                      {r.archived ? <ArchiveRestore /> : <Archive />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Hapus"
                      className="hover:text-destructive"
                      onClick={() => setDeleting(r)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4">
        <PaginationControl {...controlProps} />
      </div>

      <RoutineFormDialog
        routine={editing}
        onOpenChange={(open) => !open && setEditId(null)}
        onSave={(values) => {
          if (editing === "new") {
            setItems((prev) => [
              ...prev,
              {
                id: `routine-${Date.now()}`,
                ...values,
                active: true,
                archived: false,
                createdAt: new Date().toISOString(),
              },
            ]);
          } else if (editing) {
            update(editing.id, (r) => ({ ...r, ...values }));
          }
          setEditId(null);
        }}
      />
      <FreezeDialog
        routine={freezing}
        onOpenChange={(open) => !open && setFreezing(null)}
        onSave={(period) => {
          if (freezing) update(freezing.id, (r) => ({ ...r, freezePeriods: [...(r.freezePeriods ?? []), period] }));
          setFreezing(null);
        }}
      />
      <FreezeHistoryDialog
        key={historyRoutine?.id ?? "none"}
        routine={historyRoutine}
        onOpenChange={(open) => !open && setHistoryId(null)}
        onChange={(periods) => historyRoutine && update(historyRoutine.id, (r) => ({ ...r, freezePeriods: periods }))}
      />
      <ConfirmDialog
        open={!!unfreezing}
        onOpenChange={(open) => !open && setUnfreezing(null)}
        title="Cairkan Rutinitas?"
        description="Rutinitas akan aktif kembali mulai hari ini. Status freeze akan diakhiri per kemarin."
        itemName={unfreezing?.title}
        confirmLabel="Ya, Unfreeze"
        destructive={false}
        onConfirm={confirmUnfreeze}
      />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={archiving?.archived ? "Aktifkan Rutinitas?" : "Arsipkan Rutinitas?"}
        description={
          archiving?.archived
            ? "Rutinitas akan kembali muncul di daftar harian."
            : "Rutinitas akan disembunyikan dari daftar harian, namun tidak dihapus."
        }
        itemName={archiving?.title}
        confirmLabel={archiving?.archived ? "Ya, Aktifkan" : "Arsipkan"}
        destructive={false}
        onConfirm={() => {
          if (archiving) update(archiving.id, (r) => ({ ...r, archived: !archiving.archived }));
          setArchiving(null);
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Rutinitas?"
        description={
          deletingCompletions > 0
            ? `Rutinitas beserta ${deletingCompletions} riwayat penyelesaiannya akan dihapus. Pilih Arsipkan bila riwayat ingin disimpan.`
            : "Rutinitas akan dihapus. Pilih Arsipkan bila hanya ingin menyembunyikannya."
        }
        itemName={deleting?.title}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting) {
            // Riwayat centang ikut dihapus agar tidak tertinggal tanpa rutinitas
            setItems((prev) => prev.filter((r) => r.id !== deleting.id));
            setCompletions((prev) => prev.filter((c) => c.routineId !== deleting.id));
          }
          setDeleting(null);
        }}
      />
    </SectionCard>
  );
}
