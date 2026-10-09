import { Archive, ArchiveRestore, Check, ListTodo, PencilLine, Plus, Trash2, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { useLists } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import type { FreeList, ListItem } from "@/types/entities";

type ItemRef = { listId: FreeList["id"]; itemId: ListItem["id"] };

export function ListsTab() {
  const { items: lists, setItems } = useLists();
  const { canEdit } = usePermissions();
  const [showArchived, setShowArchived] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [editingTitle, setEditingTitle] = useState<{ id: FreeList["id"]; title: string } | null>(null);
  const [editingItem, setEditingItem] = useState<(ItemRef & { text: string }) | null>(null);
  const [deleting, setDeleting] = useState<FreeList | null>(null);
  const [archiving, setArchiving] = useState<FreeList | null>(null);

  const updateList = (id: FreeList["id"], fn: (l: FreeList) => FreeList) =>
    setItems((prev) => prev.map((l) => (l.id === id ? fn(l) : l)));

  const addList = (e: FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    setItems((prev) => [...prev, { id: Date.now(), title: newListName.trim(), items: [], archived: false }]);
    setNewListName("");
  };

  const saveTitle = (e: FormEvent) => {
    e.preventDefault();
    if (!editingTitle?.title.trim()) return;
    updateList(editingTitle.id, (l) => ({ ...l, title: editingTitle.title.trim() }));
    setEditingTitle(null);
  };

  const saveItemText = (e: FormEvent) => {
    e.preventDefault();
    if (!editingItem?.text.trim()) return;
    updateList(editingItem.listId, (l) => ({
      ...l,
      items: l.items.map((i) => (i.id === editingItem.itemId ? { ...i, text: editingItem.text.trim() } : i)),
    }));
    setEditingItem(null);
  };

  const displayed = lists.filter((l) => (showArchived ? l.archived : !l.archived));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        {canEdit && !showArchived ? (
          <form onSubmit={addList} className="flex w-full max-w-md gap-2">
            <Input
              placeholder="Judul List Baru..."
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
            />
            <Button type="submit" size="icon" aria-label="Tambah list">
              <Plus />
            </Button>
          </form>
        ) : (
          <span />
        )}
        <Button
          variant={showArchived ? "secondary" : "outline"}
          className={cn(showArchived && "bg-warning/20 text-warning-foreground dark:text-warning")}
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? (
            <>
              <ListTodo /> Kembali ke List
            </>
          ) : (
            <>
              <Archive /> Lihat Arsip
            </>
          )}
        </Button>
      </div>

      {displayed.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="bg-module-soft text-module">
              <ListTodo />
            </EmptyMedia>
            <EmptyTitle>Tidak ada list {showArchived ? "diarsipkan" : "aktif"}.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
          {displayed.map((list) => {
            const allDone = list.items.length > 0 && list.items.every((i) => i.checked);
            return (
              <Card key={list.id} className={cn("gap-0 py-0", list.archived && "opacity-75 grayscale")}>
                <CardHeader className="flex flex-row items-center justify-between gap-2 border-b bg-module-soft/60 py-4">
                  {editingTitle?.id === list.id ? (
                    <form onSubmit={saveTitle} className="flex-1">
                      <Input
                        autoFocus
                        className="h-8 font-bold"
                        value={editingTitle.title}
                        onChange={(e) => setEditingTitle({ ...editingTitle, title: e.target.value })}
                        onBlur={() => setEditingTitle(null)}
                      />
                    </form>
                  ) : (
                    <h4 className="group flex min-w-0 items-center gap-2 text-base font-bold">
                      <span className="truncate">{list.title}</span>
                      {canEdit && !list.archived && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Ubah judul"
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() => setEditingTitle({ id: list.id, title: list.title })}
                        >
                          <PencilLine />
                        </Button>
                      )}
                    </h4>
                  )}
                  {canEdit && (
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={list.archived ? "Aktifkan kembali" : "Arsipkan"}
                        className={list.archived ? "text-success" : "hover:text-warning"}
                        onClick={() => setArchiving(list)}
                      >
                        {list.archived ? <ArchiveRestore /> : <Archive />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Hapus"
                        className="hover:text-destructive"
                        onClick={() => setDeleting(list)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="flex min-h-36 flex-col gap-2 py-4">
                  {list.items.map((item) => (
                    <div key={item.id} className="group flex items-start gap-3">
                      <button
                        type="button"
                        disabled={!canEdit || list.archived}
                        aria-label={item.checked ? "Tandai belum selesai" : "Tandai selesai"}
                        onClick={() =>
                          updateList(list.id, (l) => ({
                            ...l,
                            items: l.items.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)),
                          }))
                        }
                        className={cn(
                          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                          item.checked
                            ? "border-success bg-success text-white"
                            : "border-muted-foreground/40 hover:border-success",
                        )}
                      >
                        {item.checked && <Check className="size-3" strokeWidth={4} />}
                      </button>
                      {editingItem?.listId === list.id && editingItem.itemId === item.id ? (
                        <form onSubmit={saveItemText} className="flex-1">
                          <Input
                            autoFocus
                            className="h-7 text-sm"
                            value={editingItem.text}
                            onChange={(e) => setEditingItem({ ...editingItem, text: e.target.value })}
                            onBlur={() => setEditingItem(null)}
                          />
                        </form>
                      ) : (
                        <span
                          className={cn("flex-1 text-sm", item.checked && "text-muted-foreground line-through")}
                          onDoubleClick={() =>
                            canEdit &&
                            !list.archived &&
                            setEditingItem({ listId: list.id, itemId: item.id, text: item.text })
                          }
                        >
                          {item.text}
                        </span>
                      )}
                      {canEdit && !list.archived && editingItem?.itemId !== item.id && (
                        <div className="flex gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Ubah item"
                            onClick={() => setEditingItem({ listId: list.id, itemId: item.id, text: item.text })}
                          >
                            <PencilLine />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Hapus item"
                            className="hover:text-destructive"
                            onClick={() =>
                              updateList(list.id, (l) => ({ ...l, items: l.items.filter((i) => i.id !== item.id) }))
                            }
                          >
                            <X />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!showArchived && allDone && (
                    <p className="rounded-lg bg-success/12 py-2 text-center text-xs font-bold text-success">
                      Semua tugas selesai! 🎉
                    </p>
                  )}
                  {list.items.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground italic">Belum ada item.</p>
                  )}
                </CardContent>
                {canEdit && !list.archived && (
                  <CardFooter className="border-t py-3">
                    <Input
                      placeholder="+ Tambah item..."
                      className="border-none bg-muted/60 shadow-none"
                      onKeyDown={(e) => {
                        const target = e.currentTarget;
                        if (e.key === "Enter" && target.value.trim()) {
                          const text = target.value.trim();
                          updateList(list.id, (l) => ({
                            ...l,
                            items: [...l.items, { id: Date.now(), text, checked: false }],
                          }));
                          target.value = "";
                        }
                      }}
                    />
                  </CardFooter>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus List?"
        description="List dan semua item di dalamnya akan dihapus permanen."
        itemName={deleting?.title}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting) setItems((prev) => prev.filter((l) => l.id !== deleting.id));
          setDeleting(null);
        }}
      />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={archiving?.archived ? "Aktifkan List?" : "Arsipkan List?"}
        description={
          archiving?.archived
            ? "List ini akan dikembalikan ke daftar aktif utama."
            : "List ini akan dipindahkan ke dalam arsip untuk menyembunyikannya."
        }
        itemName={archiving?.title}
        confirmLabel={archiving?.archived ? "Aktifkan" : "Arsipkan"}
        destructive={false}
        onConfirm={() => {
          if (archiving) updateList(archiving.id, (l) => ({ ...l, archived: !archiving.archived }));
          setArchiving(null);
        }}
      />
    </div>
  );
}
