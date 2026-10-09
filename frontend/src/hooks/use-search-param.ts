import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * State yang disimpan di query string URL (mis. `?edit=<id>`), sehingga dialog/pilihan
 * bisa dibuka lewat deep link dan tombol Back browser. Param lain dipertahankan.
 */
export function useSearchParam(key: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(key);

  const setValue = useCallback(
    (next: string | null, options: { replace?: boolean } = {}) =>
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === null || next === "") params.delete(key);
          else params.set(key, next);
          return params;
        },
        { replace: options.replace ?? true },
      ),
    [key, setSearchParams],
  );

  return [value, setValue] as const;
}
