import { ChevronDown, Plus, Printer, Trash2, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { type PageSize, PaginationControl, paginate } from "@/components/common/pagination-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useDispositionLogs } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import { formatNumericDate } from "@/lib/dates";
import type { ArchiveDispositionLog, DispositionType } from "@/types/entities";
import { useArchiveFiles, useFileControlActions } from "../../use-file-control";
import { DispositionFormDialog } from "../disposition-form-dialog";
import { BapPrintDialog } from "../print-documents";

/** Histori berita acara penyusutan + pembuatan BAP manual. */
export function DispositionHistoryPanel() {
  const { items: logs } = useDispositionLogs();
  const { files } = useArchiveFiles();
  const { canEdit } = usePermissions();
  const actions = useFileControlActions();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [manualType, setManualType] = useState<DispositionType | null>(null);
  const [printing, setPrinting] = useState<ArchiveDispositionLog | null>(null);

  const sorted = [...logs].sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Berita Acara Penyusutan</h3>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus /> Buat BAP <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem variant="destructive" onClick={() => setManualType("destroy")}>
                <Trash2 /> Pemusnahan Arsip
              </DropdownMenuItem>
              <DropdownMenuItem className="text-info focus:text-info" onClick={() => setManualType("transfer")}>
                <Truck className="text-info" /> Penyerahan (Statis)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {sorted.length === 0 ? (
        <Empty className="border-2 border-dashed">
          <EmptyHeader>
            <EmptyTitle>Belum ada riwayat penyusutan/pemusnahan.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {paginate(sorted, page, pageSize).map((log) => (
              <div key={log.id} className="rounded-2xl border bg-card p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{log.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumericDate(new Date(log.executedAt))}
                      {log.user && ` • Oleh: ${log.user}`}
                      {log.id.startsWith("BAP-AUTO-") && " (otomatis)"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      log.type === "destroy"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-info/30 bg-info/10 text-info"
                    }
                  >
                    {log.statusLabel}
                  </Badge>
                </div>
                <p className="mb-4 text-xs text-muted-foreground">
                  {log.items.length} arsip telah diproses berdasarkan{" "}
                  {log.formData?.dasarHukum || log.formData?.legalNumber || "keputusan pengelola"}.
                </p>
                <Button variant="secondary" size="sm" className="w-full" onClick={() => setPrinting(log)}>
                  <Printer /> Cetak Berita Acara
                </Button>
              </div>
            ))}
          </div>
          <PaginationControl
            totalItems={sorted.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            sizes={[5, 10, 25]}
          />
        </>
      )}

      <DispositionFormDialog
        type={manualType}
        manualCandidates={files}
        onClose={() => setManualType(null)}
        onConfirm={(formData, selected) => {
          if (!manualType) return;
          actions.executeManualDisposition(manualType, selected, formData);
          toast.success(
            `Berhasil memproses ${selected.length} arsip untuk ${manualType === "destroy" ? "Pemusnahan" : "Penyerahan"}.`,
          );
          setManualType(null);
        }}
      />
      <BapPrintDialog doc={printing} onClose={() => setPrinting(null)} />
    </div>
  );
}
