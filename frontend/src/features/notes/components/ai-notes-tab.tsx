import { CalendarDays, FileText, Link2, Mic, Paperclip, Pin, PinOff, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { AccessScope } from "@/components/common/access-scope";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SharedBadge } from "@/features/sharing/shared-badge";
import { itemAccess } from "@/lib/sharing";
import { PageLoader } from "@/components/common/page-loader";
import { PaginationControl } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useAiNotes, useSchedules } from "@/data/collections";
import { usePagination } from "@/hooks/use-pagination";
import { usePermissions } from "@/hooks/use-permissions";
import { useSearchParam, useSetSearchParams } from "@/hooks/use-search-param";
import { scheduleStart } from "@/features/planner/lib/planner-logic";
import { formatShortDate, parseLocalYMD, todayYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AiNote, Schedule } from "@/types/entities";
import { agendaLabel } from "../lib/agenda-options";
import { fileOf, filterAiNotes, sortAiNotes, uploadIdsOf } from "../lib/notes-logic";
import { removeUploads } from "../lib/remove-uploads";
import { AiNoteEditor } from "./ai-note-editor";

/** Tombol aksi kartu: muncul saat hover di perangkat ber-mouse, selalu terlihat di layar sentuh. */
const HOVER_ACTIONS =
  "transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100";

/** Catatan baru; bila dibuat dari agenda (`?schedule=<id>`) langsung terhubung + judul & tanggal agenda. */
const emptyNote = (schedule?: Schedule): AiNote => ({
  id: "",
  title: schedule?.title ?? "",
  date: schedule ? scheduleStart(schedule) || todayYMD() : todayYMD(),
  linkedScheduleId: schedule?.id ?? "",
  content: "",
  aiSummary: "",
  audioTranscript: "",
  fileContext: "",
  hasAudio: false,
  fileAttachment: null,
});

/** Teks pratinjau tanpa sintaks Markdown/rumus. */
const preview = (n: AiNote) =>
  n.aiSummary
    ? n.aiSummary
        .replace(/[*#$>`|_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : n.content || "";

export function AiNotesTab() {
  const { items: notes, setItems, isLoading } = useAiNotes();
  const { items: schedules } = useSchedules();
  const { canEdit } = usePermissions();
  const [noteParam, setNoteParam] = useSearchParam("note");
  const [scheduleParam] = useSearchParam("schedule");
  const setParams = useSetSearchParams();
  const [deleting, setDeleting] = useState<AiNote | null>(null);
  const [query, setQuery] = useState("");

  const visible = sortAiNotes(filterAiNotes(notes, query));
  const { pageItems, setPage, controlProps } = usePagination(visible, 10);

  const fromSchedule = noteParam === "new" && scheduleParam ? schedules.find((s) => s.id === scheduleParam) : undefined;
  const editing =
    noteParam === "new" ? emptyNote(fromSchedule) : (notes.find((n) => String(n.id) === noteParam) ?? null);

  const upsert = (note: AiNote) =>
    setItems((prev) =>
      prev.some((n) => n.id === note.id) ? prev.map((n) => (n.id === note.id ? note : n)) : [...prev, note],
    );

  if (editing) {
    return (
      <AccessScope item={editing}>
        <AiNoteEditor
          // Remount saat agenda asal selesai dimuat agar catatan baru ikut terisi
          key={`${noteParam}:${fromSchedule?.id ?? ""}`}
          note={editing}
          readOnly={!canEdit || !itemAccess(editing).canEdit}
          onPersist={(note) => upsert({ ...note, id: note.id || Date.now(), updatedAt: new Date().toISOString() })}
          onExit={() => setParams({ note: null, schedule: null })}
        />
      </AccessScope>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          placeholder="Cari judul, catatan, transkrip, ringkasan..."
          className="md:w-80"
        />
        {canEdit && (
          <Button onClick={() => setNoteParam("new")}>
            <Plus /> Notes AI Baru
          </Button>
        )}
      </div>

      {isLoading ? (
        <PageLoader />
      ) : visible.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="bg-module-soft text-module">
              <Sparkles />
            </EmptyMedia>
            <EmptyTitle>{query ? "Tidak ada Notes AI yang cocok." : "Belum ada Notes AI."}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {pageItems.map((n) => {
            const schedule = n.linkedScheduleId ? schedules.find((s) => s.id === n.linkedScheduleId) : undefined;
            return (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => setNoteParam(String(n.id))}
                onKeyDown={(e) => e.key === "Enter" && setNoteParam(String(n.id))}
                className="group relative cursor-pointer rounded-2xl border bg-card p-5 transition-all hover:border-module/40 hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="flex items-center gap-1.5 text-lg font-bold">
                      {n.pinned && (
                        <Pin className="size-3.5 shrink-0 fill-current text-module" aria-label="Disematkan" />
                      )}
                      <span className="truncate">{n.title || "Tanpa Judul"}</span>
                    </h4>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {n.date && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="size-3" /> {formatShortDate(parseLocalYMD(n.date))}
                        </span>
                      )}
                      {n.linkedScheduleId && (
                        <Badge className="max-w-full bg-mod-planner/15 text-mod-planner">
                          <Link2 />
                          <span className="truncate">{schedule ? agendaLabel(schedule) : "Agenda sudah dihapus"}</span>
                        </Badge>
                      )}
                    </div>
                  </div>
                  {n.aiSummary && (
                    <Badge className="shrink-0 bg-module-soft text-module">
                      <Sparkles /> Ringkasan siap
                    </Badge>
                  )}
                </div>
                <div className="my-2 flex flex-wrap gap-2">
                  <SharedBadge item={n} recordType="ai_note" />
                  {n.hasAudio && (
                    <Badge variant="outline" className="border-destructive/30 text-destructive">
                      <Mic /> Audio
                    </Badge>
                  )}
                  {fileOf(n) && (
                    <Badge variant="outline" className="border-mod-notes/40 text-mod-notes">
                      <Paperclip /> Dokumen
                    </Badge>
                  )}
                  {n.content && (
                    <Badge variant="outline">
                      <FileText /> Catatan
                    </Badge>
                  )}
                </div>
                <p className="line-clamp-2 pr-20 text-sm text-muted-foreground">
                  {preview(n) || "Tidak ada pratinjau konten."}
                </p>
                {/* Sematkan & hapus hanya untuk catatan milik sendiri */}
                {canEdit && !n.share && (
                  <div className={cn("absolute right-4 bottom-4 flex gap-0.5", HOVER_ACTIONS)}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={n.pinned ? "Lepas sematan" : "Sematkan"}
                      title={n.pinned ? "Lepas sematan" : "Sematkan"}
                      onClick={(e) => {
                        e.stopPropagation();
                        upsert({ ...n, pinned: !n.pinned });
                      }}
                    >
                      {n.pinned ? <PinOff /> : <Pin />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Hapus"
                      title="Hapus"
                      className="hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleting(n);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <PaginationControl {...controlProps} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Notes AI?"
        description={
          deleting && uploadIdsOf(deleting).length > 0
            ? "Catatan beserta audio/dokumen lampirannya akan dihapus permanen."
            : "Catatan ini akan dihapus permanen."
        }
        itemName={deleting?.title || "Tanpa Judul"}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting) {
            setItems((prev) => prev.filter((n) => n.id !== deleting.id));
            removeUploads(uploadIdsOf(deleting));
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}
