import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemePreference = "light" | "dark" | "system";

interface UiState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

/** Preferensi UI per perangkat (bukan data domain). */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
    }),
    { name: "lifeos-ui", storage: createJSONStorage(() => localStorage) },
  ),
);

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

export const resolveTheme = (theme: ThemePreference) =>
  theme === "system" ? (prefersDark() ? "dark" : "light") : theme;

/** Terapkan class `dark` pada <html> dan ikuti perubahan tema sistem. */
export const initThemeSync = () => {
  const apply = () => {
    const resolved = resolveTheme(useUiStore.getState().theme);
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
  };
  apply();
  useUiStore.subscribe(apply);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
};
