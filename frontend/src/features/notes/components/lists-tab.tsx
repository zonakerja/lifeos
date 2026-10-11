import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  ChevronUp,
  ListChecks,
  ListTodo,
  PencilLine,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageLoader } from "@/components/common/page-loader";
import { PaginationControl } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useLists } from "@/data/collections";
import { usePagination } from "@/hooks/use-pagination";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import type { FreeList, ListItem } from "@/types/entities";
import { filterLists, listProgress, moveItem, removeCheckedItems } from "../lib/notes-logic";

type ItemRef = { listId: FreeList["id"]; itemId: ListItem["id"] };

/** Tombol aksi: muncul saat hover di perangkat ber-mouse, selalu terlihat di layar sentuh. */
const HOVER_ACTIONS =
  "transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100";

export function ListsTab() {
  const { items: lists, setItems, isLoading } = useLists();
  const { canEdit } = usePermissions();
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [newListName, setNewListName] = useState("");
  const [editingTitle, setEditingTitle] = useState<{ id: FreeList["id"]; title: string } | null>(null);
  const [editingItem, setEditingItem] = useState<(ItemRef & { text: string }) | null>(null);
  const [deleting, setDeleting] = useState<FreeList | null>(null);
  const [archiving, setArchiving] = useState<FreeList | null>(null);
  const [clearing, setClearing] = useState<FreeList | null>(null);

  const displayed = filterLists(
    lists.filter((l) => (showArchived ? l.archived : !l.archived)),
    query,
  );
  const { pageItems, setPage, controlProps } = usePagination(displayed, 9);

  const updateList = (id: FreeList["id"], fn: (l: FreeList) => FreeList) =>
    setItems((prev) => prev.map((l) => (l.id === id ? fn(l) : l)));

  const addList = (e: FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    setItems((prev) => [...prev, { id: Date.now(), title: newListName.trim(), items: [], archived: false }]);
    setNewListName("");
    setQuery("");
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        {canEdit && !showArchived ? (
          <form onSubmit={addList} className="flex w-full max-w-md gap-2">
            <Input
              placeholder="Judul List Baru..."
              aria-label="Judul list baru"
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            placeholder="Cari list atau item..."
          />
          <Button
            variant={showArchived ? "secondary" : "outline"}
            className={cn(showArchived && "bg-warning/20 text-warning-foreground dark:text-warning")}
            onClick={() => {
              setShowArchived((v) => !v);
              setPage(1);
            }}
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
      </div>

      {isLoading ? (
        <PageLoader />
      ) : displayed.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="bg-module-soft text-module">
              <ListTodo />
            </EmptyMedia>
            <EmptyTitle>
              {query ? "Tidak ada list yang cocok." : `Tidak ada list ${showArchived ? "diarsipkan" : "aktif"}.`}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((list) => {
            const progress = listProgress(list);
            const allDone = progress.total > 0 && progress.done === progress.total;
            const editable = canEdit && !list.archived;
            return (
              <Card key={list.id} className={cn("gap-0 py-0", list.archived && "opacity-75 grayscale")}>
                <CardHeader className="flex flex-col gap-2 border-b bg-module-soft/60 py-4">
                  <div className="flex w-full items-center justify-between gap-2">
                    {editingTitle?.id === list.id ? (
                      <form onSubmit={saveTitle} className="flex-1">
                        <Input
                          autoFocus
                          aria-label="Judul list"
                          className="h-8 font-bold"
                          value={editingTitle.title}
                          onChange={(e) => setEditingTitle({ ...editingTitle, title: e.target.value })}
                          onBlur={() => setEditingTitle(null)}
                        />
                      </form>
                    ) : (
                      <h4 className="group flex min-w-0 items-center gap-2 text-base font-bold">
                        <span className="truncate">{list.title}</span>
                        {editable && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Ubah judul"
                            className={HOVER_ACTIONS}
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
                          aria-label={list.archived ? "Aktifkan kembali" : "Arsipkan"}
                          className={list.archived ? "text-success" : "hover:text-warning"}
                          onClick={() => setArchiving(list)}
                        >
                          {list.archived ? <ArchiveRestore /> : <Archive />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Hapus"
                          aria-label="Hapus list"
                          className="hover:text-destructive"
                          onClick={() => setDeleting(list)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </div>
                  {progress.total > 0 && (
                    <div className="flex w-full items-center gap-2">
                      <Progress
                        value={progress.percent}
                        className="h-1.5"
                        indicatorClassName={allDone ? "bg-success" : "bg-module"}
                        aria-label="Progres list"
                      />
                      <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
                        {progress.done}/{progress.total}
                      </span>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="flex min-h-36 flex-col gap-2 py-4">
                  {list.items.map((item, index) => {
                    const isEditing = editingItem?.listId === list.id && editingItem.itemId === item.id;
                    return (
                      <div key={item.id} className="group flex items-start gap-3">
                        <button
                          type="button"
                          disabled={!editable}
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
                        {isEditing ? (
                          <form onSubmit={saveItemText} className="flex-1">
                            <Input
                              autoFocus
                              aria-label="Teks item"
                              className="h-7 text-sm"
                              value={editingItem.text}
                              onChange={(e) => setEditingItem({ ...editingItem, text: e.target.value })}
                              onBlur={() => setEditingItem(null)}
                            />
                          </form>
                        ) : (
                          <span
                            className={cn(
                              "min-w-0 flex-1 text-sm break-words",
                              item.checked && "text-muted-foreground line-through",
                            )}
                            onDoubleClick={() =>
                              editable && setEditingItem({ listId: list.id, itemId: item.id, text: item.text })
                            }
                          >
                            {item.text}
                          </span>
                        )}
                        {editable && !isEditing && (
                          <div className={cn("flex shrink-0 gap-0.5", HOVER_ACTIONS)}>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Pindah ke atas"
                              disabled={index === 0}
                              onClick={() =>
                                updateList(list.id, (l) => ({ ...l, items: moveItem(l.items, index, -1) }))
                              }
                            >
                              <ChevronUp />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Pindah ke bawah"
                              disabled={index === list.items.length - 1}
                              onClick={() => updateList(list.id, (l) => ({ ...l, items: moveItem(l.items, index, 1) }))}
                            >
                              <ChevronDown />
                            </Button>
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
                    );
                  })}
                  {!showArchived && allDone && (
                    <p className="rounded-lg bg-success/12 py-2 text-center text-xs font-bold text-success">
                      Semua tugas selesai! 🎉
                    </p>
                  )}
                  {list.items.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground italic">Belum ada item.</p>
                  )}
                  {editable && progress.done > 0 && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="self-end text-muted-foreground hover:text-destructive"
                      onClick={() => setClearing(list)}
                    >
                      <ListChecks /> Hapus yang selesai ({progress.done})
                    </Button>
                  )}
                </CardContent>
                {editable && (
                  <CardFooter className="border-t py-3">
                    <Input
                      placeholder="+ Tambah item lalu tekan Enter..."
                      aria-label={`Tambah item ke ${list.title}`}
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
      <PaginationControl {...controlProps} sizes={[9, 18, 36]} />

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
        open={!!clearing}
        onOpenChange={(open) => !open && setClearing(null)}
        title="Hapus Item Selesai?"
        description={`${clearing ? listProgress(clearing).done : 0} item yang sudah dicentang akan dihapus dari list ini.`}
        itemName={clearing?.title}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (clearing) updateList(clearing.id, (l) => ({ ...l, items: removeCheckedItems(l.items) }));
          setClearing(null);
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
