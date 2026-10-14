import { useState } from "react";
import { useSchedules } from "@/data/collections";
import { ownedFiles } from "@/features/resources/attachment-cleanup";
import { DeleteWithFilesDialog } from "@/features/resources/delete-with-files-dialog";
import { useAttachmentCleanup } from "@/features/resources/use-attachment-cleanup";
import { useRetained } from "@/hooks/use-retained";
import type { Schedule } from "@/types/entities";
import { membersInScope, type SeriesScope, seriesMembers } from "../lib/recurrence";
import { SeriesScopePicker } from "./recurrence-fields";

/**
 * Konfirmasi hapus agenda — dipakai bersama Planner (tab Jadwal) & Productivity (daftar agenda Project/Area).
 * Agenda berulang: pilih cakupan (hanya ini / ini & berikutnya / semua dalam seri). Berkas dasar pelaksanaan & hasil
 * pertemuan yang terhapus ikut dihapus kecuali dipertahankan (→ Resource Global); berkas yang masih dipakai pertemuan
 * lain tetap aman. `schedule` null = tertutup.
 */
export function ScheduleDeleteDialog({
  schedule: scheduleProp,
  onOpenChange,
  onDeleted,
}: {
  schedule: Schedule | null;
  onOpenChange: (open: boolean) => void;
  /** Dipanggil setelah dihapus (ID agenda yang terhapus) */
  onDeleted?: (ids: string[]) => void;
}) {
  const { items: schedules, setItems } = useSchedules();
  const cleanup = useAttachmentCleanup();
  const deleting = useRetained(scheduleProp);
  // Cakupan kembali ke "hanya ini" setiap agenda lain dibuka (derived state saat render)
  const [state, setState] = useState<{ id: string | null; scope: SeriesScope }>({ id: null, scope: "this" });
  if (scheduleProp && state.id !== scheduleProp.id) setState({ id: scheduleProp.id, scope: "this" });
  const scope = state.scope;

  const targets = deleting
    ? deleting.seriesId
      ? membersInScope(seriesMembers(schedules, deleting.seriesId), deleting, scope)
      : [deleting]
    : [];
  // Bila agenda belum ada di koleksi (mis. baru saja dihapus), tetap tampilkan dirinya
  const effective = targets.length ? targets : deleting ? [deleting] : [];
  const attachments = effective.flatMap((s) => [...(s.resources ?? []), ...(s.results ?? [])]);
  const files = ownedFiles(attachments);

  return (
    <DeleteWithFilesDialog
      open={!!scheduleProp}
      onOpenChange={onOpenChange}
      title="Hapus Agenda?"
      description={
        effective.length > 1
          ? `${effective.length} pertemuan beserta dasar pelaksanaan & hasilnya akan dihapus:`
          : "Agenda beserta dasar pelaksanaan & hasilnya akan dihapus:"
      }
      itemName={deleting?.title}
      files={files}
      shared={deleting ? cleanup.referenced(attachments) : undefined}
      onConfirm={(keepIds) => {
        if (deleting) {
          const ids = new Set(effective.map((s) => s.id));
          setItems((prev) => prev.filter((s) => !ids.has(s.id)));
          cleanup.release(files, keepIds, { contextTag: "Agenda", exclude: attachments, ownerId: deleting.userId });
          onDeleted?.([...ids]);
        }
        onOpenChange(false);
      }}
    >
      {deleting?.seriesId && (
        <SeriesScopePicker value={scope} onChange={(next) => setState({ id: state.id, scope: next })} />
      )}
    </DeleteWithFilesDialog>
  );
}
