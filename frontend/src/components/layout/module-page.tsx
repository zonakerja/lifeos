import { type ReactNode, useEffect } from "react";
import { Navigate, NavLink, useParams } from "react-router";
import { getModule, type ModuleKey, visibleTabs } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

interface ModulePageProps {
  module: ModuleKey;
  /** Konten kanan pada hero (tombol aksi utama modul). */
  actions?: ReactNode;
  /** Ringkasan kecil di bawah judul (mis. statistik). */
  meta?: ReactNode;
  children: ReactNode | ((tab: string | undefined) => ReactNode);
  /** Override judul & deskripsi hero (default dari config navigasi). */
  title?: ReactNode;
  description?: ReactNode;
  /** Sembunyikan hero (mis. halaman dengan header kustom). */
  hideHero?: boolean;
}

/**
 * Kerangka standar setiap halaman modul: hero berwarna sesuai modul,
 * tab berbasis URL (`/modul/:tab`), lalu konten. Semua halaman wajib memakai
 * komponen ini agar layout seragam.
 */
export function ModulePage({ module: key, actions, meta, children, hideHero, title, description }: ModulePageProps) {
  const module = getModule(key);

  // Warna modul juga dipasang di <html> agar konten portal (Dialog, Popover, Sheet) ikut berwarna modul
  useEffect(() => {
    document.documentElement.dataset.module = key;
  }, [key]);
  const role = useAuthStore((s) => s.user?.role);
  const { tab } = useParams();
  const tabs = visibleTabs(module, role);

  // Tab tidak valid / kosong → arahkan ke tab pertama yang boleh diakses
  if (tabs.length > 0 && !tabs.some((t) => t.id === tab)) {
    return <Navigate to={`${module.path}/${tabs[0].id}`} replace />;
  }

  const Icon = module.icon;

  return (
    <div data-module={module.key} className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      {!hideHero && (
        <section className="relative overflow-hidden rounded-3xl bg-module-gradient p-5 text-white shadow-lg shadow-module/20 md:p-7">
          <div className="pointer-events-none absolute inset-0 bg-dots opacity-60" />
          <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/15 blur-2xl" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur">
                <Icon className="size-6" />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title ?? module.label}</h1>
                <p className="mt-1 max-w-2xl text-sm text-white/85">{description ?? module.description}</p>
                {meta && <div className="mt-3 flex flex-wrap gap-2">{meta}</div>}
              </div>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </section>
      )}

      {tabs.length > 0 && (
        <nav className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="inline-flex min-w-max gap-1 rounded-2xl border bg-card p-1 shadow-xs">
            {tabs.map((t) => {
              const TabIcon = t.icon;
              return (
                <NavLink
                  key={t.id}
                  to={`${module.path}/${t.id}`}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors",
                      isActive
                        ? "bg-module text-module-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-module-soft hover:text-module",
                    )
                  }
                >
                  <TabIcon className="size-4" />
                  {t.label}
                </NavLink>
              );
            })}
          </div>
        </nav>
      )}

      <div className="min-w-0">{typeof children === "function" ? children(tab) : children}</div>
    </div>
  );
}

/** Pemberi tanda pada hero, mis. jumlah item. */
export function HeroStat({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/18 px-3 py-1 text-xs font-semibold ring-1 ring-white/25 backdrop-blur">
      {children}
    </span>
  );
}
