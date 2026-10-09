import type { LucideIcon } from "lucide-react";

/** Kotak penjelasan kategori PARA. */
export function ParaInfo({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-module/20 bg-module-soft p-4">
      <span className="rounded-xl bg-card p-2 text-module shadow-xs">
        <Icon className="size-5" />
      </span>
      <div>
        <h4 className="mb-1 text-sm font-bold">{title}</h4>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
