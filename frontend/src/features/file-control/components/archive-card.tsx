import {
  ArchiveRestore,
  CalendarDays,
  CheckSquare,
  Eye,
  FileText,
  HardDrive,
  History,
  Info,
  MapPin,
  PencilLine,
  Printer,
  Shield,
  Square,
  Trash2,
  Truck,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { openAttachment } from "@/features/resources/resource-utils";
import { formatNumericDate, parseLocalYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ArchiveClassification, ArchiveJra, PhysicalReference } from "@/types/entities";
import { type ArchiveFile, archiveTitle, isPermanent } from "../lib/archive";
import { StatusBadge } from "./archive-ui";

function IconAction({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className={className}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const hasAttachment = (r: ArchiveFile) => !!(r.uploadId || r.url);

/** Kartu arsip yang belum diberkaskan (tab Gantung). */
export function PendingArchiveCard({
  file,
  canEdit,
  onProcess,
}: {
  file: ArchiveFile;
  canEdit: boolean;
  onProcess: () => void;
}) {
  const date = parseLocalYMD(file.date ?? "") ?? (file.date ? new Date(file.date) : null);
  return (
    <div className="group flex h-full flex-col justify-between rounded-2xl border bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-module/40 hover:shadow-lg">
      <div>
        <div className="mb-4 flex items-start justify-between">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-info/15 text-info">
            <FileText className="size-6" />
          </span>
          <div className="flex items-center gap-2">
            {hasAttachment(file) && (
              <IconAction label="Lihat File" onClick={() => void openAttachment(file)}>
                <Eye />
              </IconAction>
            )}
            <Badge
              variant="outline"
              className="border-warning/40 bg-warning/20 text-warning-foreground dark:text-warning"
            >
              PENDING
            </Badge>
          </div>
        </div>
        {file.number && <p className="mb-1 font-mono text-[10px] text-muted-foreground">No: {file.number}</p>}
        <h4 className="mb-2 line-clamp-2 text-base leading-snug font-bold">{archiveTitle(file)}</h4>
        <p className="mb-4 line-clamp-2 text-xs text-muted-foreground">
          {file.description || file.content || "Dokumen belum terklasifikasi."}
        </p>
      </div>
      <div className="mt-auto border-t border-dashed pt-4">
        <span className="mb-3 inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
          <CalendarDays className="size-3" /> {date ? formatNumericDate(date) : "-"}
        </span>
        {canEdit && (
          <Button className="w-full" onClick={onProcess}>
            <ArchiveRestore /> Proses Pemberkasan
          </Button>
        )}
      </div>
    </div>
  );
}

interface ArchiveCardProps {
  file: ArchiveFile;
  tab: string;
  classifications: ArchiveClassification[];
  jraList: ArchiveJra[];
  physRefs: PhysicalReference[];
  canEdit: boolean;
  bulkActive: boolean;
  selected: boolean;
  onToggle: () => void;
  onDetail: () => void;
  /** Kosong = tombol Cetak Label disembunyikan (mis. arsip milik user lain) */
  onLabel?: () => void;
  onEdit: () => void;
  onDispose: (type: "destroy" | "transfer") => void;
}

/** Kartu arsip terkelola (tab Fisik, Digital, Statis, Musnah). */
export function ArchiveCard({
  file,
  tab,
  classifications,
  jraList,
  physRefs,
  canEdit,
  bulkActive,
  selected,
  onToggle,
  onDetail,
  onLabel,
  onEdit,
  onDispose,
}: ArchiveCardProps) {
  const jra = jraList.find((j) => j.id === file.jraId);
  const status = file.dynamicStatus;
  const isFinal = status === "destroyed" || status === "static";
  const permanent = isPermanent(jra);
  const refName = (id?: string) => physRefs.find((r) => r.id === id)?.name || "?";

  return (
    <div
      onClick={() => bulkActive && onToggle()}
      className={cn(
        "relative flex flex-col gap-4 rounded-2xl border bg-card p-5 transition-all md:flex-row",
        bulkActive
          ? selected
            ? "cursor-pointer border-module bg-module-soft ring-1 ring-module"
            : "cursor-pointer opacity-60 hover:opacity-100"
          : "hover:border-module/40 hover:shadow-md",
      )}
    >
      {bulkActive && (
        <span className="pointer-events-none absolute top-4 right-4 text-module">
          {selected ? <CheckSquare className="size-5" /> : <Square className="size-5 text-muted-foreground" />}
        </span>
      )}

      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-info/15 text-info">
        <FileText className="size-6" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {file.number && (
            <span className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">{file.number}</span>
          )}
          {file.classificationId && (
            <Badge variant="secondary" className="h-5 text-[10px]">
              {classifications.find((c) => c.id === file.classificationId)?.kodeItem || "CODE"}
            </Badge>
          )}
          {file.isVital && (
            <Badge
              variant="outline"
              className="h-5 border-destructive/30 bg-destructive/10 text-[10px] text-destructive"
            >
              <Shield /> VITAL
            </Badge>
          )}
        </div>
        <h4 className="truncate pr-2 text-sm font-bold">{archiveTitle(file)}</h4>
        <p className="mb-2 line-clamp-1 text-xs text-muted-foreground">
          {file.description || file.content || "Tidak ada deskripsi."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusBadge status={status} className="h-5 text-[10px]" />
          {jra ? (
            <Badge
              variant="outline"
              className={cn(
                "h-5 text-[10px]",
                permanent
                  ? "border-info/30 bg-info/10 text-info"
                  : "border-destructive/30 bg-destructive/10 text-destructive",
              )}
            >
              {jra.keterangan === "Musnah" ? "Non Permanen" : jra.keterangan}
            </Badge>
          ) : (
            <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
              Belum Diset
            </Badge>
          )}
          {!isFinal && (
            <span className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              <History className="size-3" />
              {status === "active"
                ? `Exp Aktif: ${file.retentionActiveDate || "-"}`
                : `Exp Inaktif: ${file.retentionInactiveDate || "-"}`}
            </span>
          )}
          {tab === "physical" && (
            <span className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-module">
              <MapPin className="size-3" /> {refName(file.physLocationId)}/{refName(file.physBoxId)}
            </span>
          )}
          {tab === "digital" && (
            <span className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-success">
              <HardDrive className="size-3" /> {file.digitalApp || "System"}
            </span>
          )}
        </div>
      </div>

      {!bulkActive && (
        <div className="flex shrink-0 flex-row justify-end gap-1 border-t pt-3 md:flex-col md:justify-center md:border-t-0 md:border-l md:pt-0 md:pl-3">
          <IconAction label="Lihat Detail" onClick={onDetail}>
            <Info />
          </IconAction>
          {!isFinal && onLabel && (
            <IconAction label="Cetak Label" onClick={onLabel}>
              <Printer />
            </IconAction>
          )}
          {canEdit && !isFinal && (tab === "physical" || tab === "digital") && (
            <IconAction label="Edit Data" onClick={onEdit}>
              <PencilLine />
            </IconAction>
          )}
          {hasAttachment(file) && (
            <IconAction label="Buka File" onClick={() => void openAttachment(file)}>
              <Eye />
            </IconAction>
          )}
          {canEdit && status === "expired" && !file.isVital && (
            <IconAction
              label="Tindak Lanjut"
              className={permanent ? "text-info" : "text-destructive"}
              onClick={() => onDispose(permanent ? "transfer" : "destroy")}
            >
              {permanent ? <Truck /> : <Trash2 />}
            </IconAction>
          )}
        </div>
      )}
    </div>
  );
}
