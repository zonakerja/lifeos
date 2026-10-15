import { createBrowserRouter } from "react-router";
import { AppShell } from "@/components/layout/app-shell";
import { NotFoundPage, RouteError } from "@/components/common/route-error";
import { RequireAuth } from "@/features/auth/require-auth";

/**
 * Peta rute aplikasi. Setiap modul di-lazy-load (code splitting) dan memiliki
 * error boundary sendiri. Tab modul ada di segmen URL: /planner/:tab.
 */
export const router = createBrowserRouter([
  { path: "/login", lazy: () => import("@/features/auth/login-page"), errorElement: <RouteError /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            errorElement: <RouteError />,
            children: [
              { index: true, lazy: () => import("@/features/overview/overview-page") },
              { path: "planner/:tab?", lazy: () => import("@/features/planner/planner-page") },
              { path: "notes/:tab?", lazy: () => import("@/features/notes/notes-page") },
              { path: "productivity/:tab?", lazy: () => import("@/features/productivity/productivity-page") },
              { path: "file-control/:tab?", lazy: () => import("@/features/file-control/file-control-page") },
              { path: "tools/:tab?", lazy: () => import("@/features/tools/tools-page") },
              { path: "settings/:tab?", lazy: () => import("@/features/settings/settings-page") },
              { path: "profile", lazy: () => import("@/features/profile/profile-page") },
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
