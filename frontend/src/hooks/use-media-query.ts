import { useCallback, useSyncExternalStore } from "react";

/** `true` bila media query cocok (mis. `"(min-width: 1024px)"`); ikut berubah saat ukuran layar berubah. */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
