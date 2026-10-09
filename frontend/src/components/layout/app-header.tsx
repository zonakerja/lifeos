import { Moon, Sun } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { MODULES } from "@/config/navigation";
import { resolveTheme, useUiStore } from "@/stores/ui-store";

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
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const isDark = resolveTheme(theme) === "dark";

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
        <Button
          variant="ghost"
          size="icon"
          aria-label={isDark ? "Gunakan tema terang" : "Gunakan tema gelap"}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? <Sun /> : <Moon />}
        </Button>
      </div>
    </header>
  );
}
