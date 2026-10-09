import { Suspense } from "react";
import { Outlet } from "react-router";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageLoader } from "@/components/common/page-loader";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useProfileSync } from "@/data/use-auth";
import { FloatingChatbot } from "@/features/assistant/floating-chatbot";
import { GlobalSearchButton } from "@/features/assistant/global-search";
import { FocusModeButton } from "@/features/focus/focus-mode";
import { NotificationsPopover } from "@/features/overview/components/notifications-popover";

export function AppShell() {
  useProfileSync();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <AppHeader
          actions={
            <>
              <GlobalSearchButton />
              <FocusModeButton />
              <NotificationsPopover />
            </>
          }
        />
        <main className="flex-1 p-3 pb-24 md:p-6 md:pb-24">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </SidebarInset>
      <FloatingChatbot />
    </SidebarProvider>
  );
}
