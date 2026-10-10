import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PageSize = number | "all";

interface PaginationControlProps {
  totalItems: number;
  pageSize: PageSize;
  page: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  sizes?: number[];
}

/** Paginasi standar tabel/daftar. */
export function PaginationControl({
  totalItems,
  pageSize,
  page,
  onPageChange,
  onPageSizeChange,
  sizes = [10, 25, 50, 100],
}: PaginationControlProps) {
  if (totalItems === 0) return null;
  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const start = pageSize === "all" ? 1 : (page - 1) * pageSize + 1;
  const end = pageSize === "all" ? totalItems : Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground md:flex-row">
      <span>
        Menampilkan {start}–{end} dari {totalItems} data
      </span>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span>Baris:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              onPageSizeChange(v === "all" ? "all" : Number(v));
              onPageChange(1);
            }}
          >
            <SelectTrigger size="sm" className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
              <SelectItem value="all">Semua</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Halaman sebelumnya"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="px-2 font-mono">
            {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Halaman berikutnya"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Ambil potongan data untuk halaman aktif. */
export const paginate = <T,>(items: T[], page: number, pageSize: PageSize) =>
  pageSize === "all" ? items : items.slice((page - 1) * pageSize, page * pageSize);
