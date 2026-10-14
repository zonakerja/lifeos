import { Eye, FileText, Folder, Info, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePhysRefs } from "@/data/collections";
import { hasArchiveDocument, openArchiveDocument } from "../lib/archive-document";
import { useRetained } from "@/hooks/use-retained";
import type { PhysicalReference } from "@/types/entities";
import { type ArchiveFile, archiveTitle, isPhysicalArchive } from "../lib/archive";
import { useArchiveFiles } from "../use-file-control";
import { CONTAINER_STYLE, ContainerIcon } from "./archive-ui";

function FileRow({ file, index, onOpen }: { file: ArchiveFile; index?: number; onOpen: (file: ArchiveFile) => void }) {
  return (
    <div className="group flex items-center justify-between gap-2 border-b px-3 py-2 text-xs last:border-0 hover:bg-muted/50">
      <div className="flex min-w-0 items-center gap-2">
        {index !== undefined ? (
          <span className="w-6 font-mono font-bold text-muted-foreground">{index + 1}.</span>
        ) : (
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="shrink-0 font-mono text-muted-foreground">{file.archiveRegId}</span>
        <span className="line-clamp-1 font-medium">{archiveTitle(file)}</span>
      </div>
      <div className="flex shrink-0 gap-1 transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
        {hasArchiveDocument(file) && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Lihat Dokumen"
            onClick={() => void openArchiveDocument(file)}
          >
            <Eye />
          </Button>
        )}
        <Button variant="ghost" size="icon-xs" aria-label="Info Detail" onClick={() => onOpen(file)}>
          <Info />
        </Button>
      </div>
    </div>
  );
}

const EmptyLine = ({ text }: { text: string }) => <p className="p-3 text-xs text-muted-foreground italic">{text}</p>;

/**
 * Info isi wadah: box/folder menampilkan daftar folder & arsip (+ cetak A4),
 * lokasi/rak menampilkan pohon rak → box → map → arsip.
 */
export function ContainerInfoDialog({
  container: containerProp,
  onClose,
  onOpenFile,
  onPrint,
}: {
  container: PhysicalReference | null;
  onClose: () => void;
  onOpenFile: (file: ArchiveFile) => void;
  onPrint: (container: PhysicalReference) => void;
}) {
  const container = useRetained(containerProp);
  const { items: refs } = usePhysRefs();
  const files = useArchiveFiles().files.filter(isPhysicalArchive);
  if (!container) return null;

  const children = (id: string) => refs.filter((r) => r.parentId === id);
  const inFolder = (id: string) => files.filter((f) => f.physFolderId === id);
  const looseInBox = (id: string) => files.filter((f) => f.physBoxId === id && !f.physFolderId);
  const open = (file: ArchiveFile) => {
    onClose();
    onOpenFile(file);
  };
  const isTree = container.type === "location" || container.type === "rack";
  const totalFiles = files.filter((f) => f.physFolderId === container.id || f.physBoxId === container.id).length;

  const boxTree = (box: PhysicalReference) => (
    <div key={box.id} className="space-y-2 rounded-xl border bg-card p-3">
      <p className="flex items-center gap-2 text-sm font-bold text-warning-foreground dark:text-warning">
        <CONTAINER_STYLE.box.icon className="size-4" /> Box: {box.name}
      </p>
      <div className="ml-3 space-y-2 border-l-2 pl-3">
        {children(box.id).map((folder) => (
          <div key={folder.id}>
            <p className="mb-1 flex items-center gap-2 text-xs font-bold text-info">
              <Folder className="size-3.5" /> Map: {folder.name}
            </p>
            <div className="ml-3 overflow-hidden rounded-lg border">
              {inFolder(folder.id).map((f) => (
                <FileRow key={f.id} file={f} onOpen={open} />
              ))}
              {inFolder(folder.id).length === 0 && <EmptyLine text="Folder kosong." />}
            </div>
          </div>
        ))}
        {looseInBox(box.id).length > 0 && (
          <div className="overflow-hidden rounded-lg border">
            {looseInBox(box.id).map((f) => (
              <FileRow key={f.id} file={f} onOpen={open} />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={!!containerProp} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="flex-row items-center gap-3 border-b p-6">
          <ContainerIcon type={container.type} className="size-12" />
          <div>
            <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              {CONTAINER_STYLE[container.type].label}
            </p>
            <DialogTitle className="text-xl">{container.name}</DialogTitle>
            <DialogDescription className="font-mono">{container.code}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto bg-muted/40 p-6">
          {isTree ? (
            <>
              <p className="border-b pb-2 text-sm font-bold">Rincian Isi Penyimpanan:</p>
              {container.type === "location"
                ? children(container.id).map((rack) => (
                    <div key={rack.id} className="space-y-3 rounded-2xl border bg-card/60 p-4">
                      <p className="flex w-max items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm font-bold text-primary">
                        <CONTAINER_STYLE.rack.icon className="size-4" /> Rak: {rack.name}
                        <span className="rounded bg-primary/15 px-2 py-0.5 font-mono text-xs">{rack.code}</span>
                      </p>
                      <div className="ml-3 space-y-3">{children(rack.id).map(boxTree)}</div>
                    </div>
                  ))
                : children(container.id).map(boxTree)}
              {children(container.id).length === 0 && <EmptyLine text="Belum ada isi." />}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-4">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Total Folder</p>
                  <p className="text-xl font-bold">{children(container.id).length}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Total Arsip</p>
                  <p className="text-xl font-bold">{totalFiles}</p>
                </div>
              </div>
              {container.type === "box" ? (
                <>
                  {children(container.id).map((folder) => (
                    <div key={folder.id}>
                      <p className="mb-2 flex items-center gap-2 text-sm font-bold">
                        <Folder className="size-4 text-info" /> {folder.name}
                        <span className="font-mono text-xs text-muted-foreground">{folder.code}</span>
                      </p>
                      <div className="overflow-hidden rounded-xl border bg-card">
                        {inFolder(folder.id).map((f) => (
                          <FileRow key={f.id} file={f} onOpen={open} />
                        ))}
                        {inFolder(folder.id).length === 0 && <EmptyLine text="Folder kosong." />}
                      </div>
                    </div>
                  ))}
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-sm font-bold">
                      <FileText className="size-4 text-warning-foreground dark:text-warning" /> Arsip Lepas (Tanpa
                      Folder)
                    </p>
                    <div className="overflow-hidden rounded-xl border bg-card">
                      {looseInBox(container.id).map((f) => (
                        <FileRow key={f.id} file={f} onOpen={open} />
                      ))}
                      {looseInBox(container.id).length === 0 && <EmptyLine text="Tidak ada arsip lepas." />}
                    </div>
                  </div>
                </>
              ) : (
                <div className="overflow-hidden rounded-xl border bg-card">
                  {inFolder(container.id).map((f, i) => (
                    <FileRow key={f.id} file={f} index={i} onOpen={open} />
                  ))}
                  {inFolder(container.id).length === 0 && <EmptyLine text="Folder ini kosong." />}
                </div>
              )}
            </>
          )}
        </div>

        {!isTree && (
          <DialogFooter className="border-t p-4">
            <Button onClick={() => onPrint(container)}>
              <Printer /> Cetak Data (A4)
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
