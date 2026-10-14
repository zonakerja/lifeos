import { Moon, Sun, SunMoon } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { MODULES } from "@/config/navigation";
import { resolveTheme, type ThemePreference, useUiStore } from "@/stores/ui-store";

const useCurrentLocation = () => {
  const { pathname } = useLocation();
  const module =
    MODULES.find((m) => m.path !== "/" && (pathname === m.path || pathname.startsWith(`${m.path}/`))) ?? MODULES[0];
  const tabId = pathname.slice(module.path.length).split("/").filter(Boolean)[0];
  const tab = module.tabs?.find((t) => t.id === tabId);
  return { module, tab };
};

export function AppHeader({ actions }: { actions?: ReactNode }) {
  const { module, tab } = useCurrentLocation();

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 rounded-t-xl border-b bg-background/80 px-3 backdrop-blur md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            {tab ? (
              <span className="text-muted-foreground">{module.label}</span>
            ) : (
              <BreadcrumbPage className="font-semibold">{module.label}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {tab && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold">{tab.label}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-1">
        {actions}
        <ThemeMenu />
      </div>
    </header>
  );
}

/** Satu-satunya pengatur tema (Terang / Gelap / Ikuti sistem), disimpan per perangkat. */
function ThemeMenu() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const isDark = resolveTheme(theme) === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Tema tampilan">
          {theme === "system" ? <SunMoon /> : isDark ? <Moon /> : <Sun />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
          <DropdownMenuRadioItem value="light">
            <Sun /> Terang
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Gelap
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <SunMoon /> Ikuti sistem
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
