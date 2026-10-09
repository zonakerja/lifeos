import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowRightCircle,
  BoxSelect,
  CheckSquare,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  FolderOpen,
  GripVertical,
  Home,
  Info,
  PencilLine,
  PlusSquare,
  Printer,
  Scissors,
  X,
} from "lucide-react";
import { type DragEvent, type MouseEvent, useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { type PageSize, PaginationControl, paginate } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useClassifications, usePhysRefs } from "@/data/collections";
import { openAttachment } from "@/features/resources/resource-utils";
import { usePermissions } from "@/hooks/use-permissions";
import { useSearchParam } from "@/hooks/use-search-param";
import { cn } from "@/lib/utils";
import type { PhysicalReference, PhysRefType } from "@/types/entities";
import {
  type ArchiveFile,
  archiveTitle,
  childTypeOf,
  classificationCode,
  containerHasFiles,
  deepestContainerId,
  isValidHierarchy,
  PHYS_SHORT_LABEL,
  PHYS_TYPE_LABEL,
} from "../../lib/archive";
import { useArchiveFiles, useFileControlActions } from "../../use-file-control";
import { CONTAINER_STYLE } from "../archive-ui";
import { BulkMoveDialog, type MoveTarget } from "../bulk-move-dialog";
import { ContainerInfoDialog } from "../container-info-dialog";
import { ArchiveLabelDialog, ContainerLabelDialog } from "../label-dialogs";
import { type PhysRefFormTarget, PhysRefFormDialog } from "../phys-ref-form-dialog";
import { ContainerPrintDialog } from "../print-documents";
import { MoveContainerDialog } from "./move-container-dialog";

type Item = ArchiveFile | PhysicalReference;
type Clipboard = { mode: "copy" | "cut"; items: Item[] };

const isFile = (item: Item): item is ArchiveFile => item.type === "file";
const itemType = (item: Item): PhysRefType | "file" => (isFile(item) ? "file" : item.type);

