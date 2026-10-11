import { useState } from "react";
import { type PageSize, paginate } from "@/components/common/pagination-control";

/**
 * State paginasi untuk satu daftar. Halaman otomatis dijepit ke halaman terakhir yang ada
 * (mis. setelah item dihapus atau filter berubah), sehingga tidak pernah menampilkan halaman kosong.
 * Sebarkan `controlProps` ke `<PaginationControl>`.
 */
export function usePagination<T>(items: T[], initialPageSize: PageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(initialPageSize);
  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, totalPages);

  return {
    pageItems: paginate(items, current, pageSize),
    setPage,
    controlProps: {
      totalItems: items.length,
      page: current,
      pageSize,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
    },
  };
}
