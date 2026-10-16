import { Eye, FileStack } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { previewFile } from "@/components/common/file-preview";
import { PaginationControl } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { usePagination } from "@/hooks/use-pagination";
import { cn } from "@/lib/utils";
import type { OfficeFormat, OfficeTemplate } from "@/types/api";
import { OFFICE_KIND_ICON } from "./office-editor-host";
import { OFFICE_KIND_LABELS } from "./office-formats";

export const KIND_OF_TARGET: Record<OfficeFormat, keyof typeof OFFICE_KIND_ICON> = {
  docx: "word",
  xlsx: "cell",
  pptx: "slide",
  pdf: "pdf",
};

const FILTERS: { value: OfficeFormat | "all"; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "docx", label: "Dokumen" },
  { value: "xlsx", label: "Spreadsheet" },
  { value: "pptx", label: "Presentasi" },
  { value: "pdf", label: "PDF" },
];

/** Cocok bila setiap kata pencarian ada di nama templat (tanpa peka huruf besar/kecil). */
export function matchesTemplate(template: Pick<OfficeTemplate, "name">, query: string) {
  const name = template.name.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => name.includes(word));
}

/**
 * Daftar templat dengan pencarian, filter jenis, dan paginasi (templat instansi bisa puluhan). Dipakai modal "Dari
 * templat" (Buat Dokumen) dan kartu Templat dokumen di Tools → ONLYOFFICE; aksi per baris dari pemanggil.
 */
export function TemplateBrowser({
  templates,
  actions,
  onSelect,
  selectingId,
  emptyText = "Belum ada templat.",
}: {
  templates: OfficeTemplate[];
  /** Tombol di ujung baris (mis. Sunting, Hapus) */
  actions?: (template: OfficeTemplate) => ReactNode;
  /** Klik baris = pakai templat (modal Buat Dokumen) */
  onSelect?: (template: OfficeTemplate) => void;
  selectingId?: string | null;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<OfficeFormat | "all">("all");
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: templates.length };
    for (const template of templates) result[template.target] = (result[template.target] ?? 0) + 1;
    return result;
  }, [templates]);
  const filtered = useMemo(
    () =>
      templates.filter((template) => (kind === "all" || template.target === kind) && matchesTemplate(template, query)),
    [templates, kind, query],
  );
  const { pageItems, setPage, controlProps } = usePagination(filtered, 10);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          placeholder="Cari templat..."
          className="md:w-64"
        />
        <div className="flex flex-wrap gap-1">
          {FILTERS.filter((filter) => filter.value === "all" || counts[filter.value]).map((filter) => (
            <Button
              key={filter.value}
              type="button"
              size="xs"
              variant={kind === filter.value ? "default" : "outline"}
              onClick={() => {
                setKind(filter.value);
                setPage(1);
              }}
            >
              {filter.label} <span className="opacity-70">{counts[filter.value] ?? 0}</span>
            </Button>
          ))}
        </div>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">{emptyText}</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada templat yang cocok.</p>
      ) : (
        <ul className="grid gap-1.5">
          {pageItems.map((template) => {
            const target = KIND_OF_TARGET[template.target];
            const Icon = OFFICE_KIND_ICON[target];
            const busy = selectingId === template.id;
            return (
              <li
                key={template.id}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-xl border p-1.5",
                  onSelect && "cursor-pointer hover:bg-muted",
                )}
                onClick={onSelect && !selectingId ? () => onSelect(template) : undefined}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-module/12 text-module">
                  {busy ? <Spinner /> : <Icon className="size-4" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={template.originalName}>
                  {template.name}
                </span>
                <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
                  {OFFICE_KIND_LABELS[target]}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Lihat templat"
                  onClick={(event) => {
                    event.stopPropagation();
                    previewFile({ uploadId: template.id, name: template.originalName, mimeType: template.mimeType });
                  }}
                >
                  <Eye />
                </Button>
                {actions?.(template)}
              </li>
            );
          })}
        </ul>
      )}
      <PaginationControl {...controlProps} sizes={[10, 25, 50]} />
    </div>
  );
}

/** Modal "Dari templat" di pilihan Buat Dokumen: klik templat = dokumen baru berisi salinan templat itu. */
export function TemplatePickerDialog({
  open,
  onOpenChange,
  templates,
  selectingId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: OfficeTemplate[];
  selectingId: string | null;
  onSelect: (template: OfficeTemplate) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileStack className="size-4 text-module" /> Buat dari templat
          </DialogTitle>
          <DialogDescription>
            Klik templat untuk membuat dokumen baru berisi salinannya (templat tetap utuh). Templat dikelola di Tools →
            ONLYOFFICE.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto">
          <TemplateBrowser templates={templates} onSelect={onSelect} selectingId={selectingId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
