import { Eye, Info, Printer, Scan, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { usePhysRefs } from "@/data/collections";
import { hasArchiveDocument, openArchiveDocument } from "../../lib/archive-document";
import { useSearchParam } from "@/hooks/use-search-param";
import { cn } from "@/lib/utils";
import type { PhysicalReference } from "@/types/entities";
import { type ArchiveFile, isManagedArchive } from "../../lib/archive";
import { useArchiveFiles } from "../../use-file-control";
import { CONTAINER_STYLE, ContainerIcon } from "../archive-ui";
import { CameraScanDialog } from "../camera-scanner";
import { ContainerInfoDialog } from "../container-info-dialog";
import { ArchiveLabelDialog, ContainerLabelDialog } from "../label-dialogs";
import { ContainerPrintDialog } from "../print-documents";

const RESULT_LABEL = {
  location: "LOKASI FISIK",
  rack: "RAK ARSIP",
  box: "BOKS ARSIP",
  folder: "MAP / FOLDER",
  file: "ARSIP DOKUMEN",
} as const;

type Result = ArchiveFile | PhysicalReference;

/** Pencarian global arsip & wadah + Smart Scan (scanner USB / kamera). */
export function GlobalSearchPanel() {
  const { files } = useArchiveFiles();
  const { items: refs } = usePhysRefs();
  const [, setDetailId] = useSearchParam("archive");
  const [query, setQuery] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [container, setContainer] = useState<PhysicalReference | null>(null);
  const [printContainer, setPrintContainer] = useState<PhysicalReference | null>(null);
  const [labelFile, setLabelFile] = useState<ArchiveFile | null>(null);
  const [labelContainer, setLabelContainer] = useState<PhysicalReference | null>(null);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matchedFiles = files.filter(
      (r) =>
        isManagedArchive(r) &&
        ((r.title ?? "").toLowerCase().includes(q) ||
          (r.number ?? "").toLowerCase().includes(q) ||
          (r.archiveRegId ?? "").toLowerCase().includes(q)),
    );
    const matchedRefs = refs.filter(
      (r) => (r.name ?? "").toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q),
    );
    const label = (r: Result) => ("title" in r && r.title) || ("name" in r && r.name) || "";
    return [...matchedRefs, ...matchedFiles].sort((a, b) => label(a).localeCompare(label(b)));
  }, [query, files, refs]);

  const openFile = (file: ArchiveFile) => setDetailId(file.id, { replace: false });

  /** Kecocokan persis ID/kode → langsung buka detail arsip atau isi wadah. */
  const processScan = (code: string, fromCamera: boolean) => {
    const q = code.trim().toLowerCase();
    if (!q) return;
    const file = files.find(
      (r) => isManagedArchive(r) && (r.id.toLowerCase() === q || (r.archiveRegId ?? "").toLowerCase() === q),
    );
    if (file) {
      openFile(file);
      setQuery("");
      return;
    }
    const ref = refs.find((r) => r.id.toLowerCase() === q || (r.code ?? "").toLowerCase() === q);
    if (ref) {
      setContainer(ref);
      setQuery("");
      return;
    }
    if (fromCamera) toast.error(`Pencarian Gagal: ID/Barcode "${code}" tidak terdaftar di sistem.`);
  };

  return (
    <div className="space-y-6">
      <InputGroup className="h-14 rounded-2xl border-2 bg-card shadow-lg shadow-module/10 has-[[data-slot=input-group-control]:focus-visible]:border-module">
        <InputGroupAddon>
          <span className="flex size-10 items-center justify-center rounded-xl bg-module-soft text-module">
            <Search className="size-5" />
          </span>
        </InputGroupAddon>
        <InputGroupInput
          autoFocus
          className="text-base"
          placeholder="Scan Barcode / Ketik ID Arsip / Nama Wadah lalu tekan Enter..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              processScan(query, false);
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            variant="default"
            size="sm"
            className="h-10 rounded-xl px-4"
            onClick={() => setCameraOpen(true)}
          >
            <Scan /> <span className="hidden md:inline">Camera Scan</span>
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      {query && results.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {results.map((res) => {
            const type = res.type === "file" ? "file" : (res as PhysicalReference).type;
            const isFile = type === "file";
            const file = isFile ? (res as ArchiveFile) : null;
            const ref = isFile ? null : (res as PhysicalReference);
            return (
              <div
                key={`${type}-${res.id}`}
                role="button"
                tabIndex={0}
                onClick={() => (file ? openFile(file) : setContainer(ref))}
                onKeyDown={(e) => e.key === "Enter" && (file ? openFile(file) : setContainer(ref))}
                className="group relative cursor-pointer overflow-hidden rounded-3xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-module/40 hover:shadow-xl"
              >
                <div className="flex items-start gap-4">
                  <ContainerIcon type={type} className="size-14 rounded-2xl" />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "mb-1 text-[10px] font-black tracking-widest",
                        CONTAINER_STYLE[type].tone,
                        "bg-transparent",
                      )}
                    >
                      {RESULT_LABEL[type]}
                    </p>
                    <h4 className="mb-2 line-clamp-2 leading-tight font-bold group-hover:text-module">
                      {file ? file.title : ref?.name}
                    </h4>
                    <span className="rounded-md bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      {file?.archiveRegId || ref?.code || file?.number || "NO-ID"}
                    </span>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  {file && hasArchiveDocument(file) && (
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      aria-label="Lihat Dokumen"
                      onClick={(e) => {
                        e.stopPropagation();
                        void openArchiveDocument(file);
                      }}
                    >
                      <Eye />
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    aria-label="Cetak QR Code"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (file) setLabelFile(file);
                      else setLabelContainer(ref);
                    }}
                  >
                    <Printer />
                  </Button>
                  <Button variant="secondary" size="icon-sm" aria-label="Buka Detail">
                    <Info />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {query && results.length === 0 && (
        <Empty className="border-2 border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Scan />
            </EmptyMedia>
            <EmptyTitle>Tidak ada kecocokan di database.</EmptyTitle>
            <EmptyDescription>Pastikan barcode atau ID benar.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <CameraScanDialog
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScan={(text) => processScan(text, true)}
      />
      <ContainerInfoDialog
        container={container}
        onClose={() => setContainer(null)}
        onOpenFile={openFile}
        onPrint={setPrintContainer}
      />
      <ContainerPrintDialog container={printContainer} onClose={() => setPrintContainer(null)} />
      <ArchiveLabelDialog file={labelFile} onClose={() => setLabelFile(null)} />
      <ContainerLabelDialog container={labelContainer} onClose={() => setLabelContainer(null)} />
    </div>
  );
}
