import {
  CheckCircle2,
  ChevronDown,
  Copy,
  FilePlus2,
  Inbox,
  Link2Off,
  ListChecks,
  Trash2,
  TriangleAlert,
  Unlink,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useKnowledgeNote } from "@/data/use-knowledge";
import { useKnowledgeHealth, useKnowledgeTree } from "@/data/use-knowledge-workspace";
import { formatDateTime } from "@/lib/dates";
import type { KnowledgeNoteListItem, KnowledgeNoteRef } from "@/types/api";
import { createResolver, folderOf, inboxNotes } from "./knowledge-logic";
import { NoteLinkProvider, NoteMarkdown } from "./note-markdown";
import { openWorkspaceDialog, useOpenNote } from "./workspace-store";

/** Tab Inbox: usulan agen/chatbot di `00-Inbox` — pratinjau, kurasi (status + folder), buka, buang. */
export function InboxTab() {
  const { data: tree, isLoading } = useKnowledgeTree();
  const openNote = useOpenNote();
  const [expanded, setExpanded] = useState<string | null>(null);
  if (isLoading || !tree) return <Spinner className="m-6" />;
  const items = inboxNotes(tree.notes);
  const resolve = createResolver(tree.notes);

  if (!items.length) {
    return (
      <Empty className="rounded-2xl border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox />
          </EmptyMedia>
          <EmptyTitle>Inbox kosong</EmptyTitle>
          <EmptyDescription>
            Usulan dari chatbot ("Simpan ke Inbox"), agen Hermes, dan Tanya AI masuk ke folder 00-Inbox untuk Anda
            kurasi.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <NoteLinkProvider
      value={{
        resolve,
        byId: (id) => tree.notes.find((n) => n.id === id) ?? null,
        open: (id, heading) => openNote(id, heading),
      }}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {items.length} usulan menunggu kurasi. Usulan berstatus draf tidak dipakai chatbot & agen sampai Anda
          menetapkan status <b>berlaku</b> dan memindahkannya ke folder pengetahuan.
        </p>
        {items.map((note) => (
          <article key={note.id} className="rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-start gap-2">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setExpanded((e) => (e === note.id ? null : note.id))}
              >
                <p className="flex items-center gap-1.5 font-semibold">
                  <ChevronDown className={`size-4 transition-transform ${expanded === note.id ? "" : "-rotate-90"}`} />
                  <span className="truncate">{note.title}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(note.updatedAt)}</p>
              </button>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => openWorkspaceDialog({ kind: "curate", note })}>
                  <CheckCircle2 /> Kurasi
                </Button>
                <Button size="sm" variant="outline" onClick={() => openNote(note.id)}>
                  Buka
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Buang usulan"
                  onClick={() => openWorkspaceDialog({ kind: "delete-note", note })}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            {expanded === note.id && <InboxPreview note={note} />}
          </article>
        ))}
      </div>
    </NoteLinkProvider>
  );
}

function InboxPreview({ note }: { note: KnowledgeNoteListItem }) {
  const { data, isLoading } = useKnowledgeNote(note.id);
  if (isLoading) return <Spinner className="mt-3" />;
  return (
    <div className="mt-3 max-h-96 overflow-y-auto rounded-xl border bg-muted/20 p-3">
      <NoteMarkdown content={data?.content ?? ""} noteId={note.id} />
    </div>
  );
}

function RefList({ items, extra }: { items: KnowledgeNoteRef[]; extra?: (note: KnowledgeNoteRef) => ReactNode }) {
  const openNote = useOpenNote();
  return (
    <ul className="flex flex-col divide-y">
      {items.map((n, i) => (
        <li key={`${n.id}-${i}`} className="flex items-center gap-2 py-1.5">
          <button type="button" className="min-w-0 flex-1 text-left hover:text-module" onClick={() => openNote(n.id)}>
            <span className="block truncate text-sm font-medium">{n.title}</span>
            <span className="block truncate font-mono text-[11px] text-muted-foreground">{n.path}</span>
          </button>
          {extra?.(n)}
        </li>
      ))}
    </ul>
  );
}

/** Tab Kesehatan: properti bermasalah, tautan rusak, catatan yatim, judul ganda. */
export function HealthTab() {
  const { data, isLoading } = useKnowledgeHealth();
  const openNote = useOpenNote();
  if (isLoading || !data) return <Spinner className="m-6" />;
  const total = data.problems.length + data.broken.length + data.orphans.length + data.duplicates.length;
  const brokenByTarget = [...new Map(data.broken.map((b) => [b.target.toLowerCase(), b])).values()];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {total === 0
          ? "Vault sehat — tidak ada masalah yang ditemukan."
          : `${total} temuan. Merapikannya membuat jawaban chatbot & agen lebih tepat.`}
      </p>
      <SectionCard
        icon={TriangleAlert}
        title={`Properti bermasalah (${data.problems.length})`}
        description="Catatan pengetahuan wajib punya properti jenis & status agar bisa disaring (dicabut / draf tidak dipakai menjawab)."
      >
        {data.problems.length ? (
          <ul className="flex flex-col divide-y">
            {data.problems.map((p) => (
              <li key={p.noteId} className="flex items-center gap-2 py-1.5">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left font-mono text-xs hover:text-module"
                  onClick={() => openNote(p.noteId)}
                >
                  {p.path}
                </button>
                <span className="text-xs text-warning">{p.issues.join(" · ")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Ok />
        )}
      </SectionCard>
      <SectionCard
        icon={Link2Off}
        title={`Tautan rusak (${brokenByTarget.length})`}
        description="[[Tautan]] ke catatan yang belum ada."
      >
        {brokenByTarget.length ? (
          <ul className="flex flex-col divide-y">
            {brokenByTarget.map((b) => (
              <li key={b.target} className="flex flex-wrap items-center gap-2 py-1.5">
                <Badge variant="outline" className="text-warning">
                  {b.target}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  di{" "}
                  <button type="button" className="hover:text-module" onClick={() => openNote(b.note.id)}>
                    {b.note.title}
                  </button>
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    openWorkspaceDialog({ kind: "new-note", title: b.target, folder: folderOf(b.note.path) })
                  }
                >
                  <FilePlus2 /> Buat catatan
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <Ok />
        )}
      </SectionCard>
      <SectionCard
        icon={Unlink}
        title={`Catatan yatim (${data.orphans.length})`}
        description="Tanpa tautan masuk maupun keluar — sulit ditemukan lewat graf & catatan tertaut."
      >
        {data.orphans.length ? <RefList items={data.orphans} /> : <Ok />}
      </SectionCard>
      <SectionCard
        icon={Copy}
        title={`Judul ganda (${data.duplicates.length})`}
        description="Nama berkas sama di folder berbeda: [[nama]] jadi ambigu (yang path-nya terpendek dipakai)."
      >
        {data.duplicates.length ? (
          <div className="flex flex-col gap-3">
            {data.duplicates.map((d) => (
              <div key={d.name}>
                <p className="text-xs font-semibold">{d.name}</p>
                <RefList items={d.notes} />
              </div>
            ))}
          </div>
        ) : (
          <Ok />
        )}
      </SectionCard>
    </div>
  );
}

function Ok() {
  return (
    <p className="flex items-center gap-1.5 text-sm text-success">
      <ListChecks className="size-4" /> Tidak ada temuan.
    </p>
  );
}
