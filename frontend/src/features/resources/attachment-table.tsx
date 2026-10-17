import { Bot, ExternalLink, FileText, NotebookPen, PencilLine, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumericDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AttachedResource } from "@/types/entities";
import { useOfficeLinkBadges } from "@/data/use-office";
import { DocumentLinkBadge } from "@/features/tools/onlyoffice/document-links";
import { AttachmentEditDialog } from "./attachment-edit-dialog";
import { attachmentLabel, noteAttachmentPath, openAttachment } from "./resource-utils";

interface AttachmentTableProps {
  resources?: AttachedResource[];
  onRemove?: (id: string) => void;
  onOpenAi?: (resource: AttachedResource) => void;
  /** Diisi → tombol Ubah (nomor, nama, tanggal, deskripsi, tag) tanpa menghapus berkasnya */
  onUpdate?: (updated: AttachedResource) => void;
  emptyText?: string;
}

/** Tabel lampiran. */
export function AttachmentTable({
  resources = [],
  onRemove,
  onOpenAi,
  onUpdate,
  emptyText = "Belum ada resource/dasar pelaksanaan dilampirkan.",
}: AttachmentTableProps) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState<AttachedResource | null>(null);
  const linkBadges = useOfficeLinkBadges(resources.map((res) => res.uploadId));
  // Lampiran catatan (tanpa file/link) dibuka di Notes Space; berkas di modal pratinjau, link di tab baru (openAttachment)
  const open = (res: AttachedResource) => {
    const notePath = !res.uploadId && !res.url ? noteAttachmentPath(res.noteId) : null;
    if (notePath) void navigate(notePath);
    else void openAttachment(res);
  };

  if (resources.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground italic">{emptyText}</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-20">No</TableHead>
            <TableHead>Nama</TableHead>
            <TableHead>Deskripsi</TableHead>
            <TableHead className="w-28">Tanggal</TableHead>
            <TableHead className="w-28 text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resources.map((res, idx) => (
            <TableRow key={`${res.id || idx}-${idx}`}>
              <TableCell className="font-mono text-xs">{res.number || "-"}</TableCell>
              <TableCell>
                <button
                  type="button"
                  onClick={() => open(res)}
                  className="flex max-w-64 items-center gap-2 text-left font-semibold text-module hover:underline"
                >
                  {res.type === "file" ? (
                    <FileText className="size-3.5 shrink-0" />
                  ) : res.type === "note" ? (
                    <NotebookPen className="size-3.5 shrink-0" />
                  ) : (
                    <ExternalLink className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{attachmentLabel(res)}</span>
                </button>
                {res.uploadId && <DocumentLinkBadge link={linkBadges?.[res.uploadId]} />}
                {!!res.tags?.length && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {res.tags.map((tag) => (
                      <Badge key={tag} className="bg-module-soft text-[10px] text-module">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell className="max-w-64 truncate text-muted-foreground">
                {res.description || res.content || "-"}
              </TableCell>
              <TableCell className="text-xs">{res.date ? formatNumericDate(res.date) : "-"}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  {onOpenAi && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      title="AI Knowledge Summary"
                      className={cn(res.aiSummary && "bg-module-soft text-module")}
                      onClick={() => onOpenAi(res)}
                    >
                      <Bot />
                    </Button>
                  )}
                  {onUpdate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      title="Ubah lampiran"
                      onClick={() => setEditing(res)}
                    >
                      <PencilLine />
                    </Button>
                  )}
                  {onRemove && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      title="Hapus lampiran"
                      className="hover:text-destructive"
                      onClick={() => onRemove(res.id)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {onUpdate && (
        <AttachmentEditDialog
          attachment={editing}
          onOpenChange={(open) => !open && setEditing(null)}
          onSave={onUpdate}
        />
      )}
    </div>
  );
}
