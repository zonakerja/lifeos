import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Jangan ulangi request yang gagal karena izin / tidak ditemukan
      retry: (failureCount, error) =>
        !(error instanceof ApiError && [400, 401, 403, 404].includes(error.status)) && failureCount < 2,
    },
  },
});
