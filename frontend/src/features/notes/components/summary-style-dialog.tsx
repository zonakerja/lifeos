import { Bot, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SUMMARY_STYLES, type SummaryStyle } from "../lib/notes-logic";

/** Pilih gaya ringkasan AI (gaya Kustom memakai instruksi yang ditulis user). */
export function SummaryStyleDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (style: SummaryStyle, customInstruction: string) => void;
}) {
  // State tetap ada selama editor terbuka, sehingga pilihan & instruksi terakhir diingat
  const [selected, setSelected] = useState<SummaryStyle>("default");
  const [instruction, setInstruction] = useState("");
  const needsInstruction = selected === "custom" && !instruction.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5 text-module" /> Gaya Ringkasan AI
          </DialogTitle>
        </DialogHeader>
        <div role="radiogroup" className="flex flex-col gap-2">
          {SUMMARY_STYLES.map((style) => (
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
        {selected === "custom" && (
          <Textarea
            autoFocus
            rows={3}
            aria-label="Instruksi gaya ringkasan"
            placeholder="Contoh: Buat daftar pertanyaan ujian beserta jawabannya, atau ringkas dalam 5 poin untuk dibagikan ke tim."
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
        )}
        <DialogFooter>
          <Button className="w-full" disabled={needsInstruction} onClick={() => onConfirm(selected, instruction)}>
            Proses Ringkasan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
