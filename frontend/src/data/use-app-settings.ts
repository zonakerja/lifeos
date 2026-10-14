import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/api/client";
import { settingsApi } from "@/lib/api/endpoints";
import { queryKeys } from "@/data/query-keys";
import type { AppSettings, AppSettingsInput } from "@/types/api";

const DEFAULT_APP_SETTINGS: AppSettings = {
  id: "global",
  name: "LifeOS",
  navSub: "Integrated Edition",
  loginSub: "Ultimate",
  motto: "Design Your Life, Manage Your Resources",
  welcomeTitle: "Selamat Datang",
  welcomeSub: "Silakan masuk menggunakan User ID dan Password Anda.",
  footerText: "© 2026 LifeOS System",
  logoVersion: null,
  createdAt: "",
  updatedAt: "",
};

/** URL gambar logo aplikasi (publik, di-cache per versi) atau null bila belum diatur. */
export const appLogoUrl = (settings: AppSettings) =>
  settings.logoVersion ? `${API_BASE_URL}/settings/app/logo?v=${settings.logoVersion}` : null;

/** Branding aplikasi (publik, dipakai juga di halaman login). */
export function useAppSettings() {
  const query = useQuery({
    queryKey: queryKeys.appSettings,
    queryFn: settingsApi.get,
    staleTime: 5 * 60_000,
  });
  return { ...query, settings: query.data ?? DEFAULT_APP_SETTINGS };
}

export function useUpdateAppSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AppSettingsInput) => settingsApi.update(input),
    onSuccess: (settings) => client.setQueryData(queryKeys.appSettings, settings),
  });
}
