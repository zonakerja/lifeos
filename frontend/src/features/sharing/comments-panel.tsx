import { MessageSquare, Pencil, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCommentMutations, useComments, useSharedOutKeys } from "@/data/use-sharing";
import { useToday } from "@/hooks/use-today";
import { errorMessage } from "@/lib/api/client";
import { formatRelative } from "@/lib/dates";
import { itemAccess } from "@/lib/sharing";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { RecordComment, RecordType, ShareMeta } from "@/types/api";

interface CommentsPanelProps {
  recordType: RecordType;
  item: { id: string | number; share?: ShareMeta };
  className?: string;
}

/**
 * Komentar pada item yang dibagikan (milik user lain, atau milik sendiri yang sedang dibagikan). Item pribadi tidak
 * menampilkan panel. Menulis butuh izin Komentar/Edit (pemilik selalu boleh).
 */
export function CommentsPanel({ recordType, item, className }: CommentsPanelProps) {
  const sharedOut = (useSharedOutKeys().get(`${recordType}:${item.id}`) ?? 0) > 0;
  if (!item.share && !sharedOut) return null;
  return <CommentsBody recordType={recordType} item={item} className={className} />;
}

/** Tombol ikon yang membuka komentar dalam dialog (untuk baris tabel/kartu); hanya tampil untuk item bersama. */
export function CommentsButton({ recordType, item, title }: CommentsPanelProps & { title?: string }) {
  const [open, setOpen] = useState(false);
  const sharedOut = (useSharedOutKeys().get(`${recordType}:${item.id}`) ?? 0) > 0;
  if (!item.share && !sharedOut) return null;
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Komentar"
        aria-label="Komentar"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <MessageSquare />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Komentar{title ? ` — ${title}` : ""}</DialogTitle>
          </DialogHeader>
          {open && <CommentsBody recordType={recordType} item={item} className="border-0 p-0" />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CommentsBody({ recordType, item, className }: CommentsPanelProps) {
  const me = useAuthStore((s) => s.user);
  const access = itemAccess(item);
  const target = { recordType, recordId: String(item.id), ownerId: item.share?.ownerId };
  const { data: comments = [], isLoading } = useComments(target);
  const { create } = useCommentMutations(target);
  const [draft, setDraft] = useState("");

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    try {
      await create.mutateAsync(body);
      setDraft("");
    } catch (error) {
      toast.error("Komentar gagal dikirim", { description: errorMessage(error) });
    }
  };

  return (
    <section className={cn("flex flex-col gap-3 rounded-2xl border p-4", className)} aria-label="Komentar">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="size-4 text-module" /> Komentar ({comments.length})
      </h3>
      {isLoading ? (
        <Spinner />
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Belum ada komentar.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              target={target}
              canEdit={comment.authorId === me?.id}
              canDelete={comment.authorId === me?.id || access.isOwner}
            />
          ))}
        </ul>
      )}
      {access.canComment ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Textarea
            rows={2}
            placeholder="Tulis komentar…"
            value={draft}
            maxLength={5000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
            }}
          />
          <Button type="submit" size="sm" className="self-end" disabled={!draft.trim() || create.isPending}>
            {create.isPending ? <Spinner /> : <Send />} Kirim
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Izin Anda hanya Lihat — tidak dapat menulis komentar.</p>
      )}
    </section>
  );
}

function CommentItem({
  comment,
  target,
  canEdit,
  canDelete,
}: {
  comment: RecordComment;
  target: { recordType: RecordType; recordId: string; ownerId?: string };
  canEdit: boolean;
  canDelete: boolean;
}) {
  const now = useToday();
  const { update, remove } = useCommentMutations(target);
  const [editing, setEditing] = useState<string | null>(null);
  const edited = comment.updatedAt !== comment.createdAt;

  return (
    <li className="group flex gap-2.5">
      <Avatar className="size-7">
        <AvatarFallback className="bg-module-soft text-[10px] font-bold text-module">
          {comment.author.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{comment.author.name}</span>
          <span className="text-xs text-muted-foreground">
            {formatRelative(comment.createdAt, now)}
            {edited ? " · diubah" : ""}
          </span>
          <span className="ml-auto flex gap-1 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100">
            {canEdit && editing === null && (
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Ubah komentar"
                onClick={() => setEditing(comment.body)}
              >
                <Pencil />
              </Button>
            )}
            {canDelete && (
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Hapus komentar"
                onClick={() =>
                  remove.mutate(comment.id, {
                    onError: (error) => toast.error("Gagal menghapus komentar", { description: errorMessage(error) }),
                  })
                }
              >
                <Trash2 className="text-destructive" />
              </Button>
            )}
          </span>
        </div>
        {editing !== null ? (
          <form
            className="mt-1 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!editing.trim()) return;
              update.mutate(
                { id: comment.id, body: editing },
                {
                  onSuccess: () => setEditing(null),
                  onError: (error) => toast.error("Gagal mengubah komentar", { description: errorMessage(error) }),
                },
              );
            }}
          >
            <Textarea rows={2} value={editing} maxLength={5000} onChange={(e) => setEditing(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                Batal
              </Button>
              <Button type="submit" size="sm" disabled={update.isPending}>
                Simpan
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">{comment.body}</p>
        )}
      </div>
    </li>
  );
}
