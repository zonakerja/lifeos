import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** Error boundary per rute: kegagalan satu modul tidak menjatuhkan seluruh aplikasi. */
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const message = isRouteErrorResponse(error)
    ? error.statusText
    : error instanceof Error
      ? error.message
      : "Kesalahan tidak diketahui.";

  return (
    <div className="flex min-h-[60svh] items-center justify-center p-6">
      <Empty className="max-w-md border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
            <AlertTriangle />
          </EmptyMedia>
          <EmptyTitle>{notFound ? "Halaman tidak ditemukan" : "Terjadi kesalahan"}</EmptyTitle>
          <EmptyDescription>{notFound ? "Alamat yang Anda buka tidak tersedia." : message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RotateCcw /> Muat ulang
          </Button>
          <Button asChild>
            <Link to="/">
              <Home /> Ke Overview
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60svh] items-center justify-center p-6">
      <Empty className="max-w-md border bg-card">
        <EmptyHeader>
          <EmptyTitle className="text-5xl font-extrabold text-primary">404</EmptyTitle>
          <EmptyDescription>Halaman yang Anda cari tidak ditemukan.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link to="/">
              <Home /> Ke Overview
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
