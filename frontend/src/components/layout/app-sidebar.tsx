import { Activity, ChevronRight, ChevronsUpDown, LogOut, Moon, Sun, SunMoon, UserRound } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { MODULES, ROLE_LABELS, type ModuleDef, visibleTabs } from "@/config/navigation";
import { useAppSettings } from "@/data/use-app-settings";
import { useLogout } from "@/data/use-auth";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { type ThemePreference, useUiStore } from "@/stores/ui-store";

const isModuleActive = (module: ModuleDef, pathname: string) =>
  module.path === "/" ? pathname === "/" : pathname === module.path || pathname.startsWith(`${module.path}/`);

/** Kotak ikon berwarna sesuai identitas modul. */
function ModuleIcon({ module, active }: { module: ModuleDef; active: boolean }) {
  const Icon = module.icon;
  return (
    <span
      data-module={module.key}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
        active ? "bg-module-gradient text-white shadow-sm shadow-module/30" : "bg-module/12 text-module",
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

export function AppSidebar() {
  const { pathname } = useLocation();
  const { settings } = useAppSettings();
  const role = useAuthStore((s) => s.user?.role);
  const { setOpenMobile } = useSidebar();
  const closeMobile = () => setOpenMobile(false);

  const mainModules = MODULES.filter((m) => m.key !== "settings");
  const settingsModule = MODULES.find((m) => m.key === "settings")!;
  const settingsActive = isModuleActive(settingsModule, pathname);

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent">
              <NavLink to="/" onClick={closeMobile}>
                <span
                  data-module="overview"
                  className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-module-gradient text-white shadow-md shadow-module/30"
                >
                  {settings.appLogo ? (
                    <img src={settings.appLogo} alt="" className="size-full object-cover" />
                  ) : (
                    <Activity className="size-5" strokeWidth={2.5} />
                  )}
                </span>
                <span className="grid min-w-0 leading-tight">
                  <span className="truncate text-base font-extrabold tracking-tight">{settings.name}</span>
                  <span className="truncate text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                    {settings.navSub}
                  </span>
                </span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {mainModules.map((module) => {
                const active = isModuleActive(module, pathname);
                return (
                  <SidebarMenuItem key={module.key}>
                    <SidebarMenuButton asChild isActive={active} tooltip={module.label} className="h-10 font-medium">
                      <NavLink to={module.path} end={module.path === "/"} onClick={closeMobile}>
                        <ModuleIcon module={module} active={active} />
                        <span>{module.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Sistem</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <Collapsible asChild defaultOpen={settingsActive} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={settingsActive}
                      tooltip={settingsModule.label}
                      className="h-10 font-medium"
                    >
                      <ModuleIcon module={settingsModule} active={settingsActive} />
                      <span>{settingsModule.label}</span>
                      <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {visibleTabs(settingsModule, role).map((tab) => (
                        <SidebarMenuSubItem key={tab.id}>
                          <SidebarMenuSubButton asChild isActive={pathname === `${settingsModule.path}/${tab.id}`}>
                            <NavLink to={`${settingsModule.path}/${tab.id}`} onClick={closeMobile}>
                              <span>{tab.label}</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

const initials = (name?: string) =>
  (name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const logout = useLogout();
  const navigate = useNavigate();
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback
                  data-module="settings"
                  className="rounded-lg bg-module-gradient text-xs font-bold text-white"
                >
                  {initials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">{user?.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user ? ROLE_LABELS[user.role] : ""}</span>
              </span>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
            <DropdownMenuLabel className="font-normal">
              <div className="grid leading-tight">
                <span className="truncate font-semibold">{user?.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => void navigate("/settings/profile")}>
                <UserRound /> Profil Saya
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <SunMoon /> Tema
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
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
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
              <LogOut /> Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
