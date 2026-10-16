import { useQueryClient } from "@tanstack/react-query";
import {
  FileSpreadsheet,
  FileText,
  FileType2,
  History,
  Presentation,
  Save,
  TriangleAlert,
  Workflow,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/lib/api/client";
import { officeApi } from "@/lib/api/endpoints";
import type { OfficeAccess, OfficeConfigResult } from "@/types/api";
import { officeKindOf, type OfficeKind } from "./office-formats";
import { VersionHistoryDialog } from "./version-history-dialog";
import { DocumentLinksButton } from "./document-links";

const OfficeEditor = lazy(() => import("./office-editor"));

export interface OfficeDocumentRef {
  uploadId: string;
  /** Nama tampil sementara sebelum judul dari server termuat */
  name?: string;
  /** `view` = buka baca saja */
  mode?: "edit" | "view";
  /** Setelah editor ditutup dan dokumen tersimpan (mis. meringkas isi dengan AI) */
  onClosed?: () => void;
}

interface EditorStore {
  doc: OfficeDocumentRef | null;
  /** Sedang menyimpan sebelum modal ditutup */
  closing: boolean;
  /** Didaftarkan editor yang terbuka: simpan dokumen sebelum modal ditutup */
  beforeClose: (() => Promise<void>) | null;
  open: (doc: OfficeDocumentRef) => void;
  requestClose: () => Promise<void>;
}

const useOfficeEditorStore = create<EditorStore>((set, get) => ({
  doc: null,
  closing: false,
  beforeClose: null,
  open: (doc) => set({ doc, closing: false }),
  requestClose: async () => {
    const { doc, closing, beforeClose } = get();
    if (!doc || closing) return;
    set({ closing: true });
    try {
      await beforeClose?.();
    } finally {
      set({ doc: null, closing: false, beforeClose: null });
      doc.onClosed?.();
    }
  },
}));

/** Buka dokumen di editor ONLYOFFICE (modal layar penuh) dari mana saja. */
export const openOfficeEditor = (doc: OfficeDocumentRef) => useOfficeEditorStore.getState().open(doc);

export const OFFICE_KIND_ICON: Record<OfficeKind, typeof FileText> = {
  word: FileText,
  cell: FileSpreadsheet,
  slide: Presentation,
  pdf: FileType2,
  diagram: Workflow,
};

const ACCESS_LABEL: Record<OfficeAccess, string> = {
  edit: "Bisa mengedit",
  comment: "Komentar saja",
  view: "Hanya lihat",
};

/** Dipasang sekali di AppShell. */
export function OfficeEditorHost() {
  const doc = useOfficeEditorStore((s) => s.doc);
  const requestClose = useOfficeEditorStore((s) => s.requestClose);
  return (
    <Dialog open={!!doc} onOpenChange={(open) => !open && void requestClose()}>
      {/* Hampir layar penuh: editor dokumen butuh ruang maksimal */}
      <DialogContent
        showCloseButton={false}
        className="flex h-[98svh] max-w-[calc(100%-0.5rem)] flex-col gap-1 rounded-xl p-1 sm:max-w-[98vw]"
        // Klik di luar tidak menutup editor (mudah tersentuh tanpa sengaja saat menyunting)
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        {doc && <EditorFrame key={`${doc.uploadId}:${doc.mode ?? ""}`} doc={doc} />}
      </DialogContent>
    </Dialog>
  );
}

function EditorFrame({ doc }: { doc: OfficeDocumentRef }) {
  const client = useQueryClient();
  const closing = useOfficeEditorStore((s) => s.closing);
  const requestClose = useOfficeEditorStore((s) => s.requestClose);
  const [info, setInfo] = useState<OfficeConfigResult | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const canEdit = useRef(false);

  // Modal ditutup (X, Esc) → simpan paksa dulu (ONLYOFFICE langsung memanggil callback), tunggu sampai tersimpan
  useEffect(() => {
    const uploadId = doc.uploadId;
    useOfficeEditorStore.setState({
      beforeClose: async () => {
        if (!canEdit.current) return;
        try {
          const { status } = await officeApi.forceSave(uploadId);
          if (status === "saved") toast.success("Dokumen tersimpan");
          else if (status === "pending")
            toast.info("Dokumen sedang disimpan", { description: "Versi baru muncul dalam beberapa detik." });
        } catch (err) {
          toast.warning("Simpan saat menutup gagal", {
            description: `${errorMessage(err)} ONLYOFFICE tetap menyimpan otomatis beberapa detik setelah editor ditutup.`,
          });
        }
        void client.invalidateQueries({ queryKey: queryKeys.officeVersions(uploadId) });
        void client.invalidateQueries({ queryKey: queryKeys.uploads });
      },
    });
    return () => useOfficeEditorStore.setState({ beforeClose: null });
  }, [client, doc.uploadId]);

  const title = info?.config.document.title ?? doc.name ?? "Dokumen";
  const kind = officeKindOf(title) ?? "word";
  const Icon = OFFICE_KIND_ICON[kind];

  const onLoaded = (result: OfficeConfigResult) => {
    canEdit.current = result.access === "edit";
    setInfo(result);
  };

  return (
    <>
      <div className="flex h-8 shrink-0 items-center gap-2 pr-1 pl-2">
        <Icon className="size-4 shrink-0 text-module" />
        <DialogTitle className="min-w-0 truncate text-sm">{title}</DialogTitle>
        <DialogDescription className="sr-only">Editor dokumen ONLYOFFICE</DialogDescription>
        {info && (
          <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
            {ACCESS_LABEL[info.access]}
          </Badge>
        )}
        {info?.lossy && (
          <Badge variant="outline" className="hidden shrink-0 gap-1 text-warning md:inline-flex">
            <TriangleAlert className="size-3" /> Sebagian format bisa hilang saat disimpan
          </Badge>
        )}
        {info?.access === "edit" && (
          <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground lg:flex">
            <Save className="size-3" /> Tersimpan otomatis saat ditutup · Ctrl+S menyimpan versi
          </span>
        )}
        <span className="flex-1" />
        <DocumentLinksButton uploadId={doc.uploadId} name={title} />
        <Button variant="ghost" size="xs" disabled={closing} onClick={() => setVersionsOpen(true)}>
          <History /> <span className="hidden sm:inline">Riwayat versi</span>
        </Button>
        <Button
          variant="ghost"
          size={closing ? "xs" : "icon-xs"}
          aria-label="Tutup editor"
          disabled={closing}
          onClick={() => void requestClose()}
        >
          {closing ? (
            <>
              <Spinner /> Menyimpan…
            </>
          ) : (
            <X />
          )}
        </Button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-background">
        <Suspense
          fallback={
            <div className="flex size-full items-center justify-center">
              <Spinner className="size-6" />
            </div>
          }
        >
          <OfficeEditor key={reloadKey} uploadId={doc.uploadId} mode={doc.mode} onLoaded={onLoaded} />
        </Suspense>
        {closing && (
          // Tahan input selama menyimpan agar tidak ada ketikan yang tertinggal
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
            <span className="flex items-center gap-2 rounded-xl border bg-card px-4 py-2 text-sm shadow-sm">
              <Spinner /> Menyimpan dokumen ke LifeOS…
            </span>
          </div>
        )}
      </div>
      <VersionHistoryDialog
        uploadId={doc.uploadId}
        fileName={title}
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        onRestored={() => {
          setVersionsOpen(false);
          setReloadKey((k) => k + 1);
        }}
      />
    </>
  );
}
