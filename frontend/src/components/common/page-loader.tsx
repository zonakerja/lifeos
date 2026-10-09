import { Spinner } from "@/components/ui/spinner";

export function PageLoader({ label = "Memuat..." }: { label?: string }) {
  return (
    <div className="flex min-h-60 items-center justify-center gap-3 text-sm font-medium text-muted-foreground">
      <Spinner className="size-5" />
      {label}
    </div>
  );
}
