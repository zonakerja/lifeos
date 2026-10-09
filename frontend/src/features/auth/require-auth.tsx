import { Navigate, Outlet, useLocation } from "react-router";
import { PageLoader } from "@/components/common/page-loader";
import { useAuthStore } from "@/stores/auth-store";

/** Pelindung rute: tunggu pemulihan sesi, lalu arahkan ke /login bila belum login. */
export function RequireAuth() {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status === "unknown") return <PageLoader />;
  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}