/** Penataan arsip bergaya file explorer. */
export function ArrangementTab() {
  const { canEdit } = usePermissions();
  const { files } = useArchiveFiles();
  const { items: refs } = usePhysRefs();
  const { items: classifications } = useClassifications();
  const actions = useFileControlActions();
  const [, setDetailId] = useSearchParam("archive");

  const [pathIds, setPathIds] = useState<string[]>([]);
  const [forwardIds, setForwardIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragged, setDragged] = useState<Set<string> | null>(null);
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [menuTarget, setMenuTarget] = useState<Item | null>(null);
  const [search, setSearch] = useState("");
  const [containerPage, setContainerPage] = useState(1);
  const [containerSize, setContainerSize] = useState<PageSize>(10);
  const [filePage, setFilePage] = useState(1);
  const [fileSize, setFileSize] = useState<PageSize>(10);

  const [form, setForm] = useState<PhysRefFormTarget | null>(null);
  const [deleting, setDeleting] = useState<Item[] | null>(null);
  const [moving, setMoving] = useState<PhysicalReference | null>(null);
  const [bulkTarget, setBulkTarget] = useState<MoveTarget | null>(null);
  const [info, setInfo] = useState<PhysicalReference | null>(null);
  const [printContainer, setPrintContainer] = useState<PhysicalReference | null>(null);
  const [labelContainer, setLabelContainer] = useState<PhysicalReference | null>(null);
  const [labelFile, setLabelFile] = useState<ArchiveFile | null>(null);

  // Path disimpan sebagai ID agar perubahan nama wadah langsung tercermin
  const path = pathIds.map((id) => refs.find((r) => r.id === id)).filter((r): r is PhysicalReference => !!r);
  const current = path.at(-1) ?? null;
  const currentId = current?.id ?? "";
  const currentType = current?.type ?? "root";
  const typeToCreate = childTypeOf(currentType);

  const q = search.trim().toLowerCase();
  const containers = refs
    .filter((r) => (current ? r.parentId === current.id : r.type === "location"))
    .filter((r) => !q || (r.name ?? "").toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q))
    .sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));
  const folderFiles = files
    .filter((r) => {
      if (r.archivalStatus !== "physical" && r.archivalStatus !== "digital") return false;
      const status = String(r.status || "").toLowerCase();
      if (r.archivalStatus === "physical" && (status === "destroyed" || status === "static")) return false;
      const parent = deepestContainerId(r);
      return current ? parent === current.id : !parent;
    })
    .filter((f) => !q || archiveTitle(f).toLowerCase().includes(q) || (f.archiveRegId ?? "").toLowerCase().includes(q))
    .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const allItems: Item[] = [...containers, ...folderFiles];
  const selectedItems = () => allItems.filter((i) => selected.has(i.id));

  const resetView = () => {
    setSelected(new Set());
    setContainerPage(1);
    setFilePage(1);
  };
  const navigate = (ids: string[], keepForward = false) => {
    setPathIds(ids);
    if (!keepForward) setForwardIds([]);
    resetView();
  };
  const goBack = () => {
    if (pathIds.length === 0) return;
    setForwardIds([pathIds[pathIds.length - 1], ...forwardIds]);
    navigate(pathIds.slice(0, -1), true);
  };
  const goForward = () => {
    if (forwardIds.length === 0) return;
    setForwardIds(forwardIds.slice(1));
    navigate([...pathIds, forwardIds[0]], true);
  };
  const openContainer = (item: PhysicalReference) => navigate([...pathIds, item.id]);

  const hierarchyError = (message: string) => toast.error(message, { description: "Aksi tidak valid" });

  const moveTo = (items: Item[], target: PhysicalReference | null) => {
    const targetType = target?.type ?? "root";
    const invalid = items.find((i) => !isValidHierarchy(itemType(i), targetType));
    if (invalid) {
      hierarchyError(
        `Gagal memindahkan "${PHYS_SHORT_LABEL[itemType(invalid)]}" ke dalam "${PHYS_SHORT_LABEL[targetType]}". Hierarki tidak valid.`,
      );
      return;
    }
    actions.moveItems(items, target, "arrangement");
  };

  const paste = () => {
    if (!clipboard || clipboard.items.length === 0 || !canEdit) return;
    const invalid = clipboard.items.find((i) => !isValidHierarchy(itemType(i), currentType));
    if (invalid) {
      hierarchyError(`Gagal Paste. "${PHYS_SHORT_LABEL[itemType(invalid)]}" tidak sesuai hierarki di sini.`);
      return;
    }
    if (clipboard.mode === "copy") {
      actions.pasteCopies(
        clipboard.items.filter((i): i is PhysicalReference => !isFile(i)),
        currentId,
      );
    } else {
      actions.moveItems(clipboard.items, current, "arrangement");
    }
    setClipboard(null);
  };

  const requestDelete = (items: Item[]) => {
    if (items.length === 0) return;
    if (items.some((i) => !isFile(i) && containerHasFiles(i.id, refs, files))) {
      hierarchyError(
        "Aksi Ditolak: Wadah ini (atau sub-wadahnya) masih berisi arsip. Pindahkan atau hapus arsip di dalamnya terlebih dahulu.",
      );
      return;
    }
    setDeleting(items);
  };

  const createNew = () => {
    if (typeToCreate && canEdit) setForm({ mode: "new", type: typeToCreate, parentId: currentId, lockParent: true });
  };

  // ---- Mouse & drag-drop ----
  const handleClick = (e: MouseEvent, item: Item) => {
    e.stopPropagation();
    const multi = e.ctrlKey || e.metaKey;
    setSelected((prev) => {
      const next = new Set(multi ? prev : []);
      if (multi && prev.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };
  const handleDragStart = (e: DragEvent, item: Item) => {
    const ids = selected.has(item.id) ? selected : new Set([item.id]);
    if (!selected.has(item.id)) setSelected(ids);
    setDragged(ids);
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDrop = (e: DragEvent, target: PhysicalReference | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragged || !canEdit) return;
    const items = allItems.filter((i) => dragged.has(i.id) && i.id !== target?.id);
    setDragged(null);
    if (items.length > 0) moveTo(items, target);
  };
  const dropProps = (target: PhysicalReference | null) =>
    canEdit
      ? {
          onDragOver: (e: DragEvent) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          },
          onDrop: (e: DragEvent) => handleDrop(e, target),
        }
      : {};

  /** Klik kanan: tentukan target dari elemen terdekat ber-data-item-id (kosong = latar). */
  const handleContextMenu = (e: MouseEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    const item = id ? (allItems.find((i) => i.id === id) ?? null) : null;
    setMenuTarget(item);
    if (item && !selected.has(item.id)) setSelected(new Set([item.id]));
    if (!item) setSelected(new Set());
  };

  // ---- Pintasan keyboard ----
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const tag = (document.activeElement as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || document.querySelector("[role=dialog]")) return;
    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const items = selectedItems();
    if (ctrl && key === "c" && items.length > 0) {
      e.preventDefault();
      setClipboard({ mode: "copy", items });
    } else if (ctrl && key === "x" && items.length > 0 && canEdit) {
      e.preventDefault();
      setClipboard({ mode: "cut", items });
    } else if (ctrl && key === "v" && clipboard) {
      e.preventDefault();
      paste();
    } else if (ctrl && key === "a") {
      e.preventDefault();
      setSelected(new Set(allItems.map((i) => i.id)));
    } else if (ctrl && key === "n" && typeToCreate && canEdit) {
      e.preventDefault();
      createNew();
    } else if (e.key === "Delete" && items.length > 0 && canEdit) {
      e.preventDefault();
      requestDelete(items);
    }
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const crumbClass = (active: boolean) =>
    cn(
      "flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm font-bold transition-colors",
      active ? "bg-module-soft text-module" : "bg-muted text-muted-foreground hover:bg-muted/70",
    );

  const target = menuTarget;
  const targetIsContainer = !!target && !isFile(target);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="min-w-0">
          <h3 className="mb-2 text-xl font-extrabold">Penataan Arsip</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border bg-card p-0.5">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Kembali"
                disabled={pathIds.length === 0}
                onClick={goBack}
              >
                <ArrowLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Maju"
                disabled={forwardIds.length === 0}
                onClick={goForward}
              >
                <ArrowRight />
              </Button>
            </div>
            <button
              type="button"
              className={crumbClass(path.length === 0)}
              onClick={() => navigate([])}
              {...dropProps(null)}
            >
              <Home className="size-3.5" /> Root
            </button>
            {path.map((item, idx) => {
              const Icon = CONTAINER_STYLE[item.type].icon;
              return (
                <div key={item.id} className="flex items-center gap-2">
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                  <button
                    type="button"
                    className={crumbClass(idx === path.length - 1)}
                    onClick={() => navigate(pathIds.slice(0, idx + 1))}
                    {...dropProps(item)}
                  >
                    <Icon className="size-3.5" /> {item.code || item.name}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {clipboard && (
            <Badge variant="outline" className="h-8 gap-2 border-warning/40 bg-warning/15 px-3">
              <Scissors /> {clipboard.mode === "cut" ? "Memindahkan" : "Menyalin"}: {clipboard.items.length} item
              <button type="button" aria-label="Batalkan" onClick={() => setClipboard(null)}>
                <X className="size-3.5" />
              </button>
            </Badge>
          )}
          {canEdit && typeToCreate && (
            <Button size="sm" onClick={createNew}>
              <PlusSquare /> {PHYS_TYPE_LABEL[typeToCreate]} Baru
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setBulkTarget(current ?? "root")}>
              <ArrowDownToLine /> Pindahkan ke Sini
            </Button>
          )}
        </div>
      </div>

      <SearchInput
        className="md:w-full"
        placeholder="Cari wadah atau arsip di lokasi ini..."
        value={search}
        onChange={(v) => {
          setSearch(v);
          resetView();
        }}
      />

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="min-h-[50svh] rounded-2xl outline-none"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelected(new Set());
            }}
            onContextMenu={handleContextMenu}
            {...dropProps(current)}
          >
            {allItems.length === 0 && (
              <Empty className="border-2 border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FolderOpen />
                  </EmptyMedia>
                  <EmptyTitle>Folder ini kosong atau tidak ada hasil pencarian.</EmptyTitle>
                  <EmptyDescription>
                    {typeToCreate
                      ? `Klik kanan atau tombol di atas untuk membuat ${PHYS_TYPE_LABEL[typeToCreate]} baru.`
                      : "Gunakan menu 'Proses Arsip' untuk menambahkan file."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}

            {containers.length > 0 && (
              <section className="mb-8">
                <h4 className="mb-3 flex items-center gap-2 px-1 text-xs font-bold text-muted-foreground uppercase">
                  <BoxSelect className="size-4" /> Wadah / Folder ({containers.length})
                </h4>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {paginate(containers, containerPage, containerSize).map((item) => {
                    const style = CONTAINER_STYLE[item.type];
                    const Icon = style.icon;
                    return (
                      <div
                        key={item.id}
                        data-item-id={item.id}
                        draggable={canEdit}
                        onDragStart={(e) => handleDragStart(e, item)}
                        onDragEnd={() => setDragged(null)}
                        onClick={(e) => handleClick(e, item)}
                        onDoubleClick={() => openContainer(item)}
                        {...dropProps(item)}
                        className={cn(
                          "relative flex h-40 cursor-default flex-col justify-between overflow-hidden rounded-2xl border select-none transition-all",
                          style.tone,
                          selected.has(item.id) ? "z-10 scale-[1.02] shadow-md ring-2 ring-module" : "hover:shadow-sm",
                          dragged?.has(item.id) && "opacity-40",
                        )}
                      >
                        <div className="flex-1 p-4 pb-0">
                          <div className="mb-1 flex items-start justify-between">
                            <span className="rounded bg-card/70 px-1.5 py-0.5 font-mono text-[9px] font-bold text-foreground">
                              {item.code || "---"}
                            </span>
                            <Icon className="size-5 opacity-50" />
                          </div>
                          <h4 className="line-clamp-2 text-sm leading-snug font-bold text-foreground">{item.name}</h4>
                          <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground">
                            {item.description || "Tidak ada deskripsi"}
                          </p>
                        </div>
                        <div className="flex items-center justify-between bg-card/50 px-4 py-2 backdrop-blur-sm">
                          <span className="text-[9px] font-black tracking-widest">{style.label}</span>
                          <div className="flex gap-1">
                            {(item.type === "box" || item.type === "folder") && (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Info"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInfo(item);
                                }}
                              >
                                <Info />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Cetak"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLabelContainer(item);
                              }}
                            >
                              <Printer />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <PaginationControl
                  totalItems={containers.length}
                  page={containerPage}
                  pageSize={containerSize}
                  onPageChange={setContainerPage}
                  onPageSizeChange={setContainerSize}
                  sizes={[10, 25, 50]}
                />
              </section>
            )}

            {folderFiles.length > 0 && (
              <section>
                <h4 className="mb-3 flex items-center gap-2 border-b px-1 pb-2 text-xs font-bold text-muted-foreground uppercase">
                  <FileText className="size-4" /> Daftar Arsip ({folderFiles.length})
                </h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {paginate(folderFiles, filePage, fileSize).map((file) => {
                    const cls = classifications.find((c) => c.id === file.classificationId);
                    return (
                      <div
                        key={file.id}
                        data-item-id={file.id}
                        draggable={canEdit}
                        onDragStart={(e) => handleDragStart(e, file)}
                        onDragEnd={() => setDragged(null)}
                        onClick={(e) => handleClick(e, file)}
                        className={cn(
                          "group relative flex h-44 cursor-default flex-col justify-between overflow-hidden rounded-xl border border-l-4 border-l-module bg-card select-none transition-all",
                          selected.has(file.id) ? "z-10 scale-[1.02] shadow-md ring-2 ring-module" : "hover:shadow-sm",
                          dragged?.has(file.id) && "opacity-40",
                        )}
                      >
                        <GripVertical className="absolute top-2 left-1 size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                        <div className="flex-1 p-4">
                          <div className="mb-2 flex items-start justify-between pl-2">
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] font-bold">
                              {cls ? classificationCode(cls) : file.archiveRegId || "NO-CODE"}
                            </span>
                            {file.isVital && (
                              <Badge
                                variant="outline"
                                className="h-4 border-destructive/30 bg-destructive/10 px-1 text-[8px] text-destructive"
                              >
                                VITAL
                              </Badge>
                            )}
                          </div>
                          <h4 className="line-clamp-2 pl-2 text-sm leading-snug font-bold">{archiveTitle(file)}</h4>
                          <p className="mt-1 pl-2 font-mono text-[10px] text-muted-foreground">{file.archiveRegId}</p>
                        </div>
                        <div className="flex items-center justify-between border-t bg-muted/40 px-3 py-2">
                          <span className="text-[9px] font-black tracking-widest text-muted-foreground">ARCHIVE</span>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Detail"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailId(file.id, { replace: false });
                              }}
                            >
                              <Info />
                            </Button>
                            {(file.digitalLink || file.uploadId || file.url) && (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Preview"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (file.digitalLink) window.open(file.digitalLink, "_blank", "noopener");
                                  else void openAttachment(file);
                                }}
                              >
                                <Eye />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Cetak"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLabelFile(file);
                              }}
                            >
                              <Printer />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <PaginationControl
                  totalItems={folderFiles.length}
                  page={filePage}
                  pageSize={fileSize}
                  onPageChange={setFilePage}
                  onPageSizeChange={setFileSize}
                  sizes={[10, 25, 50]}
                />
              </section>
            )}
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-60">
          {!target ? (
            <>
              <ContextMenuItem disabled={!typeToCreate || !canEdit} onSelect={createNew}>
                <PlusSquare /> Buat Baru <ContextMenuShortcut>Ctrl+N</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem disabled={!clipboard || !canEdit} onSelect={paste}>
                <CheckSquare /> Tempel <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
              </ContextMenuItem>
            </>
          ) : (
            <>
              <ContextMenuLabel className="truncate font-mono text-[10px] text-muted-foreground">
                {(isFile(target) ? target.archiveRegId : target.code) || "ITEM"}
              </ContextMenuLabel>
              <ContextMenuSeparator />
              {targetIsContainer && (
                <ContextMenuItem onSelect={() => openContainer(target)}>
                  <FolderOpen /> Buka
                </ContextMenuItem>
              )}
              {targetIsContainer && canEdit && (
                <ContextMenuItem onSelect={() => setBulkTarget(target)}>
                  <ArrowDownToLine /> Pindahkan ke Sini...
                </ContextMenuItem>
              )}
              {targetIsContainer && (
                <ContextMenuItem onSelect={() => setClipboard({ mode: "copy", items: selectedItems() })}>
                  <Copy /> Salin <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                </ContextMenuItem>
              )}
              {canEdit && (
                <ContextMenuItem onSelect={() => setClipboard({ mode: "cut", items: selectedItems() })}>
                  <Scissors /> Potong <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
                </ContextMenuItem>
              )}
              {targetIsContainer && canEdit && (
                <ContextMenuItem onSelect={() => setMoving(target)}>
                  <ArrowRightCircle /> Pindahkan ke...
                </ContextMenuItem>
              )}
              <ContextMenuSeparator />
              {targetIsContainer ? (
                <>
                  {canEdit && (
                    <ContextMenuItem onSelect={() => setForm({ mode: "edit", item: target, lockParent: true })}>
                      <PencilLine /> Ubah Data
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem onSelect={() => setLabelContainer(target)}>
                    <Printer /> Cetak Label
                  </ContextMenuItem>
                </>
              ) : (
                <ContextMenuItem onSelect={() => setLabelFile(target as ArchiveFile)}>
                  <Printer /> Cetak QR Arsip
                </ContextMenuItem>
              )}
              {canEdit && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" onSelect={() => requestDelete(selectedItems())}>
                    <X /> Hapus <ContextMenuShortcut>Del</ContextMenuShortcut>
                  </ContextMenuItem>
                </>
              )}
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <PhysRefFormDialog
        target={form}
        onClose={() => setForm(null)}
        onSave={(data) => {
          actions.saveContainer(data);
          setForm(null);
        }}
      />
      <MoveContainerDialog
        item={moving}
        onClose={() => setMoving(null)}
        onMove={(item, dest) => {
          moveTo([item], dest);
          setMoving(null);
        }}
      />
      <BulkMoveDialog
        target={bulkTarget}
        onClose={() => setBulkTarget(null)}
        onExecute={(items) => {
          const dest = bulkTarget === "root" ? null : bulkTarget;
          actions.moveItems(items, dest, "arrangement");
          toast.success(`Berhasil memindahkan ${items.length} item.`);
          setBulkTarget(null);
        }}
      />
      <ContainerInfoDialog
        container={info}
        onClose={() => setInfo(null)}
        onOpenFile={(file) => setDetailId(file.id, { replace: false })}
        onPrint={setPrintContainer}
      />
      <ContainerPrintDialog container={printContainer} onClose={() => setPrintContainer(null)} />
      <ContainerLabelDialog container={labelContainer} onClose={() => setLabelContainer(null)} />
      <ArchiveLabelDialog file={labelFile} onClose={() => setLabelFile(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus"
        description={`Hapus ${deleting?.length ?? 0} item? Wadah dihapus beserta sub-wadahnya; arsip hanya dilepas dari lokasinya.`}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting) {
            const containerIds = deleting.filter((i) => !isFile(i)).map((i) => i.id);
            const fileItems = deleting.filter(isFile);
            if (containerIds.length > 0) actions.deleteContainers(containerIds);
            if (fileItems.length > 0) actions.clearFileLocations(fileItems);
            setSelected(new Set());
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}
