import { Bot, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type SummaryStyle = "default" | "academic" | "meeting" | "simple" | "custom";

const STYLES: { id: SummaryStyle; label: string; desc: string }[] = [
  { id: "default", label: "Default", desc: "Ringkasan standar, seimbang." },
  { id: "academic", label: "Akademis", desc: "Formal, detail, dan terstruktur rapi." },
  { id: "meeting", label: "Risalah Rapat", desc: "Fokus pada poin keputusan & action items." },
  { id: "simple", label: "Catatan Mudah", desc: "Bahasa santai dan poin-poin singkat." },
  { id: "custom", label: "Lainnya", desc: "Gaya bebas sesuai konteks." },
];

export const STYLE_PROMPTS: Record<SummaryStyle, string> = {
  academic: "Akademis/Formal",
  meeting: "Risalah Rapat (Action Items & Decisions)",
  simple: "Sederhana & Mudah Dimengerti",
  default: "Standar",
  custom: "Standar",
};

/** Pilih gaya ringkasan AI. */
export function SummaryStyleDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (style: SummaryStyle) => void;
}) {
  const [selected, setSelected] = useState<SummaryStyle>("default");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5 text-module" /> Gaya Ringkasan AI
          </DialogTitle>
        </DialogHeader>
        <div role="radiogroup" className="flex flex-col gap-2">
          {STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              role="radio"
              aria-checked={selected === style.id}
              onClick={() => setSelected(style.id)}
              className={cn(
                "rounded-2xl border p-3.5 text-left transition-all",
                selected === style.id ? "border-module bg-module-soft ring-2 ring-module/40" : "hover:bg-muted/60",
              )}
            >
              <span className="flex items-center justify-between text-sm font-bold">
                {style.label}
                {selected === style.id && <CheckCircle2 className="size-4 text-module" />}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{style.desc}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button className="w-full" onClick={() => onConfirm(selected)}>
            Proses Ringkasan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
